import { pool } from "../../database/db";
import { logger } from "../../lib/logger";
import { smsPoolClient, type SmsPoolPayload } from "./smspool.client";
import { sendAurelinkFinalReceipt } from "./aurelink-receipts.service";
import { walletCredit } from "./aurelink-wallet.service";
import { nonVoipClient, nvRecord } from "./nonvoip.client";

const configuredIntervalMs = Number(process.env.AURELINK_LIFECYCLE_POLL_MS ?? 60_000);
const configuredBatchSize = Number(process.env.AURELINK_LIFECYCLE_BATCH_SIZE ?? 25);
const INTERVAL_MS = Number.isFinite(configuredIntervalMs) ? Math.max(30_000, configuredIntervalMs) : 60_000;
const BATCH_SIZE = Number.isFinite(configuredBatchSize) ? Math.max(1, Math.min(100, configuredBatchSize)) : 25;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function scalarFields(value: unknown, output: Array<{ key: string; value: string }> = []): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) { for (const item of value) scalarFields(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== null && ["string", "number", "boolean"].includes(typeof child)) output.push({ key: key.toLowerCase(), value: String(child).trim() });
    else if (child && typeof child === "object") scalarFields(child, output);
  }
  return output;
}
function expiryFrom(value: unknown): Date | null {
  const fields = scalarFields(value);
  const raw = fields.find((field) => ["expires_at", "expiration", "expiry", "expires"].includes(field.key));
  if (raw?.value) {
    const parsed = new Date(raw.value);
    if (Number.isFinite(parsed.getTime())) return parsed;
    const numeric = Number(raw.value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric);
  }
  const left = fields.find((field) => ["time_left", "expires_in"].includes(field.key));
  if (left) {
    const seconds = Number(left.value);
    if (Number.isFinite(seconds) && seconds >= 0) return new Date(Date.now() + seconds * 1000);
  }
  return null;
}
function containsSms(value: unknown): boolean {
  return scalarFields(value).some((field) => /^(sms|full_sms|message_body|code)$/.test(field.key) && field.value.length > 0);
}

