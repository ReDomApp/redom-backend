import axios from "axios";
import { env } from "../../config/env";
import { pool } from "../../database/db";

const STRIPE_API = "https://api.stripe.com/v1";
type PM = { id:string; type:string; customer?:string|null; billing_details?:{name?:string|null;address?:{country?:string|null}|null}|null; card?:{brand?:string|null;last4?:string|null;exp_month?:number|null;exp_year?:number|null;country?:string|null;funding?:string|null;fingerprint?:string|null}|null };
type SI = { id:string; client_secret?:string|null; status:string; customer?:string|null; payment_method?:string|null; metadata?:Record<string,string>; last_setup_error?:{message?:string|null}|null };

const headers=()=>({Authorization:"Bearer "+env.stripe.secretKey});
const form=(v:Record<string,unknown>)=>{const b=new URLSearchParams();for(const[k,x]of Object.entries(v))if(x!==undefined&&x!==null)b.append(k,String(x));return b;};
async function stripe<T>(method:"get"|"post",path:string,data?:URLSearchParams):Promise<T>{
  const r=await axios.request<T>({method,url:STRIPE_API+path,data,headers:{...headers(),...(data?{"Content-Type":"application/x-www-form-urlencoded"}:{})},timeout:20000});
  return r.data;
}
async function customerForUser(userId:string,email:string,name?:string|null){
  const q=await pool.query("SELECT stripe_customer_id FROM redom_payment_methods WHERE user_id=$1 AND stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1",[userId]);
  if(q.rows[0]?.stripe_customer_id)return String(q.rows[0].stripe_customer_id);
  const c=await stripe<{id:string}>("post","/customers",form({email,name:name||undefined,description:"ReDom Pay customer","metadata[reDomUserId]":userId,"metadata[purpose]":"saved_payment_methods"}));
  return c.id;
}
function brand(v:string|null|undefined){if(!v)return null;const n=v.toLowerCase();const m:Record<string,string>={mastercard:"Mastercard",visa:"Visa",amex:"American Express","american express":"American Express",discover:"Discover",jcb:"JCB",unionpay:"UnionPay",diners:"Diners Club","diners club":"Diners Club",verve:"Verve"};return m[n]||v.replace(/\b\w/g,c=>c.toUpperCase());}
export function safeStripeMethod(pm:PM){
  return {stripePaymentMethodId:pm.id,stripeCustomerId:pm.customer?String(pm.customer):null,provider:"stripe",brand:brand(pm.card?.brand),cardType:pm.card?.funding?String(pm.card.funding):null,last4:pm.card?.last4?String(pm.card.last4):null,expMonth:pm.card?.exp_month??null,expYear:pm.card?.exp_year??null,countryCode:pm.card?.country?String(pm.card.country).toUpperCase():(pm.billing_details?.address?.country?String(pm.billing_details.address.country).toUpperCase():null),cardholderName:pm.billing_details?.name?String(pm.billing_details.name):null,fingerprint:pm.card?.fingerprint?String(pm.card.fingerprint):null};
}
async function persist(userId:string,setupId:string){
  const si=await stripe<SI>("get","/setup_intents/"+encodeURIComponent(setupId));
  if(si.status!=="succeeded"||!si.payment_method||!si.customer)throw new Error("Card setup has not completed.");
  if(String(si.metadata?.reDomUserId||"")!==userId)throw new Error("Card setup does not belong to this account.");
  const pm=await stripe<PM>("get","/customers/"+encodeURIComponent(si.customer)+"/payment_methods/"+encodeURIComponent(si.payment_method));
  if(pm.type!=="card")throw new Error("Only credit or debit cards can be saved here.");
  const s=safeStripeMethod(pm);
  const existing=await pool.query("SELECT id FROM redom_payment_methods WHERE user_id=$1 AND stripe_payment_method_id=$2 LIMIT 1",[userId,s.stripePaymentMethodId]);
  if(!existing.rows[0]){
    const count=await pool.query("SELECT COUNT(*)::int count FROM redom_payment_methods WHERE user_id=$1 AND active=true",[userId]);
    if(Number(count.rows[0]?.count||0)>=3)throw new Error("You can save a maximum of 3 payment methods.");
    await pool.query(`INSERT INTO redom_payment_methods(user_id,provider,authorization_code_encrypted,authorization_signature,customer_email,brand,card_type,last4,exp_month,exp_year,country_code,reusable,active,stripe_customer_id,stripe_payment_method_id,cardholder_name,card_fingerprint,status)
      VALUES($1,'stripe','stripe-managed','stripe:'+substr($3,1,80),$2,$4,$5,$6,$7,$8,$9,true,true,$10,$3,$11,$12,'active')`,
      [userId,String(s.cardholderName||""),s.stripePaymentMethodId,s.brand,s.cardType,s.last4,s.expMonth,s.expYear,s.countryCode,s.stripeCustomerId,s.cardholderName,s.fingerprint]);
  }else{
    await pool.query(`UPDATE redom_payment_methods SET provider='stripe',active=true,reusable=true,status='active',stripe_customer_id=$3,brand=$4,card_type=$5,last4=$6,exp_month=$7,exp_year=$8,country_code=$9,cardholder_name=$10,card_fingerprint=$11,updated_at=now() WHERE id=$1 AND user_id=$2`,
      [String(existing.rows[0].id),userId,s.stripeCustomerId,s.brand,s.cardType,s.last4,s.expMonth,s.expYear,s.countryCode,s.cardholderName,s.fingerprint]);
  }
  const saved=await pool.query(`SELECT id,provider,customer_email,brand,card_type,last4,exp_month,exp_year,bank,country_code,currency,reusable,created_at,status,stripe_customer_id,stripe_payment_method_id,cardholder_name FROM redom_payment_methods WHERE user_id=$1 AND stripe_payment_method_id=$2 LIMIT 1`,[userId,s.stripePaymentMethodId]);
  return saved.rows[0];
}
export async function createStripeCardSetup(input:{userId:string;email:string;name?:string|null;paymentMethodId:string}){
  const count=await pool.query("SELECT COUNT(*)::int count FROM redom_payment_methods WHERE user_id=$1 AND active=true",[input.userId]);
  if(Number(count.rows[0]?.count||0)>=3)throw new Error("You can save a maximum of 3 payment methods.");
  if(!/^pm_[A-Za-z0-9_]+$/.test(input.paymentMethodId))throw new Error("Invalid Stripe payment method.");
  const customer=await customerForUser(input.userId,input.email,input.name);
  const pm=await stripe<PM>("get","/payment_methods/"+encodeURIComponent(input.paymentMethodId));
  if(pm.type!=="card")throw new Error("Only credit or debit cards can be saved here.");
  const si=await stripe<SI>("post","/setup_intents",form({customer,payment_method:input.paymentMethodId,confirm:true,usage:"off_session","payment_method_types[0]":"card","metadata[reDomUserId]":input.userId,"metadata[purpose]":"redom_saved_card"}));
  if(si.status==="succeeded")return {setupIntentId:si.id,clientSecret:si.client_secret||null,status:si.status,method:await persist(input.userId,si.id)};
  return {setupIntentId:si.id,clientSecret:si.client_secret||null,status:si.status,message:si.last_setup_error?.message||undefined};
}
export async function finalizeStripeCardSetup(userId:string,setupIntentId:string){if(!/^seti_[A-Za-z0-9_]+$/.test(setupIntentId))throw new Error("Invalid setup intent.");return {status:"succeeded",method:await persist(userId,setupIntentId)};}
export async function listStripeCardMethods(userId:string){
  const q=await pool.query(`SELECT id,provider,customer_email,brand,card_type,last4,exp_month,exp_year,bank,country_code,currency,reusable,created_at,status,stripe_customer_id,stripe_payment_method_id,cardholder_name FROM redom_payment_methods WHERE user_id=$1 AND active=true ORDER BY created_at DESC`,[userId]);
  const out:any[]=[];
  for(const row of q.rows){
    let st=String(row.status||"active"),pm:PM|null=null;
    try{if(row.stripe_customer_id&&row.stripe_payment_method_id)pm=await stripe<PM>("get","/customers/"+encodeURIComponent(String(row.stripe_customer_id))+"/payment_methods/"+encodeURIComponent(String(row.stripe_payment_method_id)));else st="unavailable";}catch{st="unavailable";}
    const s=pm?safeStripeMethod(pm):null;
    out.push({id:String(row.id),provider:"stripe",email:String(row.customer_email),brand:s?.brand||(row.brand?String(row.brand):null),cardType:s?.cardType||(row.card_type?String(row.card_type):null),last4:s?.last4||(row.last4?String(row.last4):null),expMonth:s?.expMonth??row.exp_month??null,expYear:s?.expYear??row.exp_year??null,bank:row.bank?String(row.bank):null,countryCode:s?.countryCode||(row.country_code?String(row.country_code):null),currency:row.currency?String(row.currency):null,reusable:Boolean(row.reusable)&&st==="active",status:st,createdAt:new Date(row.created_at).toISOString(),cardholderName:row.cardholder_name?String(row.cardholder_name):null,stripePaymentMethodId:String(row.stripe_payment_method_id||""),stripeCustomerId:String(row.stripe_customer_id||"")});
  }
  return out;
}
export async function getStripeCardMethodForUser(userId:string,id:string){
  const q=await pool.query("SELECT * FROM redom_payment_methods WHERE id=$1 AND user_id=$2 AND active=true LIMIT 1",[id,userId]);const row=q.rows[0];if(!row)throw new Error("Payment method not found.");
  if(!row.stripe_customer_id||!row.stripe_payment_method_id)throw new Error("Payment method is unavailable.");
  const pm=await stripe<PM>("get","/customers/"+encodeURIComponent(String(row.stripe_customer_id))+"/payment_methods/"+encodeURIComponent(String(row.stripe_payment_method_id)));
  return {row,provider:safeStripeMethod(pm)};
}
export async function detachStripeCardMethod(userId:string,id:string){
  const m=await getStripeCardMethodForUser(userId,id);
  await stripe("post","/payment_methods/"+encodeURIComponent(m.provider.stripePaymentMethodId)+"/detach",form({}));
  await pool.query("UPDATE redom_payment_methods SET active=false,reusable=false,status='removed',updated_at=now() WHERE id=$1 AND user_id=$2",[id,userId]);
}

