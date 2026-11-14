import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus } from "../../redom-backend/src/services/aurelink/communications-webhooks.utils.ts";
import { classifyProviderHttpStatus, ProviderSubmissionError } from "../../redom-backend/src/services/aurelink/communications-providers.service.ts";
import { createAurelinkResendSmtpKey, revokeAurelinkResendSmtpKey } from "../../redom-backend/src/services/aurelink/communications-smtp.service.ts";
import { reserveAurelinkEmailUsage } from "../../redom-backend/src/services/aurelink/communications-email-billing.service.ts";
import { AURELINK_SMS_PACKAGE_CATALOG, isAurelinkSmsPublicReference } from "../../redom-backend/src/services/aurelink/communications-sms-billing-schema.service.ts";

test("Resend Svix signatures verify against the exact raw payload",()=>{
  const raw=Buffer.from(JSON.stringify({type:"email.delivered",data:{email_id:"email_123"}}));
  const id="msg_123",timestamp=String(Math.floor(Date.now()/1000)),secret="communications-test-secret";
  const signature=createHmac("sha256",secret).update(id+"."+timestamp+"."+raw.toString("utf8")).digest("base64");
  assert.equal(verifyAurelinkResendWebhook(raw,id,timestamp,"v1,"+signature,secret),true);
  assert.equal(verifyAurelinkResendWebhook(Buffer.from(raw.toString("utf8")+" "),id,timestamp,"v1,"+signature,secret),false);
});

test("Resend webhook verification rejects stale timestamps",()=>{
  const raw=Buffer.from("{}"),id="msg_stale",timestamp=String(Math.floor(Date.now()/1000)-600),secret="communications-test-secret";
  const signature=createHmac("sha256",secret).update(id+"."+timestamp+"."+raw.toString("utf8")).digest("base64");
  assert.equal(verifyAurelinkResendWebhook(raw,id,timestamp,"v1,"+signature,secret),false);
});

test("Provider status maps preserve accepted and delivery failure states",()=>{
  assert.equal(mapAurelinkResendEvent("email.delivered"),"delivered");
  assert.equal(mapAurelinkResendEvent("email.bounced"),"bounced");
  assert.equal(mapAurelinkResendEvent("email.unsubscribed"),"unsubscribed");
  assert.equal(mapAurelinkTwilioStatus("queued"),"accepted");
  assert.equal(mapAurelinkTwilioStatus("delivered"),"delivered");
  assert.equal(mapAurelinkTwilioStatus("undelivered"),"failed");
});

