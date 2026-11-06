import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { pool } from "../../database/db";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function encryptionKey(){const source=process.env.AURELINK_WEBHOOK_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;if(!source||source.length<32)throw new Error("A secure webhook encryption key is not configured.");return createHash("sha256").update(source).update("|aurelink-webhook-v1").digest();}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");}
function decrypt(value:string){const [iv,tag,body]=value.split(".");if(!iv||!tag||!body)throw new Error("Webhook signing secret is unavailable.");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");}
function publicWebhookUrl(value:string){let u:URL;try{u=new URL(value);}catch{throw new Error("Enter a valid HTTPS webhook URL.");}if(u.protocol!=="https:"||u.username||u.password||u.hash)throw new Error("Webhook endpoints must use HTTPS and cannot contain credentials or fragments.");const host=u.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host==="metadata.google.internal")throw new Error("Local and metadata webhook destinations are not allowed.");if(isIP(host)){if(host==="::1"||host==="::"||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe80:")||host.startsWith("127.")||host.startsWith("10.")||host.startsWith("192.168.")||host.startsWith("169.254.")||/^172\.(1[6-9]|2\d|3[01])\./.test(host))throw new Error("Private network webhook destinations are not allowed.");}return u.toString();}

export async function ensureAurelinkDeveloperSchema():Promise<void>{
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS environment VARCHAR(8) NOT NULL DEFAULT 'live' CHECK(environment IN ('test','live'))");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[\"catalog:read\",\"orders:read\",\"numbers:write\",\"messages:read\",\"wallet:read\"]'::jsonb");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK(rate_limit_per_minute BETWEEN 1 AND 6000)");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ");
 await pool.query("ALTER TABLE aurelink_api_keys ALTER COLUMN key_prefix TYPE VARCHAR(32)");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_keys_user_env_idx ON aurelink_api_keys(user_id,environment,created_at DESC)");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_api_request_logs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,api_key_id UUID REFERENCES aurelink_api_keys(id) ON DELETE SET NULL,environment VARCHAR(8) NOT NULL DEFAULT 'live',method VARCHAR(10) NOT NULL,path VARCHAR(255) NOT NULL,status_code INTEGER NOT NULL,latency_ms INTEGER NOT NULL DEFAULT 0,request_id VARCHAR(100),ip_address VARCHAR(45),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_request_logs_user_time_idx ON aurelink_api_request_logs(user_id,created_at DESC)");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_request_logs_key_time_idx ON aurelink_api_request_logs(api_key_id,created_at DESC)");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_api_rate_windows(api_key_id UUID NOT NULL REFERENCES aurelink_api_keys(id) ON DELETE CASCADE,window_start TIMESTAMPTZ NOT NULL,request_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(api_key_id,window_start))");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_webhook_endpoints(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,url TEXT NOT NULL,description VARCHAR(120) NOT NULL DEFAULT '',secret_encrypted TEXT NOT NULL,secret_prefix VARCHAR(16) NOT NULL,events TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],enabled BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_endpoints_user_idx ON aurelink_webhook_endpoints(user_id,created_at DESC)");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_webhook_deliveries(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),endpoint_id UUID NOT NULL REFERENCES aurelink_webhook_endpoints(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,event_id UUID NOT NULL,event_type VARCHAR(100) NOT NULL,payload JSONB NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_status_code INTEGER,last_error TEXT,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(endpoint_id,event_id))");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_deliveries_due_idx ON aurelink_webhook_deliveries(status,next_attempt_at) WHERE status IN ('pending','processing')");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_deliveries_user_idx ON aurelink_webhook_deliveries(user_id,created_at DESC)");
}

export async function createWebhook(userId:string,input:{url:string;description?:string;events?:string[]}){
 const url=publicWebhookUrl(input.url),allowed=new Set(["activation.created","activation.updated","sms.received","activation.cancelled","rental.created","rental.updated","rental.expiring","dedicated.created","dedicated.updated","wallet.credited","wallet.debited"]);
 const events=Array.isArray(input.events)?[...new Set(input.events.map(x=>String(x).trim()).filter(x=>allowed.has(x)))]:["*"];
 if(Array.isArray(input.events)&&!events.length)throw new Error("Select at least one supported event.");
 const secret="whsec_"+randomBytes(32).toString("base64url");
 const result=await pool.query("INSERT INTO aurelink_webhook_endpoints(user_id,url,description,secret_encrypted,secret_prefix,events) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,url,description,secret_prefix,events,enabled,created_at",[userId,url,String(input.description||"").slice(0,120),encrypt(secret),secret.slice(0,13),events]);
 return {endpoint:result.rows[0],secret};
}

