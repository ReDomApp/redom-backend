import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify a Resend/Svix webhook using the raw request body and signed headers. */
export function verifyAurelinkResendWebhook(raw:Buffer,id:string,timestamp:string,signature:string,secret:string):boolean{
 const seconds=Number(timestamp);
 if(!id||!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return false;
 const key=secret.startsWith("whsec_")?Buffer.from(secret.slice(6),"base64"):Buffer.from(secret);
 const expected=createHmac("sha256",key).update(id+"."+timestamp+"."+raw.toString("utf8")).digest("base64");
 return signature.split(" ").some(part=>{
  const pieces=part.split(",");
  if(pieces.length!==2||pieces[0]!=="v1")return false;
  const supplied=Buffer.from(pieces[1]),calculated=Buffer.from(expected);
  return supplied.length===calculated.length&&timingSafeEqual(supplied,calculated);
 });
}
export function mapAurelinkResendEvent(eventType:string):string|null{
 const map:Record<string,string>={"email.sent":"sent","email.delivered":"delivered","email.delivery_delayed":"deferred","email.bounced":"bounced","email.failed":"failed","email.complained":"complained","email.suppressed":"rejected","email.unsubscribed":"unsubscribed"};
 return map[eventType]??null;
}
export function mapAurelinkTwilioStatus(status:string):string|null{
 const map:Record<string,string>={accepted:"accepted",queued:"accepted",sending:"sent",sent:"sent",delivered:"delivered",undelivered:"failed",failed:"failed"};
 return map[status.toLowerCase()]??null;
}
