import express from "express";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { Pool } from "pg";
import { ensureSchema } from "./schema.js";
import { normalizeMessage, loadAttachments } from "./message.js";
import { MailStore } from "./store.js";
import { MailQueue } from "./queue.js";
import { startWebhookWorker } from "./webhook-worker.js";
import { startInboundSmtp } from "./inbound.js";
import { emitEvent } from "./webhooks.js";
import type { SendEmailRequest } from "./types.js";

const logger=pino({name:"redom-mail"});
const app=express();
app.use(express.json({limit:"2mb"}));
const port=Number(process.env.PORT??8080);
const apiKey=process.env.MAIL_API_KEY;
const databaseUrl=process.env.DATABASE_URL;
const fromDomain=(process.env.SMTP_FROM_DOMAIN??"wnncompany.com").toLowerCase();
const requireDkim=process.env.REQUIRE_DKIM!=="false";
const dkimPrivateKeyPath=process.env.DKIM_PRIVATE_KEY_PATH;
const role=process.env.MAIL_ROLE??"all";
if(!databaseUrl) throw new Error("DATABASE_URL is required");
if(!apiKey) throw new Error("MAIL_API_KEY is required");

const pool=new Pool({connectionString:databaseUrl,max:10});
const store=new MailStore(pool);
const queue=new MailQueue(pool,{
  host:process.env.SMTP_HOSTNAME??"mail.wnncompany.com",
  heloName:process.env.SMTP_HELO_NAME??"mail.wnncompany.com",
  connectTimeoutMs:Number(process.env.SMTP_CONNECT_TIMEOUT_MS??15000),
  commandTimeoutMs:Number(process.env.SMTP_COMMAND_TIMEOUT_MS??15000),
  maxMessageBytes:Number(process.env.SMTP_MAX_MESSAGE_BYTES??26214400),
  retryLimit:Number(process.env.SMTP_RETRY_LIMIT??8),
  retryBaseMs:Number(process.env.SMTP_RETRY_BASE_MS??5000),
  trackingBaseUrl:process.env.TRACKING_BASE_URL,
  dkim:dkimPrivateKeyPath?{domain:fromDomain,selector:process.env.DKIM_SELECTOR??"mail2026",privateKeyPath:dkimPrivateKeyPath}:undefined
});

function auth(req:express.Request):boolean {
  const supplied=req.header("authorization")?.replace(/^Bearer\s+/i,"");
  return supplied===apiKey;
}
function requireAuth(req:express.Request,res:express.Response):boolean {
  if(!auth(req)){res.status(401).json({error:{code:"unauthorized",message:"Invalid API key"}});return false;}
  return true;
}
function parseScheduled(value?:string|Date):Date|undefined {
  if(!value)return undefined;
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))throw new Error("Invalid scheduledAt");
  if(d.getTime()<Date.now()-5000)throw new Error("scheduledAt must be in the future");
  return d;
}

app.get("/health",async(_req,res)=>{
  try{await pool.query("SELECT 1");res.json({ok:true,service:"redom-mail",domain:fromDomain});}
  catch{res.status(503).json({ok:false});}
});

app.get("/v1/domains",(_req,res)=>res.json({
  domain:fromDomain,
  status:dkimPrivateKeyPath?"ready-for-dns-verification":"configuration-required",
  authentication:["SPF","DKIM","DMARC","PTR","TLS"]
}));

app.post("/v1/emails",async(req,res)=>{
  if(!requireAuth(req,res))return;
  try{
    if(requireDkim&&!dkimPrivateKeyPath){res.status(503).json({error:{code:"mail_not_ready",message:"DKIM signing is not configured"}});return;}
    const input=req.body as SendEmailRequest;
    const message=await normalizeMessage(input);
    if(!message.from.email.endsWith("@"+fromDomain)){res.status(403).json({error:{code:"sender_not_allowed",message:"Sender must use @"+fromDomain}});return;}
    const idempotencyKey=req.header("idempotency-key")??undefined;
    const scheduledAt=parseScheduled(input.scheduledAt);
    if(scheduledAt && (input.attachments?.length ?? 0)) throw new Error("Scheduled emails cannot contain attachments");
    const attachments=await loadAttachments(input);
    const saved=await store.saveMessage(message,"outbound",scheduledAt?"scheduled":"queued",attachments,idempotencyKey,scheduledAt);
    if(saved.created){
      await store.enqueue(message.id,scheduledAt??new Date());
      if(scheduledAt) await emitEvent(pool,message.id,"email.scheduled",{email_id:message.id,scheduled_at:scheduledAt.toISOString()});
      await emitEvent(pool,message.id,"email.sent",{email_id:message.id,to:message.recipients.map(x=>x.email)});
    }
    res.status(saved.created?202:200).json({id:saved.message.id,object:"email",status:saved.message.status});
  }catch(error){res.status(400).json({error:{code:"invalid_request",message:error instanceof Error?error.message:"Invalid request"}});}
});

app.post("/v1/emails/batch",async(req,res)=>{
  if(!requireAuth(req,res))return;
  try{
    const emails=Array.isArray(req.body?.emails)?req.body.emails:[]; if(!emails.length||emails.length>100)throw new Error("emails must contain 1-100 messages");
    const out=[];
    const batchKey=req.header("idempotency-key")??undefined;
    for(const [index,input] of (emails as SendEmailRequest[]).entries()){
      const message=await normalizeMessage(input);
      if(!message.from.email.endsWith("@"+fromDomain))throw new Error("Sender must use @"+fromDomain);
      const attachments=await loadAttachments(input);
      const scheduledAt=parseScheduled(input.scheduledAt);
      if(scheduledAt) throw new Error("Batch emails cannot be scheduled");
      const saved=await store.saveMessage(message,"outbound","queued",attachments,batchKey ? batchKey + ":" + index : undefined);
      if(saved.created)await store.enqueue(message.id,scheduledAt??new Date());
      out.push({id:saved.message.id,status:saved.message.status});
    }
    res.status(202).json({data:out});
  }catch(error){res.status(400).json({error:{code:"invalid_request",message:error instanceof Error?error.message:"Invalid request"}});}
});

