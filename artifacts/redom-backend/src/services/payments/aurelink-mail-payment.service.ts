import axios from "axios";
import crypto from "node:crypto";
import { pool } from "../../database/db";

type Provider = "paypal" | "paystack";
type PaymentRow = Record<string, any>;

const paypalBase = () => String(process.env.PAYPAL_ENV || "sandbox").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const required = (name:string) => { const v=String(process.env[name]||"").trim(); if(!v) throw new Error(name+" is required to enable Aurelink Mail payments."); return v; };
const money = (minor:number,currency:string) => ({value:(minor/100).toFixed(2),currency_code:currency});
const reference = () => "AURELINK-MAIL-"+crypto.randomUUID().replace(/-/g,"").slice(0,24);

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
  const q=await pool.query(`SELECT u.email,u.account_status,u.email_verified,u.country_code,u.country_verified_at,w.id
    FROM aurelink_users u JOIN aurelink_communications_workspaces w ON w.user_id=u.id OR EXISTS
    (SELECT 1 FROM aurelink_communications_members m WHERE m.workspace_id=w.id AND m.accepted_user_id=u.id AND m.status='active')
    WHERE u.id=$1 AND w.id=$2 AND w.status='active' LIMIT 1`,[userId,workspaceId]);
  const u=q.rows[0];
  if(!u||u.account_status!=="active"||u.email_verified!==true) throw new Error("An active Aurelink account with a verified email is required.");
  const country=String(u.country_code||"").toUpperCase();
  if(!country||!u.country_verified_at) throw new Error("Verify your account country before purchasing Aurelink Mail. Checkout country selection cannot be used for payment routing.");
  return {email:String(u.email),country};
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

