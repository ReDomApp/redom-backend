import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyAurelinkResendWebhook, mapAurelinkResendEvent, mapAurelinkTwilioStatus } from "../../redom-backend/src/services/aurelink/communications-webhooks.utils.ts";

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
