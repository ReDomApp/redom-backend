import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { walletCredit, walletDebit } from "../services/aurelink/aurelink-wallet.service";
import { verifyAurelinkNumber, veriphoneLineAssessment } from "../services/aurelink/veriphone.client";
import { aurelinkPriceBreakdown } from "../services/aurelink/aurelink-pricing.service";
import { nonVoipClient, NonVoipError, nvRows, nvRecord, nonVoipIdempotencyKey, type NvRow } from "../services/aurelink/nonvoip.client";

const router=Router();
function text(v:unknown){return v==null?"":String(v);}
function providerPrice(row:Record<string,unknown>){for(const k of ["customer_price","price","cost","amount","quoted_price"]) {const n=Number(row[k]);if(Number.isFinite(n)&&n>0)return n;}return 0;}
function retailMinor(price:number){return aurelinkPriceBreakdown(price,"long_term")?.totalMinor ?? 0;}
function productFields(row:Record<string,unknown>){
 const serviceId=text(row.service_id??row.serviceId??row.id??row.product_id);
 const offerId=text(row.offer_id??row.offerId??row.id??row.offer?.id);
 const price=providerPrice(row);
 return {serviceId,offerId,providerPrice:price,retailMinor:retailMinor(price),service:text(row.service_name??row.service??row.name??row.title),logo:text(row.logo_url??row.logo??row.icon_url??row.icon),countryCode:text(row.country_code??row.countryCode??row.iso2??row.country),countryName:text(row.country_name??row.countryName??row.country_label),dialCode:text(row.dial_code??row.dialCode??row.phone_code),offerLabel:text(row.offer_name??row.name??row.label),available:row.available!==false&&row.in_stock!==false&&Number(row.stock??row.available_count??1)>0};
}
router.use(aurelinkAuthMiddleware);
router.get("/aurelink/nonvoip/countries",async(_req,res)=>{try{const d=await nonVoipClient.products("long-term",undefined,1,50);const rows=nvRows(d);const map=new Map<string,Record<string,unknown>>();for(const r of rows){const f=productFields(r);if(f.countryCode)map.set(f.countryCode,{code:f.countryCode,name:f.countryName||f.countryCode,dialCode:f.dialCode});}return res.json({success:true,countries:[...map.values()]});}catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip countries unavailable."});}});
router.get("/aurelink/nonvoip/products",async(req,res)=>{const country=String(req.query.country||"").trim();const page=Math.max(1,Math.min(1000,Number(req.query.page)||1));if(!country)return res.status(400).json({success:false,message:"Choose a country first."});try{const d=await nonVoipClient.products("long-term",country,page,50);const rows=nvRows(d).map(productFields).filter(x=>x.serviceId&&x.offerId&&x.providerPrice>0&&x.available);return res.json({success:true,products:rows.map(x=>({...x,retailPriceUsd:(x.retailMinor/100).toFixed(2),priceBreakdown:aurelinkPriceBreakdown(x.providerPrice,"long_term")})),page,perPage:50,total:Number(nvRecord(d).total)||null,hasMore:rows.length>=50});}catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip catalog unavailable."});}});
router.post("/aurelink/nonvoip/orders",async(req,res)=>{
 const userId=req.user?.userId;
 if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
 const parsed=req.body as Record<string,unknown>;
 const serviceId=text(parsed.serviceId),offerId=text(parsed.offerId),countryCode=text(parsed.countryCode).toUpperCase();
 const quotedPrice=Number(parsed.providerPrice);
 if(!serviceId||!offerId||!countryCode)return res.status(400).json({success:false,message:"A live NonVoip offer and country are required."});
 if(!Number.isFinite(quotedPrice)||quotedPrice<=0)return res.status(409).json({success:false,message:"This number is unavailable because its provider price is zero or invalid."});
 let liveOffer:NvRow|undefined;
 try{
  // Refresh the provider catalog before wallet debit; never trust a client-supplied amount.
  const catalog=await nonVoipClient.products("long-term",countryCode,1,1000);
  liveOffer=nvRows(catalog).find(row=>{
   const fields=productFields(row);
   return fields.serviceId===serviceId&&fields.offerId===offerId&&fields.countryCode.toUpperCase()===countryCode&&fields.available&&fields.providerPrice>0;
  });
  if(!liveOffer){
   for(let page=2;page<=20&&!liveOffer;page++){
    const next=await nonVoipClient.products("long-term",countryCode,page,50);
    const rows=nvRows(next);
    liveOffer=rows.find(row=>{
     const fields=productFields(row);
     return fields.serviceId===serviceId&&fields.offerId===offerId&&fields.countryCode.toUpperCase()===countryCode&&fields.available&&fields.providerPrice>0;
    });
    if(rows.length<50)break;
   }
  }
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Aurelink could not refresh the live NonVoip offer."});}
 if(!liveOffer)return res.status(409).json({success:false,message:"This NonVoip offer is no longer available. Refresh the catalog and try again."});
 const liveFields=productFields(liveOffer);
 const providerAmount=liveFields.providerPrice;
 if(Math.abs(providerAmount-quotedPrice)>0.000001){
  const currentBreakdown=aurelinkPriceBreakdown(providerAmount,"long_term");
  return res.status(409).json({success:false,message:"The provider price changed. Refresh the quote before purchasing.",providerPrice:providerAmount,retailMinor:currentBreakdown?.totalMinor??0,priceBreakdown:currentBreakdown});
 }
 const priceBreakdown=aurelinkPriceBreakdown(providerAmount,"long_term");
 if(!priceBreakdown)return res.status(409).json({success:false,message:"This number is unavailable because the provider returned a zero or invalid price."});
 const total=priceBreakdown.totalMinor;
 const client=await pool.connect();let debitRef="";let createdId="";
 try{
  await client.query("BEGIN");
  await walletDebit(client,{userId,amountMinor:total,reference:"nonvoip-purchase:"+randomUUID(),type:"purchase",description:"Aurelink 30-day mobile number purchase",metadata:{provider:"NonVoip",serviceId,offerId,priceBreakdown}});
  debitRef=String((await client.query("SELECT reference FROM aurelink_wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[userId])).rows[0]?.reference||"");
  await client.query("COMMIT");
  const idempotency=nonVoipIdempotencyKey();
  const order=await nonVoipClient.createOrder({serviceId,offerId,quotedPrice:providerAmount.toFixed(2),idempotencyKey:idempotency});
  const data=nvRecord(order);createdId=text(data.id??data.order_id??data.verification_id);
  const number=text(data.phone_number??data.number??data.phoneNumber);
  if(!createdId||!number)throw new NonVoipError("NonVoip returned an incomplete order. Aurelink is reconciling the provider result.",502,"INCOMPLETE_ORDER");
  const check=await verifyAurelinkNumber(number);
  const assessment=veriphoneLineAssessment(check as Record<string,unknown>);
  if(!assessment.valid||!assessment.lineType.toLowerCase().includes("mobile")){
   await nonVoipClient.cancel(createdId).catch(()=>undefined);
   throw new NonVoipError("This allocation did not pass the mobile-line check. The order was rejected and a wallet refund was initiated.",409,"MOBILE_CHECK_FAILED");
  }
  const orderId=String(440+Math.floor(Math.random()*120))+String(Math.floor(10000+Math.random()*90000));
  const saved=await pool.query("INSERT INTO aurelink_provider_orders(aurelink_order_id,aurelink_user_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,carrier_name,line_type,verification_status,verified_at,rental_started_at,expires_at,provider_payload) VALUES($1,$2,'rental',$3,$4,$5,$6,'active',$7,$8,$9,$10,$11,'verified',NOW(),NOW(),COALESCE($12::timestamptz,NOW()+INTERVAL '30 days'),$13::jsonb) RETURNING id,aurelink_order_id,provider_order_id,phone_number,country,service,status,expires_at,created_at",
   [orderId,userId,createdId,number,text(data.country_code??countryCode),text(data.service??parsed.serviceName),providerAmount,String(total),debitRef||null,assessment.carrier,assessment.lineType,data.expires_at??null,JSON.stringify({provider:"NonVoip",providerOrder:data,offerId,serviceId,priceBreakdown,verified:true})]);
  return res.status(201).json({success:true,order:saved.rows[0],priceBreakdown});
 }catch(e){
  await client.query("ROLLBACK").catch(()=>undefined);
  if(debitRef){const refund=await pool.connect();try{await refund.query("BEGIN");await walletCredit(refund,{userId,amountMinor:total,reference:"refund:"+debitRef,type:"refund",description:"Automatic refund for failed NonVoip mobile number purchase",metadata:{provider:"NonVoip",reason:e instanceof Error?e.message:"order failed"}});await refund.query("COMMIT");}catch{await refund.query("ROLLBACK").catch(()=>undefined);}finally{refund.release();}}
  return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip order failed; wallet reconciliation was attempted."});
 }finally{client.release();}
});
router.get("/aurelink/nonvoip/orders/:id/messages",async(req,res)=>{try{const result=await pool.query("SELECT provider_order_id FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND product_kind='rental'",[req.user?.userId,req.params.id]);if(!result.rows[0])return res.status(404).json({success:false,message:"Order not found."});const messages=await nonVoipClient.messages(req.params.id);const body=nvRecord(messages);const hasSms=Array.isArray(body.messages)&&(body.messages as unknown[]).length>0;await pool.query("UPDATE aurelink_provider_orders SET sms_received_at=CASE WHEN $2 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE aurelink_user_id=$1 AND provider_order_id=$4",[req.user?.userId,hasSms,JSON.stringify({lastNonVoipMessages:messages}),req.params.id]);return res.json({success:true,messages:body.messages??[],smsReceived:hasSms});}catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"SMS status unavailable."});}});

router.post("/aurelink/nonvoip/orders/:id/cancel",async(req,res)=>{const userId=req.user?.userId;if(!userId)return res.status(401).json({success:false,message:"Authentication required."});const db=await pool.query("SELECT * FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND product_kind='rental'",[userId,req.params.id]);const order=db.rows[0] as Record<string,unknown>|undefined;if(!order)return res.status(404).json({success:false,message:"Order not found."});if(order.sms_received_at)return res.status(409).json({success:false,message:"This order has received an SMS and cannot be cancelled."});if(Date.now()-new Date(String(order.created_at)).getTime()>3600000)return res.status(409).json({success:false,message:"The one-hour cancellation window has expired."});try{const result=await nonVoipClient.cancel(req.params.id);const status=text(result.status??result.state).toLowerCase();if(result.success===false||/failed|rejected/.test(status))return res.status(409).json({success:false,message:"NonVoip did not confirm cancellation. No wallet refund was issued."});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1",[order.id,JSON.stringify({nonVoipCancellation:result})]);if(order.wallet_debit_reference&&order.retail_amount_minor)await walletCredit(client,{userId,amountMinor:String(order.retail_amount_minor),reference:"refund:"+String(order.wallet_debit_reference),type:"refund",description:"NonVoip confirmed cancellation within one hour",orderId:String(order.id)});await client.query("COMMIT");return res.json({success:true,cancelled:true,refunded:true});}catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}}catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Unable to cancel NonVoip order."});}});


function shortTermFields(row:Record<string,unknown>){
 const f=productFields(row);
 const lineType=text(row.line_type??row.number_type??row.type??row.category).toLowerCase();
 const priceBreakdown=aurelinkPriceBreakdown(f.providerPrice,"short_term");
 return {...f,lineType,retailMinor:priceBreakdown?.totalMinor??0,priceBreakdown};
}
function shortTermExpiry(data:Record<string,unknown>):Date|null{
 const raw=data.expires_at??data.expiration??data.expiry;
 if(typeof raw==="string"&&raw.trim()){const d=new Date(raw);if(Number.isFinite(d.getTime()))return d;const n=Number(raw);if(Number.isFinite(n)&&n>0)return new Date(n<100000000000?n*1000:n);}
 if(typeof raw==="number"&&raw>0)return new Date(raw<100000000000?raw*1000:raw);
 const seconds=Number(data.expires_in??data.time_left);
 return Number.isFinite(seconds)&&seconds>0?new Date(Date.now()+seconds*1000):null;
}
function shortTermProviderConfirmed(value:unknown):boolean{
 const row=nvRecord(value);
 return row.success===true||row.success===1||/^(success|cancelled|canceled|refunded)$/i.test(text(row.status??row.message));
}
router.get("/aurelink/nonvoip/short-term/countries",async(_req,res)=>{
 try{
  const seen=new Map<string,{code:string;name:string;dialCode:string}>();
  for(let page=1;page<=20;page++){
   const d=await nonVoipClient.products("short-term",undefined,page,50);
   const rows=nvRows(d);
   for(const row of rows){const f=shortTermFields(row);if(f.countryCode)seen.set(f.countryCode,{code:f.countryCode,name:f.countryName||f.countryCode,dialCode:f.dialCode});}
   if(rows.length<50)break;
  }
  return res.json({success:true,countries:[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name)),availableCountryCount:seen.size,provider:"nonvoip",poolLabel:"Lisa Pool 1"});
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip Short-term countries unavailable."});}
});
router.get("/aurelink/nonvoip/short-term/products",async(req,res)=>{
 const country=text(req.query.country).toUpperCase();
 if(!country)return res.status(400).json({success:false,message:"Choose a country first."});
 try{
  const rows:Record<string,unknown>[]=[];
  for(let page=1;page<=20;page++){
   const d=await nonVoipClient.products("short-term",country,page,50);
   const batch=nvRows(d);
   rows.push(...batch);
   if(batch.length<50)break;
  }
  const products=rows.map(shortTermFields).filter(x=>x.serviceId&&x.offerId&&x.countryCode.toUpperCase()===country&&x.providerPrice>0&&x.available&&!/bank|crypto|exchange|government|telecom|carrier/i.test(x.service));
  return res.json({success:true,products:products.map(x=>({...x,provider:"nonvoip",poolLabel:"Lisa Pool 1",retailPriceUsd:(x.retailMinor/100).toFixed(2)})),country,availableCount:products.length});
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip Short-term catalog unavailable."});}
});
router.post("/aurelink/nonvoip/short-term/quote",async(req,res)=>{
 const userId=req.user?.userId;
 const countryCode=text(req.body?.countryCode).toUpperCase();
 const serviceId=text(req.body?.serviceId);
 const offerId=text(req.body?.offerId);
 if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
 if(!countryCode||!serviceId||!offerId)return res.status(400).json({success:false,message:"A country, service and live offer are required."});
 try{
  let offer:Record<string,unknown>|undefined;
  for(let page=1;page<=20&&!offer;page++){
   const d=await nonVoipClient.products("short-term",countryCode,page,50);
   const batch=nvRows(d);
   offer=batch.find(row=>{const f=shortTermFields(row);return f.serviceId===serviceId&&f.offerId===offerId&&f.countryCode.toUpperCase()===countryCode&&f.available&&f.providerPrice>0;});
   if(batch.length<50)break;
  }
  if(!offer)return res.status(409).json({success:false,message:"This NonVoip Short-term offer is unavailable. Refresh the catalog."});
  const fields=shortTermFields(offer);
  if(/bank|crypto|exchange|government|telecom|carrier/i.test(fields.service))return res.status(403).json({success:false,message:"This service is not enabled for Aurelink."});
  const priorOtp=await pool.query("SELECT 1 FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND product_kind='activation' AND sms_received_at IS NOT NULL LIMIT 1",[userId]);
  const firstPurchaseEligible=priorOtp.rowCount===0;
  const requiredLineType=firstPurchaseEligible?"mobile":"voip";
  if(fields.lineType&&!(requiredLineType==="mobile"?/mobile|gsm|real/.test(fields.lineType):/voip|virtual/.test(fields.lineType)))
   return res.status(409).json({success:false,message:"This offer does not match the line type available to this account."});
  const priceBreakdown=aurelinkPriceBreakdown(fields.providerPrice,"short_term",{firstPurchase:firstPurchaseEligible});
  if(!priceBreakdown)return res.status(409).json({success:false,message:"This number is unavailable because the provider price is zero or invalid."});
  const pricing={provider:"nonvoip",poolLabel:"Lisa Pool 1",serviceId,offerId,offer,pricingRule:{providerMultiplier:2,firstPurchaseEligible,requiredLineType,firstPurchaseDiscountMinor:priceBreakdown.firstPurchaseDiscountMinor},priceBreakdown};
  const inserted=await pool.query(
   "INSERT INTO aurelink_quotes(aurelink_user_id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,provider_pricing,expires_at) VALUES($1,'activation',$2,$3,$4,$5,'USD',$6::jsonb,NOW()+INTERVAL '10 minutes') RETURNING id,product_kind,country,service,provider_max_price,retail_amount_minor,currency,expires_at",
   [userId,countryCode,fields.service,fields.providerPrice,priceBreakdown.totalMinor,JSON.stringify(pricing)]
  );
  return res.json({success:true,quote:inserted.rows[0],provider:"nonvoip",poolLabel:"Lisa Pool 1",providerPriceUsd:fields.providerPrice,customerPriceUsd:(priceBreakdown.totalMinor/100).toFixed(2),priceBreakdown,requiredLineType,eligibility:firstPurchaseEligible?"first_purchase_mobile":"returning_customer_voip"});
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Unable to quote this NonVoip Short-term offer."});}
});
router.post("/aurelink/nonvoip/short-term/orders",async(req,res)=>{
 const userId=req.user?.userId;
 const quoteId=text(req.body?.quoteId);
 if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
 if(!quoteId)return res.status(400).json({success:false,message:"A valid Short-term quote is required."});
 const client=await pool.connect();
 let quote:Record<string,unknown>|undefined;
 let debitReference="purchase:"+quoteId;
 try{
  await client.query("BEGIN");
  const q=await client.query("SELECT * FROM aurelink_quotes WHERE id=$1 AND aurelink_user_id=$2 AND product_kind='activation' AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[quoteId,userId]);
  quote=q.rows[0] as Record<string,unknown>|undefined;
  if(!quote){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"Quote expired, consumed, or not found."});}
  const pricing=nvRecord(quote.provider_pricing);
  if(pricing.provider!=="nonvoip"){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"This quote belongs to a different provider."});}
  await walletDebit(client,{userId,amountMinor:String(quote.retail_amount_minor),reference:debitReference,type:"purchase",description:"Short-term number purchase · NonVoip",metadata:{quoteId,provider:"nonvoip",country:quote.country,service:quote.service}});
  await client.query("UPDATE aurelink_quotes SET consumed_at=NOW() WHERE id=$1",[quoteId]);
  await client.query("COMMIT");
 }catch(e){
  await client.query("ROLLBACK").catch(()=>undefined);
  if(e instanceof Error&&e.message==="INSUFFICIENT_AURELINK_CREDIT")return res.status(402).json({success:false,code:"INSUFFICIENT_CREDIT",message:"Your Aurelink wallet balance is insufficient for this purchase."});
  return res.status(e instanceof NonVoipError?e.status:500).json({success:false,message:e instanceof Error?e.message:"Unable to reserve the quote."});
 }finally{client.release();}
 const pricing=nvRecord(quote?.provider_pricing);
 const serviceId=text(pricing.serviceId);
 const offerId=text(pricing.offerId);
 const providerPrice=Number(quote?.provider_max_price);
 let providerOrderId="";
 let number="";
 let providerOrder:Record<string,unknown>={};
 let cancelled=false;
 try{
  const created=await nonVoipClient.createOrder({type:"short-term",serviceId,offerId,quotedPrice:providerPrice.toFixed(2),idempotencyKey:nonVoipIdempotencyKey()});
  providerOrder=nvRecord(created);
  providerOrderId=text(providerOrder.id??providerOrder.order_id??providerOrder.verification_id);
  number=text(providerOrder.phone_number??providerOrder.number??providerOrder.phoneNumber);
  if(!providerOrderId||!number)throw new NonVoipError("NonVoip returned an incomplete Short-term allocation; reconciliation is required.",502,"INCOMPLETE_ORDER");
  const lookup=await verifyAurelinkNumber(number);
  const assessment=veriphoneLineAssessment(lookup as Record<string,unknown>);
  const rule=nvRecord(pricing.pricingRule);
  const required=String(rule.requiredLineType??"mobile");
  const actual=assessment.lineType.toLowerCase().includes("mobile")?"mobile":assessment.lineType.toLowerCase().includes("voip")?"voip":"unknown";
  if(!assessment.valid||actual!==required){
   const cancel=await nonVoipClient.cancel(providerOrderId).catch(()=>null);
   cancelled=shortTermProviderConfirmed(cancel);
   throw new NonVoipError(actual==="unknown"?"The allocated number could not be classified and was rejected.":"The allocated number did not match the line type required for this account and was rejected.",409,"LINE_TYPE_MISMATCH");
  }
  const orderId=String(100+Math.floor(Math.random()*900))+String(Math.floor(10000+Math.random()*90000));
  const expiry=shortTermExpiry(providerOrder);
  const firstDiscount=Boolean(rule.firstPurchaseEligible);
  const saved=await pool.query(
   "INSERT INTO aurelink_provider_orders(aurelink_order_id,aurelink_user_id,quote_id,product_kind,provider,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,first_purchase_discount,carrier_name,line_type,verification_status,verified_at,expires_at,provider_payload) VALUES($1,$2,$3,'activation','nonvoip',$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,'verified',NOW(),$14,$15::jsonb) RETURNING id,aurelink_order_id,provider_order_id,phone_number,country,service,status,expires_at,created_at",
   [orderId,userId,quoteId,providerOrderId,number,String(quote?.country),String(quote?.service),Number(providerOrder.customer_price??providerOrder.price??providerPrice),String(quote?.retail_amount_minor),debitReference,firstDiscount,assessment.carrier,assessment.lineType,expiry,JSON.stringify({provider:"nonvoip",providerOrder,carrierLookup:lookup,offerId,serviceId,priceBreakdown:pricing.priceBreakdown})]
  );
  return res.status(201).json({success:true,provider:"nonvoip",order:saved.rows[0],priceBreakdown:pricing.priceBreakdown});
 }catch(e){
  if(providerOrderId&&!cancelled){
   const cancel=await nonVoipClient.cancel(providerOrderId).catch(()=>null);
   cancelled=shortTermProviderConfirmed(cancel);
  }
  if(cancelled||!providerOrderId){
   const refund=await pool.connect();
   try{await refund.query("BEGIN");await walletCredit(refund,{userId,amountMinor:String(quote?.retail_amount_minor??0),reference:"refund:"+debitReference,type:"refund",description:"NonVoip Short-term order failure refund",metadata:{providerOrderId,reason:e instanceof Error?e.message:"order failed"}});await refund.query("COMMIT");}
   catch{await refund.query("ROLLBACK").catch(()=>undefined);}
   finally{refund.release();}
   await pool.query("UPDATE aurelink_quotes SET consumed_at=NULL WHERE id=$1 AND aurelink_user_id=$2",[quoteId,userId]).catch(()=>undefined);
  }else if(providerOrderId){
   const orderId=String(100+Math.floor(Math.random()*900))+String(Math.floor(10000+Math.random()*90000));
   await pool.query("INSERT INTO aurelink_provider_orders(aurelink_order_id,aurelink_user_id,quote_id,product_kind,provider,provider_order_id,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,first_purchase_discount,provider_payload) VALUES($1,$2,$3,'activation','nonvoip',$4,$5,$6,'cancellation_pending',$7,$8,$9,$10,$11::jsonb) ON CONFLICT(provider,provider_order_id) DO NOTHING",
    [orderId,userId,quoteId,providerOrderId,String(quote?.country),String(quote?.service),providerPrice,String(quote?.retail_amount_minor),debitReference,Boolean(nvRecord(pricing.pricingRule).firstPurchaseEligible),JSON.stringify({provider:"nonvoip",providerOrder,reconciliationRequired:true})]
   ).catch(()=>undefined);
  }
  return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip Short-term order failed; wallet reconciliation was attempted.",reconciliationRequired:Boolean(providerOrderId&&!cancelled)});
 }
});
router.get("/aurelink/nonvoip/short-term/orders/:id/messages",async(req,res)=>{
 const userId=req.user?.userId;
 try{
  const found=await pool.query("SELECT id FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND product_kind='activation' AND provider='nonvoip'",[userId,req.params.id]);
  if(!found.rows[0])return res.status(404).json({success:false,message:"Order not found."});
  const response=await nonVoipClient.messages(req.params.id);
  const body=nvRecord(response);
  const messages=Array.isArray(body.messages)?body.messages:[];
  const arrived=messages.length>0;
  await pool.query("UPDATE aurelink_provider_orders SET sms_received_at=CASE WHEN $2 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE id=$1",[found.rows[0].id,arrived,JSON.stringify({nonVoipMessages:messages})]);
  return res.json({success:true,messages,smsReceived:arrived});
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"NonVoip messages are unavailable."});}
});
router.post("/aurelink/nonvoip/short-term/orders/:id/cancel",async(req,res)=>{
 const userId=req.user?.userId;
 const found=await pool.query("SELECT * FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND product_kind='activation' AND provider='nonvoip'",[userId,req.params.id]);
 const order=found.rows[0] as Record<string,unknown>|undefined;
 if(!order)return res.status(404).json({success:false,message:"Order not found."});
 if(order.sms_received_at)return res.status(409).json({success:false,message:"This number has received an SMS and cannot be cancelled."});
 try{
  const result=await nonVoipClient.cancel(req.params.id);
  if(!shortTermProviderConfirmed(result))return res.status(409).json({success:false,message:"NonVoip has not confirmed cancellation. No wallet refund was issued."});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1",[order.id,JSON.stringify({nonVoipCancellation:result})]);
   if(order.wallet_debit_reference&&order.retail_amount_minor){
     const refundReference="refund:"+String(order.wallet_debit_reference);
     await walletCredit(client,{userId,amountMinor:String(order.retail_amount_minor),reference:refundReference,type:"refund",description:"NonVoip Short-term cancellation refund",orderId:String(order.id)});
     await client.query("UPDATE aurelink_provider_orders SET refund_reference=$2 WHERE id=$1",[order.id,refundReference]);
    }
   await client.query("COMMIT");
   return res.json({success:true,cancelled:true,refunded:Boolean(order.wallet_debit_reference)});
  }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
 }catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Unable to cancel the NonVoip Short-term order."});}
});

