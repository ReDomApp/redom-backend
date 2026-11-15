import { pool } from "../../database/db";
import { emitAurelinkWebhookEvent } from "./developer-platform.service";

type MetricRow = {
  workspace_id: string; domain: string | null; sample_size: string | number;
  delivered: string | number; bounced: string | number; complained: string | number; deferred: string | number;
};
function pct(n:number,d:number){return d>0?n/d:0;}
function scoreFor(row:MetricRow){
  const sample=Number(row.sample_size),delivered=Number(row.delivered),bounced=Number(row.bounced),complained=Number(row.complained),deferred=Number(row.deferred);
  if(sample<20)return {score:0,level:"insufficient_data" as const,bounceRate:pct(bounced,sample),complaintRate:pct(complained,sample),deliveryRate:pct(delivered,sample)};
  const bounce=pct(bounced,sample),complaint=pct(complained,sample),defer=pct(deferred,sample),delivery=pct(delivered,sample);
  const score=Math.max(0,Math.min(100,Math.round(100-(bounce*300)-(complaint*1200)-(defer*80)+Math.min(5,delivery*5))));
  const level=score>=85?"healthy":score>=65?"watch":score>=40?"poor":"critical";
  return {score,level,bounceRate:bounce,complaintRate:complaint,deliveryRate:delivery};
}
async function upsertAlert(workspaceId:string,domain:string|null,key:string,severity:"warning"|"critical",title:string,description:string){
  const prior=await pool.query("SELECT id FROM aurelink_communications_reputation_alerts WHERE workspace_id=$1 AND domain IS NOT DISTINCT FROM $2 AND alert_key=$3 AND status='open' ORDER BY first_seen_at DESC LIMIT 1",[workspaceId,domain,key]);
  if(prior.rows[0]){
    await pool.query("UPDATE aurelink_communications_reputation_alerts SET severity=$2,title=$3,description=$4,last_seen_at=NOW() WHERE id=$1",[prior.rows[0].id,severity,title,description]);
    return;
  }
  await pool.query("INSERT INTO aurelink_communications_reputation_alerts(workspace_id,domain,alert_key,severity,title,description) VALUES($1,$2,$3,$4,$5,$6)",[workspaceId,domain,key,severity,title,description]);
  const owner=await pool.query("SELECT user_id FROM aurelink_communications_workspaces WHERE id=$1",[workspaceId]);
  if(owner.rows[0]?.user_id)await emitAurelinkWebhookEvent(String(owner.rows[0].user_id),"email.reputation.alert",{workspaceId,domain,alertKey:key,severity,title,description});
}
export async function calculateAurelinkReputation():Promise<void>{
  const result=await pool.query(`
    SELECT m.workspace_id,LOWER(s.domain) AS domain,
      COUNT(*)::int AS sample_size,
      COUNT(*) FILTER(WHERE m.status='delivered')::int AS delivered,
      COUNT(*) FILTER(WHERE m.status IN ('bounced','failed','rejected'))::int AS bounced,
      COUNT(*) FILTER(WHERE m.status='complained')::int AS complained,
      COUNT(*) FILTER(WHERE m.status='deferred')::int AS deferred
    FROM aurelink_messages m
    LEFT JOIN aurelink_email_senders s ON LOWER(s.email)=LOWER(m.sender) AND s.workspace_id=m.workspace_id
    WHERE m.channel='email' AND m.status IN ('delivered','bounced','failed','rejected','complained','deferred') AND m.created_at>=NOW()-INTERVAL '30 days'
    GROUP BY m.workspace_id,LOWER(s.domain)
  `);
  const activeKeys=new Map<string,Set<string>>();
  for(const raw of result.rows as MetricRow[]){
    const metrics=scoreFor(raw),domain=raw.domain?String(raw.domain):null;
    await pool.query(`INSERT INTO aurelink_communications_reputation
      (workspace_id,domain,score,level,sample_size,delivered_count,bounced_count,complained_count,deferred_count,bounce_rate,complaint_rate,delivery_rate,metrics)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [raw.workspace_id,domain,metrics.score,metrics.level,Number(raw.sample_size),Number(raw.delivered),Number(raw.bounced),Number(raw.complained),Number(raw.deferred),metrics.bounceRate,metrics.complaintRate,metrics.deliveryRate,JSON.stringify({windowDays:30,calculatedAt:new Date().toISOString()})]);
    const keys=new Set<string>();
    if(Number(raw.sample_size)>=20){
      if(metrics.complaintRate>=0.003){keys.add("complaint_rate");await upsertAlert(String(raw.workspace_id),domain,"complaint_rate",metrics.complaintRate>=0.01?"critical":"warning","Elevated email complaint rate",`Complaint rate is ${(metrics.complaintRate*100).toFixed(2)}% over the last 30 days.`);}
      if(metrics.bounceRate>=0.05){keys.add("bounce_rate");await upsertAlert(String(raw.workspace_id),domain,"bounce_rate",metrics.bounceRate>=0.10?"critical":"warning","Elevated email bounce rate",`Bounce/failure rate is ${(metrics.bounceRate*100).toFixed(2)}% over the last 30 days.`);}
      if(metrics.level==="critical"){keys.add("reputation_critical");await upsertAlert(String(raw.workspace_id),domain,"reputation_critical","critical","Sending reputation is critical","Aurelink's rolling reputation score has entered the critical range. Review complaints, bounces and sending practices.");}
    }
    activeKeys.set(String(raw.workspace_id)+"|"+(domain||""),keys);
  }
  const open=await pool.query("SELECT id,workspace_id,domain,alert_key FROM aurelink_communications_reputation_alerts WHERE status IN ('open','acknowledged')");
  for(const alert of open.rows){
    const key=String(alert.workspace_id)+"|"+(alert.domain||"");
    if(!activeKeys.get(key)?.has(String(alert.alert_key)))await pool.query("UPDATE aurelink_communications_reputation_alerts SET status='resolved',resolved_at=NOW(),last_seen_at=NOW() WHERE id=$1",[alert.id]);
  }
}
let timer:ReturnType<typeof setInterval>|undefined;let busy=false;
async function tick(){if(busy)return;busy=true;try{await calculateAurelinkReputation();}catch(error){console.error("[Aurelink reputation]",error instanceof Error?error.message:"unknown error");}finally{busy=false;}}
export function startAurelinkReputationWorker(){if(timer)return;timer=setInterval(()=>void tick(),60*60*1000);void tick();}
export function stopAurelinkReputationWorker(){if(timer)clearInterval(timer);timer=undefined;}
