import axios from "axios";
import crypto from "node:crypto";
import { pool } from "../../database/db";
import { ensureAurelinkMailSecuritySchema, quoteAurelinkMailUsd, processAurelinkMailCreditConfirmationOutbox, startAurelinkMailCreditConfirmationWorker } from "./aurelink-mail-security.service";

type Provider = "paypal" | "paystack";
type PaymentRow = Record<string, any>;
startAurelinkMailCreditConfirmationWorker();

const paypalBase = () => String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const required = (name:string) => { const v=String(process.env[name]||"").trim(); if(!v) throw new Error(name+" is required to enable Aurelink Mail payments."); return v; };
const zeroDecimalCurrency=(currency:string)=>["JPY","KRW","VND","CLP","XAF","XOF","XPF"].includes(currency);
const money = (minor:number,currency:string) => ({value:(minor/Math.pow(10,zeroDecimalCurrency(currency)?0:2)).toFixed(zeroDecimalCurrency(currency)?0:2),currency_code:currency});
const providerAmountToMinor=(value:string|number,currency:string)=>Math.round(Number(value)*Math.pow(10,zeroDecimalCurrency(currency)?0:2));
const reference = () => "AURELINK-MAIL-"+crypto.randomUUID().replace(/-/g,"").slice(0,24);
function paymentEncryptionKey():Buffer{
  const raw=required("AURELINK_PAYMENT_ENCRYPTION_KEY");
  const key=/^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,"hex"):Buffer.from(raw,"base64");
  if(key.length!==32) throw new Error("AURELINK_PAYMENT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}
function encryptProviderSecret(value:string):string{
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",paymentEncryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64"),cipher.getAuthTag().toString("base64"),encrypted.toString("base64")].join(".");
}
function decryptProviderSecret(value:string):string{
  const [iv,tag,data]=value.split(".");
  const decipher=crypto.createDecipheriv("aes-256-gcm",paymentEncryptionKey(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(data,"base64")),decipher.final()]).toString("utf8");
}