function dedicatedFields(row:Record<string,unknown>){
 const serviceId=text(row.service_id??row.serviceId??row.id??row.product_id);
 const offerId=text(row.offer_id??row.offerId??row.id??row.offer?.id);
 const price=providerPrice(row);
 const countryCode=text(row.country_code??row.countryCode??row.iso2??row.country);
 const countryName=text(row.country_name??row.countryName??row.country_label);
 const dialCode=text(row.dial_code??row.dialCode??row.phone_code);
 const lineType=text(row.line_type??row.number_type??row.type??row.category).toLowerCase();
 return {serviceId,offerId,providerPrice:price,countryCode,countryName,dialCode,lineType,available:row.available!==false&&row.in_stock!==false&&Number(row.stock??row.available_count??1)>0};
}
function dedicatedRetailMinor(price:number){return aurelinkPriceBreakdown(price,"dedicated")?.totalMinor ?? 0;}
router.get("/aurelink/dedicated/countries",async(_req,res)=>{
 try{const d=await nonVoipClient.products("dedicated",undefined,1,100);const map=new Map<string,{code:string;name:string;dialCode:string}>();for(const row of nvRows(d)){const x=dedicatedFields(row);if(x.countryCode)map.set(x.countryCode,{code:x.countryCode,name:x.countryName||x.countryCode,dialCode:x.dialCode});}return res.json({success:true,countries:[...map.values()]});}
 catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:"Aurelink could not load dedicated-number countries."});}
});
router.post("/aurelink/dedicated/quote",async(req,res)=>{
 const countryCode=text(req.body?.countryCode).toUpperCase();const lineType=text(req.body?.lineType).toLowerCase();
 if(!countryCode||!(lineType==="mobile"||lineType==="voip"))return res.status(400).json({success:false,message:"Choose a country and number type."});
 try{const d=await nonVoipClient.products("dedicated",countryCode,1,100);const rows=nvRows(d).map(dedicatedFields).filter(x=>x.countryCode.toUpperCase()===countryCode&&x.providerPrice>0&&x.available&&(!x.lineType||(lineType==="mobile"?/mobile|gsm|real/.test(x.lineType):/voip|virtual/.test(x.lineType))));if(!rows.length)return res.status(404).json({success:false,message:"No matching dedicated numbers are available in this country."});const x=rows[0];const retailMinor=dedicatedRetailMinor(x.providerPrice);return res.json({success:true,quote:{serviceId:x.serviceId,offerId:x.offerId,providerPrice:x.providerPrice,retailMinor,priceBreakdown:aurelinkPriceBreakdown(x.providerPrice,"dedicated"),lineType,countryCode,expiresAt:new Date(Date.now()+120000).toISOString()}});}
 catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:"Aurelink could not calculate a dedicated-number price."});}
});
router.post("/aurelink/dedicated/orders",async(req,res)=>{
 const userId=req.user?.userId;const countryCode=text(req.body?.countryCode).toUpperCase();const lineType=text(req.body?.lineType).toLowerCase();const serviceId=text(req.body?.serviceId);const offerId=text(req.body?.offerId);const price=Number(req.body?.providerPrice);
 if(!userId)return res.status(401).json({success:false,message:"Authentication required."});
 if(!countryCode||!(lineType==="mobile"||lineType==="voip")||!serviceId||!offerId||!Number.isFinite(price)||price<=0)return res.status(400).json({success:false,message:"A valid dedicated-number quote is required."});
 let liveOffer:Record<string,unknown>|undefined;try{const catalog=await nonVoipClient.products("dedicated",countryCode,1,100);liveOffer=nvRows(catalog).find(row=>{const fields=dedicatedFields(row);return fields.offerId===offerId&&fields.serviceId===serviceId&&fields.countryCode.toUpperCase()===countryCode&&fields.available&&fields.providerPrice>0;});}catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:"Aurelink could not refresh the live dedicated-number offer."});}if(!liveOffer)return res.status(409).json({success:false,message:"This dedicated-number offer is no longer available. Refresh the price and try again."});const liveFields=dedicatedFields(liveOffer);const livePrice=liveFields.providerPrice;if(Math.abs(livePrice-price)>0.000001)return res.status(409).json({success:false,message:"The provider price changed. Refresh the quote before purchasing.",providerPrice:livePrice});const total=dedicatedRetailMinor(livePrice);const reference="aurelink-dedicated:"+randomUUID();let debited=false;let providerId="";let providerCancelled=false;
 try{
  const client=await pool.connect();try{await client.query("BEGIN");await walletDebit(client,{userId,amountMinor:total,reference,type:"purchase",description:"Aurelink dedicated number · 30 days",metadata:{productKind:"dedicated",countryCode,lineType}});await client.query("COMMIT");debited=true;}catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
  const created=await nonVoipClient.createOrder({serviceId,offerId,quotedPrice:price.toFixed(2),idempotencyKey:nonVoipIdempotencyKey(),type:"dedicated"});const data=nvRecord(created);providerId=text(data.id??data.order_id??data.verification_id);const number=text(data.phone_number??data.number??data.phoneNumber);if(!providerId||!number)throw new NonVoipError("Aurelink received an incomplete allocation and is reconciling it.",502,"INCOMPLETE_ORDER");
  const check=await verifyAurelinkNumber(number);const assessment=veriphoneLineAssessment(check as Record<string,unknown>);const matches=lineType==="mobile"?assessment.lineType.toLowerCase().includes("mobile"):assessment.lineType.toLowerCase().includes("voip");if(!assessment.valid||!matches){const cancelled=await nonVoipClient.cancel(providerId);providerCancelled=Boolean(cancelled);if(!providerCancelled)throw new NonVoipError("The number failed its line-type check. Cancellation is pending reconciliation; the wallet charge remains protected.",409,"LINE_CHECK_RECONCILIATION");throw new NonVoipError("The number did not match the selected line type and was cancelled.",409,"LINE_TYPE_MISMATCH");}
  const orderId=String(992+Math.floor(Math.random()*7))+"-"+String(Math.floor(100+Math.random()*900))+"-"+String(Math.floor(1000+Math.random()*9000));
  const saved=await pool.query("INSERT INTO aurelink_provider_orders(aurelink_order_id,aurelink_user_id,product_kind,provider_order_id,phone_number,country,service,status,provider_cost,retail_amount_minor,wallet_debit_reference,carrier_name,line_type,verification_status,verified_at,rental_started_at,expires_at,provider_payload) VALUES($1,$2,'dedicated',$3,$4,$5,'Multi-Service','active',$6,$7,$8,$9,$10,'verified',NOW(),NOW(),COALESCE($11::timestamptz,NOW()+INTERVAL '30 days'),$12::jsonb) RETURNING id,aurelink_order_id,provider_order_id,phone_number,country,service,status,expires_at,created_at",[orderId,userId,providerId,number,countryCode,price,String(total),reference,assessment.carrier,assessment.lineType,data.expires_at??null,JSON.stringify({dedicated:true,lineType,providerOrder:data})]);
  return res.status(201).json({success:true,order:saved.rows[0]});
 }catch(e){
  if(debited&&(!providerId||providerCancelled)){const refund=await pool.connect();try{await refund.query("BEGIN");await walletCredit(refund,{userId,amountMinor:total,reference:"refund:"+reference,type:"refund",description:"Aurelink dedicated number order refund",metadata:{reason:e instanceof Error?e.message:"order failed"}});await refund.query("COMMIT");}catch{await refund.query("ROLLBACK").catch(()=>undefined);}finally{refund.release();}}
  return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Aurelink could not complete the dedicated-number order."});
 }
});
router.get("/aurelink/dedicated/orders/:id/messages",async(req,res)=>{
 try{const owned=await pool.query("SELECT id FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND provider_order_id=$2 AND product_kind='dedicated'",[req.user?.userId,req.params.id]);if(!owned.rows[0])return res.status(404).json({success:false,message:"Order not found."});const d=await nonVoipClient.messages(req.params.id);const body=nvRecord(d);const messages=Array.isArray(body.messages)?body.messages:[];const sms=messages.length>0;await pool.query("UPDATE aurelink_provider_orders SET sms_received_at=CASE WHEN $2 THEN COALESCE(sms_received_at,NOW()) ELSE sms_received_at END,last_provider_check_at=NOW(),updated_at=NOW(),provider_payload=provider_payload || $3::jsonb WHERE id=$1",[owned.rows[0].id,sms,JSON.stringify({dedicatedMessages:messages})]);return res.json({success:true,messages,smsReceived:sms,unreadCount:0});}
 catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:"Aurelink could not refresh messages."});}
});


