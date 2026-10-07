import express from "express";
import pino from "pino";
import { Pool } from "pg";
import crypto from "node:crypto";
import { SendSmsSchema } from "./types.js";
import { encodingFor,segmentCount,encodeSegment } from "./encoding.js";
import { ensureSchema } from "./schema.js";
import { SmsStore } from "./store.js";
import { SmppTransport } from "./smsc.js";

const log=pino({name:"redom-sms"});
const app=express();
app.use(express.json({limit:"32kb"}));
const port=Number(process.env.PORT??8090);
const apiKey=process.env.SMS_API_KEY;
const db=process.env.DATABASE_URL;
if(!apiKey)throw new Error("SMS_API_KEY is required");
if(!db)throw new Error("DATABASE_URL is required");
const pool=new Pool({connectionString:db,max:10});
const store=new SmsStore(pool);

function auth(req:express.Request){return req.header("authorization")?.replace(/^Bearer\\s+/i,"")===apiKey;}
function guard(req:express.Request,res:express.Response){if(!auth(req)){res.status(401).json({error:{code:"unauthorized"}});return false}return true;}

app.get("/health",async(_req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,service:"redom-sms",smscEnabled:process.env.SMSC_ENABLED==="true"});}catch{res.status(503).json({ok:false})}});
app.get("/v1/capabilities",(_req,res)=>res.json({service:"redom-sms",architecture:"redom-owned-sms",transports:["direct-smpp"],thirdPartySmsApiRequired:false,backendIntegration:"disabled-until-sms-infrastructure-complete"}));

app.post("/v1/messages",async(req,res)=>{
  if(!guard(req,res))return;
  try{
    const input=SendSmsSchema.parse(req.body);
    const encoding=encodingFor(input.text),segments=segmentCount(input.text);
    const created=await store.create({to:input.to,from:input.from??process.env.SMS_DEFAULT_SOURCE??"ReDom",text:input.text,encoding,segments,clientReference:input.clientReference,metadata:input.metadata},req.header("idempotency-key")??undefined);
    res.status(created.created?202:200).json({id:created.row.id,object:"sms",status:created.row.status,encoding:created.row.encoding,segments:created.row.segment_count});
  }catch(e){res.status(400).json({error:{code:"invalid_request",message:e instanceof Error?e.message:"Invalid request"}})}
});

app.get("/v1/messages",async(req,res)=>{if(!guard(req,res))return;res.json({data:await store.list(Number(req.query.limit??50))})});
app.get("/v1/messages/:id",async(req,res)=>{if(!guard(req,res))return;const m=await store.get(req.params.id);if(!m)return res.status(404).json({error:{code:"not_found"}});res.json({data:m,segments:await store.segments(req.params.id)})});

const workerId=crypto.randomUUID();
const smsc=process.env.SMSC_ENABLED==="true"?new SmppTransport({
  host:process.env.SMSC_HOST??"",port:Number(process.env.SMSC_PORT??2775),systemId:process.env.SMSC_SYSTEM_ID??"",password:process.env.SMSC_PASSWORD??"",
  systemType:process.env.SMSC_SYSTEM_TYPE,sourceTon:Number(process.env.SMSC_SOURCE_TON??5),sourceNpi:Number(process.env.SMSC_SOURCE_NPI??0),
  destTon:Number(process.env.SMSC_DEST_TON??1),destNpi:Number(process.env.SMSC_DEST_NPI??1),enquireLinkMs:Number(process.env.SMSC_ENQUIRE_LINK_MS??30000)
}):null;

async function worker(){
  while(true){
    try{
      const m=await store.claim(workerId);
      if(!m){await new Promise(r=>setTimeout(r,Number(process.env.SMS_QUEUE_POLL_MS??1000)));continue;}
      if(!smsc){await store.markFailed(m.id,"No direct SMSC connection configured");continue;}
      const parts=m.encoding==="GSM7"?splitGsm(m.body):splitUcs2(m.body);
      await store.createSegments(m.id,parts);
      const segs=await store.segments(m.id);
      for(let i=0;i<parts.length;i++){
        const result=await smsc.submit({id:m.id,to:m.destination,from:m.source,text:m.body,encoding:m.encoding,segments:m.segment_count,status:"processing"},i,parts[i]);
        await pool.query("UPDATE redom_sms_segments SET provider_message_id=$2,status='submitted',submitted_at=NOW() WHERE message_id=$1 AND segment_index=$3",[m.id,result.providerMessageId,i]);
      }
      await store.markSubmitted(m.id);
    }catch(e){log.error({err:e},"SMS worker error");}
  }
}
function splitGsm(text:string):Buffer[]{const chars=[...text];const max=segmentCount(text)===1?160:153;const out:string[]=[];let cur="";let units=0;for(const c of chars){const u="^{}\\[~]|€".includes(c)?2:1;if(units+u>max){out.push(cur);cur="";units=0}cur+=c;units+=u}if(cur)out.push(cur);return out.map(x=>encodeSegment(x,"GSM7"))}
function splitUcs2(text:string):Buffer[]{const chars=[...text];const max=chars.length<=70?70:67;const out:string[]=[];for(let i=0;i<chars.length;i+=max)out.push(chars.slice(i,i+max).join(""));return out.map(x=>encodeSegment(x,"UCS2"))}

await ensureSchema(pool);
app.listen(port,()=>log.info({port},"ReDom SMS API listening"));
void worker();
