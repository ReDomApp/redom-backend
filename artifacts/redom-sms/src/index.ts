import express from "express";
import pino from "pino";
import { Pool } from "pg";
import crypto from "node:crypto";
import { SendSmsSchema } from "./types.js";
import { encodingFor,segmentCount,encodeSegment,encodeMultipartPart } from "./encoding.js";
import { ensureSchema } from "./schema.js";
import { SmsStore } from "./store.js";
import { SmppTransport } from "./smsc.js";

const log=pino({name:"redom-sms"}),app=express();app.use(express.json({limit:"32kb"}));
const port=Number(process.env.PORT??8090),apiKey=process.env.SMS_API_KEY,db=process.env.DATABASE_URL;
if(!apiKey)throw new Error("SMS_API_KEY is required");if(!db)throw new Error("DATABASE_URL is required");
const pool=new Pool({connectionString:db,max:10}),store=new SmsStore(pool);
const auth=(req:express.Request)=>req.header("authorization")?.replace(/^Bearer\s+/i,"")===apiKey;
const guard=(req:express.Request,res:express.Response)=>{if(!auth(req)){res.status(401).json({error:{code:"unauthorized"}});return false}return true};

app.get("/health",async(_q,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,service:"redom-sms",smscEnabled:process.env.SMSC_ENABLED==="true"});}catch{res.status(503).json({ok:false})}});
app.get("/v1/capabilities",(_q,res)=>res.json({service:"redom-sms",architecture:"redom-owned-sms",transports:["direct-smpp"],thirdPartySmsApiRequired:false,backendIntegration:"disabled-until-sms-infrastructure-complete"}));
app.post("/v1/messages",async(req,res)=>{if(!guard(req,res))return;try{const i=SendSmsSchema.parse(req.body),encoding=encodingFor(i.text),segments=segmentCount(i.text),r=await store.create({to:i.to,from:i.from??process.env.SMS_DEFAULT_SOURCE??"ReDom",text:i.text,encoding,segments,clientReference:i.clientReference,metadata:i.metadata},req.header("idempotency-key")??undefined);res.status(r.created?202:200).json({id:r.row.id,object:"sms",status:r.row.status,encoding:r.row.encoding,segments:r.row.segment_count});}catch(e){res.status(400).json({error:{code:"invalid_request",message:e instanceof Error?e.message:"Invalid request"}})}});
app.get("/v1/messages",async(req,res)=>{if(!guard(req,res))return;res.json({data:await store.list(Number(req.query.limit??50))})});
app.get("/v1/messages/:id",async(req,res)=>{if(!guard(req,res))return;const m=await store.get(req.params.id);if(!m)return res.status(404).json({error:{code:"not_found"}});res.json({data:m,segments:await store.segments(req.params.id)})});

const workerId=crypto.randomUUID();
const smsc=process.env.SMSC_ENABLED==="true"?new SmppTransport({host:process.env.SMSC_HOST??"",port:Number(process.env.SMSC_PORT??2775),systemId:process.env.SMSC_SYSTEM_ID??"",password:process.env.SMSC_PASSWORD??"",systemType:process.env.SMSC_SYSTEM_TYPE,sourceTon:Number(process.env.SMSC_SOURCE_TON??5),sourceNpi:Number(process.env.SMSC_SOURCE_NPI??0),destTon:Number(process.env.SMSC_DEST_TON??1),destNpi:Number(process.env.SMSC_DEST_NPI??1),enquireLinkMs:Number(process.env.SMSC_ENQUIRE_LINK_MS??30000),onDeliveryReceipt:r=>store.applyReceipt(r.providerMessageId,r.status,r.errorCode,r.raw)}):null;

async function worker(){for(;;){let current:string|undefined;try{const m=await store.claim(workerId);if(!m){await new Promise(r=>setTimeout(r,Number(process.env.SMS_QUEUE_POLL_MS??1000)));continue}current=m.id;if(!smsc){await store.markFailed(m.id,"No direct SMSC connection configured");continue}const parts=m.encoding==="GSM7"?splitGsm(m.body):splitUcs2(m.body);await store.createSegments(m.id,parts);const ref=crypto.randomInt(0,256);for(let i=0;i<parts.length;i++){const payload=m.segment_count>1?encodeMultipartPart(m.encoding==="GSM7"?partTextGsm(m.body,i):partTextUcs2(m.body,i),m.encoding,ref,m.segment_count,i+1):parts[i];const result=await smsc.submit({id:m.id,to:m.destination,from:m.source,text:m.body,encoding:m.encoding,segments:m.segment_count,status:"processing"},i,payload);await pool.query("UPDATE redom_sms_segments SET provider_message_id=$2,status='submitted',submitted_at=NOW() WHERE message_id=$1 AND segment_index=$3",[m.id,result.providerMessageId])}await store.markSubmitted(m.id)}catch(e){log.error({err:e,messageId:current},"SMS worker error");if(current){const delay=Number(process.env.SMS_RETRY_BASE_MS??5000);await store.markFailed(current,e instanceof Error?e.message:"SMS delivery failed",new Date(Date.now()+delay));}}}}
function splitGsm(text:string):Buffer[]{return splitText(text,153,160,"GSM7")}
function splitUcs2(text:string):Buffer[]{return splitText(text,67,70,"UCS2")}
function splitText(text:string,concatMax:number,singleMax:number,enc:"GSM7"|"UCS2"):Buffer[]{const chars=[...text],max=chars.length<=singleMax?singleMax:concatMax,out:string[]=[];if(enc==="GSM7"){let cur="",u=0;for(const c of chars){const n="^{}\\[~]|€".includes(c)?2:1;if(u+n>max){out.push(cur);cur="";u=0}cur+=c;u+=n}if(cur)out.push(cur)}else for(let i=0;i<chars.length;i+=max)out.push(chars.slice(i,i+max).join(""));return out.map(x=>encodeSegment(x,enc))}
function partTextGsm(text:string,index:number){const chars=[...text],max=153,out:string[]=[];let cur="",u=0;for(const c of chars){const n="^{}\\[~]|€".includes(c)?2:1;if(u+n>max){out.push(cur);cur="";u=0}cur+=c;u+=n}if(cur)out.push(cur);return out[index]}
function partTextUcs2(text:string,index:number){const chars=[...text],max=67,out:string[]=[];for(let i=0;i<chars.length;i+=max)out.push(chars.slice(i,i+max).join(""));return out[index]}

await ensureSchema(pool);app.listen(port,()=>log.info({port},"ReDom SMS API listening"));void worker();