function providerConfirmed(value:unknown):boolean{const row=asRecord(value);return row.success===true||row.success===1||/^(success|cancelled|canceled|refunded)$/i.test(String(row.status??row.message??""));}
async function refundExpiredWalletOrder(order:Record<string,unknown>,label:string):Promise<void>{
  const debit=String(order["wallet_debit_reference"]??"");const amount=String(order["retail_amount_minor"]??"");const userId=String(order["aurelink_user_id"]??"");
  if(!debit||!amount||!userId||order["refund_reference"])return;
  const client=await pool.connect();try{await client.query("BEGIN");await walletCredit(client,{userId,amountMinor:amount,reference:"refund:"+debit,type:"refund",description:"Automatic wallet refund: "+label+" provider expiry",orderId:String(order["id"]),metadata:{providerOrderId:order["provider_order_id"]}});await client.query("UPDATE aurelink_provider_orders SET refund_reference=$2 WHERE id=$1",[order["id"],"refund:"+debit]);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
async function pollActivation(order: Record<string, unknown>): Promise<void> {
  if (String(order["provider"] ?? "smspool").toLowerCase() === "nonvoip") {
    const id = String(order["provider_order_id"]);
    const [statusResponse, messagesResponse] = await Promise.all([
      nonVoipClient.order(id),
      nonVoipClient.messages(id),
    ]);
    const statusData = nvRecord(statusResponse);
    const messagesData = nvRecord(messagesResponse);
    const messages = Array.isArray(messagesData.messages) ? messagesData.messages : [];
    const smsArrived = messages.length > 0 || containsSms(messagesResponse);
    const rawStatus = String(statusData.status ?? statusData.state ?? "").toLowerCase();
    const nextStatus = smsArrived || /^(completed|complete|received)$/.test(rawStatus) ? "completed"
      : /^(refunded|refund)$/.test(rawStatus) ? "refunded"
      : /^(cancelled|canceled)$/.test(rawStatus) ? "cancelled"
      : /^(expired|timeout|timed out)$/.test(rawStatus) ? "expired"
      : null;
    const expiry = expiryFrom(statusResponse) ?? expiryFrom(messagesResponse);
    const previous = String(order["status"] ?? "").toLowerCase();
    await pool.query(
      "UPDATE aurelink_provider_orders SET status=COALESCE($2,status),sms_received_at=CASE WHEN $3 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,expires_at=COALESCE($4,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $5::jsonb WHERE id=$1",
      [order["id"], nextStatus, smsArrived, expiry, JSON.stringify({ lifecyclePoll: { provider: "nonvoip", status: rawStatus || null, smsReceived: smsArrived, checkedAt: new Date().toISOString() }, lastMessages: messages })],
    );
    if (nextStatus && nextStatus !== previous && ["completed", "refunded", "cancelled", "expired"].includes(nextStatus)) {
      await sendAurelinkFinalReceipt({ ...order, status: nextStatus }, nextStatus === "completed" ? "Completed" : nextStatus === "refunded" ? "Refunded" : nextStatus === "cancelled" ? "Canceled" : "Expired");
    }
    return;
  }
  const response = await smsPoolClient.checkSms(String(order["provider_order_id"]));
  const data = asRecord(response as SmsPoolPayload);
  const status = data["status"];
  const statusText = String(status ?? "").toLowerCase().trim();
  const smsArrived = status === 3 || status === "3" || containsSms(response);
  const nextStatus = status === 3 || status === "3" || smsArrived ? "completed"
    : status === 6 || status === "6" || statusText === "refunded" ? "refunded"
    : /^(cancelled|canceled)$/.test(statusText) ? "cancelled"
    : /^(expired|timeout|timed out)$/.test(statusText) ? "expired"
    : null;
  const expiry = expiryFrom(response);
  const previous = String(order["status"] ?? "").toLowerCase();
  await pool.query(
    "UPDATE aurelink_provider_orders SET status=COALESCE($2,status),sms_received_at=CASE WHEN $3 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,expires_at=COALESCE($4,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $5::jsonb WHERE id=$1",
    [order["id"], nextStatus, smsArrived, expiry, JSON.stringify({ lifecyclePoll: { status: status ?? null, smsReceived: smsArrived, checkedAt: new Date().toISOString() }, lastPoll: response })],
  );
  if (nextStatus && nextStatus !== previous && ["completed", "refunded", "cancelled", "expired"].includes(nextStatus)) {
    const amount = scalarFields(response).find((field) => /^(refund_amount|amount_refunded|refunded_amount)$/.test(field.key) && Number(field.value) >= 0)?.value ?? null;
    const finalPayload = { ...asRecord(order["provider_payload"]), lastPoll: response };
    await sendAurelinkFinalReceipt({ ...order, status: nextStatus, provider_payload: finalPayload }, nextStatus === "completed" ? "Completed" : nextStatus === "refunded" ? "Refunded" : nextStatus === "cancelled" ? "Canceled" : "Expired", nextStatus === "refunded" ? amount : null);
  }
}
async function pollRental(order: Record<string, unknown>): Promise<void> {
  const id = String(order["provider_order_id"]);
  const [statusResponse, messagesResponse] = await Promise.all([
    smsPoolClient.rentalStatus(id),
    smsPoolClient.rentalMessages(id),
  ]);
  const statusFields = scalarFields(statusResponse);
  const rawStatus = statusFields.find((field) => field.key === "status")?.value.toLowerCase() ?? null;
  const nextStatus = rawStatus && /^(expired|cancelled|refunded|active|completed)$/.test(rawStatus) ? rawStatus : null;
  const smsArrived = containsSms(messagesResponse);
  const expiry = expiryFrom(statusResponse) ?? expiryFrom(messagesResponse);
  await pool.query(
    "UPDATE aurelink_provider_orders SET status=COALESCE($2,status),sms_received_at=CASE WHEN $3 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,expires_at=COALESCE($4,expires_at),last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $5::jsonb WHERE id=$1",
    [order["id"], nextStatus, smsArrived, expiry, JSON.stringify({ lifecyclePoll: { status: rawStatus, smsReceived: smsArrived, checkedAt: new Date().toISOString() } })],
  );
}

export async function runAurelinkLifecyclePoll(): Promise<void> {
  if (running || (!process.env.SMSPOOL_API_KEY?.trim() && !process.env.NONVOIP_API_KEY?.trim())) return;
  running = true;
  try {
    const expiredActivations = await pool.query(
      "UPDATE aurelink_provider_orders SET status='expired',updated_at=NOW() WHERE product_kind='activation' AND status='pending' AND expires_at IS NOT NULL AND expires_at<=NOW() RETURNING *",
    );
    for (const order of expiredActivations.rows as Array<Record<string, unknown>>) {
      try {
        const cancellation = String(order["provider"] ?? "smspool").toLowerCase() === "nonvoip"
          ? await nonVoipClient.cancel(String(order["provider_order_id"]))
          : await smsPoolClient.cancelSms(String(order["provider_order_id"]));
        if(providerConfirmed(cancellation))await refundExpiredWalletOrder(order,"activation");
        await sendAurelinkFinalReceipt(order,"Expired");
      } catch (error) { logger.warn({orderId:order["id"],errorType:error instanceof Error?error.name:typeof error},"AURELINK expired activation reconciliation failed"); }
    }
    const expiredRentals=await pool.query("UPDATE aurelink_provider_orders SET status='expired',updated_at=NOW() WHERE product_kind='rental' AND status='active' AND expires_at IS NOT NULL AND expires_at<=NOW() RETURNING *");
    for(const order of expiredRentals.rows as Array<Record<string,unknown>>){
      try{const cancellation=await smsPoolClient.cancelRental(String(order["provider_order_id"]));if(providerConfirmed(cancellation))await refundExpiredWalletOrder(order,"rental");}
      catch(error){logger.warn({orderId:order["id"],errorType:error instanceof Error?error.name:typeof error},"AURELINK expired rental reconciliation failed");}
    }
    const result = await pool.query(
      "SELECT * FROM aurelink_provider_orders WHERE product_kind IN ('activation','rental') AND status IN ('pending','active','cancelled','cancellation_pending','expired') AND (last_provider_check_at IS NULL OR last_provider_check_at<NOW()-($2::text||' milliseconds')::interval) ORDER BY COALESCE(last_provider_check_at,created_at) ASC LIMIT $1",
      [BATCH_SIZE, String(Math.max(10_000, INTERVAL_MS - 5_000))],
    );
    for (const order of result.rows as Array<Record<string, unknown>>) {
      try {
        if (order["product_kind"] === "activation") await pollActivation(order);
        else if (order["product_kind"] === "rental") await pollRental(order);
      } catch (error) {
        await pool.query("UPDATE aurelink_provider_orders SET last_provider_check_at=NOW() WHERE id=$1", [order["id"]]).catch(() => undefined);
        logger.warn({ orderId: order["id"], kind: order["product_kind"], errorType: error instanceof Error ? error.name : typeof error }, "AURELINK lifecycle poll failed");
      }
    }
  } catch (error) {
    logger.error({ errorType: error instanceof Error ? error.name : typeof error }, "AURELINK lifecycle worker failed");
  } finally {
    running = false;
  }
}

export function startAurelinkLifecycleWorker(): void {
  if (timer || (!process.env.SMSPOOL_API_KEY?.trim() && !process.env.NONVOIP_API_KEY?.trim())) return;
  timer = setInterval(() => { void runAurelinkLifecyclePoll(); }, INTERVAL_MS);
  timer.unref?.();
  void runAurelinkLifecyclePoll();
  logger.info({ intervalMs: INTERVAL_MS, batchSize: BATCH_SIZE }, "AURELINK lifecycle worker started");
}
export function stopAurelinkLifecycleWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