async function paypalToken():Promise<string>{
  const auth=Buffer.from(required("PAYPAL_CLIENT_ID")+":"+required("PAYPAL_CLIENT_SECRET")).toString("base64");
  const r=await axios.post(paypalBase()+"/v1/oauth2/token","grant_type=client_credentials",{headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},timeout:20000});
  return String(r.data.access_token);
}
async function paypal<T>(method:"get"|"post",path:string,data?:unknown):Promise<T>{
  const token=await paypalToken();
  const r=await axios.request<T>({method,url:paypalBase()+path,data,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},timeout:25000});
  return r.data;
}
async function paystack<T>(method:"get"|"post",path:string,data?:unknown):Promise<T>{
  const r=await axios.request<T>({method,url:"https://api.paystack.co"+path,data,headers:{Authorization:"Bearer "+required("PAYSTACK_SECRET_KEY"),"Content-Type":"application/json"},timeout:25000});
  if((r.data as any)?.status===false) throw new Error(String((r.data as any)?.message||"Paystack request failed."));
  return r.data;
}
async function customerContext(userId:string,workspaceId:string){
  const q=await pool.query(`SELECT u.email,u.account_id,u.account_status,u.email_verified,u.country_code,u.country_verified_at,w.id
    FROM aurelink_users u JOIN aurelink_communications_workspaces w ON w.user_id=u.id OR EXISTS
    (SELECT 1 FROM aurelink_communications_members m WHERE m.workspace_id=w.id AND m.accepted_user_id=u.id AND m.status='active')
    WHERE u.id=$1 AND w.id=$2 AND w.status='active' LIMIT 1`,[userId,workspaceId]);
  const u=q.rows[0];
  if(!u||u.account_status!=="active"||u.email_verified!==true) throw new Error("An active Aurelink account with a verified email is required.");
  const country=String(u.country_code||"").toUpperCase();
  if(!country||!u.country_verified_at) throw new Error("Verify your account country before purchasing Aurelink Mail. Checkout country selection cannot be used for payment routing.");
  return {email:String(u.email),accountId:String(u.account_id||userId),country};
}
function providerFor(country:string):Provider { return country==="NG"||country==="GH" ? "paystack" : "paypal"; }
function localCurrency(country:string):"NGN"|"GHS" { return country==="NG"?"NGN":"GHS"; }
function localAmount(usdCents:number,country:string):number {
  const currency=localCurrency(country);
  const rate=Number(process.env[currency+"_PER_USD"]||0);
  if(!Number.isFinite(rate)||rate<=0) throw new Error(currency+"_PER_USD must be configured with an approved exchange rate before Paystack checkout is enabled.");
  const major=(usdCents/100)*rate;
  const minor=Math.round(major*100);
  if(!Number.isSafeInteger(minor)||minor<=0) throw new Error("The configured local-currency conversion is invalid.");
  return minor;
}
function returnUrls(ref:string){
  const success=String(process.env.AURELINK_EMAIL_BILLING_SUCCESS_URL||"").trim(), cancel=String(process.env.AURELINK_EMAIL_BILLING_CANCEL_URL||"").trim();
  if(!success||!cancel) throw new Error("Configure AURELINK_EMAIL_BILLING_SUCCESS_URL and AURELINK_EMAIL_BILLING_CANCEL_URL.");
  const s=new URL(success),c=new URL(cancel);
  const valid=(u:URL)=>u.protocol==="https:"||(u.protocol==="http:"&&["localhost","127.0.0.1"].includes(u.hostname));
  if(!valid(s)||!valid(c)) throw new Error("Aurelink Mail payment return URLs must use HTTPS.");
  s.searchParams.set("reference",ref);s.searchParams.set("status","success");c.searchParams.set("reference",ref);c.searchParams.set("status","cancelled");
  return {success:s.toString(),cancel:c.toString()};
}
async function createPayPalPlan(payment:PaymentRow):Promise<string>{
  const cached=await pool.query("SELECT provider_plan_id FROM aurelink_email_provider_plans WHERE provider='paypal' AND plan_option_id=$1 AND currency='USD' AND active=TRUE LIMIT 1",[payment.plan_option_id]);
  if(cached.rows[0]) return String(cached.rows[0].provider_plan_id);
  const option=(await pool.query("SELECT o.monthly_email_allowance,o.monthly_price_minor,p.display_name FROM aurelink_email_plan_options o JOIN aurelink_email_plan_catalog p ON p.id=o.plan_id WHERE o.id=$1",[payment.plan_option_id])).rows[0];
  if(!option) throw new Error("Aurelink Mail subscription plan is unavailable.");
  const product=await paypal<any>("post","/v1/catalogs/products",{name:"Aurelink Mail "+option.display_name,description:"Monthly Aurelink Mail outbound email allowance",type:"SERVICE",category:"SOFTWARE"});
  const plan=await paypal<any>("post","/v1/billing/plans",{product_id:product.id,name:"Aurelink Mail "+option.display_name+" "+option.monthly_email_allowance+" emails/month",billing_cycles:[{frequency:{interval_unit:"MONTH",interval_count:1},tenure_type:"REGULAR",sequence:1,total_cycles:0,pricing_scheme:{fixed_price:money(Number(option.monthly_price_minor),"USD")}}],payment_preferences:{auto_bill_outstanding:true,setup_fee_failure_action:"CONTINUE",payment_failure_threshold:3}});
  if(!plan.id) throw new Error("PayPal did not create a subscription plan.");
  await pool.query("INSERT INTO aurelink_email_provider_plans(provider,plan_option_id,currency,provider_product_id,provider_plan_id,amount_minor) VALUES('paypal',$1,'USD',$2,$3,$4) ON CONFLICT(provider,plan_option_id,currency) DO UPDATE SET provider_product_id=EXCLUDED.provider_product_id,provider_plan_id=EXCLUDED.provider_plan_id,amount_minor=EXCLUDED.amount_minor,active=TRUE,updated_at=NOW()",[payment.plan_option_id,product.id,plan.id,option.monthly_price_minor]);
  return String(plan.id);
}
async function createPaystackPlan(payment:PaymentRow,currency:"NGN"|"GHS",amount:number):Promise<string>{
  const cached=await pool.query("SELECT provider_plan_id FROM aurelink_email_provider_plans WHERE provider='paystack' AND plan_option_id=$1 AND currency=$2 AND active=TRUE LIMIT 1",[payment.plan_option_id,currency]);
  if(cached.rows[0]) return String(cached.rows[0].provider_plan_id);
  const option=(await pool.query("SELECT o.monthly_email_allowance,p.display_name FROM aurelink_email_plan_options o JOIN aurelink_email_plan_catalog p ON p.id=o.plan_id WHERE o.id=$1",[payment.plan_option_id])).rows[0];
  const plan=await paystack<any>("post","/plan",{name:"Aurelink Mail "+option.display_name+" "+option.monthly_email_allowance+" emails/month",amount,currency,interval:"monthly",description:"Aurelink Mail monthly email subscription"});
  if(!plan.data?.plan_code) throw new Error("Paystack did not create a recurring plan.");
  await pool.query("INSERT INTO aurelink_email_provider_plans(provider,plan_option_id,currency,provider_plan_id,amount_minor) VALUES('paystack',$1,$2,$3,$4) ON CONFLICT(provider,plan_option_id,currency) DO UPDATE SET provider_plan_id=EXCLUDED.provider_plan_id,amount_minor=EXCLUDED.amount_minor,active=TRUE,updated_at=NOW()",[payment.plan_option_id,currency,plan.data.plan_code,amount]);
  return String(plan.data.plan_code);
}