export async function createAurelinkMailCheckout(input:{userId:string;workspaceId:string;purchaseType:"subscription"|"email_credits";planOptionId?:string;creditPackId?:string}){
  const customer=await customerContext(input.userId,input.workspaceId),provider=providerFor(customer.country);
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
        const order=await paypal<any>("post","/v2/checkout/orders",{intent:"CAPTURE",purchase_units:[{reference_id:ref,custom_id:ref,description:"Aurelink Mail prepaid email credits",amount:money(amount,"USD")}],payment_source:{paypal:{experience_context:{return_url:urls.success,cancel_url:urls.cancel,user_action:"PAY_NOW"}}}});
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

async function fulfill(referenceValue:string,providerRef:string,provider:string,providerAmount:number,providerCurrency:string,subscriptionId?:string){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const p=(await client.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 FOR UPDATE",[referenceValue])).rows[0] as PaymentRow;
    if(!p) throw new Error("Aurelink Mail payment reference not found.");
    if(p.status==="paid"){await client.query("COMMIT");return;}
    if(String(p.payment_provider)!==provider||Number(p.provider_amount_minor)!==providerAmount||String(p.provider_currency).trim()!==providerCurrency) throw new Error("Provider amount or currency does not match the pending Aurelink Mail payment.");
    if(p.purchase_type==="email_credits"){
      const w=(await client.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1 FOR UPDATE",[p.workspace_id])).rows[0];
      if(!w) throw new Error("Aurelink Mail workspace not found.");
      await client.query("INSERT INTO aurelink_email_credit_wallets(workspace_id,user_id) VALUES($1,$2) ON CONFLICT(workspace_id) DO NOTHING",[p.workspace_id,w.user_id]);
      const wallet=(await client.query("SELECT balance_emails FROM aurelink_email_credit_wallets WHERE workspace_id=$1 FOR UPDATE",[p.workspace_id])).rows[0];
      const credits=BigInt(String(p.email_credits)),next=BigInt(String(wallet.balance_emails))+credits;
      if(credits<1000n||credits>250000n||next>250000n) throw new Error("Prepaid credit balance would exceed the permitted 250,000-credit limit.");
      await client.query("UPDATE aurelink_email_credit_wallets SET balance_emails=$2,updated_at=NOW() WHERE workspace_id=$1",[p.workspace_id,next.toString()]);
      await client.query("INSERT INTO aurelink_email_credit_ledger(workspace_id,user_id,entry_type,direction,amount_emails,balance_after,reference,payment_reference,description,metadata) VALUES($1,$2,'purchase','credit',$3,$4,$5,$6,'Purchase of Aurelink Mail prepaid email credits',$7::jsonb) ON CONFLICT(reference) DO NOTHING",[p.workspace_id,p.user_id,credits.toString(),next.toString(),"AL-EMAIL-CREDIT-PURCHASE-"+referenceValue,referenceValue,JSON.stringify({provider,providerReference:providerRef})]);
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
        await fulfill(ref,String(cap.id), "paypal",Math.round(Number(cap.amount.value)*100),String(cap.amount.currency_code));
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
    if(d.status==="success") await fulfill(ref,String(d.id),"paystack",Number(d.amount),String(d.currency).toUpperCase());
  }
  const refreshed=(await pool.query("SELECT status,purchase_type,email_credits FROM aurelink_email_billing_payments WHERE reference=$1",[ref])).rows[0];
  return {status:String(refreshed.status),purchaseType:String(refreshed.purchase_type),creditsAdded:refreshed.status==="paid"&&refreshed.purchase_type==="email_credits"?String(refreshed.email_credits):undefined};
}

export async function cancelAurelinkMailSubscription(workspaceId:string){
  const p=(await pool.query("SELECT s.*,b.payment_provider FROM aurelink_email_subscriptions s LEFT JOIN aurelink_email_billing_payments b ON b.reference=s.payment_reference WHERE s.workspace_id=$1 AND s.status IN ('active','past_due') AND s.cancel_at_period_end=FALSE ORDER BY s.created_at DESC LIMIT 1",[workspaceId])).rows[0];
  if(!p) throw new Error("An active cancellable Aurelink Mail subscription was not found.");
  if(p.payment_provider==="paypal"&&p.paypal_subscription_id) await paypal("post","/v1/billing/subscriptions/"+encodeURIComponent(p.paypal_subscription_id)+"/cancel",{reason:"Customer requested cancellation"});
  else if(p.payment_provider==="paystack"&&p.paystack_subscription_code&&p.paystack_customer_code) await paystack("post","/subscription/disable",{code:p.paystack_subscription_code,token:p.paystack_customer_code});
  else throw new Error("This legacy Stripe subscription must be cancelled through its original billing provider.");
  await pool.query("UPDATE aurelink_email_subscriptions SET cancel_at_period_end=TRUE,cancelled_at=NOW(),updated_at=NOW() WHERE id=$1",[p.id]);
  return {subscriptionId:String(p.paypal_subscription_id||p.paystack_subscription_code),cancelAtPeriodEnd:true,periodEnd:new Date(p.billing_period_end)};
}

export async function handleAurelinkMailWebhook(provider:"paypal"|"paystack",headers:Record<string,string|undefined>,body:any,rawBody?:Buffer){
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
      if(p) await fulfill(ref,String(body.data.id),"paystack",Number(body.data.amount),String(body.data.currency).toUpperCase(),String(body.data.subscription?.subscription_code||"")||undefined);
      else { const code=String(body.data?.subscription?.subscription_code||""); if(code) await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,billing_period_start=NOW(),billing_period_end=NOW()+INTERVAL '1 month',used_emails=0,reserved_emails=0,paystack_customer_code=COALESCE($3,paystack_customer_code),updated_at=NOW() WHERE paystack_subscription_code=$1 AND status IN ($2,'past_due')",[code,"active",body.data?.customer?.customer_code||null]); }
      if(body.data?.subscription?.subscription_code) await pool.query("UPDATE aurelink_email_subscriptions SET paystack_customer_code=$2 WHERE paystack_subscription_code=$1 AND paystack_customer_code IS NULL",[body.data.subscription.subscription_code,body.data.customer?.customer_code||null]);
    }else if(body.event==="invoice.payment_failed"){
      const code=String(body.data?.subscription?.subscription_code||body.data?.subscription_code||"");
      if(code) await pool.query("UPDATE aurelink_email_subscriptions SET status='past_due',updated_at=NOW() WHERE paystack_subscription_code=$1 AND status='active'",[code]);
    }
    await pool.query("UPDATE aurelink_email_payment_webhook_events SET processed_at=NOW() WHERE provider='paystack' AND event_id=$1",[eventId]);
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
  const inserted=await pool.query("INSERT INTO aurelink_email_payment_webhook_events(provider,event_id,event_type,payload) VALUES('paypal',$1,$2,$3::jsonb) ON CONFLICT(provider,event_id) DO NOTHING RETURNING id",[eventId,String(body?.event_type||"unknown"),JSON.stringify(body)]);
  if(!inserted.rows[0]) return;
  const resource=body.resource||{};
  if(body.event_type==="PAYMENT.CAPTURE.COMPLETED"){
    const ref=String(resource.custom_id||resource.supplementary_data?.related_ids?.order_id||"");
    const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE reference=$1 AND payment_provider='paypal'",[ref])).rows[0];
    if(p) await fulfill(ref,String(resource.id),"paypal",Math.round(Number(resource.amount?.value)*100),String(resource.amount?.currency_code||""));
  }else if(body.event_type==="BILLING.SUBSCRIPTION.ACTIVATED"){
    const id=String(resource.id||"");
    const p=(await pool.query("SELECT * FROM aurelink_email_billing_payments WHERE paypal_subscription_id=$1 AND payment_provider='paypal'",[id])).rows[0];
    if(p){
      const plan=await pool.query("SELECT amount_minor FROM aurelink_email_provider_plans WHERE provider='paypal' AND provider_plan_id=$1",[resource.plan_id]);
      await fulfill(String(p.reference),id,"paypal",Number(plan.rows[0]?.amount_minor||p.amount_minor),"USD",id);
    }
  }else if(body.event_type==="PAYMENT.SALE.COMPLETED"){
    const subscriptionId=String(resource.billing_agreement_id||resource.supplementary_data?.related_ids?.subscription_id||"");
    if(subscriptionId) await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,billing_period_start=NOW(),billing_period_end=NOW()+INTERVAL '1 month',used_emails=0,reserved_emails=0,updated_at=NOW() WHERE paypal_subscription_id=$1 AND status IN ($2,'past_due')",[subscriptionId,"active"]);
  }else if(body.event_type==="BILLING.SUBSCRIPTION.PAYMENT.FAILED"){
    await pool.query("UPDATE aurelink_email_subscriptions SET status='past_due',updated_at=NOW() WHERE paypal_subscription_id=$1 AND status='active'",[resource.id]);
  }else if(body.event_type==="BILLING.SUBSCRIPTION.CANCELLED"||body.event_type==="BILLING.SUBSCRIPTION.SUSPENDED"||body.event_type==="BILLING.SUBSCRIPTION.EXPIRED"){
    const status=body.event_type.endsWith("CANCELLED")?"cancelled":body.event_type.endsWith("SUSPENDED")?"suspended":"expired";
    await pool.query("UPDATE aurelink_email_subscriptions SET status=$2,updated_at=NOW() WHERE paypal_subscription_id=$1 AND status IN ('active','past_due')",[resource.id,status]);
  }
  await pool.query("UPDATE aurelink_email_payment_webhook_events SET processed_at=NOW() WHERE provider='paypal' AND event_id=$1",[eventId]);
}