router.patch("/aurelink/dedicated/orders/:id/auto-renew",async(req,res)=>{
 const enabled=req.body?.enabled===true;
 const updated=await pool.query("UPDATE aurelink_provider_orders SET auto_renew=$3,provider_payload=jsonb_set(COALESCE(provider_payload,'{}'::jsonb),'{autoRenew}',to_jsonb($3::boolean),true),updated_at=NOW() WHERE aurelink_user_id=$1 AND aurelink_order_id=$2 AND product_kind='dedicated' RETURNING aurelink_order_id",[req.user?.userId,req.params.id,enabled]);
 if(!updated.rows[0])return res.status(404).json({success:false,message:"Dedicated order not found."});
 return res.json({success:true,autoRenew:enabled});
});
router.post("/aurelink/dedicated/orders/:id/cancel",async(req,res)=>{
 const userId=req.user?.userId;const found=await pool.query("SELECT * FROM aurelink_provider_orders WHERE aurelink_user_id=$1 AND aurelink_order_id=$2 AND product_kind='dedicated'",[userId,req.params.id]);const order=found.rows[0] as Record<string,unknown>|undefined;
 if(!order)return res.status(404).json({success:false,message:"Dedicated order not found."});
 if(order.sms_received_at)return res.status(409).json({success:false,message:"This number has received an SMS and cannot be cancelled."});
 if(Date.now()-new Date(String(order.created_at)).getTime()>3600000)return res.status(409).json({success:false,message:"The one-hour cancellation window has expired."});
 try{const cancelled=await nonVoipClient.cancel(String(order.provider_order_id));const state=text(cancelled.status??cancelled.state).toLowerCase();if(/failed|rejected|pending/.test(state))return res.status(409).json({success:false,message:"Aurelink could not confirm cancellation. No refund was issued."});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE aurelink_provider_orders SET status='cancelled',updated_at=NOW(),provider_payload=provider_payload || $2::jsonb WHERE id=$1",[order.id,JSON.stringify({cancellation:cancelled})]);if(order.wallet_debit_reference&&order.retail_amount_minor)await walletCredit(client,{userId,amountMinor:String(order.retail_amount_minor),reference:"refund:"+String(order.wallet_debit_reference),type:"refund",description:"Dedicated number cancelled within one hour",orderId:String(order.id)});await client.query("COMMIT");return res.json({success:true,cancelled:true,refunded:true});}catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}}
 catch(e){return res.status(e instanceof NonVoipError?e.status:502).json({success:false,message:e instanceof Error?e.message:"Cancellation could not be confirmed."});}
});

export default router;