async function createEmailCreditPurchase(input:{userId:string;workspaceId:string;customer:{email:string;accountId:string;country:string};creditPackId:string;provider:Provider;pricingCountryCode:string}){
 await ensureAurelinkMailSecuritySchema();
 const pack=(await pool.query("SELECT id,email_credits,price_minor FROM aurelink_email_credit_packs WHERE id=$1 AND active=TRUE AND email_credits IN (1000,5000,10000,50000,100000,250000)",[input.creditPackId])).rows[0];
 if(!pack)throw new Error("Selected prepaid credit pack is unavailable.");
 const bal=(await pool.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1",[input.workspaceId])).rows[0];
 if(BigInt(String(bal?.balance_emails||0))+BigInt(String(pack.email_credits))>250000n)throw new Error("Prepaid balance cannot exceed 250,000 credits.");
 const usd=Number(pack.price_minor);if(!Number.isSafeInteger(usd)||usd<50)throw new Error("Configured credit-pack price is invalid.");
 const fx=await quoteAurelinkMailUsd(usd,input.pricingCountryCode);
 const currency=fx.currency,amount=fx.amountMinor;
 const paypalCurrencies=new Set(["USD","EUR","GBP","AUD","CAD","CHF","CZK","DKK","HKD","HUF","ILS","JPY","MXN","MYR","NOK","NZD","PHP","PLN","SEK","SGD","THB","TWD"]);
 if(input.provider==="paypal"&&!paypalCurrencies.has(currency))throw new Error("PayPal does not support settlement in "+currency+". Choose a supported pricing country or contact Aurelink billing.");
 if(input.provider==="paystack"&&((input.customer.country==="NG"&&currency!=="NGN")||(input.customer.country==="GH"&&currency!=="GHS")))throw new Error("The selected pricing country currency is not supported by the verified-account Paystack route. Checkout has been stopped.");
 const base=String(process.env.AURELINK_API_URL||process.env.API_BASE_URL||"").trim();if(!base)throw new Error("AURELINK_API_URL is required.");const baseUrl=new URL(base);if(baseUrl.protocol!=="https:"&&!(baseUrl.protocol==="http:"&&["localhost","127.0.0.1"].includes(baseUrl.hostname)))throw new Error("Payment link must use HTTPS.");
 const from=String(process.env.AURELINK_MAIL_BILLING_FROM||process.env.AURELINK_RECEIPT_FROM||"").trim();if(!from)throw new Error("AURELINK_MAIL_BILLING_FROM or AURELINK_RECEIPT_FROM is required.");const key=required("RESEND_API_KEY");
 const ref=reference(),token=crypto.randomBytes(32).toString("base64url"),hash=crypto.createHash("sha256").update(token).digest("hex"),expires=new Date(Date.now()+3600000);
 await pool.query("INSERT INTO aurelink_email_billing_payments(reference,user_id,workspace_id,purchase_type,credit_pack_id,email_credits,amount_minor,currency,payment_provider,provider_currency,provider_amount_minor,status,account_country,account_id,email_checkout_token_hash,email_checkout_expires_at,pricing_country,pricing_currency,fx_rate,fx_source,fx_as_of,fx_expires_at) VALUES($1,$2,$3,'email_credits',$4,$5,$6,'USD',$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",[ref,input.userId,input.workspaceId,pack.id,String(pack.email_credits),usd,input.provider,currency,amount,input.customer.country,input.customer.accountId,hash,expires,fx.countryCode,fx.currency,fx.rate,fx.source,fx.asOf,fx.expiresAt]);
 const zeroDecimal=["JPY","KRW","VND","CLP","XAF","XOF","XPF"].includes(currency);
 const link=base.replace(/\/$/,"")+"/aurelink/mail/credits/pay/"+token,credits=Number(pack.email_credits).toLocaleString("en-US"),due=(amount/Math.pow(10,zeroDecimal?0:2)).toFixed(zeroDecimal?0:2)+" "+currency,providerName=input.provider==="paystack"?"Paystack":"PayPal";
 const safe=(v:string)=>v.replace(/[&<>"\x27]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\x27":"&#39;"}[c]!));
 const html="<h2>Aurelink Mail credit purchase</h2><p>Account ID: <b>"+safe(input.customer.accountId)+"</b></p><p>Verified country: <b>"+safe(input.customer.country)+"</b></p><p>Package: <b>"+credits+" credits</b></p><p>Amount: <b>"+due+"</b></p><p>Pricing country: <b>"+safe(fx.countryCode)+"</b></p><p>USD exchange rate: <b>"+safe(fx.rate)+"</b></p><p>Rate source: ExchangeRate-API ("+safe(fx.asOf)+")</p><p><a href=\"https://www.exchangerate-api.com\">Rates by ExchangeRate-API</a></p><p>Provider: <b>"+providerName+"</b></p><p>Purchase reference: "+ref+"</p><p><a href=\""+link+"\">Continue to secure payment</a></p><p>This link expires in one hour and can be used once. Credits are issued only after Aurelink verifies payment.</p>";
 const textBody=["Aurelink Mail credit purchase","Account ID: "+input.customer.accountId,"Verified account country: "+input.customer.country,"Pricing country: "+fx.countryCode,"Package: "+credits+" credits","Amount: "+due,"Provider: "+providerName,"USD FX rate: "+fx.rate+" ("+fx.source+", "+fx.asOf+")","Reference: "+ref,"One-use link (expires in one hour): "+link].join("\n");
 try{const sent=await axios.post("https://api.resend.com/emails",{from,to:[input.customer.email],subject:"Complete your Aurelink Mail credit purchase",html,text:textBody},{headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"aurelink-mail-credit-request/"+ref},timeout:15000});if(!sent.data?.id)throw new Error("Email provider did not accept the payment email.");await pool.query("UPDATE aurelink_email_billing_payments SET email_sent_at=NOW() WHERE reference=$1",[ref]);}
 catch(e){await pool.query("UPDATE aurelink_email_billing_payments SET status='failed',email_checkout_token_hash=NULL,updated_at=NOW() WHERE reference=$1 AND status='pending'",[ref]);throw e;}
 return {reference:ref,status:"awaiting_email_payment",emailSent:true,expiresAt:expires.toISOString(),purchaseType:"email_credits",paymentProvider:input.provider};
}
export async function startAurelinkMailCreditPayment(token:string):Promise<string>{
 await ensureAurelinkMailSecuritySchema();
 if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))throw new Error("Invalid, expired or already-used Aurelink payment link.");
 const hash=crypto.createHash("sha256").update(token).digest("hex"),client=await pool.connect();let row:PaymentRow;
 try{await client.query("BEGIN");const q=await client.query("SELECT p.*,u.email FROM aurelink_email_billing_payments p JOIN aurelink_users u ON u.id=p.user_id WHERE p.email_checkout_token_hash=$1 AND p.purchase_type='email_credits' AND p.status='pending' AND p.email_checkout_consumed_at IS NULL AND p.email_checkout_expires_at>NOW() FOR UPDATE",[hash]);row=q.rows[0] as PaymentRow;if(!row)throw new Error("Invalid, expired or already-used Aurelink payment link.");await client.query("UPDATE aurelink_email_billing_payments SET email_checkout_consumed_at=NOW(),updated_at=NOW() WHERE id=$1",[row.id]);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
 try{const ref=String(row.reference),provider=String(row.payment_provider) as Provider,urls=returnUrls(ref);let url="",id="";
 if(provider==="paypal"){const order=await paypal<any>("post","/v2/checkout/orders",{intent:"CAPTURE",purchase_units:[{reference_id:ref,custom_id:ref,description:"Aurelink Mail "+row.email_credits+" prepaid credits",amount:money(Number(row.provider_amount_minor),String(row.provider_currency||"USD"))}],payment_source:{paypal:{experience_context:{return_url:urls.success,cancel_url:urls.cancel,user_action:"PAY_NOW"}}}});id=String(order.id||"");url=String(order.links?.find((x:any)=>x.rel==="payer-action"||x.rel==="approve")?.href||"");if(!id)throw new Error("PayPal did not return an order ID.");await pool.query("UPDATE aurelink_email_billing_payments SET paypal_order_id=$2 WHERE reference=$1",[ref,id]);}
 else{const init=await paystack<any>("post","/transaction/initialize",{email:String(row.email||""),amount:Number(row.provider_amount_minor),currency:String(row.provider_currency),reference:ref,callback_url:urls.success,metadata:{purpose:"aurelink_mail_email_credits",reference:ref,userId:String(row.user_id),workspaceId:String(row.workspace_id),emailCredits:String(row.email_credits),accountId:String(row.account_id),accountCountry:String(row.account_country)}});url=String(init.data?.authorization_url||"");id=String(init.data?.reference||"");if(id!==ref)throw new Error("Unexpected Paystack reference.");await pool.query("UPDATE aurelink_email_billing_payments SET paystack_reference=$2 WHERE reference=$1",[ref,id]);}
 const u=new URL(url),allowed=provider==="paypal"?["www.paypal.com","www.sandbox.paypal.com","paypal.com","sandbox.paypal.com"]:["checkout.paystack.com"];if(!url||u.protocol!=="https:"||!allowed.includes(u.hostname))throw new Error("Untrusted provider checkout URL.");return url;
 }catch(e){await pool.query("UPDATE aurelink_email_billing_payments SET status='failed',updated_at=NOW() WHERE reference=$1 AND status='pending'",[row.reference]);throw e;}
}
export async function createAurelinkMailCheckout(input:{userId:string;workspaceId:string;purchaseType:"subscription"|"email_credits";planOptionId?:string;creditPackId?:string;pricingCountryCode?:string}){
  const customer=await customerContext(input.userId,input.workspaceId),provider=providerFor(customer.country);
  if(input.purchaseType==="email_credits"){if(!input.creditPackId)throw new Error("Select a prepaid email credit pack.");if(!input.pricingCountryCode)throw new Error("Select the country used to calculate the prepaid purchase currency.");return createEmailCreditPurchase({userId:input.userId,workspaceId:input.workspaceId,customer,creditPackId:input.creditPackId,provider,pricingCountryCode:input.pricingCountryCode});}
  let amountUsd=0,planOptionId:string|null=null,creditPackId:string|null=null,emailCredits:string|null=null;
  if(input.purchaseType==="subscription"){
    if(!input.planOptionId) throw new Error("Select a monthly email plan.");
    const option=(await pool.query("SELECT o.id,o.monthly_price_minor FROM aurelink_email_plan_options o JOIN aurelink_email_plan_catalog p ON p.id=o.plan_id WHERE o.id=$1 AND o.active=TRUE AND p.active=TRUE AND o.effective_from<=NOW() AND (o.effective_until IS NULL OR o.effective_until>NOW())",[input.planOptionId])).rows[0];
    if(!option) throw new Error("The selected monthly email plan is unavailable.");
    amountUsd=Number(option.monthly_price_minor);planOptionId=String(option.id);
    const active=await pool.query("SELECT id FROM aurelink_email_subscriptions WHERE workspace_id=$1 AND status IN ('active','past_due','pending_payment') LIMIT 1",[input.workspaceId]);
    if(active.rows[0]) throw new Error("This workspace already has an active or pending monthly email subscription.");
  } else {
    if(!input.creditPackId) throw new Error("Select a prepaid email credit pack.");
    const pack=(await pool.query("SELECT id,email_credits,price_minor FROM aurelink_email_credit_packs WHERE id=$1 AND active=TRUE AND email_credits IN (1000,5000,10000,50000,100000,250000)",[input.creditPackId])).rows[0];
    if(!pack) throw new Error("The selected prepaid email pack is unavailable.");
    const bal=(await pool.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1",[input.workspaceId])).rows[0];
    if(BigInt(String(bal?.balance_emails||0))+BigInt(String(pack.email_credits))>250000n) throw new Error("Prepaid balance cannot exceed 250,000 credits. Use existing credits before purchasing another pack.");
    amountUsd=Number(pack.price_minor);creditPackId=String(pack.id);emailCredits=String(pack.email_credits);
  }
  if(!Number.isSafeInteger(amountUsd)||amountUsd<50) throw new Error("Configured Mail price is invalid.");
  const ref=reference(),urls=returnUrls(ref);
  const currency=provider==="paypal"?"USD":localCurrency(customer.country);
  const amount=provider==="paypal"?amountUsd:localAmount(amountUsd,customer.country);
  await pool.query(`INSERT INTO aurelink_email_billing_payments(reference,user_id,workspace_id,purchase_type,plan_option_id,credit_pack_id,email_credits,amount_minor,currency,payment_provider,provider_currency,provider_amount_minor,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,$11,'pending')`,[ref,input.userId,input.workspaceId,input.purchaseType,planOptionId,creditPackId,emailCredits,amountUsd,provider,currency,amount]);
  try{
    let checkoutUrl="",providerId="";
    if(provider==="paypal"){
      if(input.purchaseType==="email_credits"){
        const order=await paypal<any>("post","/v2/checkout/orders",{intent:"CAPTURE",purchase_units:[{reference_id:ref,custom_id:ref,description:"Aurelink Mail prepaid email credits",amount:money(amount,currency)}],payment_source:{paypal:{experience_context:{return_url:urls.success,cancel_url:urls.cancel,user_action:"PAY_NOW"}}}});
        providerId=String(order.id);checkoutUrl=String(order.links?.find((x:any)=>x.rel==="payer-action"||x.rel==="approve")?.href||"");
        await pool.query("UPDATE aurelink_email_billing_payments SET paypal_order_id=$2,provider_metadata=$3::jsonb,expires_at=NOW()+INTERVAL '3 hours' WHERE reference=$1",[ref,providerId,JSON.stringify({orderStatus:order.status})]);
      }else{
        const planId=await createPayPalPlan({plan_option_id:planOptionId});
        const sub=await paypal<any>("post","/v1/billing/subscriptions",{plan_id:planId,custom_id:ref,application_context:{brand_name:"Aurelink",user_action:"SUBSCRIBE_NOW",return_url:urls.success,cancel_url:urls.cancel}});
        providerId=String(sub.id);checkoutUrl=String(sub.links?.find((x:any)=>x.rel==="approve")?.href||"");
        await pool.query("UPDATE aurelink_email_billing_payments SET paypal_subscription_id=$2,provider_metadata=$3::jsonb,expires_at=NOW()+INTERVAL '24 hours' WHERE reference=$1",[ref,providerId,JSON.stringify({planId})]);
      }
    }else{
      const data:any={email:customer.email,amount,currency,reference:ref,callback_url:urls.success,metadata:{provider:"paystack",purpose:"aurelink_mail_"+input.purchaseType,reference:ref,userId:input.userId,workspaceId:input.workspaceId,purchaseType:input.purchaseType}};
      if(input.purchaseType==="subscription") data.plan=await createPaystackPlan({plan_option_id:planOptionId},currency as any,amount);
      const init=await paystack<any>("post","/transaction/initialize",data);
      checkoutUrl=String(init.data?.authorization_url||"");providerId=String(init.data?.reference||ref);
      await pool.query("UPDATE aurelink_email_billing_payments SET paystack_reference=$2,provider_metadata=$3::jsonb,expires_at=NOW()+INTERVAL '24 hours' WHERE reference=$1",[ref,providerId,JSON.stringify({accessCode:init.data?.access_code,currency,amount})]);
    }
    if(!checkoutUrl) throw new Error("Payment provider did not return an approval URL.");
    return {reference:ref,checkoutUrl,amountMinor:amount,currency,purchaseType:input.purchaseType,paymentProvider:provider};
  }catch(e){await pool.query("UPDATE aurelink_email_billing_payments SET status='failed',updated_at=NOW() WHERE reference=$1 AND status='pending'",[ref]);throw e;}
}

async function fulfill(referenceValue:string,providerRef:string,provider:string,providerAmount:number,providerCurrency:string,subscriptionId?:string,providerDetails?:Record<string,any>){
  await ensureAurelinkMailSecuritySchema();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const p=(await client.query("SELECT p.*,u.email FROM aurelink_email_billing_payments p JOIN aurelink_users u ON u.id=p.user_id WHERE p.reference=$1 FOR UPDATE OF p",[referenceValue])).rows[0] as PaymentRow;
    if(!p) throw new Error("Aurelink Mail payment reference not found.");
    if(p.status==="paid"){await client.query("COMMIT");return;}
    if(p.status!=="pending") throw new Error("This Aurelink payment is not eligible for fulfillment.");
    if(String(p.payment_provider)!==provider||Number(p.provider_amount_minor)!==providerAmount||String(p.provider_currency).trim()!==providerCurrency) throw new Error("Provider amount or currency does not match the pending Aurelink Mail payment.");
    if(p.purchase_type==="email_credits"){
      const w=(await client.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1 FOR UPDATE",[p.workspace_id])).rows[0];
      if(!w) throw new Error("Aurelink Mail workspace not found.");
      await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[p.workspace_id,w.user_id]);
      const wallet=(await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[p.workspace_id])).rows[0];
      const previous=BigInt(String(wallet.balance_emails)),credits=BigInt(String(p.email_credits)),next=previous+credits;
      if(credits<1000n||credits>250000n||next>250000n) throw new Error("Prepaid credit balance would exceed the permitted 250,000-credit limit.");
      await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[p.workspace_id,next.toString()]);
      await client.query("INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,payment_reference,description,metadata) VALUES($1,$2,'purchase','credit',$3,$4,$5,$6,'Purchase of Aurelink Mail prepaid email credits',$7::jsonb) ON CONFLICT(reference) DO NOTHING",[p.workspace_id,p.user_id,credits.toString(),next.toString(),"AL-EMAIL-CREDIT-PURCHASE-"+referenceValue,referenceValue,JSON.stringify({provider,providerReference:providerRef})]);
      const ledgerReference="AL-EMAIL-CREDIT-PURCHASE-"+referenceValue;
      let providerMinorUnit=2;
      try{providerMinorUnit=new Intl.NumberFormat("en",{style:"currency",currency:String(p.provider_currency||"USD")}).resolvedOptions().maximumFractionDigits;}catch{providerMinorUnit=2;}
      const usdAmount=(Number(p.amount_minor)/100).toFixed(2);
      const packageSize=credits===1000n?"1K":credits===5000n?"5K":credits===10000n?"10K":credits===50000n?"50K":credits===100000n?"100K":"250K";
      const fxPayload={
        accountId:String(p.account_id||p.user_id),accountCountry:String(p.account_country||""),
        country:String(p.pricing_country||p.account_country||""),currency:String(p.provider_currency||"USD"),
        fxRate:String(p.fx_rate||"1"),fxSource:String(p.fx_source||"USD catalogue"),
        fxAsOf:p.fx_as_of?new Date(p.fx_as_of).toISOString():"",
        provider,providerTransactionReference:String(providerRef),
        paymentMethod:(()=>{const channel=String(providerDetails?.channel||"").toLowerCase();const brand=String(providerDetails?.authorization?.brand||providerDetails?.authorization?.card_type||providerDetails?.paymentSource?.card?.brand||"");return channel==="card"?(brand?brand+" Card":"Card"):provider==="paypal"?"PayPal checkout":channel?channel.replace(/_/g," "):"Paystack checkout";})(),
        cardNumber:(()=>{const last4=String(providerDetails?.authorization?.last4||providerDetails?.authorization?.last_digits||providerDetails?.paymentSource?.card?.last_digits||"");return /^\\d{4}$/.test(last4)?"XXXXXXXXXXXX"+last4:"Not provided by payment provider";})(),
        cardType:String(providerDetails?.authorization?.card_type||providerDetails?.paymentSource?.card?.type||"Not provided by payment provider"),
        paymentCountry:String(providerDetails?.authorization?.country_code||providerDetails?.paymentSource?.card?.country_code||p.account_country||""),
        packageName:"Aurelink Credit Package · "+packageSize,
        packageSize,credits:credits.toString(),usdAmount,
        amount:(Number(p.provider_amount_minor)/Math.pow(10,providerMinorUnit)).toFixed(providerMinorUnit)+" "+String(p.provider_currency||"USD"),
        previousBalance:previous.toString(),newBalance:next.toString(),ledgerReference,
        paymentStatus:"SUCCESSFUL",creditAllocationStatus:"SUCCESSFUL",transactionIntegrity:"VERIFIED",
        completedAt:new Date().toISOString()
      };
      await client.query("INSERT INTO aurelink_email_credit_confirmation_outbox(payment_reference,recipient_email,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(payment_reference) DO NOTHING",[referenceValue,String(p.email),JSON.stringify(fxPayload)]);
    }else{
      if(!subscriptionId) throw new Error("Provider subscription ID is missing.");
      const option=(await client.query("SELECT monthly_email_allowance FROM aurelink_email_plan_options WHERE id=$1",[p.plan_option_id])).rows[0];
      if(!option) throw new Error("Purchased subscription plan no longer exists.");
      const start=new Date(),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
      await client.query("UPDATE aurelink_email_subscriptions SET status='expired',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW() WHERE workspace_id=$1 AND status IN ('active','past_due','pending_payment')",[p.workspace_id]);
      await client.query(`INSERT INTO aurelink_email_subscriptions(user_id,workspace_id,plan_option_id,status,monthly_email_allowance,used_emails,reserved_emails,billing_period_start,billing_period_end,payment_reference,payment_provider,paypal_subscription_id,paystack_subscription_code,activated_at)
        VALUES($1,$2,$3,'active',$4,0,0,$5,$6,$7,$8,$9,$10,NOW())`,[p.user_id,p.workspace_id,p.plan_option_id,option.monthly_email_allowance,start,end,referenceValue,provider,provider==="paypal"?subscriptionId:null,provider==="paystack"?subscriptionId:null]);
      await client.query("INSERT INTO aurelink_email_billing_accounts(workspace_id,user_id,billing_mode) VALUES($1,$2,'subscription') ON CONFLICT(workspace_id) DO UPDATE SET billing_mode='subscription',updated_at=NOW()",[p.workspace_id,p.user_id]);
      await client.query("UPDATE aurelink_email_billing_payments SET paypal_subscription_id=CASE WHEN $2='paypal' THEN $3 ELSE paypal_subscription_id END WHERE reference=$1",[referenceValue,provider,subscriptionId]);
    }
    await client.query("UPDATE aurelink_email_billing_payments SET status='paid',paid_at=NOW(),provider_metadata=provider_metadata||$2::jsonb,updated_at=NOW() WHERE reference=$1",[referenceValue,JSON.stringify({providerReference:providerRef})]);
    await client.query("INSERT INTO aurelink_email_billing_audit(workspace_id,actor_user_id,action,details) VALUES($1,$2,'email_billing_payment_fulfilled',$3::jsonb)",[p.workspace_id,p.user_id,JSON.stringify({reference:referenceValue,provider,purchaseType:p.purchase_type})]);
    await client.query("COMMIT");
    void processAurelinkMailCreditConfirmationOutbox(10).catch(()=>undefined);
  }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
}