type CheckoutSession={id:string;url?:string|null;status?:string|null;setup_intent?:string|null;customer?:string|null;metadata?:Record<string,string>};
export async function createStripeCardSetupCheckout(input:{userId:string;email:string;name?:string|null;successUrl:string;cancelUrl:string}){
  const count=await pool.query("SELECT COUNT(*)::int count FROM redom_payment_methods WHERE user_id=$1 AND active=true",[input.userId]);
  if(Number(count.rows[0]?.count||0)>=3)throw new Error("You can save a maximum of 3 payment methods.");
  const customer=await customerForUser(input.userId,input.email,input.name);
  const session=await stripe<CheckoutSession>("post","/checkout/sessions",form({
    mode:"setup",
    customer,
    "payment_method_types[0]":"card",
    billing_address_collection:"required",
    success_url:input.successUrl,
    cancel_url:input.cancelUrl,
    client_reference_id:input.userId,
    "metadata[reDomUserId]":input.userId,
    "metadata[purpose]":"redom_saved_card_expo_fallback",
    "setup_intent_data[metadata][reDomUserId]":input.userId,
    "setup_intent_data[metadata][purpose]":"redom_saved_card",
  }));
  if(!session.url)throw new Error("Stripe did not return a secure card-entry URL.");
  return {checkoutSessionId:session.id,checkoutUrl:session.url};
}
export async function finalizeStripeCardSetupCheckout(userId:string,sessionId:string){
  if(!/^cs_[A-Za-z0-9_]+$/.test(sessionId))throw new Error("Invalid Checkout Session.");
  const session=await stripe<CheckoutSession>("get","/checkout/sessions/"+encodeURIComponent(sessionId));
  if(String(session.metadata?.reDomUserId||"")!==userId)throw new Error("Checkout Session does not belong to this account.");
  if(session.status!=="complete"||!session.setup_intent)throw new Error("Stripe card setup has not completed.");
  return {status:"succeeded",method:await persist(userId,String(session.setup_intent))};
}
