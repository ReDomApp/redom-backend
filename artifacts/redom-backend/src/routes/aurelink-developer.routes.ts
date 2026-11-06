import { Router } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { pool } from "../database/db";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { createWebhook } from "../services/aurelink/developer-platform.service";

const router=Router();
const EVENTS=["activation.created","activation.updated","sms.received","activation.cancelled","rental.created","rental.updated","rental.expiring","dedicated.created","dedicated.updated","wallet.credited","wallet.debited"];
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Math.floor(Number(v)):fallback));

router.get("/aurelink/developer/overview",aurelinkAuthMiddleware,async(req,res)=>{
 const uid=req.user!.userId;
 const [keys,usage,webhooks,deliveries,recent]=await Promise.all([
  pool.query("SELECT environment,COUNT(*) FILTER(WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()))::int AS active FROM aurelink_api_keys WHERE user_id=$1 GROUP BY environment",[uid]),
  pool.query("SELECT COUNT(*)::int AS requests,COUNT(*) FILTER(WHERE status_code>=400)::int AS errors,COALESCE(AVG(latency_ms),0)::int AS avg_latency FROM aurelink_api_request_logs WHERE user_id=$1 AND created_at>NOW()-INTERVAL '30 days'",[uid]),
  pool.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE enabled)::int AS enabled FROM aurelink_webhook_endpoints WHERE user_id=$1",[uid]),
  pool.query("SELECT COUNT(*) FILTER(WHERE status='delivered')::int AS delivered,COUNT(*) FILTER(WHERE status IN ('pending','processing'))::int AS pending,COUNT(*) FILTER(WHERE status='failed')::int AS failed FROM aurelink_webhook_deliveries WHERE user_id=$1 AND created_at>NOW()-INTERVAL '30 days'",[uid]),
  pool.query("SELECT id,method,path,status_code,latency_ms,environment,created_at FROM aurelink_api_request_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8",[uid])
 ]);
 res.json({success:true,keys:keys.rows,usage:usage.rows[0],webhooks:webhooks.rows[0],deliveries:deliveries.rows[0],recent:recent.rows});
});

router.get("/aurelink/developer/usage",aurelinkAuthMiddleware,async(req,res)=>{
 const uid=req.user!.userId,days=clamp(req.query.days,1,90,30);
 const [daily,byKey,statuses]=await Promise.all([
  pool.query("SELECT DATE_TRUNC('day',created_at) AS day,COUNT(*)::int AS requests,COUNT(*) FILTER(WHERE status_code>=400)::int AS errors,COALESCE(AVG(latency_ms),0)::int AS avg_latency FROM aurelink_api_request_logs WHERE user_id=$1 AND created_at>NOW()-($2 * INTERVAL '1 day') GROUP BY 1 ORDER BY 1",[uid,days]),
  pool.query("SELECT k.id,k.label,k.environment,k.key_prefix,k.rate_limit_per_minute,COUNT(l.id)::int AS requests,MAX(l.created_at) AS last_request FROM aurelink_api_keys k LEFT JOIN aurelink_api_request_logs l ON l.api_key_id=k.id AND l.created_at>NOW()-($2 * INTERVAL '1 day') WHERE k.user_id=$1 GROUP BY k.id ORDER BY requests DESC",[uid,days]),
  pool.query("SELECT status_code,COUNT(*)::int AS requests FROM aurelink_api_request_logs WHERE user_id=$1 AND created_at>NOW()-($2 * INTERVAL '1 day') GROUP BY status_code ORDER BY requests DESC LIMIT 12",[uid,days])
 ]);
 res.json({success:true,days,daily:daily.rows,byKey:byKey.rows,statuses:statuses.rows});
});

router.get("/aurelink/developer/logs",aurelinkAuthMiddleware,async(req,res)=>{
 const uid=req.user!.userId,limit=clamp(req.query.limit,1,100,50),before=String(req.query.before||"");
 const values:any[]=[uid,limit],filters:string[]=[];
 if(before){values.push(before);filters.push("created_at<$"+values.length);}
 if(req.query.environment==="test"||req.query.environment==="live"){values.push(req.query.environment);filters.push("environment=$"+values.length);}
 if(req.query.status){values.push(clamp(req.query.status,100,599,200));filters.push("status_code=$"+values.length);}
 const where=filters.length?" AND "+filters.join(" AND "):"";
 const result=await pool.query("SELECT id,api_key_id,environment,method,path,status_code,latency_ms,request_id,ip_address,created_at FROM aurelink_api_request_logs WHERE user_id=$1"+where+" ORDER BY created_at DESC LIMIT $2",values);
 res.json({success:true,logs:result.rows,nextBefore:result.rows.length===limit?result.rows[result.rows.length-1].created_at:null});
});

