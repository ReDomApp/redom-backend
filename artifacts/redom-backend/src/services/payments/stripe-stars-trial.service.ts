import axios from "axios";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { pool } from "../../database/db";
import { sendPaymentEmailForReference } from "./payment.service";

const API = "https://api.stripe.com/v1";
const BACKEND_CALLBACK = "https://redom-backend.onrender.com/redom-backend/payments/stripe/callback";
const TERMS_VERSION = "stars-trial-v1";
const CONSENT_DISCLOSURE = "I authorize ReDom to save my Stripe payment method and make one off-session payment for 10 ReDom Stars after the 7-day trial. No charge is made when the trial starts. If the first conversion payment fails, ReDom will retry once approximately 24 hours later. No third automatic attempt will be made.";

type StripeSetupSession = {
  id:string; url?:string|null; status?:string|null; setup_intent?:string|{id?:string}|null;
  customer?:string|{id?:string}|null; metadata?:Record<string,string>;
};
type StripeSetupIntent = {
  id:string; status?:string|null; customer?:string|{id?:string}|null; payment_method?:string|{id?:string}|null;
};
type StripePaymentIntent = {
  id:string; status?:string|null; amount?:number|null; currency?:string|null;
  customer?:string|{id?:string}|null; payment_method?:string|{id?:string}|null;
  last_payment_error?:{message?:string|null}|null; metadata?:Record<string,string>;
};

function headers(){return {Authorization:"Bearer "+env.stripe.secretKey};}
function form(fields:Record<string,string|number|undefined|null>){const b=new URLSearchParams();for(const[k,v]of Object.entries(fields))if(v!==undefined&&v!==null)b.append(k,String(v));return b;}
async function stripe<T>(method:"get"|"post",path:string,data?:URLSearchParams):Promise<T>{
 const r=await axios.request<T>({method,url:API+path,data,headers:{...headers(),...(data?{"Content-Type":"application/x-www-form-urlencoded"}:{})},timeout:20000});
 return r.data;
}
function id(session:StripeSetupSession){return typeof session.setup_intent==="string"?session.setup_intent:session.setup_intent?.id?String(session.setup_intent.id):null;}
function customerId(v:any){return typeof v==="string"?v:v?.id?String(v.id):null;}
function paymentMethodId(v:any){return typeof v==="string"?v:v?.id?String(v.id):null;}
function reference(){return "trial_"+Date.now()+"_"+crypto.randomBytes(8).toString("hex");}
function localQuote(countryCode:string):{currency:string;amountMinor:number}{
 const rates:Record<string,{currency:string;rate:number}>={
  NG:{currency:"NGN",rate:1500},GH:{currency:"GHS",rate:12.5},KE:{currency:"KES",rate:130},
  ZA:{currency:"ZAR",rate:17.5},CI:{currency:"XOF",rate:600},US:{currency:"USD",rate:1},
 };
 const c=rates[String(countryCode).toUpperCase()];
 if(!c) throw new Error("The selected country is not currently available for ReDom Stars pricing.");
 return {currency:c.currency,amountMinor:Math.max(1,Math.round(2.21*c.rate*100))};
}

export async function getStarsTrialEligibility(userId:string){
 const existing=await pool.query("SELECT id,status,trial_started_at,trial_ends_at FROM redom_stars_trials WHERE user_id=$1 LIMIT 1",[userId]);
 if(existing.rows[0]) return {eligible:false,trial:existing.rows[0]};
 const pendingSetup=await pool.query("SELECT id,reference,status FROM redom_stars_trial_setups WHERE user_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 1",[userId]);
 if(pendingSetup.rows[0]) return {eligible:false,trial:null,pendingSetup:pendingSetup.rows[0]};
 const purchase=await pool.query("SELECT 1 FROM redom_stars_transactions WHERE user_id=$1 AND type='purchase' LIMIT 1",[userId]);
 return {eligible:!purchase.rows[0],trial:null};
}

