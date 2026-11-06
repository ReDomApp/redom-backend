import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { pool } from "../../database/db";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function encryptionKey(){const source=process.env.AURELINK_WEBHOOK_ENCRYPTION_KEY||process.env.JWT_ACCESS_SECRET;if(!source||source.length<32)throw new Error("A secure webhook encryption key is not configured.");return createHash("sha256").update(source).update("|aurelink-webhook-v1").digest();}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),body.toString("base64url")].join(".");}
function decrypt(value:string){const [iv,tag,body]=value.split(".");if(!iv||!tag||!body)throw new Error("Webhook signing secret is unavailable.");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));decipher.setAuthTag(Buffer.from(tag,"base64url"));return Buffer.concat([decipher.update(Buffer.from(body,"base64url")),decipher.final()]).toString("utf8");}
function isPrivateAddress(address:string){
 const value=address.toLowerCase().replace(/^::ffff:/,"");
 const version=isIP(value);
 if(version===4){const n=value.split(".").reduce((a,x)=>(a<<8n)|BigInt(Number(x)),0n);const inRange=(base:string,prefix:number)=>{const b=base.split(".").reduce((a,x)=>(a<<8n)|BigInt(Number(x)),0n);return(n>>BigInt(32-prefix))===(b>>BigInt(32-prefix));};return [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]].some(([b,p])=>inRange(String(b),Number(p)));}
 if(version===6)return value==="::"||value==="::1"||value.startsWith("fc")||value.startsWith("fd")||/^fe[89ab]/.test(value)||value.startsWith("ff")||value.startsWith("2001:db8:");
 return true;
}
async function publicWebhookUrl(value:string){
 let u:URL;try{u=new URL(value);}catch{throw new Error("Enter a valid HTTPS webhook URL.");}
 if(u.protocol!=="https:"||u.username||u.password||u.hash)throw new Error("Webhook endpoints must use HTTPS and cannot contain credentials or fragments.");
 const host=u.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host==="metadata.google.internal")throw new Error("Local and metadata webhook destinations are not allowed.");
 const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(x=>isPrivateAddress(x.address)))throw new Error("Webhook hosts must resolve only to public IP addresses.");
 return u.toString();
}