router.get("/aurelink/developer/webhooks/events",aurelinkAuthMiddleware,(_req,res)=>res.json({success:true,events:EVENTS}));
router.get("/aurelink/developer/webhooks",aurelinkAuthMiddleware,async(req,res)=>{
 const result=await pool.query("SELECT id,url,description,secret_prefix,events,enabled,created_at,updated_at FROM aurelink_webhook_endpoints WHERE user_id=$1 ORDER BY created_at DESC",[req.user!.userId]);
 res.json({success:true,endpoints:result.rows});
});
router.post("/aurelink/developer/webhooks",aurelinkAuthMiddleware,async(req,res)=>{
 try{const result=await createWebhook(req.user!.userId,{url:String(req.body.url||""),description:String(req.body.description||""),events:Array.isArray(req.body.events)?req.body.events.map(String):undefined});res.status(201).json({success:true,...result});}
 catch(error){res.status(400).json({success:false,message:error instanceof Error?error.message:"Could not create webhook endpoint."});}
});
router.patch("/aurelink/developer/webhooks/:id",aurelinkAuthMiddleware,async(req,res)=>{
 const enabled=Boolean(req.body.enabled);
 const result=await pool.query("UPDATE aurelink_webhook_endpoints SET enabled=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id,enabled,updated_at",[req.params.id,req.user!.userId,enabled]);
 if(!result.rowCount)return res.status(404).json({success:false,message:"Webhook endpoint not found."});
 res.json({success:true,endpoint:result.rows[0]});
});
router.delete("/aurelink/developer/webhooks/:id",aurelinkAuthMiddleware,async(req,res)=>{
 const result=await pool.query("DELETE FROM aurelink_webhook_endpoints WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user!.userId]);
 res.json({success:Boolean(result.rowCount)});
});
router.post("/aurelink/developer/webhooks/:id/rotate-secret",aurelinkAuthMiddleware,async(req,res)=>{
 const secret="whsec_"+randomBytes(32).toString("base64url");
 const key=process.env.AURELINK_WEBHOOK_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;
 if(!key||key.length<32)return res.status(503).json({success:false,message:"Webhook encryption is not configured."});
 const cryptoKey=(await import("node:crypto")).createHash("sha256").update(key).update("|aurelink-webhook-v1").digest();
 const iv=randomBytes(12),cipher=(await import("node:crypto")).createCipheriv("aes-256-gcm",cryptoKey,iv),body=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
 const encrypted=[iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");
 const result=await pool.query("UPDATE aurelink_webhook_endpoints SET secret_encrypted=$3,secret_prefix=$4,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id,secret_prefix",[req.params.id,req.user!.userId,encrypted,secret.slice(0,13)]);
 if(!result.rowCount)return res.status(404).json({success:false,message:"Webhook endpoint not found."});
 res.json({success:true,endpoint:result.rows[0],secret});
});
router.get("/aurelink/developer/webhooks/:id/deliveries",aurelinkAuthMiddleware,async(req,res)=>{
 const limit=clamp(req.query.limit,1,100,30);
 const result=await pool.query("SELECT id,event_id,event_type,status,attempts,last_status_code,last_error,delivered_at,created_at,next_attempt_at FROM aurelink_webhook_deliveries WHERE endpoint_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT $3",[req.params.id,req.user!.userId,limit]);
 res.json({success:true,deliveries:result.rows});
});
router.post("/aurelink/developer/webhooks/:id/deliveries/:deliveryId/retry",aurelinkAuthMiddleware,async(req,res)=>{
 const result=await pool.query("UPDATE aurelink_webhook_deliveries SET status='pending',attempts=0,next_attempt_at=NOW(),last_error=NULL,last_status_code=NULL WHERE id=$1 AND endpoint_id=$2 AND user_id=$3 AND status='failed' RETURNING id",[req.params.deliveryId,req.params.id,req.user!.userId]);
 if(!result.rowCount)return res.status(409).json({success:false,message:"Only failed deliveries can be retried."});
 res.json({success:true});
});
router.post("/aurelink/developer/webhooks/:id/test",aurelinkAuthMiddleware,async(req,res)=>{
 const endpoint=(await pool.query("SELECT id FROM aurelink_webhook_endpoints WHERE id=$1 AND user_id=$2 AND enabled=TRUE",[req.params.id,req.user!.userId])).rows[0];
 if(!endpoint)return res.status(404).json({success:false,message:"Enabled webhook endpoint not found."});
 const eventId=crypto.randomUUID();
 await pool.query("INSERT INTO aurelink_webhook_deliveries(endpoint_id,user_id,event_id,event_type,payload) VALUES($1,$2,$3,'endpoint.test',$4::jsonb)",[endpoint.id,req.user!.userId,eventId,JSON.stringify({id:eventId,type:"endpoint.test",created_at:new Date().toISOString(),data:{message:"Aurelink webhook endpoint test."}})]);
 res.status(202).json({success:true,message:"Test delivery queued.",eventId});
});

export default router;
