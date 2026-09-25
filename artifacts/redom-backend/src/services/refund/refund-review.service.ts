import axios from "axios";
import { pool } from "../../database/db";
import { env } from "../../config/env";
import { addSupportMessage, permanentlyCloseSupportCase } from "../support/support.service";
import { sendRefundProviderEmail } from "./refund.service";

let running=false;
let timer:NodeJS.Timeout|undefined;

async function processOne(row:any):Promise<void>{
 const metadata=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata??{};
 const stars=Number(metadata?.stars??0);
 // Refund only the original ReDom product amount. The provider's gross/settled
 // amount can include non-refundable processing/tax/transfer charges and must
 // never be used as the refund amount.
 const amountMinor=String(row.amount_minor);
 const target=String(row.refund_target_masked??"original payment rail");
 let eligible=true;
 let reason="The product and transaction passed ReDom's automated refund eligibility review.";
 if(String(row.payment_status)!=="paid"){ eligible=false; reason="The payment is no longer in a completed paid state."; }
 if(String(row.purpose)!=="stars_purchase"){ eligible=false; reason="This product is not eligible for the Stars refund workflow."; }
 if(!Number.isInteger(stars)||stars<=0){ eligible=false; reason="The Stars purchase record is incomplete."; }
 if(eligible){
   const account=await pool.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 LIMIT 1",[row.user_id]);
   const balance=BigInt(String(account.rows[0]?.balance??"0"));
   if(balance<BigInt(stars)){ eligible=false; reason="The purchased Stars have already been used or are no longer available in the account, so the product fails the refund eligibility review."; }
 }
 if(!eligible){
   await pool.query("UPDATE refund_reviews SET eligibility_result='ineligible',transaction_result='verified',decision='denied',decision_reason=$1,completed_at=now(),internal_notes=$1 WHERE refund_request_id=$2 AND completed_at IS NULL",[reason,row.refund_request_id]);
   await pool.query("UPDATE refund_requests SET status='refund_rejected',decision='denied',decision_reason=$1,reviewed_at=now(),updated_at=now(),case_invalidated_at=COALESCE(case_invalidated_at,now()) WHERE id=$2",[reason,row.refund_request_id]);
   await pool.query("UPDATE refund_transaction_locks SET outcome_status='refund_rejected',outcome_reason=$1,invalidated_at=COALESCE(invalidated_at,now()),updated_at=now() WHERE transaction_number=$2",[reason,row.redom_transaction_id]);
   await sendRefundProviderEmail({email:String(row.email),caseNumber:String(row.case_number),transactionNumber:String(row.redom_transaction_id),status:"Refund Rejected",reason,target,amount:String(amountMinor),currency:String(row.currency)});
   await addSupportMessage({caseId:String(row.case_id),senderType:"system",body:"Refund review completed: rejected. Reason: "+reason});
   await addSupportMessage({caseId:String(row.case_id),senderType:"ai",senderEmail:env.email.supportFrom,body:"Your refund request has been processed and the review is complete. The case is now closed. The final decision and reason have been sent from refunds@."});
   await permanentlyCloseSupportCase(String(row.case_id));
   return;
 }
 let refund:any;
 try{
   const providerReference=String(row.provider_reference ?? row.reference ?? "").trim();
   if(!providerReference) throw new Error("Provider reference could not be resolved from the ReDom Transaction ID.");

   // Resolve and verify the real Paystack transaction before creating a refund.
   // The ReDom transaction ID is only our internal identifier; Paystack must receive
   // the provider reference. For bank-transfer payments, Paystack's gross amount can
   // include customer-paid charges, while requested_amount is the merchant/product
   // amount. The refund is always limited to the original ReDom product amount.
   const auth={headers:{Authorization:"Bearer "+env.payments.paystack.secretKey,"Content-Type":"application/json"},timeout:20000};
   const verified=await axios.get("https://api.paystack.co/transaction/verify/"+encodeURIComponent(providerReference),auth);
   if(!verified.data?.status || !verified.data?.data) {
     throw new Error(verified.data?.message||"Paystack could not verify the provider transaction.");
   }
   const providerTransaction=verified.data.data;
   if(String(providerTransaction.status).toLowerCase()!=="success") {
     throw new Error("Paystack transaction is not in a successful state and cannot be refunded.");
   }

   const providerCurrency=String(providerTransaction.currency??"").toUpperCase();
   const refundCurrency=String(row.currency??"").toUpperCase();
   if(providerCurrency && refundCurrency && providerCurrency!==refundCurrency) {
     throw new Error("Paystack transaction currency does not match the ReDom payment currency.");
   }

   const merchantAmountMinor=String(providerTransaction.requested_amount ?? providerTransaction.amount ?? "");
   if(!/^\\d+$/.test(merchantAmountMinor)) {
     throw new Error("Paystack returned an invalid original transaction amount.");
   }
   if(BigInt(amountMinor)>BigInt(merchantAmountMinor)) {
     throw new Error("The ReDom refund amount exceeds the provider's original merchant transaction amount.");
   }

   const response=await axios.post("https://api.paystack.co/refund",{
     transaction:providerReference,
     amount:amountMinor,
     currency:refundCurrency || undefined,
     customer_note:"ReDom Stars refund "+String(row.redom_transaction_id),
     merchant_note:"Approved ReDom Stars refund "+String(row.redom_transaction_id)
   },auth);
   if(!response.data?.status) throw new Error(response.data?.message||"Paystack rejected the refund request.");
   refund=response.data.data;
 }catch(error){
   let reason="Refund provider rejected the request.";
   if(axios.isAxiosError(error)){
     const status=error.response?.status;
     const data:any=error.response?.data;
     const providerMessage=String(data?.message??data?.error??"").trim();
     const providerCode=String(data?.code??"").trim();
     reason=providerMessage
       ? "Paystack refund request failed"+(status?" ("+status+")":"")+": "+providerMessage+(providerCode?" ["+providerCode+"]":"")
       : "Paystack refund request failed"+(status?" ("+status+")":"")+": "+String(error.message);
     console.error("Paystack refund request failed",{
       transactionReference:String(row.provider_reference ?? row.reference ?? ""),
       redomTransactionId:String(row.redom_transaction_id),
       refundAmountMinor:amountMinor,
       currency:String(row.currency),
       httpStatus:status??null,
       providerCode:providerCode||null,
       providerMessage:providerMessage||null
     });
   } else {
     reason=error instanceof Error?error.message:"Refund provider rejected the request.";
     console.error("Refund review provider failure",{
       transactionReference:String(row.provider_reference ?? row.reference ?? ""),
       redomTransactionId:String(row.redom_transaction_id),
       refundAmountMinor:amountMinor,
       currency:String(row.currency),
       error:reason
     });
   }
   await pool.query("UPDATE payment_transactions SET refund_status='failed',refund_error=$1,updated_at=now() WHERE id=$2",[reason.slice(0,500),row.payment_id]);
   await pool.query("UPDATE refund_reviews SET eligibility_result='eligible',transaction_result='provider_error',decision='approved',decision_reason=$1,completed_at=now(),internal_notes=$1 WHERE refund_request_id=$2 AND completed_at IS NULL",[reason,row.refund_request_id]);
   await pool.query("UPDATE refund_requests SET status='refund_failed',decision='approved',decision_reason=$1,reviewed_at=now(),updated_at=now(),case_invalidated_at=COALESCE(case_invalidated_at,now()) WHERE id=$2",[reason,row.refund_request_id]);
   await pool.query("UPDATE refund_transaction_locks SET outcome_status='refund_failed',outcome_reason=$1,invalidated_at=COALESCE(invalidated_at,now()),updated_at=now() WHERE transaction_number=$2",[reason,row.redom_transaction_id]);
   await sendRefundProviderEmail({email:String(row.email),caseNumber:String(row.case_number),transactionNumber:String(row.redom_transaction_id),status:"Refund Approved — Provider Failed",reason,target,amount:String(amountMinor),currency:String(row.currency)});
   await addSupportMessage({caseId:String(row.case_id),senderType:"ai",senderEmail:env.email.supportFrom,body:"Your refund request has been processed. The review approved the refund, but the payment provider could not accept the refund request. The case is now closed. The final status and reason have been sent from refunds@."});
   await permanentlyCloseSupportCase(String(row.case_id));
   return;
 }
 const status=String(refund.status||"pending");
 await pool.query("UPDATE payment_transactions SET refund_status=$1,refund_id=$2,refund_amount_minor=$3,refund_requested_at=now(),refund_expected_at=$4,refund_error=NULL,updated_at=now() WHERE id=$5",[status,refund.id?String(refund.id):null,String(refund.amount??amountMinor),refund.expected_at?new Date(refund.expected_at):null,row.payment_id]);
 await pool.query("UPDATE refund_reviews SET eligibility_result='eligible',transaction_result='verified',decision='approved',decision_reason='Product passed automated refund eligibility review.',completed_at=now(),internal_notes='Refund initiated after the scheduled review window.' WHERE refund_request_id=$1 AND completed_at IS NULL",[row.refund_request_id]);
 await pool.query("UPDATE refund_requests SET status='refund_processing',decision='approved',decision_reason='Product passed automated refund eligibility review and the provider refund was initiated.',reviewed_at=now(),refund_expected_by=$1,updated_at=now() WHERE id=$2",[refund.expected_at?new Date(refund.expected_at):null,row.refund_request_id]);
 await pool.query("UPDATE refund_transaction_locks SET outcome_status='refund_processing',outcome_reason='Refund approved and submitted to provider.',refund_id=COALESCE($1,refund_id),updated_at=now() WHERE transaction_number=$2",[refund.id?String(refund.id):null,row.redom_transaction_id]);
 await sendRefundProviderEmail({email:String(row.email),caseNumber:String(row.case_number),transactionNumber:String(row.redom_transaction_id),status:"Refund Approved — Initiated",reason:"The product passed the automated refund eligibility review and the refund was submitted to the payment provider.",target,refundId:refund.id?String(refund.id):null,amount:String(refund.amount??amountMinor),currency:String(row.currency)});
 await addSupportMessage({caseId:String(row.case_id),senderType:"ai",senderEmail:env.email.supportFrom,body:"Your refund request has been processed and the eligibility review is complete. The approved refund has been submitted to the payment provider. The support case remains open until Paystack returns a final refund decision. Further status updates will come from refunds@.\n\nSecurity warning: Never share your password, payment PIN, CVV, full card number, bank login, or one-time verification code with anyone."});
}

