import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Aurelink, AurelinkError, verifyAurelinkWebhook } from "./index.js";

test("client authenticates requests and sends idempotency headers",async()=>{
 let seen;
 const client=new Aurelink({apiKey:"aul_test_unit",baseUrl:"https://api.example.test/v1",fetch:async(url,options)=>{seen={url:String(url),options};return new Response(JSON.stringify({success:true,services:[]}),{status:200,headers:{"content-type":"application/json","x-aurelink-request-id":"req_test"}});}});
 const result=await client.activations.create({service:"demo"},{idempotencyKey:"idem-test-1"});
 assert.equal(result.success,true);
 assert.equal(seen.options.headers.Authorization,"Bearer aul_test_unit");
 assert.equal(seen.options.headers["Idempotency-Key"],"idem-test-1");
 assert.equal(seen.url,"https://api.example.test/v1/aurelink/activations");
});

test("client exposes structured API and rate limit errors",async()=>{
 const client=new Aurelink({apiKey:"aul_test_unit",fetch:async()=>new Response(JSON.stringify({success:false,code:"RATE_LIMIT_EXCEEDED",message:"Slow down"}),{status:429,headers:{"content-type":"application/json","retry-after":"60","x-aurelink-request-id":"req_429","x-aurelink-ratelimit-limit":"30","x-aurelink-ratelimit-remaining":"0"}})});
 await assert.rejects(()=>client.services.list(),error=>error instanceof AurelinkError&&error.status===429&&error.code==="RATE_LIMIT_EXCEEDED"&&error.retryAfter==="60"&&error.requestId==="req_429");
});

test("webhook verifier accepts valid HMAC and rejects modified payload",()=>{
 const secret="whsec_unit_test_secret",timestamp=String(Math.floor(Date.now()/1000)),payload=Buffer.from('{"id":"evt_1","type":"sms.received"}');
 const signature="v1="+createHmac("sha256",secret).update(timestamp+".").update(payload).digest("hex");
 assert.equal(verifyAurelinkWebhook({payload,signature,timestamp,secret}),true);
 assert.equal(verifyAurelinkWebhook({payload:Buffer.from('{"id":"evt_2"}'),signature,timestamp,secret}),false);
});
