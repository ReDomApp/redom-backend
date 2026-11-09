import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { pool } from "../database/db";
import { emitAurelinkWebhookEvent } from "../services/aurelink/developer-platform.service";

function secrets(){const access=process.env.JWT_ACCESS_SECRET;if(!access)throw new Error("JWT_ACCESS_SECRET is not configured.");return access;}
function apiKeyAllowed(req:Request):boolean{
 const p=req.path.split("/").filter(Boolean);if(p[0]!=="aurelink")return false;
 if(req.method==="GET"){
  if(req.path==="/aurelink/communications/overview"||req.path==="/aurelink/communications/campaigns")return true;
  if(["/aurelink/status","/aurelink/orders","/aurelink/wallet","/aurelink/wallet/ledger","/aurelink/catalog/services","/aurelink/catalog/countries","/aurelink/catalog/suggested-countries","/aurelink/catalog/rentals","/aurelink/catalog/success-rate","/aurelink/nonvoip/countries","/aurelink/nonvoip/products","/aurelink/dedicated/countries"].includes(req.path))return true;
  if(req.path==="/aurelink/catalog/pricing"&&!req.query.pool)return true;
  if(p[1]==="catalog"&&p[2]==="rentals"&&p.length===5&&(p[4]==="services"||p[4]==="pricing"))return true;
  if(p[1]==="activations"&&p.length===4&&(p[3]==="messages"||p[3]==="status"))return true;
  if(p[1]==="rentals"&&p.length===4&&p[3]==="status")return true;
  if(p[1]==="rentals"&&p.length===4&&p[3]==="messages")return true;
  if((p[1]==="nonvoip"||p[1]==="dedicated")&&p[2]==="orders"&&p.length===5&&p[4]==="messages")return true;
 }
 if(req.method==="PATCH"&&p[1]==="dedicated"&&p[2]==="orders"&&p.length===5&&p[4]==="auto-renew")return true;
 if(req.method==="POST"){
  if(["/aurelink/communications/sms/send","/aurelink/communications/email/send","/aurelink/communications/campaigns","/aurelink/verify/start"].includes(req.path))return true;\n  if(p[1]==="communications"&&p[2]==="campaigns"&&p.length===5&&p[4]==="send")return true;
  if(p[1]==="verify"&&p.length===4&&p[3]==="check")return true;
  if(["/aurelink/quotes","/aurelink/rental-quotes","/aurelink/checkout","/aurelink/activations","/aurelink/rentals","/aurelink/dedicated/quote","/aurelink/dedicated/orders","/aurelink/nonvoip/orders"].includes(req.path))return true;
  if(p[1]==="activations"&&p.length===4&&(p[3]==="cancel"||p[3]==="resend"))return true;
  if(p[1]==="rentals"&&p.length===4&&p[3]==="cancel")return true;
  if(p[1]==="dedicated"&&p[2]==="orders"&&p.length===5&&p[4]==="auto-renew")return true;
  if(p[1]==="rentals"&&p.length===4&&p[3]==="renew")return true;
  if((p[1]==="nonvoip"||p[1]==="dedicated")&&p[2]==="orders"&&p.length===5&&p[4]==="cancel")return true;
 }
 return false;
}
function scopeFor(req:Request):string{
 const p=req.path.split("/").filter(Boolean);
 if(req.path==="/aurelink/communications/overview"||req.method==="GET"&&req.path==="/aurelink/communications/campaigns")return "communications:read";
 if(p[1]==="verify")return "verify:write";
 if(p[1]==="communications")return "communications:send";
 if(req.method==="GET"&&req.path.includes("/wallet"))return "wallet:read";
 if(req.method==="GET"&&req.path.endsWith("/messages"))return "messages:read";
 if(req.method==="GET"&&(req.path.endsWith("/orders")||p[1]==="activations"&&p.length===4&&p[3]==="status"||p[1]==="rentals"&&p.length===4&&p[3]==="status"))return "orders:read";
 if(req.method==="GET")return "catalog:read";
 return "numbers:write";
}
function requestLogger(req:Request,res:Response,key:{id:string;userId:string;environment:string},started:number){
 const requestId=String(req.headers["x-request-id"]||randomUUID()).slice(0,100);res.setHeader("X-Aurelink-Request-Id",requestId);res.setHeader("X-Aurelink-Environment",key.environment);
 res.on("finish",()=>{const address=String(req.ip||"").replace(/^::ffff:/,"").slice(0,45)||null;void pool.query("INSERT INTO aurelink_api_request_logs(user_id,api_key_id,environment,method,path,status_code,latency_ms,request_id,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[key.userId,key.id,key.environment,req.method,req.path.slice(0,255),res.statusCode,Math.max(0,Date.now()-started),requestId,address]).catch(error=>console.error("[Aurelink API log]",error instanceof Error?error.message:"unknown error"));});
}
function eventFor(req:Request,body:any):{type:string;data:Record<string,unknown>}|null{
 if(!body||body.success===false)return null;const p=req.path.split("/").filter(Boolean),id=String(body.order?.id||body.activation?.id||body.orderId||body.id||"");
 if(req.method==="POST"&&p[1]==="activations"&&p.length===2)return {type:"activation.created",data:{id,order:body.order||body.activation||body.data||null}};
 if(req.method==="POST"&&p[1]==="rentals"&&p.length===2)return {type:"rental.created",data:{id,order:body.order||body.data||null}};
 if(req.method==="POST"&&p[1]==="nonvoip"&&p[2]==="orders")return {type:"rental.created",data:{id,order:body.order||body.data||null}};
 if(req.method==="POST"&&p[1]==="dedicated"&&p[2]==="orders")return {type:"dedicated.created",data:{id,order:body.order||body.data||null}};
 if(req.method==="POST"&&p[p.length-1]==="cancel"){const type=p[1]==="activations"?"activation.cancelled":p[1]==="dedicated"?"dedicated.updated":"rental.updated";return {type,data:{id,status:body.status||"cancelled"}};}
 if(req.method==="POST"&&p[1]==="rentals"&&p[p.length-1]==="renew")return {type:"rental.updated",data:{id,status:body.status||"active",renewed:true}};
 if(req.method==="PATCH"&&p[1]==="dedicated"&&p[p.length-1]==="auto-renew")return {type:"dedicated.updated",data:{id,autoRenew:body.autoRenew??body.enabled}};
 if(req.method==="GET"&&p[p.length-1]==="messages"){const messages=Array.isArray(body.messages)?body.messages:Array.isArray(body.data)?body.data:[];if(messages.length)return {type:"sms.received",data:{id,orderId:p[p.length-2],messages}};}
 return null;
}
function testResponse(req:Request,res:Response):boolean{
 const p=req.path.split("/").filter(Boolean),path=req.path,now=new Date().toISOString(),id="test_"+randomUUID().replace(/-/g,"").slice(0,18);
 res.setHeader("X-Aurelink-Test-Mode","true");res.setHeader("Cache-Control","no-store");
 const ok=(data:unknown,status=200)=>{res.status(status).json({success:true,environment:"test",data,...(data&&typeof data==="object"&&!Array.isArray(data)?data as object:{})});return true;};
 if(req.method==="GET"&&path==="/aurelink/status")return ok({status:"operational",testMode:true});
 if(req.method==="GET"&&path==="/aurelink/communications/overview")return ok({providers:{sms:{brevo:false,twilio:false},email:{resend:false,brevo:false}},messages:[],domains:[],senderIds:[],contacts:{sms:0,email:0},campaigns:[],testMode:true});
 if(req.method==="POST"&&path==="/aurelink/verify/start")return ok({verificationId:id,expiresAt:new Date(Date.now()+300000).toISOString(),testCode:"123456",testMode:true},202);
 if(req.method==="POST"&&p[1]==="verify"&&p[3]==="check")return ok({verified:String(req.body.code||"")==="123456",verificationId:p[2],testMode:true},String(req.body.code||"")==="123456"?200:400);
 if(req.method==="POST"&&p[1]==="communications"&&p[2]==="sms"&&p[3]==="send")return ok({message:{id,channel:"sms",provider:"sandbox",status:"accepted",testMode:true}},202);
 if(req.method==="POST"&&p[1]==="communications"&&p[2]==="email"&&p[3]==="send")return ok({message:{id,channel:"email",provider:"sandbox",status:"accepted",testMode:true}},202);
 if(req.method==="GET"&&(path==="/aurelink/catalog/services"||path==="/aurelink/catalog/countries"||path==="/aurelink/catalog/suggested-countries"))return ok({services:[{id:"telegram",name:"Telegram"},{id:"google",name:"Google"},{id:"facebook",name:"Facebook"}],countries:[{code:"US",name:"United States",dialCode:"+1"},{code:"GB",name:"United Kingdom",dialCode:"+44"}]});
 if(req.method==="GET"&&path==="/aurelink/catalog/rentals")return ok({rentals:[],countries:[{code:"US",name:"United States"}],testMode:true});
 if(req.method==="GET"&&p[1]==="catalog"&&p[2]==="rentals"&&p[4]==="services")return ok({services:[{id:"test-service",name:"Test verification",available:true}],testMode:true});
 if(req.method==="GET"&&p[1]==="catalog"&&p[2]==="rentals"&&p[4]==="pricing")return ok({pricing:{amount:"0.00",currency:"USD"},testMode:true});
 if(req.method==="GET"&&path==="/aurelink/nonvoip/countries")return ok({countries:[{code:"US",name:"United States",dialCode:"+1"}]});
 if(req.method==="GET"&&path==="/aurelink/nonvoip/products")return ok({products:[{serviceId:"test-service",offerId:"test-offer",service:"Test verification",countryCode:"US",countryName:"United States",providerPrice:0,retailPriceUsd:"0.00",available:true,testMode:true}]});
 if(req.method==="GET"&&path==="/aurelink/dedicated/countries")return ok({countries:[{code:"US",name:"United States",dialCode:"+1"}]});
 if(req.method==="GET"&&path==="/aurelink/catalog/success-rate")return ok({successRate:99.9});
 if(req.method==="GET"&&path==="/aurelink/catalog/pricing")return ok({currency:"USD",testMode:true});
 if(req.method==="GET"&&path==="/aurelink/orders")return ok({orders:[]});
 if(req.method==="GET"&&path==="/aurelink/wallet")return ok({wallet:{balanceUsd:"100.00",currency:"USD",testBalance:true}});
 if(req.method==="GET"&&path==="/aurelink/wallet/ledger")return ok({entries:[]});
 if(req.method==="GET"&&p[1]==="activations"&&p[3]==="messages")return ok({messages:[{id:"test_sms_1",message:"Your Aurelink test verification code is 123456.",code:"123456",receivedAt:now}]});
 if(req.method==="GET"&&p[1]==="activations"&&p[3]==="status")return ok({activation:{id:p[2],status:"completed",phoneNumber:"+15555550100",smsReceived:true,testMode:true}});
 if(req.method==="GET"&&p[1]==="activations")return ok({activation:{id:p[2],status:"completed",phoneNumber:"+15555550100",service:"test",country:"US",testMode:true}});
 if(req.method==="GET"&&p[1]==="rentals"&&p[3]==="messages")return ok({messages:[]});
 if(req.method==="GET"&&p[1]==="rentals"&&p[3]==="status")return ok({rental:{id:p[2],status:"active",phoneNumber:"+15555550100",testMode:true}});
 if(req.method==="GET"&&p[1]==="rentals")return ok({rental:{id:p[2],status:"active",phoneNumber:"+15555550100",expiresAt:new Date(Date.now()+86400000).toISOString(),testMode:true}});
 if(req.method==="GET"&&(p[1]==="dedicated"||p[1]==="nonvoip")&&p[2]==="orders"&&p[4]==="messages")return ok({messages:[{id:"test_sms_1",message:"Your Aurelink test verification code is 123456.",code:"123456",receivedAt:now}]});
 if(req.method==="POST"&&(path==="/aurelink/quotes"||path==="/aurelink/rental-quotes"))return ok({quote:{id:"test_quote_"+randomUUID().slice(0,8),amount:"0.00",currency:"USD",expiresAt:new Date(Date.now()+600000).toISOString(),testMode:true}});
 if(req.method==="POST"&&path==="/aurelink/dedicated/quote")return ok({quote:{id:"test_quote_"+randomUUID().slice(0,8),amount:"0.00",currency:"USD",testMode:true}});
 if(req.method==="POST"&&["/aurelink/activations","/aurelink/rentals","/aurelink/nonvoip/orders","/aurelink/dedicated/orders"].includes(path)){const resource={id,orderId:id,status:"pending",phoneNumber:"+15555550100",country:"US",service:"test",createdAt:now,testMode:true};return ok({order:resource,activation:resource,rental:resource},201);}
 if(req.method==="POST"&&p[p.length-1]==="cancel")return ok({id:p[p.length-2],status:"cancelled",testMode:true});
 if(req.method==="POST"&&p[p.length-1]==="resend")return ok({id:p[p.length-2],status:"pending",resendAccepted:true,testMode:true});
 if((req.method==="POST"||req.method==="PATCH")&&p[p.length-1]==="auto-renew")return ok({id:p[p.length-2],autoRenew:Boolean(req.body?.enabled),testMode:true});
 if(req.method==="POST"&&p[p.length-1]==="renew")return ok({id:p[p.length-2],status:"active",renewed:true,testMode:true});
 if(req.method==="POST")return ok({id,testMode:true,accepted:true},202);
 return ok({testMode:true,received:true});
}
async function authenticateApiKey(secret:string,req:Request,res:Response,next:NextFunction):Promise<void>{
 const p=req.path.split("/").filter(Boolean);
 if(!apiKeyAllowed(req)){res.status(403).json({success:false,message:"This API key cannot access this route."});return;}
 const digest=createHash("sha256").update(secret).digest();
 const found=await pool.query("SELECT k.id,k.user_id,k.key_hash,k.environment,k.scopes,k.rate_limit_per_minute,k.expires_at,u.account_status FROM aurelink_api_keys k JOIN aurelink_users u ON u.id=k.user_id WHERE k.key_prefix IN ($1,$2,$3) AND k.revoked_at IS NULL LIMIT 1",[secret.slice(0,20),secret.slice(0,16),secret.slice(0,12)]);
 const row=found.rows[0] as {id:string;user_id:string;key_hash:string;environment:string;scopes:unknown;rate_limit_per_minute:number;expires_at:Date|null;account_status:string}|undefined;
 const stored=row?.key_hash||"";if(!row||stored.length!==64||! /^[a-f0-9]{64}$/i.test(stored)||!timingSafeEqual(Buffer.from(stored,"hex"),digest)){res.status(401).json({success:false,message:"Invalid or revoked Aurelink API key."});return;}
 if(row.account_status!=="active"){res.status(403).json({success:false,message:"Aurelink account is not active."});return;}
 if(row.expires_at&&new Date(row.expires_at).getTime()<=Date.now()){res.status(401).json({success:false,message:"This Aurelink API key has expired."});return;}
 const scope=scopeFor(req),scopes=Array.isArray(row.scopes)?row.scopes.map(String):[];
 if(!scopes.includes(scope)){res.status(403).json({success:false,code:"INSUFFICIENT_SCOPE",message:"This API key does not have the required "+scope+" permission."});return;}
 const key={id:row.id,userId:row.user_id,environment:row.environment==="test"?"test":"live"};
 requestLogger(req,res,key,Date.now());
 const limit=Math.max(1,Math.min(6000,Number(row.rate_limit_per_minute)||60));
 const window=await pool.query("INSERT INTO aurelink_api_rate_windows(api_key_id,window_start,request_count) VALUES($1,date_trunc('minute',NOW()),1) ON CONFLICT(api_key_id,window_start) DO UPDATE SET request_count=aurelink_api_rate_windows.request_count+1 RETURNING request_count",[row.id]);
 const used=Number(window.rows[0]?.request_count||1);
 res.setHeader("X-Aurelink-RateLimit-Limit",String(limit));res.setHeader("X-Aurelink-RateLimit-Remaining",String(Math.max(0,limit-used)));
 if(used>limit){res.setHeader("Retry-After","60");res.status(429).json({success:false,code:"RATE_LIMIT_EXCEEDED",message:"Aurelink API rate limit exceeded. Retry after 60 seconds."});return;}
 let idempotency:{key:string;hash:string}|null=null;
 if(key.environment==="live"&&req.method==="POST"&&(["/aurelink/activations","/aurelink/rentals","/aurelink/nonvoip/orders","/aurelink/dedicated/orders","/aurelink/checkout"].includes(req.path)||p[1]==="rentals"&&p.length===4&&p[3]==="renew")){
  const supplied=String(req.headers["idempotency-key"]||"").trim();
  if(!supplied||supplied.length>128){res.status(400).json({success:false,code:"IDEMPOTENCY_KEY_REQUIRED",message:"Send a unique Idempotency-Key header for every purchase request."});return;}
  const requestHash=createHash("sha256").update(JSON.stringify(req.body??{})).digest("hex");
  const inserted=await pool.query("INSERT INTO aurelink_api_idempotency(api_key_id,idempotency_key,request_hash) VALUES($1,$2,$3) ON CONFLICT(api_key_id,idempotency_key) DO NOTHING RETURNING idempotency_key",[row.id,supplied,requestHash]);
  if(!inserted.rowCount){
   const previous=(await pool.query("SELECT request_hash,state,response_status,response_body,expires_at FROM aurelink_api_idempotency WHERE api_key_id=$1 AND idempotency_key=$2",[row.id,supplied])).rows[0];
   if(!previous||new Date(previous.expires_at).getTime()<=Date.now()){await pool.query("DELETE FROM aurelink_api_idempotency WHERE api_key_id=$1 AND idempotency_key=$2",[row.id,supplied]);const fresh=await pool.query("INSERT INTO aurelink_api_idempotency(api_key_id,idempotency_key,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING idempotency_key",[row.id,supplied,requestHash]);if(!fresh.rowCount){res.status(409).json({success:false,code:"REQUEST_IN_PROGRESS",message:"This Idempotency-Key is being used by another request."});return;}}
   else if(previous.request_hash!==requestHash){res.status(409).json({success:false,code:"IDEMPOTENCY_CONFLICT",message:"This Idempotency-Key was already used with a different request body."});return;}
   else if(previous.state==="completed"&&previous.response_body){res.setHeader("Idempotent-Replay","true");res.status(Number(previous.response_status)||200).json(previous.response_body);return;}
   else{res.status(409).json({success:false,code:"REQUEST_IN_PROGRESS",message:"A request with this Idempotency-Key is still processing. Retry shortly using the same key."});return;}
  }
  idempotency={key:supplied,hash:requestHash};
 }
 await pool.query("UPDATE aurelink_api_keys SET last_used_at=NOW() WHERE id=$1",[row.id]);
 (req as any).aurelinkApiKey=key;
 req.user={userId:row.user_id,profileId:row.user_id,sessionId:"api-key:"+row.id};
 const originalJson=res.json.bind(res);
 res.json=(body:any)=>{if(key.environment==="test"){const event=eventFor(req,body);if(event)void emitAurelinkWebhookEvent(row.user_id,event.type,event.data,key.environment);}if(idempotency){const saved=idempotency;void pool.query("UPDATE aurelink_api_idempotency SET state='completed',response_status=$3,response_body=$4::jsonb WHERE api_key_id=$1 AND idempotency_key=$2",[row.id,saved.key,res.statusCode,JSON.stringify(body)]).then(()=>originalJson(body)).catch(()=>originalJson(body));return res;}return originalJson(body);};
 if(key.environment==="test"){testResponse(req,res);return;}
 next();
}
export async function aurelinkAuthMiddleware(req:Request,res:Response,next:NextFunction):Promise<void>{
 try{const raw=req.headers.authorization;if(!raw?.startsWith("Bearer ")){res.status(401).json({success:false,message:"Aurelink authentication required."});return;}const credential=raw.slice(7).trim();if(credential.startsWith("aul_")){await authenticateApiKey(credential,req,res,next);return;}const payload=jwt.verify(credential,secrets()) as {userId?:string;sessionId?:string;audience?:string};if(payload.audience!=="aurelink"||!payload.userId||!payload.sessionId){res.status(401).json({success:false,message:"Invalid Aurelink session."});return;}const result=await pool.query("SELECT u.id,u.account_status,s.id AS session_id FROM aurelink_users u JOIN aurelink_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()",[payload.userId,payload.sessionId]);const row=result.rows[0];if(!row){res.status(401).json({success:false,message:"Aurelink session expired, was revoked, or was inactive for more than 10 minutes."});return;}if(row.account_status!=="active"){res.status(403).json({success:false,message:"Aurelink account is not active."});return;}await pool.query("UPDATE aurelink_sessions SET last_activity_at=NOW(),updated_at=NOW() WHERE id=$1",[row.session_id]);req.user={userId:row.id,profileId:row.id,sessionId:row.session_id};next();}catch{res.status(401).json({success:false,message:"Invalid Aurelink access token."});}
}
