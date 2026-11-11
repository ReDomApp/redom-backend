import type { PoolClient } from "pg";
import { chargeAurelinkUsage, captureAurelinkUsage, refundAurelinkUsage } from "./communications-billing.service";

type Db = Pick<PoolClient,"query">;

export async function reserveAurelinkEmailUsage(client:Db,input:{
  userId:string;workspaceId:string;messageId:string;units:number;transport:"api"|"smtp";
  provider:string;category:string;metadata?:Record<string,unknown>;
}):Promise<{source:"subscription"|"prepaid"|"wallet";units:number;unitPriceMinor:number|null;amountMinor:string|null;walletReference:string|null}> {
  if(!Number.isSafeInteger(input.units)||input.units<1)throw new Error("AURELINK_INVALID_EMAIL_UNITS");
  const existing=await client.query("SELECT source,units,unit_price_minor,amount_minor,wallet_reference FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[input.messageId]);
  if(existing.rows[0])return {source:existing.rows[0].source,units:Number(existing.rows[0].units),unitPriceMinor:existing.rows[0].unit_price_minor===null?null:Number(existing.rows[0].unit_price_minor),amountMinor:existing.rows[0].amount_minor===null?null:String(existing.rows[0].amount_minor),walletReference:existing.rows[0].wallet_reference??null};

  const subscriptionResult=await client.query(
    `SELECT id,monthly_email_allowance,used_emails,reserved_emails,allow_prepaid_fallback
       FROM aurelink_email_subscriptions
      WHERE workspace_id=$1 AND status='active'
        AND billing_period_start<=NOW() AND billing_period_end>NOW()
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [input.workspaceId]
  );
  const subscription=subscriptionResult.rows[0];
  if(subscription){
    const remaining=BigInt(String(subscription.monthly_email_allowance))-BigInt(String(subscription.used_emails))-BigInt(String(subscription.reserved_emails));
    if(remaining>=BigInt(input.units)){
      await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE id=$1",[subscription.id,input.units]);
      await client.query(
        "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,subscription_id,units,status,metadata) VALUES($1,$2,$3,'subscription',$4,$5,'reserved',$6::jsonb)",
        [input.messageId,input.userId,input.workspaceId,subscription.id,input.units,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category,...input.metadata})]
      );
      return {source:"subscription",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:null};
    }
    if(!subscription.allow_prepaid_fallback){
      throw Object.assign(new Error("The monthly Aurelink Mail allowance is exhausted. Upgrade the package, enable prepaid fallback, or wait for renewal."),{code:"AURELINK_EMAIL_PLAN_LIMIT_REACHED"});
    }
  }

  await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[input.workspaceId,input.userId]);
  const credit=await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[input.workspaceId]);
  const creditBalance=BigInt(String(credit.rows[0]?.balance_emails??"0"));
  if(creditBalance>=BigInt(input.units)){
    const next=creditBalance-BigInt(input.units);
    await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[input.workspaceId,next.toString()]);
    const reference="AL-EMAIL-USE-"+input.messageId;
    await client.query(
      "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'usage','debit',$3,$4,$5,'Aurelink prepaid email usage',$6::jsonb)",
      [input.workspaceId,input.userId,input.units,next.toString(),reference,JSON.stringify({messageId:input.messageId,transport:input.transport,provider:input.provider,...input.metadata})]
    );
    await client.query(
      "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,units,status,metadata) VALUES($1,$2,$3,'prepaid',$4,'reserved',$5::jsonb)",
      [input.messageId,input.userId,input.workspaceId,input.units,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category})]
    );
    return {source:"prepaid",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:reference};
  }
  if(subscription)throw Object.assign(new Error("The monthly Aurelink Mail allowance and prepaid email credits are insufficient."),{code:"AURELINK_EMAIL_PLAN_LIMIT_REACHED"});

  const service=input.transport==="smtp"?"smtp_message":"email_message";
  const charged=await chargeAurelinkUsage(client,{
    userId:input.userId,workspaceId:input.workspaceId,messageId:input.messageId,service,units:input.units,
    metadata:{channel:"email",provider:input.provider,category:input.category,transport:input.transport,...input.metadata}
  });
  await client.query(
    "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,units,unit_price_minor,amount_minor,wallet_reference,status,metadata) VALUES($1,$2,$3,'wallet',$4,$5,$6,$7,'reserved',$8::jsonb)",
    [input.messageId,input.userId,input.workspaceId,input.units,charged.unitPriceMinor,charged.amountMinor,charged.reference,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category})]
  );
  return {source:"wallet",units:input.units,unitPriceMinor:charged.unitPriceMinor,amountMinor:charged.amountMinor,walletReference:charged.reference};
}

export async function captureAurelinkEmailUsage(client:Db,messageId:string):Promise<void>{
  const result=await client.query("SELECT * FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[messageId]);
  const reservation=result.rows[0];
  if(!reservation||reservation.status==="captured"||reservation.status==="refunded"||reservation.status==="released")return;
  if(reservation.status==="unknown")throw new Error("AURELINK_EMAIL_USAGE_REQUIRES_RECONCILIATION");
  if(reservation.source==="subscription"){
    const updated=await client.query(
      "UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails-$2,used_emails=used_emails+$2,updated_at=NOW() WHERE id=$1 AND reserved_emails >= $2",
      [reservation.subscription_id,reservation.units]
    );
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_SUBSCRIPTION_RESERVATION_MISMATCH");
  }else if(reservation.source==="wallet"){
    await captureAurelinkUsage(client,messageId);
  }
  await client.query("UPDATE aurelink_email_usage_reservations SET status='captured',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);
}

export async function refundAurelinkEmailUsage(client:Db,messageId:string):Promise<void>{
  const result=await client.query("SELECT * FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[messageId]);
  const reservation=result.rows[0];
  if(!reservation||reservation.status==="refunded"||reservation.status==="released")return;
  if(reservation.status==="captured")throw new Error("AURELINK_EMAIL_USAGE_ALREADY_CAPTURED");
  if(reservation.status==="unknown")throw new Error("AURELINK_EMAIL_USAGE_REQUIRES_RECONCILIATION");
  if(reservation.source==="subscription"){
    const updated=await client.query(
      "UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails-$2,updated_at=NOW() WHERE id=$1 AND reserved_emails >= $2",
      [reservation.subscription_id,reservation.units]
    );
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_SUBSCRIPTION_RESERVATION_MISMATCH");
  }else if(reservation.source==="prepaid"){
    const wallet=await client.query(
      "UPDATE aurelink_email_credit_wallets SET balance_emails=balance_emails+$2,updated_at=NOW() WHERE workspace_id=$1 RETURNING balance_emails",
      [reservation.workspace_id,reservation.units]
    );
    if(!wallet.rows[0])throw new Error("AURELINK_EMAIL_CREDIT_WALLET_MISSING");
    const reference="AL-EMAIL-REFUND-"+messageId;
    await client.query(
      "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'refund','credit',$3,$4,$5,'Refund for rejected Aurelink email submission',$6::jsonb) ON CONFLICT(reference) DO NOTHING",
      [reservation.workspace_id,reservation.user_id,reservation.units,wallet.rows[0].balance_emails,reference,JSON.stringify({messageId})]
    );
  }else if(reservation.source==="wallet"){
    await refundAurelinkUsage(client,messageId,String(reservation.user_id),String(reservation.workspace_id));
  }
  await client.query("UPDATE aurelink_email_usage_reservations SET status='refunded',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);
}

export async function markAurelinkEmailUsageUnknown(client:Db,messageId:string):Promise<void>{
  await client.query("UPDATE aurelink_email_usage_reservations SET status='unknown',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);
}
