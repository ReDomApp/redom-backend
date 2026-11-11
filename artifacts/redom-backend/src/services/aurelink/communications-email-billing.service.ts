import type { PoolClient } from "pg";
import { chargeAurelinkUsage, captureAurelinkUsage, refundAurelinkUsage } from "./communications-billing.service";

type Db = Pick<PoolClient,"query">;

export async function reserveAurelinkEmailUsage(client:Db,input:{
  userId:string;workspaceId:string;messageId:string;units:number;transport:"api"|"smtp";
  provider:string;category:string;metadata?:Record<string,unknown>;
}):Promise<{source:"free"|"subscription"|"prepaid"|"wallet";units:number;unitPriceMinor:number|null;amountMinor:string|null;walletReference:string|null}> {
  if(!Number.isSafeInteger(input.units)||input.units<1)throw new Error("AURELINK_INVALID_EMAIL_UNITS");
  const existing=await client.query("SELECT source,units,unit_price_minor,amount_minor,wallet_reference FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[input.messageId]);
  if(existing.rows[0])return {source:existing.rows[0].source,units:Number(existing.rows[0].units),unitPriceMinor:existing.rows[0].unit_price_minor===null?null:Number(existing.rows[0].unit_price_minor),amountMinor:existing.rows[0].amount_minor===null?null:String(existing.rows[0].amount_minor),walletReference:existing.rows[0].wallet_reference??null};

  await client.query(
    "INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id) SELECT id,user_id FROM aurelink_communications_workspaces WHERE id=$1 ON CONFLICT(workspace_id) DO NOTHING",
    [input.workspaceId]
  );
  const account=(await client.query("SELECT billing_mode FROM aurelink_email_billing_accounts WHERE workspace_id=$1 FOR SHARE",[input.workspaceId])).rows[0];
  const billingMode=String(account?.billing_mode||"free");

  const subscriptionResult=await client.query(
    `SELECT id,status,monthly_email_allowance,used_emails,reserved_emails,allow_prepaid_fallback,
            (billing_period_start<=NOW() AND billing_period_end>NOW()) AS period_active
       FROM aurelink_email_subscriptions
      WHERE workspace_id=$1 AND status IN ('active','past_due')
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [input.workspaceId]
  );
  const subscription=subscriptionResult.rows[0];
  if(subscription){
    const periodActive=subscription.status==="active"&&subscription.period_active===true;
    if(periodActive){
      const remaining=BigInt(String(subscription.monthly_email_allowance))-BigInt(String(subscription.used_emails))-BigInt(String(subscription.reserved_emails));
      if(remaining>=BigInt(input.units)){
        await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE id=$1",[subscription.id,input.units]);
        await client.query(
          "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,subscription_id,units,status,metadata) VALUES($1,$2,$3,'subscription',$4,$5,'reserved',$6::jsonb)",
          [input.messageId,input.userId,input.workspaceId,subscription.id,input.units,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category,...input.metadata})]
        );
        return {source:"subscription",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:null};
      }
    }
    if(!subscription.allow_prepaid_fallback){
      const message=subscription.status==="past_due"||!periodActive
        ?"The Aurelink Mail subscription is not currently paid and active. Resolve payment or explicitly enable prepaid fallback."
        :"The monthly Aurelink Mail allowance is exhausted. Upgrade the package, enable prepaid fallback, or wait for renewal.";
      throw Object.assign(new Error(message),{code:"AURELINK_EMAIL_PLAN_LIMIT_REACHED"});
    }
  }

  if(!subscription&&billingMode==="free"){
    const limitResult=await client.query("SELECT daily_limit FROM aurelink_email_plan_catalog WHERE plan_code='free' AND active=TRUE");
    const dailyLimit=Number(limitResult.rows[0]?.daily_limit||100);
    await client.query("INSERT INTO aurelink_email_free_daily_usage(workspace_id,usage_date) VALUES($1,CURRENT_DATE) ON CONFLICT(workspace_id,usage_date) DO NOTHING",[input.workspaceId]);
    const daily=(await client.query("SELECT usage_date,used_emails,reserved_emails FROM aurelink_email_free_daily_usage WHERE workspace_id=$1 AND usage_date=CURRENT_DATE FOR UPDATE",[input.workspaceId])).rows[0];
    const remaining=BigInt(dailyLimit)-BigInt(String(daily.used_emails))-BigInt(String(daily.reserved_emails));
    if(remaining>=BigInt(input.units)){
      await client.query("UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=CURRENT_DATE",[input.workspaceId,input.units]);
      await client.query(
        "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,units,status,metadata) VALUES($1,$2,$3,'free',$4,'reserved',$5::jsonb)",
        [input.messageId,input.userId,input.workspaceId,input.units,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category,usageDate:String(daily.usage_date),dailyLimit})]
      );
      return {source:"free",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:null};
    }
  }

  await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[input.workspaceId,input.userId]);
  const credit=await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[input.workspaceId]);
  const creditBalance=BigInt(String(credit.rows[0]?.balance_emails??"0"));
  if(creditBalance>=BigInt(input.units)){
    if(input.category!=="transactional")throw Object.assign(new Error("Prepaid Mail is restricted to low-volume transactional sending. Use an active subscription for campaigns and business mailing."),{code:"AURELINK_PREPAID_FEATURE_RESTRICTED"});
    await client.query("INSERT INTO aurelink_email_prepaid_daily_usage(workspace_id,usage_date) VALUES($1,CURRENT_DATE) ON CONFLICT(workspace_id,usage_date) DO NOTHING",[input.workspaceId]);
    const daily=(await client.query("SELECT usage_date,used_emails,reserved_emails FROM aurelink_email_prepaid_daily_usage WHERE workspace_id=$1 AND usage_date=CURRENT_DATE FOR UPDATE",[input.workspaceId])).rows[0];
    if(BigInt(String(daily.used_emails))+BigInt(String(daily.reserved_emails))+BigInt(input.units)>2500n)throw Object.assign(new Error("Prepaid Mail is limited to 2,500 emails per workspace per day. A subscription is required for higher-volume sending."),{code:"AURELINK_PREPAID_DAILY_LIMIT"});
    await client.query("UPDATE aurelink_email_prepaid_daily_usage SET reserved_emails=reserved_emails+$2,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=CURRENT_DATE",[input.workspaceId,input.units]);
    const next=creditBalance-BigInt(input.units);
    await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[input.workspaceId,next.toString()]);
    const reference="AL-EMAIL-USE-"+input.messageId;
    await client.query(
      "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'usage','debit',$3,$4,$5,'Aurelink prepaid email usage',$6::jsonb)",
      [input.workspaceId,input.userId,input.units,next.toString(),reference,JSON.stringify({messageId:input.messageId,transport:input.transport,provider:input.provider,usageDate:String(daily.usage_date),dailyLimit:2500,...input.metadata})]
    );
    await client.query(
      "INSERT INTO aurelink_email_usage_reservations(message_id,user_id,workspace_id,source,units,status,metadata) VALUES($1,$2,$3,'prepaid',$4,'reserved',$5::jsonb)",
      [input.messageId,input.userId,input.workspaceId,input.units,JSON.stringify({transport:input.transport,provider:input.provider,category:input.category,usageDate:String(daily.usage_date),dailyLimit:2500})]
    );
    return {source:"prepaid",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:reference};
  }
  if(subscription||billingMode==="free"||billingMode==="subscription")throw Object.assign(new Error("The monthly/daily Aurelink Mail allowance and prepaid email credits are insufficient. Renew the subscription or switch to Pay-as-you-go."),{code:"AURELINK_EMAIL_PLAN_LIMIT_REACHED"});

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

export async function resizeAurelinkEmailUsageReservation(client:Db,messageId:string,acceptedUnits:number,rejectedRecipients:string[]):Promise<void>{
  if(!Number.isSafeInteger(acceptedUnits)||acceptedUnits<1||!Array.isArray(rejectedRecipients)||!rejectedRecipients.length)throw new Error("AURELINK_INVALID_PARTIAL_EMAIL_ALLOCATION");
  const reservation=(await client.query("SELECT * FROM aurelink_email_usage_reservations WHERE message_id=$1 FOR UPDATE",[messageId])).rows[0];
  if(!reservation||!["reserved","unknown"].includes(String(reservation.status)))throw new Error("AURELINK_EMAIL_RESERVATION_NOT_RESIZABLE");
  const rejectedUnits=rejectedRecipients.length;
  if(Number(reservation.units)!==acceptedUnits+rejectedUnits){
    if(reservation.metadata?.partialAcceptanceReconciled===true&&Number(reservation.units)===acceptedUnits)return;
    throw new Error("AURELINK_EMAIL_PARTIAL_ALLOCATION_MISMATCH");
  }
  let acceptedAmountMinor:string|null=null;
  if(reservation.source==="subscription"){
    const updated=await client.query("UPDATE aurelink_email_subscriptions SET reserved_emails=reserved_emails-$2,updated_at=NOW() WHERE id=$1 AND reserved_emails >= $2",[reservation.subscription_id,rejectedUnits]);
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_SUBSCRIPTION_RESERVATION_MISMATCH");
  }else if(reservation.source==="free"){
    const usageDate=String(reservation.metadata?.usageDate||"");
    const updated=await client.query("UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails-$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",[reservation.workspace_id,usageDate,rejectedUnits]);
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_FREE_DAILY_RESERVATION_MISMATCH");
  }else if(reservation.source==="prepaid"){
    const usageDate=String(reservation.metadata?.usageDate||new Date().toISOString().slice(0,10));
    await client.query("UPDATE aurelink_email_prepaid_daily_usage SET reserved_emails=GREATEST(0,reserved_emails-$3),updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date",[reservation.workspace_id,usageDate,rejectedUnits]);
    const wallet=(await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=balance_emails+$2,updated_at=NOW() WHERE workspace_id=$1 RETURNING balance_emails",[reservation.workspace_id,rejectedUnits])).rows[0];
    if(!wallet)throw new Error("AURELINK_EMAIL_CREDIT_WALLET_MISSING");
    await client.query(
      "INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,description,metadata) VALUES($1,$2,'refund','credit',$3,$4,$5,'Refund for SMTP recipients rejected by the provider',$6::jsonb) ON CONFLICT(reference) DO NOTHING",
      [reservation.workspace_id,reservation.user_id,rejectedUnits,wallet.balance_emails,"AL-EMAIL-REFUND-"+messageId+"-PARTIAL",JSON.stringify({messageId,rejectedRecipients})]
    );
  }else if(reservation.source==="wallet"){
    const refundAmount=(BigInt(String(reservation.unit_price_minor))*BigInt(rejectedUnits)).toString();
    acceptedAmountMinor=(BigInt(String(reservation.unit_price_minor))*BigInt(acceptedUnits)).toString();
    const wallet=(await client.query("SELECT balance_minor FROM aurelink_wallets WHERE user_id=$1 FOR UPDATE",[reservation.user_id])).rows[0];
    if(!wallet)throw new Error("Aurelink USD wallet is missing.");
    const next=BigInt(String(wallet.balance_minor))+BigInt(refundAmount);
    await client.query("UPDATE aurelink_wallets SET balance_minor=$2,updated_at=NOW() WHERE user_id=$1",[reservation.user_id,next.toString()]);
    const refundReference=String((reservation as any).wallet_reference||"AL-COMM-"+messageId)+"-PARTIAL-R";
    await client.query("INSERT INTO aurelink_wallet_ledger(user_id,entry_type,direction,amount_minor,balance_after_minor,currency,reference,description,metadata) VALUES($1,'refund','credit',$2,$3,'USD',$4,'Refund for SMTP recipients rejected by the provider',$5::jsonb)",[reservation.user_id,refundAmount,next.toString(),refundReference,JSON.stringify({messageId,rejectedRecipients})]);
    await client.query("INSERT INTO aurelink_communications_billing_ledger(user_id,workspace_id,message_id,entry_type,status,units,unit_price_minor,amount_minor,currency,wallet_reference,metadata) VALUES($1,$2,$3,'refund','posted',$4,$5,$6,'USD',$7,$8::jsonb) ON CONFLICT(message_id,entry_type) DO NOTHING",[reservation.user_id,reservation.workspace_id,messageId,rejectedUnits,reservation.unit_price_minor,refundAmount,refundReference,JSON.stringify({partial:true,rejectedRecipients})]);
    await client.query("UPDATE aurelink_communications_billing_ledger SET units=$2,amount_minor=$3,updated_at=NOW() WHERE message_id=$1 AND entry_type='charge' AND status='reserved'",[messageId,acceptedUnits,acceptedAmountMinor]);
  }
  await client.query(
    "UPDATE aurelink_email_usage_reservations SET units=$2,amount_minor=COALESCE($3,amount_minor),metadata=metadata||$4::jsonb,updated_at=NOW() WHERE message_id=$1",
    [messageId,acceptedUnits,acceptedAmountMinor,JSON.stringify({partialAcceptance:true,partialAcceptanceReconciled:true,acceptedUnits,rejectedUnits,rejectedRecipients})]
  );
  await client.query("UPDATE aurelink_communications_usage SET units=$2,updated_at=NOW() WHERE message_id=$1",[messageId,acceptedUnits]);
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
  }else if(reservation.source==="free"){
    const usageDate=String(reservation.metadata?.usageDate||"");
    const updated=await client.query(
      "UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails-$3,used_emails=used_emails+$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",
      [reservation.workspace_id,usageDate,reservation.units]
    );
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_FREE_DAILY_RESERVATION_MISMATCH");
  }else if(reservation.source==="prepaid"){
    const usageDate=String(reservation.metadata?.usageDate||new Date().toISOString().slice(0,10));
    const daily=await client.query("UPDATE aurelink_email_prepaid_daily_usage SET reserved_emails=reserved_emails-$3,used_emails=used_emails+$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",[reservation.workspace_id,usageDate,reservation.units]);
    if(!daily.rowCount)throw new Error("AURELINK_PREPAID_DAILY_RESERVATION_MISMATCH");
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
  }else if(reservation.source==="free"){
    const usageDate=String(reservation.metadata?.usageDate||"");
    const updated=await client.query(
      "UPDATE aurelink_email_free_daily_usage SET reserved_emails=reserved_emails-$3,updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date AND reserved_emails >= $3",
      [reservation.workspace_id,usageDate,reservation.units]
    );
    if(!updated.rowCount)throw new Error("AURELINK_EMAIL_FREE_DAILY_RESERVATION_MISMATCH");
  }else if(reservation.source==="prepaid"){
    const usageDate=String(reservation.metadata?.usageDate||new Date().toISOString().slice(0,10));
    await client.query("UPDATE aurelink_email_prepaid_daily_usage SET reserved_emails=GREATEST(0,reserved_emails-$3),updated_at=NOW() WHERE workspace_id=$1 AND usage_date=$2::date",[reservation.workspace_id,usageDate,reservation.units]);
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