export async function ensureAurelinkDeveloperSchema():Promise<void>{
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS environment VARCHAR(8) NOT NULL DEFAULT 'live' CHECK(environment IN ('test','live'))");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[\"catalog:read\",\"orders:read\",\"numbers:write\",\"messages:read\",\"wallet:read\"]'::jsonb");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 60 CHECK(rate_limit_per_minute BETWEEN 1 AND 6000)");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ");
 await pool.query("ALTER TABLE aurelink_api_keys ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ");
 await pool.query("ALTER TABLE aurelink_api_keys ALTER COLUMN key_prefix TYPE VARCHAR(32)");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_keys_user_env_idx ON aurelink_api_keys(user_id,environment,created_at DESC)");
 await pool.query("ALTER TABLE aurelink_provider_orders ADD COLUMN IF NOT EXISTS webhook_expiring_sent_at TIMESTAMPTZ");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_api_request_logs(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,api_key_id UUID REFERENCES aurelink_api_keys(id) ON DELETE SET NULL,environment VARCHAR(8) NOT NULL DEFAULT 'live',method VARCHAR(10) NOT NULL,path VARCHAR(255) NOT NULL,status_code INTEGER NOT NULL,latency_ms INTEGER NOT NULL DEFAULT 0,request_id VARCHAR(100),ip_address VARCHAR(45),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_request_logs_user_time_idx ON aurelink_api_request_logs(user_id,created_at DESC)");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_api_request_logs_key_time_idx ON aurelink_api_request_logs(api_key_id,created_at DESC)");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_api_rate_windows(api_key_id UUID NOT NULL REFERENCES aurelink_api_keys(id) ON DELETE CASCADE,window_start TIMESTAMPTZ NOT NULL,request_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(api_key_id,window_start))");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_api_idempotency(api_key_id UUID NOT NULL REFERENCES aurelink_api_keys(id) ON DELETE CASCADE,idempotency_key VARCHAR(128) NOT NULL,request_hash CHAR(64) NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','completed')),response_status INTEGER,response_body JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',PRIMARY KEY(api_key_id,idempotency_key))");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_webhook_endpoints(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,url TEXT NOT NULL,description VARCHAR(120) NOT NULL DEFAULT '',secret_encrypted TEXT NOT NULL,secret_prefix VARCHAR(16) NOT NULL,events TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],enabled BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await pool.query("ALTER TABLE aurelink_webhook_endpoints ADD COLUMN IF NOT EXISTS environment VARCHAR(8) NOT NULL DEFAULT 'live' CHECK(environment IN ('test','live'))");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_endpoints_user_idx ON aurelink_webhook_endpoints(user_id,environment,created_at DESC)");
 await pool.query("CREATE TABLE IF NOT EXISTS aurelink_webhook_deliveries(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),endpoint_id UUID NOT NULL REFERENCES aurelink_webhook_endpoints(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE,event_id UUID NOT NULL,event_type VARCHAR(100) NOT NULL,payload JSONB NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_status_code INTEGER,last_error TEXT,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(endpoint_id,event_id))");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_deliveries_due_idx ON aurelink_webhook_deliveries(status,next_attempt_at) WHERE status IN ('pending','processing')");
 await pool.query("CREATE INDEX IF NOT EXISTS aurelink_webhook_deliveries_user_idx ON aurelink_webhook_deliveries(user_id,created_at DESC)");
 await pool.query("CREATE OR REPLACE FUNCTION aurelink_order_webhook_events() RETURNS trigger AS $aurelink$ DECLARE evt TEXT; eid UUID; payload JSONB; uid UUID; BEGIN uid:=COALESCE(NEW.aurelink_user_id,NEW.user_id); IF uid IS NULL THEN RETURN NEW; END IF; IF TG_OP='INSERT' THEN evt:=CASE NEW.product_kind WHEN 'activation' THEN 'activation.created' WHEN 'rental' THEN 'rental.created' WHEN 'dedicated' THEN 'dedicated.created' ELSE NULL END; IF evt IS NULL THEN RETURN NEW; END IF; ELSIF NEW.sms_received_at IS NOT NULL AND OLD.sms_received_at IS NULL THEN evt:='sms.received'; ELSIF NEW.status IS DISTINCT FROM OLD.status THEN evt:=CASE WHEN NEW.status='cancelled' AND NEW.product_kind='activation' THEN 'activation.cancelled' WHEN NEW.product_kind='activation' THEN 'activation.updated' WHEN NEW.product_kind='rental' THEN 'rental.updated' WHEN NEW.product_kind='dedicated' THEN 'dedicated.updated' ELSE NULL END; ELSE RETURN NEW; END IF; IF evt IS NULL THEN RETURN NEW; END IF; eid:=gen_random_uuid(); payload:=jsonb_build_object('id',eid,'type',evt,'created_at',NOW(),'data',jsonb_build_object('id',NEW.id,'orderId',NEW.aurelink_order_id,'phoneNumber',NEW.phone_number,'country',NEW.country,'service',NEW.service,'status',NEW.status,'expiresAt',NEW.expires_at)); INSERT INTO aurelink_webhook_deliveries(endpoint_id,user_id,event_id,event_type,payload) SELECT id,uid,eid,evt,payload FROM aurelink_webhook_endpoints WHERE user_id=uid AND environment='live' AND enabled=TRUE AND (events @> ARRAY[evt]::text[] OR events @> ARRAY['*']::text[]); RETURN NEW; END; $aurelink$ LANGUAGE plpgsql");
 await pool.query("DROP TRIGGER IF EXISTS aurelink_provider_orders_webhook_events ON aurelink_provider_orders");
 await pool.query("CREATE TRIGGER aurelink_provider_orders_webhook_events AFTER INSERT OR UPDATE OF status,sms_received_at ON aurelink_provider_orders FOR EACH ROW EXECUTE FUNCTION aurelink_order_webhook_events()");
 await pool.query("CREATE OR REPLACE FUNCTION aurelink_wallet_webhook_event() RETURNS trigger AS $aurelink$ DECLARE evt TEXT; eid UUID; payload JSONB; BEGIN evt:=CASE WHEN NEW.direction='credit' THEN 'wallet.credited' ELSE 'wallet.debited' END; eid:=gen_random_uuid(); payload:=jsonb_build_object('id',eid,'type',evt,'created_at',NOW(),'data',jsonb_build_object('entryId',NEW.id,'entryType',NEW.entry_type,'amountMinor',NEW.amount_minor,'currency',NEW.currency,'balanceAfterMinor',NEW.balance_after_minor,'reference',NEW.reference,'orderId',NEW.order_id)); INSERT INTO aurelink_webhook_deliveries(endpoint_id,user_id,event_id,event_type,payload) SELECT id,NEW.user_id,eid,evt,payload FROM aurelink_webhook_endpoints WHERE user_id=NEW.user_id AND environment='live' AND enabled=TRUE AND (events @> ARRAY[evt]::text[] OR events @> ARRAY['*']::text[]); RETURN NEW; END; $aurelink$ LANGUAGE plpgsql");
 await pool.query("DROP TRIGGER IF EXISTS aurelink_wallet_ledger_webhook_event ON aurelink_wallet_ledger");
 await pool.query("CREATE TRIGGER aurelink_wallet_ledger_webhook_event AFTER INSERT ON aurelink_wallet_ledger FOR EACH ROW EXECUTE FUNCTION aurelink_wallet_webhook_event()");

}

