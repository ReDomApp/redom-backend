import type { Pool } from "pg";
import type { SmsMessage, SmsStatus, SmsEncoding } from "./types.js";

function id(prefix:string){return prefix+"_"+Date.now().toString(36)+"_"+crypto.randomUUID().replaceAll("-","").slice(0,16)}

export class SmsStore {
  constructor(private readonly pool:Pool){}

  async create(input:{to:string;from:string;text:string;encoding:SmsEncoding;segments:number;clientReference?:string;metadata?:Record<string,string>}, idempotencyKey?:string){
    if(idempotencyKey){
      const existing=await this.pool.query("SELECT * FROM redom_sms_messages WHERE idempotency_key=$1",[idempotencyKey]);
      if(existing.rowCount)return {created:false,row:existing.rows[0]};
    }
    const messageId=id("sms");
    const r=await this.pool.query(
      `INSERT INTO redom_sms_messages(id,client_reference,idempotency_key,direction,source,destination,body,encoding,segment_count,status,metadata)
       VALUES($1,$2,$3,'outbound',$4,$5,$6,$7,$8,'queued',$9) RETURNING *`,
      [messageId,input.clientReference??null,idempotencyKey??null,input.from,input.to,input.text,input.encoding,input.segments,input.metadata??{}]
    );
    const row=r.rows[0];
    await this.pool.query("INSERT INTO redom_sms_queue(message_id) VALUES($1)",[messageId]);
    return {created:true,row};
  }

  async claim(workerId:string){
    const c=await this.pool.connect();
    try{
      await c.query("BEGIN");
      const r=await c.query(
        `SELECT q.message_id FROM redom_sms_queue q JOIN redom_sms_messages m ON m.id=q.message_id
         WHERE q.available_at<=NOW() AND q.locked_at IS NULL AND m.status='queued'
         ORDER BY q.available_at,q.message_id FOR UPDATE SKIP LOCKED LIMIT 1`);
      if(!r.rowCount){await c.query("COMMIT");return null;}
      const messageId=r.rows[0].message_id;
      await c.query("UPDATE redom_sms_queue SET locked_at=NOW(),locked_by=$2,attempts=attempts+1 WHERE message_id=$1",[messageId,workerId]);
      await c.query("UPDATE redom_sms_messages SET status='processing',attempts=attempts+1,updated_at=NOW() WHERE id=$1",[messageId]);
      await c.query("COMMIT");
      return this.get(messageId);
    }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
  }

  async get(id:string){const r=await this.pool.query("SELECT * FROM redom_sms_messages WHERE id=$1",[id]);return r.rows[0]??null;}
  async list(limit=50){const r=await this.pool.query("SELECT * FROM redom_sms_messages ORDER BY created_at DESC LIMIT $1",[Math.min(Math.max(limit,1),100)]);return r.rows;}
  async segments(messageId:string){const r=await this.pool.query("SELECT * FROM redom_sms_segments WHERE message_id=$1 ORDER BY segment_index",[messageId]);return r.rows;}
  async createSegments(messageId:string,parts:Buffer[]){for(let i=0;i<parts.length;i++)await this.pool.query("INSERT INTO redom_sms_segments(id,message_id,segment_index,payload,status) VALUES($1,$2,$3,$4,'queued') ON CONFLICT DO NOTHING",[id("seg"),messageId,i,parts[i]]);}
  async markSubmitted(messageId:string){await this.pool.query("UPDATE redom_sms_messages SET status='submitted',submitted_at=NOW(),updated_at=NOW() WHERE id=$1",[messageId]);await this.pool.query("DELETE FROM redom_sms_queue WHERE message_id=$1",[messageId]);}
  async markFailed(messageId:string,error:string,retryAt?:Date){
    if(retryAt) await this.pool.query("UPDATE redom_sms_messages SET status='queued',last_error=$2,updated_at=NOW() WHERE id=$1",[messageId,error]);
    else await this.pool.query("UPDATE redom_sms_messages SET status='failed',last_error=$2,updated_at=NOW() WHERE id=$1",[messageId,error]);
    if(retryAt) await this.pool.query("UPDATE redom_sms_queue SET locked_at=NULL,locked_by=NULL,available_at=$2 WHERE message_id=$1",[messageId,retryAt]);
    else await this.pool.query("DELETE FROM redom_sms_queue WHERE message_id=$1",[messageId]);
  }
  async applyReceipt(providerMessageId:string,status:SmsStatus,errorCode?:string,raw?:string){
    const r=await this.pool.query("SELECT id,message_id FROM redom_sms_segments WHERE provider_message_id=$1 LIMIT 1",[providerMessageId]);
    await this.pool.query("INSERT INTO redom_sms_receipts(segment_id,provider_message_id,status,error_code,raw) VALUES($1,$2,$3,$4,$5)",[r.rows[0]?.id??null,providerMessageId,status,errorCode??null,raw??null]);
    if(r.rows[0]){
      await this.pool.query("UPDATE redom_sms_segments SET status=$2,error_code=$3,delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE delivered_at END WHERE id=$1",[r.rows[0].id,status,errorCode??null]);
      const m=r.rows[0].message_id;
      const pending=await this.pool.query("SELECT COUNT(*)::int n FROM redom_sms_segments WHERE message_id=$1 AND status NOT IN ('delivered')",[m]);
      if(pending.rows[0].n===0) await this.pool.query("UPDATE redom_sms_messages SET status='delivered',delivered_at=NOW(),updated_at=NOW() WHERE id=$1",[m]);
    }
  }
}