app.get("/v1/emails",async(req,res)=>{
  if(!requireAuth(req,res))return;
  res.json({data:await store.listMessages(Number(req.query.limit??50),typeof req.query.direction==="string"?req.query.direction:undefined)});
});
app.get("/v1/emails/:id",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const m=await store.getMessage(req.params.id); if(!m){res.status(404).json({error:{code:"not_found"}});return;}
  res.json({data:m});
  return undefined;
});
app.get("/v1/emails/:id/attachments",async(req,res)=>{
  if(!requireAuth(req,res))return;
  res.json({data:await store.listAttachments(req.params.id)});
});
app.get("/t/o/:token",async(req,res)=>{
  const r=await pool.query("UPDATE redom_mail_tracking SET seen_count=seen_count+1,last_seen_at=NOW() WHERE token=$1 AND kind='open' RETURNING message_id",[req.params.token]);
  if(r.rowCount) await emitEvent(pool,r.rows[0].message_id,"email.opened",{email_id:r.rows[0].message_id});
  const pixel=Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==","base64");
  res.setHeader("Content-Type","image/gif");res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");res.send(pixel);return undefined;
});
app.get("/t/c/:token",async(req,res)=>{
  const r=await pool.query("UPDATE redom_mail_tracking SET seen_count=seen_count+1,last_seen_at=NOW() WHERE token=$1 AND kind='click' RETURNING message_id,target_url",[req.params.token]);
  if(!r.rowCount)return res.status(404).end();
  await emitEvent(pool,r.rows[0].message_id,"email.clicked",{email_id:r.rows[0].message_id});
  res.redirect(r.rows[0].target_url);return undefined;
});

app.get("/v1/attachments/:id",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const a=await store.getAttachment(req.params.id); if(!a){res.status(404).end();return;}
  res.setHeader("Content-Type",a.contentType);res.setHeader("Content-Disposition",'attachment; filename="'+a.filename.replace(/"/g,"'")+'"');res.send(a.content);
  return undefined;
});

app.post("/v1/webhooks",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const endpoint=String(req.body?.endpoint??""); const events=Array.isArray(req.body?.events)?req.body.events:["email.received","email.delivered","email.bounced","email.failed"];
  if(!/^https:\/\//i.test(endpoint))return res.status(400).json({error:{code:"invalid_endpoint"}});
  const secret="whsec_"+Buffer.from(cryptoRandom(32)).toString("hex");
  const id="wh_"+Date.now().toString(36)+"_"+cryptoRandom(6).toString("hex");
  await pool.query("INSERT INTO redom_mail_webhooks (id,endpoint,signing_secret,events) VALUES ($1,$2,$3,$4)",[id,endpoint,secret,JSON.stringify(events)]);
  res.status(201).json({id,endpoint,events,signing_secret:secret});
  return undefined;
});



app.get("/v1/webhooks",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const r=await pool.query("SELECT id,endpoint,events,enabled,created_at FROM redom_mail_webhooks ORDER BY created_at DESC");
  res.json({data:r.rows});
  return undefined;
});
app.delete("/v1/webhooks/:id",async(req,res)=>{
  if(!requireAuth(req,res))return;
  await pool.query("UPDATE redom_mail_webhooks SET enabled=false WHERE id=$1",[req.params.id]);
  res.status(204).end();
  return undefined;
});
app.post("/v1/webhooks/:id/replay",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const r=await pool.query(
    "INSERT INTO redom_mail_webhook_deliveries (id,webhook_id,event_id) SELECT $1,$2,id FROM redom_mail_events WHERE id=$3 RETURNING id",
    [cryptoRandom(12).toString("hex"),req.params.id,String(req.body?.event_id??"")],
  );
  if(!r.rowCount)return res.status(404).json({error:{code:"event_not_found"}});
  res.status(202).json({id:r.rows[0].id,status:"pending"});
  return undefined;
});
app.get("/v1/received",async(req,res)=>{
  if(!requireAuth(req,res))return;
  res.json({data:await store.listMessages(Number(req.query.limit??50),"inbound")});
  return undefined;
});
app.get("/v1/received/:id",async(req,res)=>{
  if(!requireAuth(req,res))return;
  const m=await store.getMessage(req.params.id);if(!m||m.direction!=="inbound")return res.status(404).json({error:{code:"not_found"}});
  res.json({data:m});
  return undefined;
});

function cryptoRandom(size:number):Buffer{return randomBytes(size);}

(async()=>{
  await ensureSchema(pool);
  if(role!=="api"){queue.start();startWebhookWorker(pool);}
  if(role!=="api"&&process.env.INBOUND_SMTP_ENABLED==="true")
    startInboundSmtp(pool,process.env.SMTP_HELO_NAME??"mail.wnncompany.com",Number(process.env.INBOUND_SMTP_PORT??2525),fromDomain);
  if(role!=="worker"){
    app.listen(port,()=>logger.info({port,role},"ReDom Mail API listening"));
  }
})();