export async function createWebhook(userId:string,input:{url:string;description?:string;events?:string[];environment?:"test"|"live"}){
 const url=await publicWebhookUrl(input.url),environment=input.environment==="test"?"test":"live",allowed=new Set(["activation.created","activation.updated","sms.received","activation.cancelled","rental.created","rental.updated","rental.expiring","dedicated.created","dedicated.updated","wallet.credited","wallet.debited"]);
 const events=Array.isArray(input.events)?[...new Set(input.events.map(x=>String(x).trim()).filter(x=>allowed.has(x)))]:["*"];
 if(Array.isArray(input.events)&&!events.length)throw new Error("Select at least one supported event.");
 const secret="whsec_"+randomBytes(32).toString("base64url");
 const result=await pool.query("INSERT INTO aurelink_webhook_endpoints(user_id,url,description,secret_encrypted,secret_prefix,events,environment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,url,description,secret_prefix,events,environment,enabled,created_at",[userId,url,String(input.description||"").slice(0,120),encrypt(secret),secret.slice(0,13),events,environment]);
 return {endpoint:result.rows[0],secret};
}

export async function emitAurelinkWebhookEvent(userId:string,eventType:string,data:Record<string,unknown>,environment:"test"|"live"="live"){
 try{const eventId=randomUUID(),payload={id:eventId,type:eventType,created_at:new Date().toISOString(),data};await pool.query("INSERT INTO aurelink_webhook_deliveries(endpoint_id,user_id,event_id,event_type,payload) SELECT id,$1,$2,$3,$4::jsonb FROM aurelink_webhook_endpoints WHERE user_id=$1 AND environment=$5 AND enabled=TRUE AND (events @> ARRAY[$3]::text[] OR events @> ARRAY['*']::text[]) ON CONFLICT(endpoint_id,event_id) DO NOTHING",[userId,eventId,eventType,JSON.stringify(payload),environment]);}catch(error){console.error("[Aurelink webhook enqueue]",error instanceof Error?error.message:"unknown error");}
}