export async function verifyAurelinkMailCheckout(userId:string,ref:string){
  const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 AND user_id=$2",[ref,userId])).rows[0] as PaymentRow;
  if(!p) throw new Error("Aurelink Mail payment reference not found.");
  if(p.status==="paid") return {status:"paid",purchaseType:p.purchase_type,creditsAdded:p.purchase_type==="email_credits"?String(p.email_credits):undefined};
  if(p.payment_provider==="paypal"){
    if(p.paypal_order_id){
      let order=await paypal<any>("get","/v2/checkout/orders/"+encodeURIComponent(p.paypal_order_id));
      if(order.status==="APPROVED") order=await paypal<any>("post","/v2/checkout/orders/"+encodeURIComponent(p.paypal_order_id)+"/capture",{});
      if(order.status==="COMPLETED"){
        const cap=order.purchase_units?.[0]?.payments?.captures?.[0];
        if(!cap||cap.status!=="COMPLETED") throw new Error("PayPal capture is not completed.");
        await fulfill(ref,String(cap.id), "paypal",providerAmountToMinor(cap.amount.value,String(cap.amount.currency_code)),String(cap.amount.currency_code),undefined,{paymentSource:cap.payment_source||order.payment_source||{},payer:order.payer||{}});
      }
    } else if(p.paypal_subscription_id){
      const sub=await paypal<any>("get","/v1/billing/subscriptions/"+encodeURIComponent(p.paypal_subscription_id));
      if(sub.status==="ACTIVE"){
        const plan=await pool.query("SELECT amount_minor FROM aurelink_email_provider_plans WHERE provider='paypal' AND provider_plan_id=$1",[sub.plan_id]);
        const amt=Number(plan.rows[0]?.amount_minor||p.amount_minor);
        await fulfill(ref,p.paypal_subscription_id,"paypal",amt,"USD",p.paypal_subscription_id);
      }
    }
  }else if(p.payment_provider==="paystack"&&p.paystack_reference){
    const v=await paystack<any>("get","/transaction/verify/"+encodeURIComponent(p.paystack_reference));
    const d=v.data;
    if(d.status==="success") await fulfill(ref,String(d.id),"paystack",Number(d.amount),String(d.currency).toUpperCase(),String(d.subscription?.subscription_code||"")||undefined,{channel:String(d.channel||""),authorization:d.authorization||{},customer:d.customer||{}});
  }
  const refreshed=(await pool.query("SELECT status,purchase_type,email_credits FROM aurelink_email_billing_payments WHERE reference=$1",[ref])).rows[0];
  return {status:String(refreshed.status),purchaseType:String(refreshed.purchase_type),creditsAdded:refreshed.status==="paid"&&refreshed.purchase_type==="email_credits"?String(refreshed.email_credits):undefined};
}

