import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { chargeAurelinkUsage, captureAurelinkUsage, refundAurelinkUsage } from "./communications-billing.service";

type Db = Pick<PoolClient,"query">;
type Reservation = { source:"package"|"wallet"; units:number; unitPriceMinor:number|null; amountMinor:string|null; walletReference:string|null };

/** SMS has exactly two funding sources: prepaid SMS segments, then the Aurelink USD wallet. */
export async function reserveAurelinkSmsUsage(client:Db,input:{
 userId:string;workspaceId:string;messageId:string;units:number;countryCode?:string;
 provider:string;category:string;metadata?:Record<string,unknown>;
}):Promise<Reservation>{
 if(!Number.isSafeInteger(input.units)||input.units<1)throw new Error("AURELINK_INVALID_SMS_UNITS");
 const prior=await client.query("SELECT source,units,unit_price_minor,amount_minor,wallet_reference FROM aurelink_sms_usage_reservations WHERE message_id=$1 FOR UPDATE",[input.messageId]);
 if(prior.rows[0]){const r=prior.rows[0];return {source:r.source,units:Number(r.units),unitPriceMinor:r.unit_price_minor===null?null:Number(r.unit_price_minor),amountMinor:r.amount_minor===null?null:String(r.amount_minor),walletReference:r.wallet_reference??null};}
 await client.query("INSERT INTO aurelink_sms_package_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[input.workspaceId,input.userId]);
 const wallet=(await client.query("SELECT balance_segments,reserved_segments FROM aurelink_sms_package_wallets WHERE workspace_id=$1 FOR UPDATE",[input.workspaceId])).rows[0];
 if(!wallet)throw new Error("AURELINK_SMS_PACKAGE_WALLET_UNAVAILABLE");
 const available=BigInt(String(wallet.balance_segments))-BigInt(String(wallet.reserved_segments));
 if(available>=BigInt(input.units)){
  await client.query("UPDATE aurelink_sms_package_wallets SET reserved_segments=reserved_segments+$2,updated_at=NOW() WHERE workspace_id=$1",[input.workspaceId,input.units]);
  await client.query("INSERT INTO aurelink_sms_usage_reservations(message_id,workspace_id,user_id,source,units,status,metadata) VALUES($1,$2,$3,'package',$4,'reserved',$5::jsonb)",[input.messageId,input.workspaceId,input.userId,input.units,JSON.stringify({provider:input.provider,category:input.category,countryCode:input.countryCode||"*",...input.metadata})]);
  return {source:"package",units:input.units,unitPriceMinor:null,amountMinor:null,walletReference:"AL-SMS-PACKAGE-"+input.messageId};
 }
 const charged=await chargeAurelinkUsage(client,{userId:input.userId,workspaceId:input.workspaceId,messageId:input.messageId,service:"sms_segment",units:input.units,countryCode:input.countryCode||"*",metadata:{channel:"sms",provider:input.provider,category:input.category,billingSource:"wallet",...input.metadata}});
 await client.query("INSERT INTO aurelink_sms_usage_reservations(message_id,workspace_id,user_id,source,units,unit_price_minor,amount_minor,wallet_reference,status,metadata) VALUES($1,$2,$3,'wallet',$4,$5,$6,$7,'reserved',$8::jsonb)",[input.messageId,input.workspaceId,input.userId,input.units,charged.unitPriceMinor,charged.amountMinor,charged.reference,JSON.stringify({provider:input.provider,category:input.category,countryCode:input.countryCode||"*",priceId:charged.priceId})]);
 return {source:"wallet",units:input.units,unitPriceMinor:charged.unitPriceMinor,amountMinor:charged.amountMinor,walletReference:charged.reference};
}
export async function captureAurelinkSmsUsage(client:Db,messageId:string):Promise<void>{
 const result=await client.query("SELECT * FROM aurelink_sms_usage_reservations WHERE message_id=$1 FOR UPDATE",[messageId]);const r=result.rows[0];
 if(!r||r.status==="captured"||r.status==="refunded")return;if(r.status==="unknown")throw new Error("AURELINK_SMS_USAGE_REQUIRES_RECONCILIATION");
 if(r.source==="package"){
  const updated=await client.query("UPDATE aurelink_sms_package_wallets SET reserved_segments=reserved_segments-$2,balance_segments=balance_segments-$2,updated_at=NOW() WHERE workspace_id=$1 AND reserved_segments >= $2 AND balance_segments >= $2 RETURNING balance_segments",[r.workspace_id,r.units]);
  if(!updated.rows[0])throw new Error("AURELINK_SMS_PACKAGE_RESERVATION_MISMATCH");
  await client.query("INSERT INTO aurelink_sms_package_ledger(workspace_id,user_id,entry_type,direction,amount_segments,balance_after,reference,description,metadata) VALUES($1,$2,'usage','debit',$3,$4,$5,'Aurelink SMS package usage',$6::jsonb)",[r.workspace_id,r.user_id,r.units,updated.rows[0].balance_segments,"AL-SMS-USE-"+messageId,JSON.stringify({messageId,units:r.units})]);
 }else await captureAurelinkUsage(client,messageId);
 await client.query("UPDATE aurelink_sms_usage_reservations SET status='captured',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);
}
export async function refundAurelinkSmsUsage(client:Db,messageId:string):Promise<void>{
 const result=await client.query("SELECT * FROM aurelink_sms_usage_reservations WHERE message_id=$1 FOR UPDATE",[messageId]);const r=result.rows[0];
 if(!r||r.status==="refunded")return;if(r.status==="captured")throw new Error("AURELINK_SMS_USAGE_ALREADY_CAPTURED");if(r.status==="unknown")throw new Error("AURELINK_SMS_USAGE_REQUIRES_RECONCILIATION");
 if(r.source==="package"){
  const updated=await client.query("UPDATE aurelink_sms_package_wallets SET reserved_segments=reserved_segments-$2,updated_at=NOW() WHERE workspace_id=$1 AND reserved_segments >= $2 RETURNING balance_segments",[r.workspace_id,r.units]);
  if(!updated.rows[0])throw new Error("AURELINK_SMS_PACKAGE_RESERVATION_MISMATCH");
 }else await refundAurelinkUsage(client,messageId,String(r.user_id),String(r.workspace_id));
 await client.query("UPDATE aurelink_sms_usage_reservations SET status='refunded',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);
}
export async function markAurelinkSmsUsageUnknown(client:Db,messageId:string):Promise<void>{await client.query("UPDATE aurelink_sms_usage_reservations SET status='unknown',updated_at=NOW() WHERE message_id=$1 AND status='reserved'",[messageId]);}
export async function restoreAurelinkSmsUsageForReconciliation(client:Db,messageId:string):Promise<void>{await client.query("UPDATE aurelink_sms_usage_reservations SET status='reserved',updated_at=NOW() WHERE message_id=$1 AND status='unknown'",[messageId]);}

/** Credit a prepaid package only after a trusted payment webhook has verified settlement. */
export async function creditAurelinkSmsPackage(client:Db,input:{
 userId:string;workspaceId:string;packageCode:string;paymentReference:string;ledgerReference:string;
}):Promise<{credited:boolean;segments:string;balance:string;ledgerReference:string}>{
 const paymentReference=input.paymentReference.trim();
 if(!/^[A-Z0-9]{18,19}$/.test(paymentReference))throw new Error("AURELINK_SMS_INVALID_PAYMENT_REFERENCE");
 const pkg=(await client.query("SELECT package_code,sms_segments,price_minor,currency FROM aurelink_sms_package_catalog WHERE package_code=$1 AND active=TRUE FOR SHARE",[input.packageCode])).rows[0];
 if(!pkg||String(pkg.currency)!=="USD")throw new Error("AURELINK_SMS_PACKAGE_NOT_AVAILABLE");
 await client.query("INSERT INTO aurelink_sms_package_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[input.workspaceId,input.userId]);
 const wallet=(await client.query("SELECT balance_segments FROM aurelink_sms_package_wallets WHERE workspace_id=$1 FOR UPDATE",[input.workspaceId])).rows[0];
 if(!wallet)throw new Error("AURELINK_SMS_PACKAGE_WALLET_UNAVAILABLE");
 const reference=input.ledgerReference;
 if(!/^[A-Z0-9]{18,19}$/.test(reference))throw new Error("AURELINK_SMS_INVALID_CREDIT_LEDGER_REFERENCE");
 const prior=(await client.query("SELECT reference,balance_after,amount_segments FROM aurelink_sms_package_ledger WHERE payment_reference=$1 AND entry_type='purchase' AND direction='credit' FOR UPDATE",[paymentReference])).rows[0];
 if(prior)return {credited:false,segments:String(prior.amount_segments),balance:String(prior.balance_after),ledgerReference:String(prior.reference)};
 const next=BigInt(String(wallet.balance_segments))+BigInt(String(pkg.sms_segments));
 await client.query("UPDATE aurelink_sms_package_wallets SET balance_segments=$2,updated_at=NOW() WHERE workspace_id=$1",[input.workspaceId,next.toString()]);
 await client.query("INSERT INTO aurelink_sms_package_ledger(workspace_id,user_id,entry_type,direction,amount_segments,balance_after,reference,reference_format_version,payment_reference,description,metadata) VALUES($1,$2,'purchase','credit',$3,$4,$5,2,$6,'Aurelink SMS prepaid package purchase',$7::jsonb)",[input.workspaceId,input.userId,String(pkg.sms_segments),next.toString(),reference,paymentReference,JSON.stringify({product:"sms",purchaseType:"sms_package",packageCode:pkg.package_code,priceMinor:String(pkg.price_minor),currency:pkg.currency,previousBalance:String(wallet.balance_segments),newBalance:next.toString()})]);
 await client.query("INSERT INTO aurelink_sms_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'package_credited',$3::jsonb)",[input.workspaceId,input.userId,JSON.stringify({packageCode:pkg.package_code,paymentReference,segments:String(pkg.sms_segments)})]);
 return {credited:true,segments:String(pkg.sms_segments),balance:next.toString(),ledgerReference:reference};
}


/** Append-only admin adjustment. A reversal is a new opposite-direction ledger entry. */
export async function adjustAurelinkSmsPackageBalance(client:Db,input:{workspaceId:string;actorUserId:string;amountSegments:number;direction:"credit"|"debit";reason:string;reversalOfReference?:string}){
 if(!Number.isSafeInteger(input.amountSegments)||input.amountSegments<1||input.amountSegments>10000000)throw new Error("AURELINK_SMS_INVALID_ADJUSTMENT_AMOUNT");
 const workspace=(await client.query("SELECT id,user_id FROM aurelink_communications_workspaces WHERE id=$1 FOR UPDATE",[input.workspaceId])).rows[0];if(!workspace)throw new Error("AURELINK_SMS_WORKSPACE_NOT_FOUND");
 let linkedPaymentReference:string|null=null;let reversingPurchase=false;
 if(input.reversalOfReference){const original=(await client.query("SELECT workspace_id,direction,amount_segments,payment_reference,entry_type FROM aurelink_sms_package_ledger WHERE reference=$1 FOR SHARE",[input.reversalOfReference])).rows[0];if(!original||String(original.workspace_id)!==input.workspaceId)throw new Error("AURELINK_SMS_REVERSAL_REFERENCE_NOT_FOUND");if(Number(original.amount_segments)!==input.amountSegments||original.direction===input.direction)throw new Error("AURELINK_SMS_REVERSAL_MUST_MATCH_ORIGINAL_AMOUNT_AND_OPPOSITE_DIRECTION");linkedPaymentReference=original.payment_reference?String(original.payment_reference):null;reversingPurchase=original.entry_type==="purchase"&&Boolean(linkedPaymentReference);const duplicate=await client.query("SELECT 1 FROM aurelink_sms_package_ledger WHERE metadata->>'reversalOfReference'=$1 LIMIT 1",[input.reversalOfReference]);if(duplicate.rows.length)throw new Error("AURELINK_SMS_LEDGER_ENTRY_ALREADY_REVERSED");}
 await client.query("INSERT INTO aurelink_sms_package_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[input.workspaceId,workspace.user_id]);
 const wallet=(await client.query("SELECT balance_segments,reserved_segments FROM aurelink_sms_package_wallets WHERE workspace_id=$1 FOR UPDATE",[input.workspaceId])).rows[0];const current=BigInt(String(wallet.balance_segments)),reserved=BigInt(String(wallet.reserved_segments)),amount=BigInt(input.amountSegments);if(input.direction==="debit"&&current-reserved<amount)throw new Error("AURELINK_SMS_INSUFFICIENT_AVAILABLE_SEGMENTS");const next=input.direction==="credit"?current+amount:current-amount;
 let reference="";let inserted:any;for(let i=0;i<30;i++){let out="";while(out.length<19){for(const b of crypto.randomBytes(32)){if(b>=252)continue;out+="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[b%36];if(out.length===19)break;}}reference=out;inserted=await client.query("INSERT INTO aurelink_sms_credit_reference_reservations(reference) SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM aurelink_sms_package_ledger WHERE reference=$1) ON CONFLICT DO NOTHING RETURNING reference",[reference]);if(inserted.rows[0])break;}if(!inserted?.rows[0])throw new Error("AURELINK_SMS_LEDGER_REFERENCE_UNAVAILABLE");
 await client.query("UPDATE aurelink_sms_package_wallets SET balance_segments=$2,updated_at=NOW() WHERE workspace_id=$1",[input.workspaceId,next.toString()]);await client.query("INSERT INTO aurelink_sms_package_ledger(workspace_id,user_id,entry_type,direction,amount_segments,balance_after,reference,reference_format_version,payment_reference,description,metadata) VALUES($1,$2,'adjustment',$3,$4,$5,$6,2,$7,$8,$9::jsonb)",[input.workspaceId,workspace.user_id,input.direction,amount.toString(),next.toString(),reference,linkedPaymentReference,input.reason,JSON.stringify({product:"sms",adminUserId:input.actorUserId,reason:input.reason,reversalOfReference:input.reversalOfReference||null,purchaseReference:linkedPaymentReference,previousBalance:current.toString(),newBalance:next.toString()})]);if(reversingPurchase&&linkedPaymentReference)await client.query("UPDATE aurelink_sms_package_payments SET credit_allocation_status='reversed',updated_at=NOW() WHERE reference=$1 AND credit_ledger_reference=$2",[linkedPaymentReference,input.reversalOfReference]);await client.query("INSERT INTO aurelink_sms_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,$3,$4::jsonb)",[input.workspaceId,input.actorUserId,input.reversalOfReference?"sms_credit_reversed":"sms_credit_adjusted",JSON.stringify({amountSegments:input.amountSegments,direction:input.direction,reference,reversalOfReference:input.reversalOfReference||null,purchaseReference:linkedPaymentReference,reason:input.reason,previousBalance:current.toString(),newBalance:next.toString()})]);return {reference,previousBalance:current.toString(),newBalance:next.toString(),amountSegments:amount.toString(),direction:input.direction};
}