export async function createStarsTrialSetupCheckout(input:{userId:string;email:string;countryCode:string;termsVersion?:string;consentTimestamp?:string}){
 const eligibility=await getStarsTrialEligibility(input.userId);
 if(!eligibility.eligible) throw new Error("This Stars trial has already been used or is no longer available.");
 const quote=localQuote(input.countryCode);
 const ref=reference();
 const consentTimestamp=input.consentTimestamp?new Date(input.consentTimestamp):new Date();
 if(Number.isNaN(consentTimestamp.getTime())||consentTimestamp.getTime()>Date.now()+60000)throw new Error("Invalid trial authorization timestamp.");
 const termsVersion=String(input.termsVersion||TERMS_VERSION);
 const disclosure=CONSENT_DISCLOSURE;
 const metadata={provider:"stripe",purpose:"stars_trial_setup",reference:ref,userId:input.userId,countryCode:String(input.countryCode).toUpperCase(),currency:quote.currency,conversionStars:"10",conversionAmountMinor:String(quote.amountMinor),termsVersion};
 const session=await stripe<StripeSetupSession>("post","/checkout/sessions",form({
   mode:"setup",customer_creation:"always",client_reference_id:ref,customer_email:input.email,
   success_url:BACKEND_CALLBACK+"?session_id={CHECKOUT_SESSION_ID}&reference="+encodeURIComponent(ref),
   cancel_url:BACKEND_CALLBACK+"?reference="+encodeURIComponent(ref)+"&status=cancelled",
   "metadata[provider]":"stripe","metadata[purpose]":"stars_trial_setup","metadata[reference]":ref,
   "metadata[userId]":input.userId,"metadata[countryCode]":String(input.countryCode).toUpperCase(),
   "metadata[currency]":quote.currency,"metadata[conversionStars]":"10","metadata[conversionAmountMinor]":String(quote.amountMinor),
   "metadata[termsVersion]":termsVersion,
 }));
 if(!session.id||!session.url)throw new Error("Stripe did not return the trial authorization checkout URL.");
 await pool.query(`INSERT INTO redom_stars_trial_setups(reference,user_id,stripe_session_id,terms_version,consent_timestamp,consent_disclosure,country_code,currency,conversion_amount_minor,status,metadata)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10::jsonb)`,
 [ref,input.userId,session.id,termsVersion,consentTimestamp,disclosure,String(input.countryCode).toUpperCase(),quote.currency,quote.amountMinor,JSON.stringify(metadata)]);
 return {reference,checkoutUrl:session.url,sessionId:session.id};
}

