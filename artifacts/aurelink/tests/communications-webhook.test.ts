import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus } from "../../redom-backend/src/services/aurelink/communications-webhooks.utils.ts";
import { createAurelinkResendSmtpKey, revokeAurelinkResendSmtpKey } from "../../redom-backend/src/services/aurelink/communications-smtp.service.ts";

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
  assert.equal(countSmsSegments("é".repeat(70)), 1);
  assert.equal(countSmsSegments("é".repeat(71)), 2);
  assert.equal(countSmsSegments("😀".repeat(36)), 2);
});
