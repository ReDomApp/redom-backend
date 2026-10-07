import { Pool } from "pg";
import { deliverDirect } from "./smtp.js";
import { MailStore } from "./store.js";
import { emitEvent } from "./webhooks.js";

type Config = Parameters<typeof deliverDirect>[1] & { retryLimit:number; retryBaseMs:number };

export class MailQueue {
  private running=false;
  private readonly store:MailStore;
  constructor(private readonly pool:Pool, private readonly config:Config) { this.store=new MailStore(pool); }

  start():void { void this.drain(); setInterval(()=>void this.drain(),1000); }

  private async claim():Promise<{message:any; attempts:number}|null>{
    const r=await this.pool.query(`
      DELETE FROM redom_mail_jobs
      WHERE id IN (
        SELECT id FROM redom_mail_jobs
        WHERE available_at <= NOW()
        ORDER BY available_at
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      RETURNING message_id, attempts`);
    if(!r.rowCount)return null;
    const message=await this.store.getMessage(r.rows[0].message_id);
    return message?{message,attempts:Number(r.rows[0].attempts)+1}:null;
  }

  private async scheduleRetry(messageId:string,attempts:number,error:string):Promise<void>{
    if(attempts>=this.config.retryLimit){
      await this.store.updateStatus(messageId,"failed",error);
      await emitEvent(this.pool,messageId,"email.bounced",{email_id:messageId,error});
      return;
    }
    await this.store.updateStatus(messageId,"queued",error);
    await this.pool.query(
      "INSERT INTO redom_mail_jobs (id,message_id,available_at,attempts,last_error) VALUES ($1,$2,$3,$4,$5)",
      ["job_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2),messageId,new Date(Date.now()+this.config.retryBaseMs*Math.pow(2,attempts-1)),attempts,error],
    );
  }

  private async drain():Promise<void>{
    if(this.running)return;
    this.running=true;
    try{
      while(true){
        const claimed=await this.claim();if(!claimed)break;
        const {message,attempts}=claimed;
        try{
          const attachments=await this.store.listAttachments(message.id);
          const full=await Promise.all(attachments.map(async(a:any)=>{
            const x=await this.store.getAttachment(a.id);
            return x?{...x,contentDisposition:a.content_disposition,contentId:a.content_id}:null;
          }));
          const result=await deliverDirect(message,{...this.config,attachments:full.filter(Boolean) as any});
          if(!result.retryable && result.response.startsWith("250")){
            await this.store.updateStatus(message.id,"delivered");
            await emitEvent(this.pool,message.id,"email.delivered",{email_id:message.id,to:message.recipients.map((x:any)=>x.email)});
          }else if(result.retryable){
            await this.scheduleRetry(message.id,attempts,result.response);
          }else{
            await this.store.updateStatus(message.id,"failed",result.response);
            await emitEvent(this.pool,message.id,"email.bounced",{email_id:message.id,error:result.response});
          }
        }catch(error){
          await this.scheduleRetry(message.id,attempts,error instanceof Error?error.message:String(error));
        }
      }
    }finally{this.running=false;}
  }
}