let timer:ReturnType<typeof setInterval>|undefined;let running=false;
async function deliverOne(row:any){
 const endpoint=(await pool.query("SELECT url,secret_encrypted,enabled FROM aurelink_webhook_endpoints WHERE id=$1",[row.endpoint_id])).rows[0];
 if(!endpoint?.enabled){await pool.query("UPDATE aurelink_webhook_deliveries SET status='failed',last_error='Webhook endpoint disabled or deleted.' WHERE id=$1",[row.id]);return;}
 const safeUrl=await publicWebhookUrl(endpoint.url);const body=JSON.stringify(row.payload),timestamp=String(Math.floor(Date.now()/1000)),secret=decrypt(endpoint.secret_encrypted),signature=createHmac("sha256",secret).update(timestamp+".").update(body).digest("hex");
 let status:number|null=null,errorText:string|null=null;
 try{const response=await fetch(safeUrl,{method:"POST",headers:{"content-type":"application/json","user-agent":"Aurelink-Webhooks/1.0","aurelink-event":row.event_type,"aurelink-delivery":row.id,"aurelink-timestamp":timestamp,"aurelink-signature":"v1="+signature},body,signal:AbortSignal.timeout(10000),redirect:"error"});status=response.status;if(!response.ok)errorText="Webhook endpoint returned HTTP "+response.status;}catch(error){errorText=error instanceof Error?error.message:"Webhook request failed.";}
 const attempts=Number(row.attempts)+1;
 if(status!==null&&status>=200&&status<300){await pool.query("UPDATE aurelink_webhook_deliveries SET status='delivered',attempts=$2,last_status_code=$3,last_error=NULL,delivered_at=NOW() WHERE id=$1",[row.id,attempts,status]);return;}
 const delays=[30,120,600,1800,7200,21600],delay=delays[Math.min(attempts-1,delays.length-1)];
 await pool.query("UPDATE aurelink_webhook_deliveries SET status=$2,attempts=$3,last_status_code=$4,last_error=$5,next_attempt_at=NOW()+($6 * INTERVAL '1 second') WHERE id=$1",[row.id,attempts>=8?"failed":"pending",attempts,status,errorText?.slice(0,500)||"Delivery failed.",delay]);
}
async function processWebhookQueue(){
 if(running)return;running=true;
 try{
  const expiring=await pool.query("UPDATE aurelink_provider_orders SET webhook_expiring_sent_at=NOW() WHERE product_kind='rental' AND status='active' AND expires_at>NOW() AND expires_at<=NOW()+INTERVAL '24 hours' AND webhook_expiring_sent_at IS NULL RETURNING aurelink_user_id,aurelink_order_id,phone_number,country,service,expires_at");
  for(const order of expiring.rows){if(order.aurelink_user_id)await emitAurelinkWebhookEvent(order.aurelink_user_id,"rental.expiring",{orderId:order.aurelink_order_id,phoneNumber:order.phone_number,country:order.country,service:order.service,expiresAt:order.expires_at});}
  const batch=await pool.query("WITH due AS (SELECT id FROM aurelink_webhook_deliveries WHERE ((status='pending' AND next_attempt_at<=NOW()) OR (status='processing' AND created_at<NOW()-INTERVAL '2 minutes')) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 20) UPDATE aurelink_webhook_deliveries d SET status='processing' FROM due WHERE d.id=due.id RETURNING d.*");
  for(const row of batch.rows){try{await deliverOne(row);}catch(error){await pool.query("UPDATE aurelink_webhook_deliveries SET status=CASE WHEN attempts+1>=8 THEN 'failed' ELSE 'pending' END,attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '2 minutes',last_error=$2 WHERE id=$1",[row.id,error instanceof Error?error.message:"Delivery worker error"]);}}
 }catch(error){console.error("[Aurelink webhook worker]",error instanceof Error?error.message:"unknown error");}
 finally{running=false;}
}
export function startAurelinkWebhookWorker(){if(timer)return;timer=setInterval(()=>void processWebhookQueue(),5000);void processWebhookQueue();}
export function stopAurelinkWebhookWorker(){if(timer)clearInterval(timer);timer=undefined;}