export async function cancelAurelinkMailSubscription(workspaceId:string){
  const p=(await pool.query("SELECT s.*,b.payment_provider FROM aurelink_email_subscriptions s LEFT JOIN aurelink_email_billing_payments b ON b.reference=s.payment_reference WHERE s.workspace_id=$1 AND s.status IN ('active','past_due') AND s.cancel_at_period_end=FALSE ORDER BY s.created_at DESC LIMIT 1",[workspaceId])).rows[0];
  if(!p) throw new Error("An active cancellable Aurelink Mail subscription was not found.");
  if(p.payment_provider==="paypal"&&p.paypal_subscription_id) await paypal("post","/v1/billing/subscriptions/"+encodeURIComponent(p.paypal_subscription_id)+"/cancel",{reason:"Customer requested cancellation"});
  else if(p.payment_provider==="paystack"&&p.paystack_subscription_code&&p.paystack_email_token_encrypted) await paystack("post","/subscription/disable",{code:p.paystack_subscription_code,token:decryptProviderSecret(String(p.paystack_email_token_encrypted))});
  else throw new Error("This legacy Stripe subscription must be cancelled through its original billing provider.");
  await pool.query("UPDATE aurelink_email_subscriptions SET cancel_at_period_end=TRUE,cancelled_at=NOW(),updated_at=NOW() WHERE id=$1",[p.id]);
  return {subscriptionId:String(p.paypal_subscription_id||p.paystack_subscription_code),cancelAtPeriodEnd:true,periodEnd:new Date(p.billing_period_end)};
}

