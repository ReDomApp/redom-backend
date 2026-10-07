import { Pool } from "pg";
import { deliverDirect } from "./smtp.js";
import { MailStore } from "./store.js";
import { emitEvent } from "./webhooks.js";
import { renderMessage } from "./message.js";

type Config = Parameters<typeof deliverDirect>[1] & { retryLimit:number; retryBaseMs:number };

export class MailQueue {
  private running=false;
  private readonly store:MailStore;
  constructor(private readonly pool:Pool, private readonly config:Config) { this.store=new MailStore(pool); }
  start():void { void this.drain(); setInterval(()=>void this.drain(),1000); }
  private async claim():Promise<any|null>{
    const r=await this.pool.query(`
      DELETE FROM redom_mail_queue
      WHERE id IN (
        SELECT id FROM redom_mail_queue
        WHERE available_at <= NOW()
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING message_id`);
    if(!r.rowCount) return null;
    return await this.store.getMessage(r.rows[0].message_id);
  }
  private async drain():Promise<void>{
    if(this.running)return; this.running=true;
    try{
      while(true){
        const message=await this.claim(); if(!message)break;
        try{
          const attachments=await this.store.listAttachments(message.id);
          const full=attachments.length ? await Promise.all(attachments.map(async (a:any)=>{
            const x=await this.store.getAttachment(a.id);
            return x ? {...x,contentDisposition:a.content_disposition,contentId:a.content_id} : null;
          })) : [];
          const result=await deliverDirect(message,{...this.config,attachments:full.filter(Boolean)});
          if(result.ok){
            await this.store.updateStatus(message.id,"delivered");
            await emitEvent(this.pool,message.id,"email.delivered",{email_id:message.id,to:message.recipients.map((x:any)=>x.email)});
          }else if(result.retryable && message.attempt < this.config.retryLimit){
            await this.store.updateStatus(message.id,"queued",result.error);
            await this.store.enqueue(message.id,new Date(Date.now()+this.config.retryBaseMs*Math.pow(2,message.attempt)));
          }else{
            await this.store.updateStatus(message.id,"failed",result.error);
            await emitEvent(this.pool,message.id,"email.bounced",{email_id:message.id,error:result.error,to:message.recipients.map((x:any)=>x.email)});
          }
        }catch(e){
          await this.store.updateStatus(message.id,"failed",e instanceof Error?e.message:String(e));
          await emitEvent(this.pool,message.id,"email.failed",{email_id:message.id,error:e instanceof Error?e.message:String(e)});
        }
      }
    }finally{this.running=false;}
  }
}
