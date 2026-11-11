import { createHash, createHmac, randomInt } from "node:crypto";
import { Resend } from "resend";
import { isAurelinkBrevoSenderFormatValid } from "./sms-country-registry";

type SmsProvider = "brevo" | "twilio";
type EmailProvider = "resend" | "brevo";
export interface SendSmsInput { recipient:string; sender:string; content:string; category:"transactional"|"marketing"|"otp"|"notification"; countryCode?:string; tag?:string; webUrl?:string; }
export interface SendEmailInput { recipient:string; sender:string; senderName?:string; subject:string; html?:string; text?:string; replyTo?:string; tags?:string[]; attachments?:Array<{filename:string;content:string;contentType?:string}>; }
export interface ProviderSendResult { provider:string; providerMessageId:string; acceptedAt:string; }

export class ProviderSubmissionError extends Error {
  constructor(message:string,readonly outcome:"rejected"|"unknown",readonly retryable:boolean=false){
    super(message);this.name="ProviderSubmissionError";
  }
}
export function classifyProviderHttpStatus(status:number):{outcome:"rejected"|"unknown";retryable:boolean}{
  if(status>=500||status===408||status===425)return {outcome:"unknown",retryable:true};
  if(status===429)return {outcome:"rejected",retryable:true};
  return {outcome:"rejected",retryable:false};
}
const timeoutMs = 12_000;
async function jsonRequest(url:string,init:RequestInit):Promise<any>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    let response:Response;
    try{response=await fetch(url,{...init,signal:controller.signal});}
    catch(error){
      const detail=error instanceof Error&&error.name==="AbortError"?"Communication provider timed out.":"Communication provider connection failed; acceptance could not be determined.";
      throw new ProviderSubmissionError(detail,"unknown",true);
    }
    let body:string;
    try{body=await response.text();}
    catch{throw new ProviderSubmissionError("Provider response could not be read; acceptance is unknown.","unknown",true);}
    let parsed:any;try{parsed=body?JSON.parse(body):{};}catch{parsed={message:body.slice(0,300)};}
    if(!response.ok){
      const detail=typeof parsed?.message==="string"?parsed.message:typeof parsed?.code==="string"?parsed.code:"Provider request rejected.";
      const classification=classifyProviderHttpStatus(response.status);
      throw new ProviderSubmissionError(`Provider HTTP ${response.status}: ${detail.slice(0,300)}`,classification.outcome,classification.retryable);
    }
    return parsed;
  }finally{clearTimeout(timer);}
}
const sha256=(s:string)=>createHash("sha256").update(s).digest("hex");