async function processDueRefundReviews():Promise<void>{
 if(running)return; running=true;
 try{
  const q=await pool.query(`SELECT rr.id AS refund_request_id,rr.case_id,rr.transaction_number AS redom_transaction_id,rr.refund_target_masked,sc.case_number,pt.id AS payment_id,pt.reference,COALESCE(NULLIF(pt.metadata->'paymentDetails'->>'providerReference',''),pt.reference) AS provider_reference,pt.amount_minor,pt.currency,pt.metadata,pt.purpose,pt.status AS payment_status,u.id AS user_id,u.email
  FROM refund_requests rr JOIN support_cases sc ON sc.id=rr.case_id JOIN payment_transactions pt ON pt.redom_transaction_id=rr.transaction_number JOIN users u ON u.id=rr.user_id
  WHERE rr.status='account_under_review' AND rr.review_available_at IS NOT NULL AND rr.review_available_at<=now() AND rr.case_invalidated_at IS NULL
  ORDER BY rr.review_available_at ASC LIMIT 25`);
  for(const row of q.rows){try{await processOne(row);}catch(error){console.error("Refund review processing failed",error);}}
 }finally{running=false;}
}

export function startRefundReviewCleanup():void{
 if(timer)return;
 timer=setInterval(()=>{void processDueRefundReviews();},5*60*1000);
 void processDueRefundReviews();
}
export function stopRefundReviewCleanup():void{if(timer)clearInterval(timer);timer=undefined;}