export async function handleAurelinkMailWebhook(provider:"paypal"|"paystack",headers:Record<string,string|undefined>,body:any,rawBody?:Buffer){
  await ensureAurelinkMailSecuritySchema();
  if(provider==="paystack"){
    const signature=headers["x-paystack-signature"]||"";
    const expected=crypto.createHmac("sha512",required("PAYSTACK_SECRET_KEY")).update(rawBody||Buffer.from(JSON.stringify(body))).digest("hex");
    if(!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new Error("Invalid Paystack webhook signature.");
    const eventId=String(body?.data?.id||body?.data?.reference||"")+":"+String(body?.event||"");
    const inserted=await pool.query("INSERT INTO aurelink_email_payment_webhook_events(provider,event_id,event_type,payload) VALUES('paystack',$1,$2,$3::jsonb) ON CONFLICT(provider,event_id) DO UPDATE SET received_at=NOW() WHERE aurelink_email_payment_webhook_events.processed_at IS NULL RETURNING id",[eventId,String(body?.event||"unknown"),JSON.stringify(body)]);
    if(!inserted.rows[0]) return;
    if(body.event==="charge.success"){
      const ref=String(body.data?.reference||"");
      const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 AND payment_provider='paystack'",[ref])).rows[0];
      if(p) await fulfill(ref,String(body.data.id),"paystack",Number(body.data.amount),String(body.data.currency).toUpperCase(),String(body.data.subscription?.subscription_code||"")||undefined,{channel:String(body.data.channel||""),authorization:body.data.authorization||{},customer:body.data.customer||{}});
      else { const code=String(body.data?.subscription?.subscription_code||""); if(code) await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,billing_period_start=NOW(),billing_period_end=NOW()+INTERVAL '1 month',used_emails=0,paystack_customer_code=COALESCE($3,paystack_customer_code),updated_at=NOW() WHERE paystack_subscription_code=$1 AND status IN ($2,'past_due')",[code,"active",body.data?.customer?.customer_code||null]); }
      if(body.data?.subscription?.subscription_code) await pool.query("UPDATE aurelink_email_subscriptions SET paystack_customer_code=COALESCE(paystack_customer_code,$2),paystack_email_token_encrypted=COALESCE(paystack_email_token_encrypted,$3) WHERE paystack_subscription_code=$1",[body.data.subscription.subscription_code,body.data.customer?.customer_code||null,body.data.subscription?.email_token?encryptProviderSecret(String(body.data.subscription.email_token)):null]);
    }else if(body.event==="invoice.payment_failed"){
      const code=String(body.data?.subscription?.subscription_code||body.data?.subscription_code||"");
      if(code) await pool.query("UPDATE aurelink_email_subscriptions SET status='past_due',updated_at=NOW() WHERE paystack_subscription_code=$1 AND status='active'",[code]);
    }
    await pool.query("UPDATE aurelink_email_payment_webhook_events SET processed_at=NOW() WHERE provider='paystack' AND event_id=$1",[eventId]);
    void processAurelinkMailCreditConfirmationOutbox(10).catch(()=>undefined);
    return;
  }
  const token=await paypalToken();
  const verification=await axios.post(paypalBase()+"/v1/notifications/verify-webhook-signature",{
    auth_algo:headers["paypal-auth-algo"],cert_url:headers["paypal-cert-url"],transmission_id:headers["paypal-transmission-id"],
    transmission_sig:headers["paypal-transmission-sig"],transmission_time:headers["paypal-transmission-time"],
    webhook_id:required("PAYPAL_WEBHOOK_ID"),webhook_event:body
  },{headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},timeout:20000});
  if(verification.data?.verification_status!=="SUCCESS") throw new Error("Invalid PayPal webhook signature.");
  const eventId=String(body?.id||"");
  if(!eventId) throw new Error("PayPal webhook event ID is missing.");
  const inserted=await pool.query("INSERT INTO aurelink_email_payment_webhook_events(provider,event_id,event_type,payload) VALUES('paypal',$1,$2,$3::jsonb) ON CONFLICT(provider,event_id) DO UPDATE SET received_at=NOW() WHERE aurelink_email_payment_webhook_events.processed_at IS NULL RETURNING id",[eventId,String(body?.event_type||"unknown"),JSON.stringify(body)]);
  if(!inserted.rows[0]) return;
  const resource=body.resource||{};
  if(body.event_type==="PAYMENT.CAPTURE.COMPLETED"){
    const orderId=String(resource.supplementary_data?.related_ids?.order_id||"");
    const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE paypal_order_id=$1 AND payment_provider='paypal'",[orderId])).rows[0];
    const ref=String(p?.reference||"");
    if(p) await fulfill(ref,String(resource.id),"paypal",providerAmountToMinor(resource.amount?.value,String(resource.amount?.currency_code||"")),String(resource.amount?.currency_code||""));
  }else if(body.event_type==="BILLING.SUBSCRIPTION.ACTIVATED"){
    const id=String(resource.id||"");
    const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE paypal_subscription_id=$1 AND payment_provider='paypal'",[id])).rows[0];
    if(p){
      const plan=await pool.query("SELECT amount_minor FROM aurelink_email_provider_plans WHERE provider='paypal' AND provider_plan_id=$1",[resource.plan_id]);
      await fulfill(String(p.reference),id,"paypal",Number(plan.rows[0]?.amount_minor||p.amount_minor),"USD",id);
    }
  }else if(body.event_type==="PAYMENT.SALE.COMPLETED"){
    const subscriptionId=String(resource.billing_agreement_id||resource.supplementary_data?.related_ids?.subscription_id||"");
    if(subscriptionId) await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,billing_period_start=NOW(),billing_period_end=NOW()+INTERVAL '1 month',used_emails=0,updated_at=NOW() WHERE paypal_subscription_id=$1 AND status IN ($2,'past_due')",[subscriptionId,"active"]);
  }else if(body.event_type==="BILLING.SUBSCRIPTION.PAYMENT.FAILED"){
    await pool.query("UPDATE aurelink_email_subscriptions SET status='past_due',updated_at=NOW() WHERE paypal_subscription_id=$1 AND status='active'",[resource.id]);
  }else if(body.event_type==="BILLING.SUBSCRIPTION.CANCELLED"||body.event_type==="BILLING.SUBSCRIPTION.SUSPENDED"||body.event_type==="BILLING.SUBSCRIPTION.EXPIRED"){
    const status=body.event_type.endsWith("CANCELLED")?"cancelled":body.event_type.endsWith("SUSPENDED")?"suspended":"expired";
    await pool.query("UPDATE aurelink_email_subscriptions SET status=CASE WHEN $2='cancelled' AND billing_period_end>NOW() THEN status ELSE $2 END,cancel_at_period_end=CASE WHEN $2='cancelled' AND billing_period_end>NOW() THEN TRUE ELSE cancel_at_period_end END,updated_at=NOW() WHERE paypal_subscription_id=$1 AND status IN ('active','past_due')",[resource.id,status]);
  }
  await pool.query("UPDATE aurelink_email_payment_webhook_events SET processed_at=NOW() WHERE provider='paypal' AND event_id=$1",[eventId]);
  void processAurelinkMailCreditConfirmationOutbox(10).catch(()=>undefined);
}