test("Aurelink creates Resend SMTP keys with sending-only access scoped to one domain",async()=>{
  const originalFetch=globalThis.fetch,originalKey=process.env.AURELINK_RESEND_API_KEY;
  const requests:Array<{url:string;init:RequestInit}>=[];
  process.env.AURELINK_RESEND_API_KEY="re_platform_test_key";
  globalThis.fetch=(async(input:any,init?:RequestInit)=>{
    requests.push({url:String(input),init:init||{}});
    return new Response(JSON.stringify({id:"key_domain_123",token:"re_customer_smtp_token"}),{status:201,headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  try{
    const result=await createAurelinkResendSmtpKey({workspaceId:"workspace-12345678",domainId:"domain_provider_123",label:"Production SMTP"});
    assert.deepEqual(result,{providerKeyId:"key_domain_123",token:"re_customer_smtp_token"});
    assert.equal(requests[0].url,"https://api.resend.com/api-keys");
    assert.equal(requests[0].init.method,"POST");
    assert.deepEqual(JSON.parse(String(requests[0].init.body)),{
      name:JSON.parse(String(requests[0].init.body)).name,
      permission:"sending_access",
      domain_id:"domain_provider_123"
    });
    assert.ok(String(JSON.parse(String(requests[0].init.body)).name).length<=50);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.AURELINK_RESEND_API_KEY;else process.env.AURELINK_RESEND_API_KEY=originalKey;
  }
});

test("Aurelink revokes the provider-owned Resend SMTP API key",async()=>{
  const originalFetch=globalThis.fetch,originalKey=process.env.AURELINK_RESEND_API_KEY;
  let request:{url:string;init:RequestInit}|undefined;
  process.env.AURELINK_RESEND_API_KEY="re_platform_test_key";
  globalThis.fetch=(async(input:any,init?:RequestInit)=>{
    request={url:String(input),init:init||{}};
    return new Response("",{status:200});
  }) as typeof fetch;
  try{
    await revokeAurelinkResendSmtpKey("key_domain_123");
    assert.equal(request?.url,"https://api.resend.com/api-keys/key_domain_123");
    assert.equal(request?.init.method,"DELETE");
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined)delete process.env.AURELINK_RESEND_API_KEY;else process.env.AURELINK_RESEND_API_KEY=originalKey;
  }
});


test("SMS segment calculation handles GSM-7, extension characters and Unicode", async () => {
  const { countSmsSegments } = await import("../../redom-backend/src/services/aurelink/sms-segmentation.service.ts");
  assert.equal(countSmsSegments("A".repeat(160)), 1);
  assert.equal(countSmsSegments("A".repeat(161)), 2);
  assert.equal(countSmsSegments("^".repeat(80)), 1);
  assert.equal(countSmsSegments("^".repeat(81)), 2);
  assert.equal(countSmsSegments("é".repeat(71)), 1);
  assert.equal(countSmsSegments("漢".repeat(70)), 1);
  assert.equal(countSmsSegments("漢".repeat(71)), 2);
  assert.equal(countSmsSegments("😀".repeat(36)), 2);
});

test("provider response classification never treats ambiguous acceptance as a safe retry",()=>{
  assert.deepEqual(classifyProviderHttpStatus(400),{outcome:"rejected",retryable:false});
  assert.deepEqual(classifyProviderHttpStatus(429),{outcome:"rejected",retryable:true});
  assert.deepEqual(classifyProviderHttpStatus(408),{outcome:"unknown",retryable:true});
  assert.deepEqual(classifyProviderHttpStatus(500),{outcome:"unknown",retryable:true});
  assert.deepEqual(classifyProviderHttpStatus(503),{outcome:"unknown",retryable:true});
  const unknown=new ProviderSubmissionError("timeout","unknown",true);
  assert.equal(unknown.outcome,"unknown");
  assert.equal(unknown.retryable,true);
});


test("Mail blocks a past-due subscription unless prepaid fallback was explicitly enabled",async()=>{
  const statements:string[]=[];
  const client={query:async(sql:string)=>{
    statements.push(sql);
    if(sql.includes("SELECT source,units,unit_price_minor"))return {rows:[]};
    if(sql.includes("SELECT billing_mode FROM aurelink_email_billing_accounts"))return {rows:[{billing_mode:"subscription"}]};
    if(sql.includes("SELECT id,status,monthly_email_allowance"))return {rows:[{id:"sub-1",status:"past_due",monthly_email_allowance:"7000",used_emails:"0",reserved_emails:"0",allow_prepaid_fallback:false,period_active:true}]};
    return {rows:[],rowCount:1};
  }};
  await assert.rejects(
    reserveAurelinkEmailUsage(client as any,{userId:"user-1",workspaceId:"workspace-1",messageId:"00000000-0000-4000-8000-000000000001",units:1,transport:"api",provider:"resend",category:"transactional"}),
    (error:any)=>error?.code==="AURELINK_EMAIL_PLAN_LIMIT_REACHED"
  );
  assert.equal(statements.some(sql=>sql.includes("aurelink_email_credit_wallets")),false);
});

test("Mail consumes a valid paid subscription allowance before prepaid credits",async()=>{
  const statements:string[]=[];
  const client={query:async(sql:string)=>{
    statements.push(sql);
    if(sql.includes("SELECT source,units,unit_price_minor"))return {rows:[]};
    if(sql.includes("SELECT billing_mode FROM aurelink_email_billing_accounts"))return {rows:[{billing_mode:"subscription"}]};
    if(sql.includes("SELECT id,status,monthly_email_allowance"))return {rows:[{id:"sub-1",status:"active",monthly_email_allowance:"7000",used_emails:"25",reserved_emails:"10",allow_prepaid_fallback:true,period_active:true}]};
    return {rows:[],rowCount:1};
  }};
  const result=await reserveAurelinkEmailUsage(client as any,{userId:"user-1",workspaceId:"workspace-1",messageId:"00000000-0000-4000-8000-000000000002",units:1,transport:"api",provider:"resend",category:"transactional"});
  assert.equal(result.source,"subscription");
  assert.equal(statements.some(sql=>sql.includes("aurelink_email_credit_wallets")),false);
});


test("SMS package catalogue enforces the reviewed $0.041 per SMS price",()=>{
  assert.deepEqual(AURELINK_SMS_PACKAGE_CATALOG.map(p=>[p.code,p.name,p.segments,p.priceMinor]),[
    ["sms_100","Individual",100,410],
    ["sms_1k","Starter",1000,4100],
    ["sms_5k","Standard",5000,20500],
    ["sms_10k","Plus",10000,41000],
    ["sms_30k","Pro",30000,123000],
    ["sms_50k","Individual Max",50000,205000],
    ["sms_100k","Business",100000,410000],
    ["sms_300k","Business Pro",300000,1230000],
    ["sms_500k","Business Max",500000,2050000],
    ["sms_1m","Enterprise",1000000,4100000]
  ]);
  for(const p of AURELINK_SMS_PACKAGE_CATALOG)assert.equal(p.priceMinor,p.segments*4.1);
  assert.equal(AURELINK_SMS_PACKAGE_CATALOG.at(-1)?.enterprise,true);
});


test("SMS purchase and credit ledger references use independent uppercase alphanumeric identities",()=>{
  const purchaseReference="5O190127TN364715T";
  const creditLedgerReference="50190127S7M0T1T";
  assert.equal(isAurelinkSmsPublicReference(purchaseReference),false);
  assert.equal(isAurelinkSmsPublicReference(creditLedgerReference),false);
  const validPurchase="5O190127TN364715T9A";
  const validLedger="50190127S7M0T1T9B3C";
  assert.equal(validPurchase.length,19);
  assert.equal(validLedger.length,19);
  assert.equal(isAurelinkSmsPublicReference(validPurchase),true);
  assert.equal(isAurelinkSmsPublicReference(validLedger),true);
  assert.equal(isAurelinkSmsPublicReference("AURELINK-SMS-50190127S7M0T1T"),false);
  assert.equal(isAurelinkSmsPublicReference("5o190127tn364715t9a"),false);
  assert.equal(isAurelinkSmsPublicReference("A".repeat(17)),false);
});