export async function finalizeStarsTrialSetup(referenceValue:string){
 const setup=await pool.query("SELECT * FROM redom_stars_trial_setups WHERE reference=$1 LIMIT 1",[referenceValue]);
 if(!setup.rows[0]) throw new Error("Stars trial authorization was not found.");
 const row=setup.rows[0];
 const session=await stripe<StripeSetupSession>("get","/checkout/sessions/"+encodeURIComponent(String(row.stripe_session_id)));
 if(String(session.status)==="expired") {await pool.query("UPDATE redom_stars_trial_setups SET status='abandoned',updated_at=now() WHERE id=$1",[row.id]);return {status:"abandoned"};}
 const setupIntentId=id(session);
 if(!setupIntentId) return {status:"processing"};
 const intent=await stripe<StripeSetupIntent>("get","/setup_intents/"+encodeURIComponent(setupIntentId));
 if(String(intent.status)!=="succeeded") return {status:"processing"};
 const customer=customerId(intent.customer??session.customer);
 const pm=paymentMethodId(intent.payment_method);
 if(!customer||!pm) throw new Error("Stripe did not return the customer/payment method required for the Stars trial.");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const current=await client.query("SELECT * FROM redom_stars_trials WHERE user_id=$1 FOR UPDATE",[row.user_id]);
  if(current.rows[0]){await client.query("UPDATE redom_stars_trial_setups SET status='completed',stripe_setup_intent_id=$1,updated_at=now() WHERE id=$2",[setupIntentId,row.id]);await client.query("COMMIT");return {status:"active",trialId:String(current.rows[0].id)};}
  const start=new Date(); const end=new Date(start.getTime()+7*24*60*60*1000);
  const inserted=await client.query(`INSERT INTO redom_stars_trials
   (user_id,status,trial_started_at,trial_ends_at,stars_granted,conversion_stars,country_code,currency,conversion_amount_minor,stripe_customer_id,stripe_payment_method_id,consent_terms_version,consent_timestamp,consent_disclosure,created_at,updated_at)
   VALUES($1,'active',$2,$3,20,10,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) RETURNING id`,
   [row.user_id,start,end,row.country_code,row.currency,row.conversion_amount_minor,customer,pm,row.terms_version,row.consent_timestamp,row.consent_disclosure]);
  await client.query("INSERT INTO redom_stars_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[row.user_id]);
  const balance=await client.query("SELECT balance FROM redom_stars_accounts WHERE user_id=$1 FOR UPDATE",[row.user_id]);
  const next=BigInt(String(balance.rows[0]?.balance??"0"))+20n;
  await client.query("UPDATE redom_stars_accounts SET balance=$1,updated_at=now() WHERE user_id=$2",[next.toString(),row.user_id]);
  await client.query("INSERT INTO redom_stars_transactions(user_id,type,stars,balance_after,package_key,country_code,currency,amount_minor,reference) VALUES($1,'trial',$2,$3,'stars_trial_20',$4,$5,0,$6)",[row.user_id,20,next.toString(),row.country_code,row.currency,referenceValue]);
  await client.query("UPDATE redom_stars_trial_setups SET status='completed',stripe_setup_intent_id=$1,stripe_customer_id=$2,stripe_payment_method_id=$3,updated_at=now() WHERE id=$4",[setupIntentId,customer,pm,row.id]);
  await client.query("COMMIT");
  return {status:"active",trialId:String(inserted.rows[0].id),trialEndsAt:end.toISOString()};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}

async function recordPi(trialId:string,pi:StripePaymentIntent,attempt:number){
 await pool.query("UPDATE redom_stars_trials SET stripe_payment_intent_ids=COALESCE(stripe_payment_intent_ids,'[]'::jsonb)||$1::jsonb,conversion_attempt_number=$2,first_conversion_attempt_at=COALESCE(first_conversion_attempt_at,now()),updated_at=now() WHERE id=$3",[JSON.stringify([String(pi.id)]),attempt,trialId]);
}

async function convertTrial(row:any):Promise<void>{
 const amount=Number(row.conversion_amount_minor);
 await pool.query("UPDATE redom_stars_trials SET status='conversion_pending',conversion_attempt_number=1,first_conversion_attempt_at=now(),updated_at=now() WHERE id=$1",[row.id]);
 let pi:StripePaymentIntent|null=null;
 try{
  pi=await stripe<StripePaymentIntent>("post","/payment_intents",form({
   amount,currency:String(row.currency).toLowerCase(),customer:String(row.stripe_customer_id),payment_method:String(row.stripe_payment_method_id),
   off_session:"true",confirm:"true",
   "metadata[purpose]":"stars_trial_conversion","metadata[trialId]":String(row.id),"metadata[userId]":String(row.user_id),"metadata[stars]":"10","metadata[attemptNumber]":"1",
  }));
  await recordPi(String(row.id),pi,1);
  if(String(pi.status)!=="succeeded") throw new Error(String(pi.last_payment_error?.message||"Stripe did not confirm the trial conversion payment."));
  await finalizeTrialPaid(row,pi);
 }catch(error){
  if(pi&&String(pi.status)==="succeeded"){
   try{await finalizeTrialPaid(row,pi);return;}catch{}
  }
  const msg=String(error instanceof Error?error.message:error).slice(0,500);
  await pool.query("UPDATE redom_stars_trials SET status='retry_pending',retry_at=now()+interval '24 hours',failure_reason=$1,updated_at=now(),final_conversion_status='first_failed' WHERE id=$2",[msg,row.id]);
 }
}


async function finalizeTrialFailed(row:any,message:string,piId:string|null){
 const reference="trial_conversion_failed_"+String(row.id)+"_"+Date.now();
 const redom="RS-"+Array.from({length:16},()=>crypto.randomInt(0,10)).join("");
 const metadata={provider:"stripe",purpose:"stars_trial_conversion",trialId:String(row.id),stars:10,stripePaymentIntentId:piId,paymentDetails:{provider:"stripe",providerReference:piId,channel:"stripe_off_session",currency:String(row.currency).toUpperCase(),requestedAmountMinor:row.conversion_amount_minor},failureReason:message};
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const exists=await client.query("SELECT id FROM payment_transactions WHERE reference=$1 LIMIT 1",[reference]);
  if(!exists.rows[0]){
   await client.query(`INSERT INTO payment_transactions(user_id,reference,redom_transaction_id,amount_minor,currency,purpose,status,metadata,country_code,customer_email,payment_provider,provider_transaction_id,gateway_status,failure_message)
    SELECT user_id,$1,$2,conversion_amount_minor,currency,'stars_purchase','failed',$3::jsonb,country_code,(SELECT email FROM users WHERE id=redom_stars_trials.user_id),'stripe',$4,'failed',$5 FROM redom_stars_trials WHERE id=$6`,
    [reference,redom,JSON.stringify(metadata),piId,message.slice(0,500),row.id]);
  }
  await client.query("UPDATE redom_stars_trials SET status='conversion_failed_final',final_conversion_status='failed',failure_reason=$1,retry_at=NULL,updated_at=now() WHERE id=$2",[message.slice(0,500),row.id]);
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
 await sendPaymentEmailForReference(reference);
}

async function retryTrial(row:any):Promise<void>{
 let pi:StripePaymentIntent|null=null;
 try{
  pi=await stripe<StripePaymentIntent>("post","/payment_intents",form({
   amount:Number(row.conversion_amount_minor),currency:String(row.currency).toLowerCase(),customer:String(row.stripe_customer_id),
   payment_method:String(row.stripe_payment_method_id),off_session:"true",confirm:"true",
   "metadata[purpose]":"stars_trial_conversion","metadata[trialId]":String(row.id),"metadata[userId]":String(row.user_id),"metadata[stars]":"10","metadata[attemptNumber]":"2",
  }));
  await recordPi(String(row.id),pi,2);
  if(String(pi.status)!=="succeeded")throw new Error(String(pi.last_payment_error?.message||"Stripe did not confirm the trial conversion retry."));
  await finalizeTrialPaid(row,pi);
 }catch(error){
  if(pi&&String(pi.status)==="succeeded"){
   try{await finalizeTrialPaid(row,pi);return;}catch{}
  }
  const msg=String(error instanceof Error?error.message:error).slice(0,500);
  await finalizeTrialFailed(row,msg,pi?.id?String(pi.id):null);
 }
}

export async function verifyStarsTrialSetup(userId:string,referenceValue:string){
 const row=await pool.query("SELECT * FROM redom_stars_trial_setups WHERE reference=$1 AND user_id=$2 LIMIT 1",[referenceValue,userId]);
 if(!row.rows[0])throw new Error("Stars trial authorization not found.");
 const setup=row.rows[0];
 if(String(setup.status)==="completed"){
  const trial=await pool.query("SELECT id,status,trial_started_at,trial_ends_at,stars_granted,conversion_stars FROM redom_stars_trials WHERE user_id=$1 LIMIT 1",[userId]);
  return {status:"active",trial:trial.rows[0]??null,reference:referenceValue};
 }
 const result=await finalizeStarsTrialSetup(referenceValue);
 if(result.status==="active"){
  const trial=await pool.query("SELECT id,status,trial_started_at,trial_ends_at,stars_granted,conversion_stars FROM redom_stars_trials WHERE user_id=$1 LIMIT 1",[userId]);
  return {status:"active",trial:trial.rows[0]??null,reference:referenceValue};
 }
 return {status:result.status,trial:null,reference:referenceValue};
}

export async function processDueStarsTrials(){
 const due=await pool.query(`SELECT * FROM redom_stars_trials WHERE status='active' AND trial_ends_at<=now()
 UNION ALL
 SELECT * FROM redom_stars_trials WHERE status='retry_pending' AND retry_at IS NOT NULL AND retry_at<=now()`);
 for(const row of due.rows){
  if(String(row.status)==="active")await convertTrial(row);else await retryTrial(row);
 }
}

let timer:NodeJS.Timeout|null=null;
export function startStarsTrialWorker(){if(timer)return;timer=setInterval(()=>void processDueStarsTrials().catch(()=>undefined),60_000);void processDueStarsTrials().catch(()=>undefined);}
export function stopStarsTrialWorker(){if(timer){clearInterval(timer);timer=null;}}

export { TERMS_VERSION, CONSENT_DISCLOSURE };
