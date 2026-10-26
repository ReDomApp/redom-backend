import { pool } from "../../database/db";

type OrderRecord = Record<string, unknown>;
function esc(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}
function record(value: unknown): OrderRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as OrderRecord : {};
}
function flatten(value: unknown, out: Array<[string, string]> = []): Array<[string, string]> {
  if (Array.isArray(value)) { for (const item of value) flatten(item, out); return out; }
  if (!value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value as OrderRecord)) {
    if (child !== null && ["string", "number", "boolean"].includes(typeof child)) out.push([key.toLowerCase(), String(child)]);
    else if (child && typeof child === "object") flatten(child, out);
  }
  return out;
}
function valueFor(source: unknown, keys: string[]): string | null {
  const found = flatten(source).find(([key, value]) => keys.includes(key) && value.trim() !== "");
  return found?.[1] ?? null;
}
export async function sendAurelinkFinalReceipt(order: OrderRecord, status: "Completed" | "Canceled" | "Refunded" | "Expired", refundedAmount?: string | number | null): Promise<string> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "skipped: Resend API key is not configured";
  const from = process.env.AURELINK_RECEIPT_FROM?.trim() || "AURELINK Admin <receipts@wnncompany.com>";
  const to = process.env.AURELINK_RECEIPT_TO?.trim() || "christianuzamaosahuo@gmail.com";
  const senderDomain = (from.match(/<([^>]+)>/)?.[1] || from).split("@")[1]?.toLowerCase();
  if (!senderDomain) return "skipped: invalid sender address";
  try {
    const domainsResponse = await fetch("https://api.resend.com/domains", { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(5000) });
    if (!domainsResponse.ok) return "skipped: could not verify sender domain";
    const domains = record(await domainsResponse.json());
    const domainRows = Array.isArray(domains.data) ? domains.data.map(record) : [];
    if (!domainRows.some((domain) => String(domain.name || "").toLowerCase() === senderDomain && String(domain.status || "").toLowerCase() === "verified")) return "skipped: sender domain is not verified in Resend";
    const payload = record(order.provider_payload);
    const orderId = String(payload.adminOrderId ?? order.orderId ?? order.provider_order_id ?? "—");
    const serial = String(payload.serialNumber ?? order.serialNumber ?? "—");
    const amount = status === "Refunded" ? (refundedAmount ?? valueFor(order.provider_payload, ["refund_amount", "refunded_amount", "amount_refunded", "refund"])) : null;
    const rows: Array<[string, unknown]> = [
      ["Order ID", orderId], ["Serial number", serial], ["Phone number", order.phone_number ?? order.phoneNumber],
      ["Country", order.country], ["Service", order.service], ["Final status", status],
      ...(status === "Refunded" ? [["Refund amount", amount ?? "Not confirmed by provider; contact support"] as [string, unknown]] : []),
      ["Provider order", order.provider_order_id], ["Carrier", order.carrier_name], ["Line type", order.line_type],
    ];
    const html = "<h2>AURELINK Admin — " + esc(status) + " receipt</h2><table>" + rows.map(([label, value]) => "<tr><td style=\"padding:8px;border-bottom:1px solid #ddd\"><b>" + esc(label) + "</b></td><td style=\"padding:8px;border-bottom:1px solid #ddd\">" + esc(value) + "</td></tr>").join("") + "</table><p>This receipt reflects the final status recorded by AURELINK.</p>";
    const text = "AURELINK Admin — " + status + " receipt\n" + rows.map(([label, value]) => label + ": " + String(value ?? "—")).join("\n");
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject: "AURELINK " + status + " — " + orderId, text, html }), signal: AbortSignal.timeout(8000) });
    return response.ok ? "sent" : "failed: Resend rejected receipt";
  } catch {
    return "failed: Resend request could not be completed";
  }
}
export async function sendAurelinkReceiptForOrderId(orderId: string, status: "Completed" | "Canceled" | "Refunded" | "Expired", refundedAmount?: string | number | null): Promise<string> {
  const result = await pool.query("SELECT * FROM aurelink_provider_orders WHERE provider_order_id=$1 OR provider_payload->>'adminOrderId'=$1 LIMIT 1", [orderId]);
  const order = result.rows[0] as OrderRecord | undefined;
  if (!order) return "skipped: order not found";
  return sendAurelinkFinalReceipt(order, status, refundedAmount);
}