export async function emitAurelinkWebhookEvent(userId:string,eventType:string,data:Record<string,unknown>){
 try{const eventId=randomUUID(),payload={id:eventId,type:eventType,created_at:new Date().toISOString(),data};await pool.query("INSERT INTO aurelink_webhook_deliveries(endpoint_id,user_id,event_id,event_type,payload) SELECT id,$1,$2,$3,$4::jsonb FROM aurelink_webhook_endpoints WHERE user_id=$1 AND enabled=TRUE AND (events @> ARRAY[$3]::text[] OR events @> ARRAY['*']::text[]) ON CONFLICT(endpoint_id,event_id) DO NOTHING",[userId,eventId,eventType,JSON.stringify(payload)]);}catch(error){console.error("[Aurelink webhook enqueue]",error instanceof Error?error.message:"unknown error");}
}

let timer:ReturnType<typeof setInterval>|undefined;let running=false;
async function deliverOne(row:any){
 const endpoint=(await pool.query("SELECT url,secret_encrypted,enabled FROM aurelink_webhook_endpoints WHERE id=$1",[row.endpoint_id])).rows[0];
 if(!endpoint?.enabled){await pool.query("UPDATE aurelink_webhook_deliveries SET status='failed',last_error='Webhook endpoint disabled or deleted.' WHERE id=$1",[row.id]);return;}
 const body=JSON.stringify(row.payload),timestamp=String(Math.floor(Date.now()/1000)),secret=decrypt(endpoint.secret_encrypted),signature=createHmac("sha256",secret).update(timestamp+".").update(body).digest("hex");
 let status:number|null=null,errorText:string|null=null;
 try{const response=await fetch(endpoint.url,{method:"POST",headers:{"content-type":"application/json","user-agent":"Aurelink-Webhooks/1.0","aurelink-event":row.event_type,"aurelink-delivery":row.id,"aurelink-timestamp":timestamp,"aurelink-signature":"v1="+signature},body,signal:AbortSignal.timeout(10000),redirect:"error"});status=response.status;if(!response.ok)errorText="Webhook endpoint returned HTTP "+response.status;}catch(error){errorText=error instanceof Error?error.message:"Webhook request failed.";}
 const attempts=Number(row.attempts)+1;
 if(status!==null&&status>=200&&status<300){await pool.query("UPDATE aurelink_webhook_deliveries SET status='delivered',attempts=$2,last_status_code=$3,last_error=NULL,delivered_at=NOW() WHERE id=$1",[row.id,attempts,status]);return;}
 const delays=[30,120,600,1800,7200,21600],delay=delays[Math.min(attempts-1,delays.length-1)];
 await pool.query("UPDATE aurelink_webhook_deliveries SET status=$2,attempts=$3,last_status_code=$4,last_error=$5,next_attempt_at=NOW()+($6 * INTERVAL '1 second') WHERE id=$1",[row.id,attempts>=8?"failed":"pending",attempts,status,errorText?.slice(0,500)||"Delivery failed.",delay]);
}
async function processWebhookQueue(){if(running)return;running=true;try{const batch=await pool.query("WITH due AS (SELECT id FROM aurelink_webhook_deliveries WHERE ((status='pending' AND next_attempt_at<=NOW()) OR (status='processing' AND created_at<NOW()-INTERVAL '2 minutes')) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 20) UPDATE aurelink_webhook_deliveries d SET status='processing' FROM due WHERE d.id=due.id RETURNING d.*");for(const row of batch.rows){try{await deliverOne(row);}catch(error){await pool.query("UPDATE aurelink_webhook_deliveries SET status='pending',attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '2 minutes',last_error=$2 WHERE id=$1",[row.id,error instanceof Error?error.message:"Delivery worker error"]);}}}catch(error){console.error("[Aurelink webhook worker]",error instanceof Error?error.message:"unknown error");}finally{running=false;}}
export function startAurelinkWebhookWorker(){if(timer)return;timer=setInterval(()=>void processWebhookQueue(),5000);void processWebhookQueue();}
export function stopAurelinkWebhookWorker(){if(timer)clearInterval(timer);timer=undefined;}
