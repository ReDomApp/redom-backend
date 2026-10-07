import type { Pool } from "pg";
import type { SmsEncoding, SmsStatus, SmsEvent } from "./types.js";

const id=(p:string)=>p+"_"+Date.now().toString(36)+"_"+crypto.randomUUID().replaceAll("-","").slice(0,16);

export class SmsStore{
 constructor(private pool:Pool){}

 async create(i:{to:string;from:string;text:string;encoding:SmsEncoding;segments:number;clientReference?:string;metadata?:Record<string,string>;scheduledAt?:Date;ttlSeconds?:number;routeId?:string},key?:string){
  if(key){const e=await this.pool.query("SELECT * FROM redom_sms_messages WHERE idempotency_key=$1",[key]);if(e.rowCount)return{created:false,row:e.rows[0]};}
  const mid=id("sms"),scheduled=i.scheduledAt??null,status=scheduled?"scheduled":"queued",available=scheduled??new Date();
  const r=await this.pool.query(`INSERT INTO redom_sms_messages(id,client_reference,idempotency_key,direction,source,destination,body,encoding,segment_count,status,metadata,route_id,scheduled_at,expires_at) VALUES($1,$2,$3,'outbound',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
   [mid,i.clientReference??null,key??null,i.from,i.to,i.text,i.encoding,i.segments,status,i.metadata??{},i.routeId??null,scheduled,i.ttlSeconds?new Date(Date.now()+i.ttlSeconds*1000):null]);
  await this.pool.query("INSERT INTO redom_sms_queue(message_id,available_at) VALUES($1,$2)",[mid,available]);
  await this.emit(mid,"message.queued");
  return{created:true,row:r.rows[0]};
 }

 async claim(worker:string){
  const c=await this.pool.connect();
  try{
   await c.query("BEGIN");
   const r=await c.query(`SELECT q.message_id FROM redom_sms_queue q JOIN redom_sms_messages m ON m.id=q.message_id
    WHERE q.available_at<=NOW() AND q.locked_at IS NULL AND m.status IN ('queued','scheduled')
    AND (m.scheduled_at IS NULL OR m.scheduled_at<=NOW())
    ORDER BY q.available_at FOR UPDATE SKIP LOCKED LIMIT 1`);
   if(!r.rowCount){await c.query("COMMIT");return null}
   const mid=r.rows[0].message_id;
   await c.query("UPDATE redom_sms_queue SET locked_at=NOW(),locked_by=$2,attempts=attempts+1 WHERE message_id=$1",[mid,worker]);
   await c.query("UPDATE redom_sms_messages SET status='processing',attempts=attempts+1,updated_at=NOW() WHERE id=$1",[mid]);
   await c.query("COMMIT");
   return this.get(mid);
  }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
 }

 async get(id:string){const r=await this.pool.query("SELECT * FROM redom_sms_messages WHERE id=$1",[id]);return r.rows[0]??null}
 async list(limit=50){const r=await this.pool.query("SELECT * FROM redom_sms_messages ORDER BY created_at DESC LIMIT $1",[Math.min(Math.max(limit,1),100)]);return r.rows}
 async segments(mid:string){const r=await this.pool.query("SELECT * FROM redom_sms_segments WHERE message_id=$1 ORDER BY segment_index",[mid]);return r.rows}

 async createSegments(mid:string,parts:Buffer[]){
  for(let i=0;i<parts.length;i++)await this.pool.query("INSERT INTO redom_sms_segments(id,message_id,segment_index,payload,status) VALUES($1,$2,$3,$4,'queued') ON CONFLICT(message_id,segment_index) DO UPDATE SET payload=EXCLUDED.payload",[id("seg"),mid,i,parts[i]]);
 }

 async submitted(mid:string,routeId?:string){
  await this.pool.query("UPDATE redom_sms_messages SET status='submitted',route_id=COALESCE($2,route_id),submitted_at=NOW(),updated_at=NOW() WHERE id=$1",[mid,routeId??null]);
  await this.pool.query("DELETE FROM redom_sms_queue WHERE message_id=$1",[mid]);
  await this.emit(mid,"message.submitted");
 }

 async fail(mid:string,error:string,retryAt?:Date){
  const m=await this.get(mid);if(!m)return;
  const max=Number(process.env.SMS_MAX_ATTEMPTS??3);
  const retryable=Boolean(retryAt)&&m.attempts<max&&!m.expires_at||Boolean(retryAt)&&m.attempts<max&&new Date(m.expires_at).getTime()>Date.now();
  if(retryable){
   await this.pool.query("UPDATE redom_sms_messages SET status='queued',last_error=$2,updated_at=NOW() WHERE id=$1",[mid,error]);
   await this.pool.query("UPDATE redom_sms_queue SET locked_at=NULL,locked_by=NULL,available_at=$2 WHERE message_id=$1",[mid,retryAt]);
   return;
  }
  await this.pool.query("UPDATE redom_sms_messages SET status='failed',last_error=$2,updated_at=NOW() WHERE id=$1",[mid,error]);
  await this.pool.query("DELETE FROM redom_sms_queue WHERE message_id=$1",[mid]);
  await this.emit(mid,"message.failed",{error,attempts:m.attempts,maxAttempts:max});
 }

 async cancel(mid:string){
  const r=await this.pool.query("UPDATE redom_sms_messages SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1 AND status IN ('queued','scheduled') RETURNING *",[mid]);
  if(r.rowCount){await this.pool.query("DELETE FROM redom_sms_queue WHERE message_id=$1",[mid]);await this.emit(mid,"message.cancelled")}
  return r.rows[0]??null;
 }

 async applyReceipt(pid:string,status:SmsStatus,errorCode?:string,raw?:string){
  const r=await this.pool.query("SELECT id,message_id FROM redom_sms_segments WHERE provider_message_id=$1",[pid]);
  await this.pool.query("INSERT INTO redom_sms_receipts(segment_id,provider_message_id,status,error_code,raw) VALUES($1,$2,$3,$4,$5)",[r.rows[0]?.id??null,pid,status,errorCode??null,raw??null]);
  if(!r.rowCount)return;
  await this.pool.query("UPDATE redom_sms_segments SET status=$2,error_code=$3,delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE delivered_at END WHERE id=$1",[r.rows[0].id,status,errorCode??null]);
  const m=r.rows[0].message_id;
  const failed=await this.pool.query("SELECT COUNT(*)::int n FROM redom_sms_segments WHERE message_id=$1 AND status IN ('failed','expired')",[m]);
  const pending=await this.pool.query("SELECT COUNT(*)::int n FROM redom_sms_segments WHERE message_id=$1 AND status NOT IN ('delivered','failed','expired')",[m]);
  if(pending.rows[0].n===0){
   const finalStatus=failed.rows[0].n>0?"failed":"delivered";
   await this.pool.query("UPDATE redom_sms_messages SET status=$2,delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE delivered_at END,updated_at=NOW() WHERE id=$1",[m,finalStatus]);
   await this.emit(m,finalStatus==="delivered"?"message.delivered":"message.failed");
  }
 }

 async isOptedOut(phone:string){return (await this.pool.query("SELECT 1 FROM redom_sms_optouts WHERE phone_number=$1",[phone])).rowCount>0}
 async optOut(phone:string,keyword:string){await this.pool.query("INSERT INTO redom_sms_optouts(phone_number,keyword) VALUES($1,$2) ON CONFLICT DO NOTHING",[phone,keyword])}

 async emit(messageId:string,event:SmsEvent,extra:Record<string,unknown>={}){
  const r=await this.pool.query("SELECT * FROM redom_sms_messages WHERE id=$1",[messageId]);if(!r.rowCount)return;
  const m=r.rows[0];
  await this.pool.query("INSERT INTO redom_sms_webhook_events(webhook_id,event_type,payload) SELECT id,$1,$2 FROM redom_sms_webhooks WHERE enabled AND $1=ANY(events)",[event,JSON.stringify({id:m.id,object:"sms.event",event,type:event,message:m,...extra})]);
 }
}