async function sendBrevoSms(input:SendSmsInput):Promise<ProviderSendResult>{
  const key=process.env.AURELINK_BREVO_API_KEY||process.env.BREVO_API_KEY;
  if(!key)throw new Error("Brevo SMS is not configured.");
  const payload={sender:input.countryCode==="US"||input.countryCode==="CA"?input.sender.replace(/^\+/,""):input.sender,recipient:input.recipient.replace(/^\+/,""),content:input.content,type:input.category==="marketing"?"marketing":"transactional",...(input.tag?{tag:input.tag}:{}),...(input.webUrl?{webUrl:input.webUrl}:{})};
  const result=await jsonRequest("https://api.brevo.com/v3/transactionalSMS/send",{method:"POST",headers:{"api-key":key,"content-type":"application/json",accept:"application/json"},body:JSON.stringify(payload)});
  if(result.messageId===undefined||result.messageId===null)throw new ProviderSubmissionError("Brevo returned success without a message identifier; acceptance is unknown.","unknown",false);
  return {provider:"brevo",providerMessageId:String(result.messageId),acceptedAt:new Date().toISOString()};
}
async function sendTwilioSms(input:SendSmsInput):Promise<ProviderSendResult>{
  const sid=process.env.AURELINK_TWILIO_ACCOUNT_SID||process.env.TWILIO_ACCOUNT_SID;
  const token=process.env.AURELINK_TWILIO_AUTH_TOKEN||process.env.TWILIO_AUTH_TOKEN;
  const messagingService=process.env.AURELINK_TWILIO_MESSAGING_SERVICE_SID||process.env.TWILIO_MESSAGING_SERVICE_SID;
  const phoneNumber=process.env.TWILIO_PHONE_NUMBER;
  if(!sid||!token||(!messagingService&&!phoneNumber&&!input.sender))throw new Error("Twilio SMS is not configured.");
  const params=new URLSearchParams({To:input.recipient,Body:input.content});
  if(input.sender && /^[A-Za-z]/.test(input.sender)) params.set("From",input.sender);
  else if(messagingService) params.set("MessagingServiceSid",messagingService);
  else if(phoneNumber) params.set("From",phoneNumber);
  else throw new Error("A valid Twilio sender or Messaging Service is required.");
  const callbackUrl=process.env.AURELINK_TWILIO_STATUS_CALLBACK_URL;if(callbackUrl)params.set("StatusCallback",callbackUrl);
  const auth=Buffer.from(`${sid}:${token}`).toString("base64"),result=await jsonRequest(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:"POST",headers:{authorization:`Basic ${auth}`,"content-type":"application/x-www-form-urlencoded"},body:params.toString()});
  if(!result.sid)throw new ProviderSubmissionError("Twilio returned success without a message identifier; acceptance is unknown.","unknown",false);
  return {provider:"twilio",providerMessageId:String(result.sid),acceptedAt:new Date().toISOString()};
}
async function sendResendEmail(input:SendEmailInput):Promise<ProviderSendResult>{
  const key=process.env.AURELINK_RESEND_API_KEY||process.env.RESEND_API_KEY;if(!key)throw new Error("Resend email is not configured.");
  const base={from:input.senderName?`${input.senderName} <${input.sender}>`:input.sender,to:input.recipient,subject:input.subject,...(input.replyTo?{replyTo:input.replyTo}:{}),...(input.tags?.length?{tags:input.tags.map(name=>({name,value:"aurelink"}))}:{})};
  const payload:any=input.html?{...base,html:input.html}:{...base,text:input.text||""};
  if(input.attachments?.length)payload.attachments=input.attachments.map(file=>({filename:file.filename,content:Buffer.from(file.content,"base64"),...(file.contentType?{contentType:file.contentType}:{})}));
  let result:any;
  try{result=await new Resend(key).emails.send(payload);}
  catch{throw new ProviderSubmissionError("Resend connection failed; acceptance could not be determined.","unknown",true);}
  if(result.error)throw new ProviderSubmissionError(`Resend rejected the email: ${result.error.message}`,"rejected",false);
  if(!result.data?.id)throw new ProviderSubmissionError("Resend returned success without an email identifier; acceptance is unknown.","unknown",false);
  return {provider:"resend",providerMessageId:result.data.id,acceptedAt:new Date().toISOString()};
}
async function sendBrevoEmail(input:SendEmailInput):Promise<ProviderSendResult>{
  const key=process.env.AURELINK_BREVO_API_KEY||process.env.BREVO_API_KEY;if(!key)throw new Error("Brevo Email API is not configured.");
  const payload={sender:{email:input.sender,...(input.senderName?{name:input.senderName}:{})},to:[{email:input.recipient}],subject:input.subject,...(input.html?{htmlContent:input.html}:{}),...(input.text?{textContent:input.text}:{}),...(input.replyTo?{replyTo:{email:input.replyTo}}:{}),...(input.tags?.length?{tags:input.tags.slice(0,10)}:{}),...(input.attachments?.length?{attachment:input.attachments.map(file=>({name:file.filename,content:file.content}))}:{})};
  const result=await jsonRequest("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":key,"content-type":"application/json",accept:"application/json"},body:JSON.stringify(payload)});
  if(!result.messageId)throw new Error("Brevo accepted no email identifier.");
  return {provider:"brevo",providerMessageId:String(result.messageId),acceptedAt:new Date().toISOString()};
}
/** Provider adapters deliver only; Aurelink owns consent, OTP lifecycle, metering and customer billing. */
export async function sendAurelinkSms(provider:SmsProvider,input:SendSmsInput):Promise<ProviderSendResult>{
  if(!/^\+?[1-9]\d{7,14}$/.test(input.recipient))throw new Error("Enter a valid E.164 SMS recipient.");
  if(!isAurelinkBrevoSenderFormatValid(input.sender,String(input.countryCode||"")))throw new Error("SMS sender must be approved for the selected Aurelink destination and meet Brevo's country-specific sender format.");
  if(!input.content.trim()||input.content.length>5000)throw new Error("SMS content must contain 1–5000 characters.");
  if(input.category==="marketing"&&!input.webUrl)throw new Error("Marketing SMS requires an opt-out/event URL.");
  return provider==="brevo"?sendBrevoSms(input):sendTwilioSms(input);
}
export async function sendAurelinkEmail(provider:EmailProvider,input:SendEmailInput):Promise<ProviderSendResult>{
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient))throw new Error("Enter a valid recipient email address.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.sender))throw new Error("Enter a valid sender email address.");
  if(!input.subject.trim()||(!input.html?.trim()&&!input.text?.trim()))throw new Error("Email subject and HTML or text content are required.");
  return provider==="resend"?sendResendEmail(input):sendBrevoEmail(input);
}
export function createOtpCode():string{return String(randomInt(0,1_000_000)).padStart(6,"0");}
export function hashCommunicationContent(content:string):string{return sha256(content);}
export function makeVerificationHash(code:string,salt:string):string{const pepper=process.env.AURELINK_VERIFICATION_PEPPER||process.env.JWT_ACCESS_SECRET;if(!pepper||pepper.length<32)throw new Error("AURELINK_VERIFICATION_PEPPER or a 32+ character JWT_ACCESS_SECRET is required.");return createHmac("sha256",pepper).update(salt).update(":").update(code).digest("hex");}
