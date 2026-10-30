import { Router, type Request } from "express";
import { isIP } from "node:net";
import { z } from "zod";
import { randomBytes, randomUUID, randomInt, createHash, createHmac, createCipheriv, createDecipheriv } from "node:crypto";
import { checkIP } from "../lib/ipapi";
import { resend } from "../lib/resend";
import jwt from "jsonwebtoken";
import { pool } from "../database/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { emailService } from "../services/auth/email.service";

const router = Router();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ip = (req: Request) => String(req.ip ?? "").replace(/^::ffff:/, "").slice(0,45);
const clientIp = (req: Request) => ip(req);
const agent = (req: Request) => String(req.get("user-agent") ?? "").slice(0,1000);
function jwtSecret() { const v=process.env.JWT_ACCESS_SECRET; if(!v) throw new Error("JWT_ACCESS_SECRET is not configured."); return v; }
function refreshSecret() { const v=process.env.JWT_REFRESH_SECRET; if(!v) throw new Error("JWT_REFRESH_SECRET is not configured."); return v; }
const weakPasswords=new Set(["123456","1234567","12345678","123456789","1234567890","password","password1","password123","qwerty","qwerty123","abc123","111111","000000","letmein","welcome","iloveyou","admin","admin123","123123","654321","passw0rd","changeme"]);
function validPassword(v:string) {
 if(v.length<6||v.length>200) throw new Error("Password must be between 6 and 200 characters.");
 if(!/[A-Za-z]/.test(v)||!/[0-9]/.test(v)) throw new Error("Choose a password with at least one letter and one number.");
 if(/\p{Extended_Pictographic}/u.test(v)||/[\u200D\uFE0F]/u.test(v)) throw new Error("Passwords cannot contain emoji characters.");
 if(weakPasswords.has(v.toLowerCase())||/^(.)\1{5,}$/.test(v)||/^(012345|123456|234567|345678|456789|qwerty|asdfgh|zxcvbn)/i.test(v)) throw new Error("This password is too common or easy to guess. Choose a different password.");
}
function validPersonName(v:string) {
 const normalized=v.trim().replace(/\s+/g," ");
 if(normalized.length<2||normalized.length>100||!/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(normalized)) throw new Error("Enter a name using letters, spaces, apostrophes, or hyphens only. Numbers and emoji are not accepted.");
 return normalized;
}
async function enforceAurelinkIpAllowlist(userId:string,sourceIp:string) {
 const row=(await pool.query("SELECT enabled,entries FROM aurelink_ip_allowlists WHERE user_id=$1",[userId])).rows[0];
 if(!row?.enabled||!Array.isArray(row.entries)||!row.entries.length)return;
 const allowed=row.entries.some((entry:string)=>{const [base,prefix]=entry.split("/");const version=isIP(base);if(!version||version!==isIP(sourceIp))return false;const bits=version===4?32:128,n=prefix===undefined?bits:Number(prefix);if(!Number.isInteger(n)||n<0||n>bits)return false;if(version===4){const toN=(s:string)=>s.split(".").reduce((v,x)=>(v<<8n)|BigInt(Number(x)),0n),shift=BigInt(bits-n);return(toN(sourceIp)>>shift)===(toN(base)>>shift);}const toN=(s:string)=>{let v=s.toLowerCase();if(v.includes(".")){const parts=v.split(":");const last=parts.pop()!,n=last.split(".").reduce((a,x)=>(a<<8n)|BigInt(Number(x)),0n);parts.push(((n>>16n)&65535n).toString(16),(n&65535n).toString(16));v=parts.join(":");}const halves=v.split("::"),left=halves[0]?halves[0].split(":"):[],right=halves[1]?halves[1].split(":"):[],groups=halves.length===2?[...left,...Array(8-left.length-right.length).fill("0"),...right]:left;if(groups.length!==8)return -1n;return groups.reduce((a,x)=>(a<<16n)|BigInt(parseInt(x||"0",16)),0n);},shift=BigInt(bits-n);return(toN(sourceIp)>>shift)===(toN(base)>>shift);});
 if(!allowed)throw Object.assign(new Error("This IP address is not on your Aurelink allowlist. Use verified-email recovery."),{status:403,code:"AURELINK_IP_NOT_ALLOWED"});
}
async function startSession(req:Request,user:{id:string;email:string}) {
  const sessionId = randomUUID();
  const accessToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},jwtSecret(),{expiresIn:"15m"});
  const refreshToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},refreshSecret(),{expiresIn:"30d"});
  await pool.query("INSERT INTO aurelink_sessions(id,user_id,refresh_token_hash,device_id,device_name,platform,browser,user_agent,ip_address,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+INTERVAL '30 days')",[sessionId,user.id,hash(refreshToken),String(req.body?.deviceId??"").slice(0,255)||null,String(req.body?.deviceName??"").slice(0,255)||null,String(req.body?.platform??"").slice(0,100)||null,String(req.body?.browser??"").slice(0,100)||null,agent(req),clientIp(req)]);
  await pool.query("INSERT INTO aurelink_login_history(user_id,session_id,ip_address,user_agent,event_type) VALUES($1,$2,$3,$4,'login')",[user.id,sessionId,clientIp(req),agent(req)]);
  await pool.query("UPDATE aurelink_users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1",[user.id]);
  const device=String(req.body?.deviceName??"Device not identified").slice(0,150).replace(/[&<>"']/g,"");
  const platform=String(req.body?.platform??"Unknown").slice(0,80).replace(/[&<>"']/g,"");
  const browser=String(req.body?.browser??"Unknown").slice(0,80).replace(/[&<>"']/g,"");
  const securityToken=randomBytes(32).toString("base64url");
  const securityExpires=new Date(Date.now()+5*60*1000);
  await pool.query("CREATE TABLE IF NOT EXISTS aurelink_session_security_actions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE, session_id UUID NOT NULL REFERENCES aurelink_sessions(id) ON DELETE CASCADE, token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO aurelink_session_security_actions(user_id,session_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",[user.id,sessionId,hash(securityToken),securityExpires]);
  const securityLink=aurelinkAppBase()+"/?screen=session-security&token="+encodeURIComponent(securityToken);
  const safeEmailName=String(user.first_name??"there").replace(/[&<>"']/g,"");
  const safeIp=clientIp(req).replace(/[&<>"']/g,"");
  void resend.emails.send({from:aurelinkSender(),to:user.email,subject:"New sign-in to Aurelink",html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#17263b"><h2>Aurelink sign-in alert</h2><p>Hello ${safeEmailName}, a sign-in to your account just occurred.</p><p><b>Device:</b> ${device}<br><b>Platform:</b> ${platform}<br><b>Browser:</b> ${browser}<br><b>IP address:</b> ${safeIp}<br><b>Time:</b> ${new Date().toISOString()} UTC</p><p>If this was you, no action is needed. If it wasn't, use the secure link below within five minutes.</p><p><a href="${securityLink}" style="display:inline-block;background:#126ac2;color:#fff;text-decoration:none;padding:14px 22px;border-radius:7px;font-weight:bold">Review sign-in and secure account</a></p><p>The one-time link lets you change your password and sign out all sessions, or terminate only this session. It expires in five minutes.</p></div>`}).catch(()=>undefined);
  return {accessToken,refreshToken,expiresIn:900,sessionId};
}
router.post("/aurelink/auth/register",(_req,res)=>res.status(410).json({success:false,message:"Direct registration is disabled. Use the email-confirmation signup flow."}));
router.post("/aurelink/auth/login",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255),password:z.string().min(1).max(200),clientIp:z.string().optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Valid email and password are required."});
  try{
    const email=emailService.normalize(parsed.data.email);
    const found=await pool.query("SELECT id,email,first_name,last_name,password_hash,email_verified,account_status FROM aurelink_users WHERE LOWER(email)=LOWER($1) LIMIT 1",[email]);
    const user=found.rows[0];
    if(!user || user.email_verified!==true || !await verifyPassword(parsed.data.password,String(user.password_hash))) {
      await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,failure_reason) VALUES($1,'login',FALSE,$2,$3,'invalid_credentials')",[user?.id??null,clientIp(req),agent(req)]).catch(()=>undefined);
      return res.status(401).json({success:false,message:"Invalid email or password."});
    }
    if(user.account_status!=="active")return res.status(403).json({success:false,message:"This Aurelink account is not active."});
    await enforceAurelinkIpAllowlist(user.id,clientIp(req));
    const sec=await pool.query("SELECT two_factor_enabled,two_factor_method,totp_enabled FROM aurelink_account_security WHERE user_id=$1",[user.id]);
    if(sec.rows[0]?.two_factor_enabled && !sec.rows[0]?.totp_enabled) return res.status(423).json({success:false,code:"AURELINK_2FA_METHOD_UNAVAILABLE",message:"This account has a legacy two-factor method that cannot be verified in this sign-in flow. Contact Aurelink Support; password-only sign-in remains blocked."});
    if(sec.rows[0]?.two_factor_enabled && sec.rows[0]?.totp_enabled) {
      const challenge=await pool.query("INSERT INTO aurelink_totp_login_challenges(user_id,device_id,ip_address,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '5 minutes') RETURNING id,expires_at",[user.id,String(req.body?.deviceId??"").slice(0,255)||null,clientIp(req)]);
      await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,device_name,platform,browser) VALUES($1,'login_2fa_required',FALSE,$2,$3,$4,$5,$6)",[user.id,clientIp(req),agent(req),req.body?.deviceName??null,req.body?.platform??null,req.body?.browser??null]);
      return res.status(202).json({success:false,requiresTwoFactor:true,challengeId:challenge.rows[0].id,expiresAt:challenge.rows[0].expires_at,message:"Enter the current code from your authenticator app."});
    }
    const session=await startSession(req,{id:user.id,email:user.email});
    await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'auth.login',$2,$3)",[user.id,clientIp(req),agent(req)]);
    delete user.password_hash;
    return res.json({success:true,user,session});
  }catch(e){const status=Number((e as any)?.status)||500;return res.status(status).json({success:false,code:(e as any)?.code,message:status===500?"Aurelink login failed.":(e instanceof Error?e.message:"Login blocked.")});}
});
router.post("/aurelink/auth/session-security/action",async(req,res)=>{
 const parsed=z.object({token:z.string().min(20).max(300),action:z.enum(["logout-session","change-password"]),password:z.string().min(6).max(200).optional(),confirmPassword:z.string().min(6).max(200).optional()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({success:false,message:"A valid security action is required."});
 try{const client=await pool.connect();try{await client.query("BEGIN");const found=await client.query("SELECT a.id,a.user_id,a.session_id,u.email FROM aurelink_session_security_actions a JOIN aurelink_users u ON u.id=a.user_id WHERE a.token_hash=$1 AND a.consumed_at IS NULL AND a.expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);const action=found.rows[0];if(!action){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"This security link is invalid, expired, or already used."});}
 if(parsed.data.action==="logout-session"){await client.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW(),revoked_reason='security_action',revoked_by='user' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",[action.session_id,action.user_id]);}
 else{if(!parsed.data.password||parsed.data.password!==parsed.data.confirmPassword){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Enter matching new passwords."});}validPassword(parsed.data.password);const passwordHash=await hashPassword(parsed.data.password);await client.query("UPDATE aurelink_users SET password_hash=$2,updated_at=NOW() WHERE id=$1",[action.user_id,passwordHash]);await client.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW(),revoked_reason='password_or_reset',revoked_by='security' WHERE user_id=$1 AND revoked_at IS NULL",[action.user_id]);}
 await client.query("UPDATE aurelink_session_security_actions SET consumed_at=NOW() WHERE id=$1",[action.id]);await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",[action.user_id,parsed.data.action==="logout-session"?"auth.email_session_logout":"auth.email_password_change",ip(req),agent(req),JSON.stringify({sessionId:action.session_id})]);await client.query("COMMIT");void resend.emails.send({from:aurelinkSender(),to:action.email,subject:"Aurelink security action completed",html:"<p>Your requested Aurelink security action was completed successfully.</p>"}).catch(()=>undefined);return res.json({success:true,message:parsed.data.action==="logout-session"?"The reported session has been signed out.":"Your password has been changed and all sessions have been signed out."});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}}catch{return res.status(400).json({success:false,message:"Unable to complete this security action."});}
});
router.get("/aurelink/auth/me",aurelinkAuthMiddleware,async(req,res)=>{
  const r=await pool.query("SELECT id,account_id,email,first_name,last_name,email_verified,phone_number,phone_verified,account_status,created_at,last_login_at FROM aurelink_users WHERE id=$1",[req.user!.userId]);
  if(!r.rows[0])return res.status(404).json({success:false,message:"Account not found."});
  const security=await pool.query("SELECT two_factor_enabled,two_factor_method,totp_enabled FROM aurelink_account_security WHERE user_id=$1",[req.user!.userId]);
  return res.json({success:true,user:r.rows[0],security:security.rows[0]??{two_factor_enabled:false,two_factor_method:"off",totp_enabled:false}});
});
router.post("/aurelink/auth/logout",aurelinkAuthMiddleware,async(req,res)=>{
  await pool.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW(),revoked_reason='user_sign_out',revoked_by='user' WHERE id=$1 AND user_id=$2",[req.user!.sessionId,req.user!.userId]);
  await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'auth.logout',$2,$3)",[req.user!.userId,ip(req),agent(req)]);
  return res.json({success:true,message:"Signed out."});
});
router.post("/aurelink/auth/refresh",async(req,res)=>{
  const parsed=z.object({refreshToken:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Refresh token is required."});
  try{
    const payload=jwt.verify(parsed.data.refreshToken,refreshSecret()) as {userId?:string;sessionId?:string;audience?:string};
    if(payload.audience!=="aurelink"||!payload.userId||!payload.sessionId)throw new Error("invalid");
    const session=await pool.query("SELECT s.id,u.email,u.account_status FROM aurelink_sessions s JOIN aurelink_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.refresh_token_hash=$3 ",[payload.sessionId,payload.userId,hash(parsed.data.refreshToken)]);
    await enforceAurelinkIpAllowlist(payload.userId,ip(req));
    if(!session.rows[0]||session.rows[0].account_status!=="active")throw new Error("invalid");
    const accessToken=jwt.sign({userId:payload.userId,sessionId:payload.sessionId,audience:"aurelink"},jwtSecret(),{expiresIn:"15m"});
    const refreshToken=jwt.sign({userId:payload.userId,sessionId:payload.sessionId,audience:"aurelink"},refreshSecret(),{expiresIn:"30d"});
    await pool.query("UPDATE aurelink_sessions SET refresh_token_hash=$2,expires_at=NOW()+INTERVAL '30 days',updated_at=NOW() WHERE id=$1",[payload.sessionId,hash(refreshToken)]);
    return res.json({success:true,session:{accessToken,refreshToken,expiresIn:900,sessionId:payload.sessionId}});
  }catch{return res.status(401).json({success:false,message:"Invalid, expired or revoked Aurelink refresh token."});}
});
// AUTH keys are separate from reset tokens. Never embed an AUTH key in a reset URL.
const authKeyAlphabet="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const authKeyPatterns=[
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kM+aM+aF,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kF+aF+kM+aL,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kL+aL+kM+aF,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kM+aF+kF+aL,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kF+aM+kM+aF,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kM+aL+kF+aM,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kF+aL+kM+aF+aM,
  (kF:string,kM:string,kL:string,aF:string,aM:string,aL:string)=>kL+aF+kM+aM+aL
];
function authEncryptionKey(){const secret=process.env.AURELINK_AUTH_KEY_ENCRYPTION_SECRET||process.env.AURELINK_AUTH_KEY_ROTATION_SECRET||process.env.JWT_ACCESS_SECRET;if(!secret||secret.length<32)throw new Error("Configure AURELINK_AUTH_KEY_ENCRYPTION_SECRET (32+ characters) or a 32+ character JWT_ACCESS_SECRET.");return createHash("sha256").update(secret).update("|AURELINK_ASAK24_ENCRYPTION_V1").digest();}
function encryptAuthKey(value:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",authEncryptionKey(),iv);const ciphertext=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");}
function decryptAuthKey(value:string){const parts=value.split(".");if(parts.length!==3)throw new Error("Invalid encrypted ASAK-24 value.");const decipher=createDecipheriv("aes-256-gcm",authEncryptionKey(),Buffer.from(parts[0],"base64url"));decipher.setAuthTag(Buffer.from(parts[1],"base64url"));return Buffer.concat([decipher.update(Buffer.from(parts[2],"base64url")),decipher.final()]).toString("utf8");}
function authRotationSecret(){
  const secret=process.env.AURELINK_AUTH_KEY_ROTATION_SECRET;
  if(!secret||secret.length<32) throw new Error("AURELINK_AUTH_KEY_ROTATION_SECRET must be configured with at least 32 characters.");
  return secret;
}
function maskAccountId(value:string){
  const id=String(value);
  if(!/^(?:\d{10}|\d{12})$/.test(id)) return "••••";
  return id.slice(0,4)+"•".repeat(id.length-8)+id.slice(-4);
}
function maskAuthKey(value:string){
  if(value.length!==20&&value.length!==24) return "••••";
  return value.slice(0,4)+"X".repeat(value.length-8)+value.slice(-4);
}
function makeRandomAuthKey(length:number){
  if(length!==20&&length!==24) throw new Error("ASAK-24 keys must be 20 or 24 characters.");
  return Array.from({length},()=>authKeyAlphabet[randomInt(authKeyAlphabet.length)]).join("");
}
function rotateAuthKey(accountId:string,currentKey:string,period:number){
  const secret=authRotationSecret();
  const aF=accountId.slice(0,4),aM=accountId.length===12?accountId.slice(4,8):accountId.slice(4,6),aL=accountId.slice(-4);
  const kF=currentKey.slice(0,4),kM=currentKey.slice(4,-4),kL=currentKey.slice(-4);
  const patternDigest=createHash("sha256").update(createHmac("sha256",secret).update("AURELINK_PATTERN|"+accountId+"|"+period).digest()).digest();
  const patternIndex=patternDigest[0]%authKeyPatterns.length;
  const patternCore=authKeyPatterns[patternIndex](kF,kM,kL,aF,aM,aL);
  // HMAC is deterministic for this account/key/period; only the server-held secret can derive the new middle.
  // Domain separation prevents this derivation from being reused for another purpose.
  const digest=createHmac("sha256",secret).update("AURELINK_AUTH_ROTATION_V1|"+accountId+"|"+period+"|"+patternIndex+"|"+patternCore+"|"+currentKey).digest();
  let middle="";
  for(let i=0;i<currentKey.length-8;i++) middle+=authKeyAlphabet[digest[i%digest.length]%authKeyAlphabet.length];
  return {key:kF+middle+kL,patternIndex};
}
async function ensureAuthKeySchema(client:any){
  await client.query("CREATE TABLE IF NOT EXISTS aurelink_account_auth_keys (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL UNIQUE REFERENCES aurelink_users(id) ON DELETE CASCADE, account_id VARCHAR(32) NOT NULL UNIQUE, key_hash CHAR(64) NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), key_version INTEGER NOT NULL DEFAULT 1, stable_prefix VARCHAR(4), stable_suffix VARCHAR(4), revoked_at TIMESTAMPTZ NULL, encrypted_key TEXT NULL)");
  await client.query("ALTER TABLE aurelink_account_auth_keys ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ADD COLUMN IF NOT EXISTS key_version INTEGER NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS stable_prefix VARCHAR(4), ADD COLUMN IF NOT EXISTS stable_suffix VARCHAR(4), ADD COLUMN IF NOT EXISTS encrypted_key TEXT NULL");
}
// Existing signed-in users can bind an AUTH key once. This route never accepts an arbitrary user ID.
router.post("/aurelink/auth/account-auth-key/bind",aurelinkAuthMiddleware,async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await ensureAuthKeySchema(client);
    const found=await client.query("SELECT id,account_id,email,first_name,created_at FROM aurelink_users WHERE id=$1 AND account_status='active' FOR UPDATE",[req.user!.userId]);
    const user=found.rows[0];
    if(!user){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"Active Aurelink account not found."});}
    if(Date.now()-new Date(user.created_at).getTime()<24*60*60*1000){await client.query("ROLLBACK");return res.status(403).json({success:false,code:"AURELINK_ASAK24_AGE_GATE",message:"ASAK-24 binding becomes available after your account has been active for 24 hours."});}
    const prior=await client.query("SELECT id FROM aurelink_account_auth_keys WHERE user_id=$1",[user.id]);
    if(prior.rows[0]){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"An AUTH key is already bound to this account. Use the recovery or rotation flow."});}
    const accountId=String(user.account_id);
    if(!/^(?:\d{10}|\d{12})$/.test(accountId)){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"This account has an unsupported Account ID format. Contact Aurelink Support."});}
    const key=makeRandomAuthKey(accountId.length===10?20:24);
    await client.query("INSERT INTO aurelink_account_auth_keys(user_id,account_id,key_hash,stable_prefix,stable_suffix,encrypted_key) VALUES($1,$2,$3,$4,$5,$6)",[user.id,String(user.account_id),hash(key),key.slice(0,4),key.slice(-4),encryptAuthKey(key)]);
    await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.account_key.bound',$2,$3,$4::jsonb)",[user.id,ip(req),agent(req),JSON.stringify({keyVersion:1,source:"authenticated_existing_account"})]);
    await client.query("COMMIT");
    const html=`<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#182230"><div style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-radius:14px"><h1 style="color:#173b78">AURELINK</h1><p>Hello ${escapeHtml(String(user.first_name||"there"))},</p><p>Aurelink has introduced ASAK-24 (Aurelink Sequential Authentication Key) to strengthen account authentication and security.</p><p>Your account has been included in Aurelink's security migration.</p><p><strong>Account ID:</strong> ${escapeHtml(maskAccountId(String(user.account_id)))}</p><p><strong>Security upgrade:</strong> ASAK-24 authentication</p><p><strong>ASAK-24 key (masked):</strong> ${escapeHtml(maskAuthKey(key))}</p><p><strong>Migration status:</strong> Completed</p><p>Your existing Account ID remains unchanged. No further action is required at this time.</p><p>Never share your full authentication key, password, or verification codes with anyone. If you did not expect this notification or suspect unauthorized activity, access Aurelink through its official application and contact support.</p><p>Regards,<br><strong>Jess Ursa</strong><br>Aurelink Security Team</p></div></body></html>`;
    try{const sent=await resend.emails.send({from:aurelinkSender(),to:user.email,subject:"Your Aurelink account ASAK-24 key",html});if(sent.error)return res.status(503).json({success:false,code:"AURELINK_KEY_EMAIL_FAILED",message:"The key was created but email delivery failed. Contact support before retrying."});}
    catch{return res.status(503).json({success:false,code:"AURELINK_KEY_EMAIL_FAILED",message:"The key was created but email delivery failed. Contact support before retrying."});}
    return res.status(201).json({success:true,message:"ASAK-24 key bound internally. Only its masked identifier was emailed."});
  }catch{
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(500).json({success:false,message:"Unable to bind an AUTH key. Verify server rotation-secret configuration and try again."});
  }finally{client.release();}
});

/** Idempotent, token-protected ASAK-24 migration. */
async function ensureAsakMigrationSchema(client:any){
  await ensureAuthKeySchema(client);
  await client.query("CREATE TABLE IF NOT EXISTS aurelink_asak_migrations (user_id UUID PRIMARY KEY REFERENCES aurelink_users(id) ON DELETE CASCADE, account_id VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'bound', email_status VARCHAR(24) NOT NULL DEFAULT 'pending', email_attempts INTEGER NOT NULL DEFAULT 0, last_email_error TEXT, bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notified_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await client.query("CREATE INDEX IF NOT EXISTS aurelink_asak_migrations_email_retry_idx ON aurelink_asak_migrations(email_status,updated_at)");
}
function asakAdminAuthorized(req:Request){
  const expected=process.env.AURELINK_ASAK_MIGRATION_TOKEN;
  const supplied=String(req.get("x-aurelink-migration-token")||"");
  return !!expected && expected.length>=32 && supplied.length>0 && hash(supplied)===hash(expected);
}
async function sendAsakMigrationNotice(user:any){
  const maskedId=maskAccountId(String(user.account_id));
  const maskedKey=String(user.key_prefix||"••••")+"X".repeat(Math.max(0,Number(user.key_length||20)-8))+String(user.key_suffix||"••••");
  const html='<!doctype html><html><body style="font-family:Arial,sans-serif;color:#182230"><h1>AURELINK</h1><p>Hello '+escapeHtml(String(user.first_name||"there"))+',</p><p>Aurelink has introduced ASAK-24 (Aurelink Sequential Authentication Key) to strengthen account authentication and security.</p><p>Your account has been included in the Aurelink security migration.</p><p><strong>Account ID:</strong> '+escapeHtml(maskedId)+'</p><p><strong>Security upgrade:</strong> ASAK-24 authentication</p><p><strong>ASAK-24 key (masked):</strong> '+escapeHtml(maskedKey)+'</p><p><strong>Migration status:</strong> Completed</p><p>Your existing Account ID remains unchanged. No further action is required at this time.</p><p>The full key is never displayed to users. Never share passwords or verification codes.</p><p>Regards,<br><strong>Jess Ursa</strong><br>Aurelink Security Team</p></body></html>';
  const result=await resend.emails.send({from:aurelinkSender(),to:user.email,subject:"Aurelink Security Upgrade — ASAK-24 Account Protection",html});
  if(result.error) throw new Error(String(result.error.message||"Email provider rejected notification"));
  return result.data?.id||null;
}
// Automatically bind existing eligible accounts after deployment; signup handles future accounts inline.
async function runInitialAsak24Binding(){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await ensureAsakMigrationSchema(client);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{client.release();}
  let boundTotal=0,sentTotal=0,failedTotal=0;
  for(let batch=0;batch<100;batch++){
    const c=await pool.connect();const notices:any[]=[];let count=0;
    try{
      await c.query("BEGIN");
      const candidates=await c.query("SELECT u.id,u.account_id,u.email,u.first_name FROM aurelink_users u LEFT JOIN aurelink_account_auth_keys k ON k.user_id=u.id WHERE k.user_id IS NULL AND u.account_status='active' AND u.email_verified=TRUE AND u.created_at<=NOW()-INTERVAL '1 day' AND u.account_id ~ '^[0-9]{10}$|^[0-9]{12}$' ORDER BY u.created_at LIMIT 50 FOR UPDATE OF u SKIP LOCKED");
      for(const user of candidates.rows){
        const accountId=String(user.account_id);
        const key=makeRandomAuthKey(accountId.length===10?20:24);
        const ins=await c.query("INSERT INTO aurelink_account_auth_keys(user_id,account_id,key_hash,stable_prefix,stable_suffix,encrypted_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",[user.id,accountId,hash(key),key.slice(0,4),key.slice(-4),encryptAuthKey(key)]);
        if(!ins.rows[0]) continue;
        await c.query("INSERT INTO aurelink_asak_migrations(user_id,account_id,status,email_status) VALUES($1,$2,'bound','pending') ON CONFLICT(user_id) DO UPDATE SET status='bound',email_status=CASE WHEN aurelink_asak_migrations.email_status='sent' THEN 'sent' ELSE 'pending' END,updated_at=NOW(),bound_at=NOW()",[user.id,accountId]);
        await c.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.asak24.migration.bound',$2::jsonb)",[user.id,JSON.stringify({accountIdMasked:maskAccountId(accountId),keyLength:key.length,source:"startup_migration"})]);
        notices.push({id:user.id,account_id:accountId,email:user.email,first_name:user.first_name,key_prefix:key.slice(0,4),key_suffix:key.slice(-4),key_length:key.length});
        count++;
      }
      await c.query("COMMIT");
    }catch(error){await c.query("ROLLBACK").catch(()=>undefined);throw error;}
    finally{c.release();}
    boundTotal+=count;
    const pending=await pool.query("SELECT m.user_id AS id,m.account_id,u.email,u.first_name,k.stable_prefix AS key_prefix,k.stable_suffix AS key_suffix,CASE WHEN length(m.account_id)=10 THEN 20 ELSE 24 END AS key_length FROM aurelink_asak_migrations m JOIN aurelink_users u ON u.id=m.user_id JOIN aurelink_account_auth_keys k ON k.user_id=m.user_id WHERE m.email_status IN ('pending','failed') AND m.status='bound' ORDER BY m.updated_at LIMIT 50");
    for(const user of pending.rows) if(!notices.some(n=>n.id===user.id)) notices.push(user);
    for(const user of notices){
      try{
        const messageId=await sendAsakMigrationNotice(user);
        await pool.query("UPDATE aurelink_asak_migrations SET email_status='sent',notified_at=NOW(),email_attempts=email_attempts+1,last_email_error=NULL,updated_at=NOW() WHERE user_id=$1",[user.id]);
        await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.asak24.migration.notified',$2::jsonb)",[user.id,JSON.stringify({accountIdMasked:maskAccountId(String(user.account_id)),messageId})]);
        sentTotal++;
      }catch(error){
        const detail=String(error instanceof Error?error.message:"Email delivery failed").slice(0,500);
        await pool.query("UPDATE aurelink_asak_migrations SET email_status='failed',email_attempts=email_attempts+1,last_email_error=$2,updated_at=NOW() WHERE user_id=$1",[user.id,detail]).catch(()=>undefined);
        failedTotal++;
      }
    }
    if(count===0) break;
  }
  console.info("[ASAK-24] initial account binding finished",JSON.stringify({bound:boundTotal,emailsSent:sentTotal,emailsFailed:failedTotal}));
}
void runInitialAsak24Binding().catch(error=>console.error("[ASAK-24] startup binding failed",error instanceof Error?error.message:"unknown error"));
setInterval(()=>void runInitialAsak24Binding().catch(error=>console.error("[ASAK-24] scheduled binding failed",error instanceof Error?error.message:"unknown error")),60*60*1000).unref?.();

router.post("/aurelink/auth/admin/asak24/migrate",async(req,res)=>{
  if(!asakAdminAuthorized(req)) return res.status(401).json({success:false,message:"Unauthorized migration request."});
  const parsed=z.object({batchSize:z.number().int().min(1).max(100).optional(),retryEmails:z.boolean().optional()}).safeParse(req.body||{});
  if(!parsed.success) return res.status(400).json({success:false,message:"Invalid migration batch options."});
  const batchSize=parsed.data.batchSize||50;
  const client=await pool.connect();
  const notices:any[]=[];
  let newlyBound=0;
  try{
    await client.query("BEGIN");
    await ensureAsakMigrationSchema(client);
    const candidates=await client.query("SELECT u.id,u.account_id,u.email,u.first_name FROM aurelink_users u LEFT JOIN aurelink_account_auth_keys k ON k.user_id=u.id WHERE k.user_id IS NULL AND u.account_status='active' AND u.email_verified=TRUE AND u.created_at<=NOW()-INTERVAL '1 day' AND u.account_id ~ '^[0-9]{10}$|^[0-9]{12}$' ORDER BY u.created_at LIMIT $1 FOR UPDATE OF u SKIP LOCKED",[batchSize]);
    for(const user of candidates.rows){
      const accountId=String(user.account_id);
      if(!/^(?:[0-9]{10}|[0-9]{12})$/.test(accountId)) continue;
      const key=makeRandomAuthKey(accountId.length===10?20:24);
      const ins=await client.query("INSERT INTO aurelink_account_auth_keys(user_id,account_id,key_hash,stable_prefix,stable_suffix,encrypted_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",[user.id,accountId,hash(key),key.slice(0,4),key.slice(-4),encryptAuthKey(key)]);
      if(!ins.rows[0]) continue;
      await client.query("INSERT INTO aurelink_asak_migrations(user_id,account_id,status,email_status) VALUES($1,$2,'bound','pending') ON CONFLICT(user_id) DO UPDATE SET status='bound',email_status=CASE WHEN aurelink_asak_migrations.email_status='sent' THEN 'sent' ELSE 'pending' END,updated_at=NOW(),bound_at=NOW()",[user.id,accountId]);
      await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.asak24.migration.bound',$2::jsonb)",[user.id,JSON.stringify({accountIdMasked:maskAccountId(accountId),keyLength:key.length,source:"protected_bulk_migration"})]);
      notices.push({id:user.id,account_id:accountId,email:user.email,first_name:user.first_name,key_prefix:key.slice(0,4),key_suffix:key.slice(-4),key_length:key.length});
      newlyBound++;
    }
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(500).json({success:false,message:"ASAK-24 migration batch failed before commit."});
  }finally{client.release();}
  if(parsed.data.retryEmails){
    const pending=await pool.query("SELECT m.user_id AS id,m.account_id,u.email,u.first_name,k.stable_prefix AS key_prefix,k.stable_suffix AS key_suffix,CASE WHEN length(m.account_id)=10 THEN 20 ELSE 24 END AS key_length FROM aurelink_asak_migrations m JOIN aurelink_users u ON u.id=m.user_id JOIN aurelink_account_auth_keys k ON k.user_id=m.user_id WHERE m.email_status IN ('pending','failed') AND m.status='bound' ORDER BY m.updated_at LIMIT $1",[batchSize]);
    for(const user of pending.rows) if(!notices.some(n=>n.id===user.id)) notices.push(user);
  }
  let sent=0,failed=0;
  for(const user of notices){
    try{
      const messageId=await sendAsakMigrationNotice(user);
      await pool.query("UPDATE aurelink_asak_migrations SET email_status='sent',notified_at=NOW(),email_attempts=email_attempts+1,last_email_error=NULL,updated_at=NOW() WHERE user_id=$1",[user.id]);
      await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.asak24.migration.notified',$2::jsonb)",[user.id,JSON.stringify({accountIdMasked:maskAccountId(String(user.account_id)),messageId})]);
      sent++;
    }catch(error){
      const detail=String(error instanceof Error?error.message:"Email delivery failed").slice(0,500);
      await pool.query("UPDATE aurelink_asak_migrations SET email_status='failed',email_attempts=email_attempts+1,last_email_error=$2,updated_at=NOW() WHERE user_id=$1",[user.id,detail]).catch(()=>undefined);
      await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.asak24.migration.email_failed',$2::jsonb)",[user.id,JSON.stringify({accountIdMasked:maskAccountId(String(user.account_id)),error:detail})]).catch(()=>undefined);
      failed++;
    }
  }
  const totals=await pool.query("SELECT COUNT(*) FILTER(WHERE status='bound')::int AS bound,COUNT(*) FILTER(WHERE email_status='sent')::int AS notified,COUNT(*) FILTER(WHERE email_status IN ('pending','failed'))::int AS email_pending FROM aurelink_asak_migrations");
  return res.json({success:true,boundThisRun:newlyBound,emailsSentThisRun:sent,emailsFailedThisRun:failed,totals:totals.rows[0],hasMore:newlyBound===batchSize});
});

// ASAK-24 is an internal, server-managed account credential. A masked display is not an authentication factor.
router.post("/aurelink/auth/account-auth-key/verify",aurelinkAuthMiddleware,async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await ensureAuthKeySchema(client);
    const found=await client.query("SELECT k.*,u.email,u.first_name FROM aurelink_account_auth_keys k JOIN aurelink_users u ON u.id=k.user_id WHERE k.user_id=$1 AND k.revoked_at IS NULL AND u.account_status='active' FOR UPDATE OF k",[req.user!.userId]);
    const record=found.rows[0];
    if(!record){await client.query("ROLLBACK");return res.status(404).json({success:false,message:"No active ASAK-24 key is bound to this account."});}
    const baseDate=new Date(record.rotated_at??record.created_at);
    const due=Date.now()-baseDate.getTime()>=30*24*60*60*1000;
    if(!due){await client.query("COMMIT");return res.json({success:true,authorized:true,maskedKey:String(record.stable_prefix)+"•".repeat(String(record.account_id).length===10?12:16)+String(record.stable_suffix),keyVersion:Number(record.key_version??1),rotatesAt:new Date(baseDate.getTime()+30*24*60*60*1000).toISOString()});}
    const length=String(record.account_id).length===10?20:24;
    const nextKey=String(record.stable_prefix)+makeRandomAuthKey(length-8===12?20:24).slice(4,-4)+String(record.stable_suffix);
    await client.query("UPDATE aurelink_account_auth_keys SET key_hash=$2,rotated_at=NOW(),key_version=key_version+1 WHERE id=$1",[record.id,hash(nextKey)]);
    await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,metadata) VALUES($1,'auth.account_key.rotated',$2::jsonb)",[record.user_id,JSON.stringify({keyVersion:Number(record.key_version??1)+1,reason:"30_day_rotation",mode:"server_managed"})]);
    await client.query("COMMIT");
    const masked=maskAuthKey(nextKey);
    const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>AURELINK</h1><p>Hi ${escapeHtml(String(record.first_name||"there"))},</p><p>Your 30-day ASAK-24 rotation is complete.</p><p><strong>ASAK-24 key (masked):</strong> <code>${escapeHtml(masked)}</code></p><p>The full key is managed internally by Aurelink and is never disclosed. You do not need to enter this key.</p></div>`;
    void resend.emails.send({from:aurelinkSender(),to:record.email,subject:"Your Aurelink ASAK-24 key has rotated",html}).catch(()=>undefined);
    return res.json({success:true,authorized:true,rotated:true,maskedKey:masked,keyVersion:Number(record.key_version??1)+1,message:"ASAK-24 rotated securely. Only the masked identifier is available."});
  }catch{
    await client.query("ROLLBACK").catch(()=>undefined);
    return res.status(500).json({success:false,message:"Unable to check ASAK-24 status."});
  }finally{client.release();}
});
router.post("/aurelink/auth/password-reset/request",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255),clientIp:z.string().min(3).max(45)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Enter a valid email address and allow Aurelink to verify your network."});
  const suppliedIp=parsed.data.clientIp.trim();
  if(isIP(suppliedIp)===0||suppliedIp==="127.0.0.1"||suppliedIp==="::1"||suppliedIp.startsWith("127."))return res.status(400).json({success:false,message:"Aurelink could not verify your public IP address. Please retry."});
  const generic={success:true,message:"If an Aurelink account exists for this email, password recovery instructions will be sent."};
  try{
    let network:Awaited<ReturnType<typeof checkIP>>;
    try{network=await checkIP(suppliedIp);}catch{return res.status(503).json({success:false,code:"AURELINK_NETWORK_CHECK_UNAVAILABLE",message:"We couldn't verify this network securely. Please try again shortly."});}
    const blocked=network.is_bogon===true||network.is_crawler===true||network.is_datacenter===true||network.is_tor===true||network.is_proxy===true||network.is_vpn===true||network.is_abuser===true||network.bot_status===true||network.hosting===true||Boolean(network.egress_service)||network.fraud_score>=50;
    if(blocked){await pool.query("INSERT INTO aurelink_audit_logs(event_type,ip_address,user_agent,metadata) VALUES('auth.password_reset.blocked',$1,$2,$3::jsonb)",[suppliedIp,agent(req),JSON.stringify({reason:"network_risk_blocked"})]).catch(()=>undefined);return res.status(403).json({success:false,code:"AURELINK_NETWORK_BLOCKED",message:"This password-reset request was blocked because the network matched a high-risk signal. Turn off VPN or proxy services and try again from a normal connection."});}
    const found=await pool.query("SELECT id,account_id,email,first_name,last_name FROM aurelink_users WHERE LOWER(email)=LOWER($1) AND account_status='active'",[emailService.normalize(parsed.data.email)]);
    const user=found.rows[0];
    await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset.requested',$2,$3,$4::jsonb)",[user?.id??null,suppliedIp,agent(req),JSON.stringify({email:emailService.normalize(parsed.data.email),accountFound:Boolean(user),country:network.location?.country??null,city:network.location?.city??null})]);
    if(!user)return res.json(generic);
    const prior=await pool.query("SELECT ip_address FROM aurelink_login_history WHERE user_id=$1 AND success=TRUE ORDER BY created_at DESC LIMIT 100",[user.id]);
    const knownIps=new Set(prior.rows.map((r:any)=>String(r.ip_address??"")));
    const newNetwork=!knownIps.has(suppliedIp);
    const token=randomBytes(32).toString("base64url"); const expiresAt=new Date(Date.now()+5*60*1000);
    // Serialize reset requests per user so concurrent requests cannot send competing live links.
    const resetClient=await pool.connect();
    try {
      await resetClient.query("BEGIN");
      await resetClient.query("SELECT pg_advisory_xact_lock(hashtext($1))",[String(user.id)]);
      const active=await resetClient.query("SELECT id FROM aurelink_password_resets WHERE user_id=$1 AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1",[user.id]);
      if(active.rows[0]) {
        await resetClient.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset.duplicate_suppressed',$2,$3,$4::jsonb)",[user.id,suppliedIp,agent(req),JSON.stringify({reason:"active_reset_link_exists"})]).catch(()=>undefined);
        await resetClient.query("COMMIT");
        return res.json(generic);
      }
      await resetClient.query("UPDATE aurelink_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",[user.id]);
      await resetClient.query("CREATE TABLE IF NOT EXISTS aurelink_reset_token_context (token_hash CHAR(64) PRIMARY KEY, user_id UUID NOT NULL REFERENCES aurelink_users(id) ON DELETE CASCADE, ip_prefix VARCHAR(80) NOT NULL, country_code VARCHAR(8), company_name TEXT, asn BIGINT, user_agent_hash CHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ)");
      const ipPrefix=(value:string)=>value.includes(".")?value.split(".").slice(0,3).join(".")+".0/24":value.split(":").filter(Boolean).slice(0,4).join(":")+"::/64";
      await resetClient.query("INSERT INTO aurelink_reset_token_context(token_hash,user_id,ip_prefix,country_code,company_name,asn,user_agent_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[hash(token),user.id,ipPrefix(suppliedIp),network.location?.country_code??null,network.company?.name??network.ISP??network.organization??null,network.asn?.asn??network.ASN??null,hash(agent(req)),expiresAt]);
      await resetClient.query("INSERT INTO aurelink_password_resets(user_id,token_hash,expires_at,request_ip) VALUES($1,$2,$3,$4)",[user.id,hash(token),expiresAt,suppliedIp]);
      await resetClient.query("COMMIT");
    } catch(error) {
      await resetClient.query("ROLLBACK").catch(()=>undefined);
      throw error;
    } finally { resetClient.release(); }
    const base=aurelinkAppBase();
    const link=`${base}/?screen=reset-password&token=${encodeURIComponent(token)}`;
    const safeName=escapeHtml(String(user.first_name||"there"));
    const location=[network.location?.city,network.location?.state,network.location?.country].filter(Boolean).map(String).map(escapeHtml).join(", ")||"Unavailable";
    const maskedIp=suppliedIp.includes(".")?suppliedIp.split(".").map((v,i)=>i===3?"•••":v).join("."):suppliedIp.slice(0,12)+"…";
    const networkNote=newNetwork?"We received a password-reset request from a network IP address that does not appear in your recent successful Aurelink sign-in history.":"We received a password-reset request from an IP address recorded in your recent successful Aurelink sign-in history.";
    const html=`<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#17263b"><div style="max-width:600px;margin:24px auto;padding:32px;background:#fff;border-radius:14px"><h1 style="color:#173b78;letter-spacing:3px">AURELINK</h1><img src="https://aurelink-react.onrender.com/aurelink-account-preview.svg" alt="Aurelink sign-in, account creation, and account-ready screen reference" width="540" style="display:block;width:100%;max-width:540px;height:auto;margin:20px auto;border:1px solid #e1e7ef;border-radius:10px"><p>Hi ${safeName},</p><p>This is Aurelink Support. We received a request to reset the password for your account.</p><p>${networkNote}</p><p><strong>Request details</strong><br>IP address: ${escapeHtml(maskedIp)}<br>Approximate location: ${location}<br>Time: ${new Date().toISOString()} (UTC)<br>Account ID: ${escapeHtml(String(user.account_id))}</p><p style="text-align:center;margin:30px 0"><a href="${link}" style="display:inline-block;background:#126ac2;color:#fff;text-decoration:none;padding:15px 28px;border-radius:7px;font-weight:bold">Reset password</a></p><p>This secure link expires in <strong>5 minutes</strong> and can be used only once.</p><p>If you did not request this change, do not use the link. Your current password will remain unchanged unless the link is used. If you suspect unauthorized access, contact Aurelink Support.</p><p style="font-size:12px;color:#65758a">For your security, Aurelink will never ask you to send your password or verification code by email.</p><p>Aurelink Support</p></div></body></html>`;
    let result;
    try { result=await resend.emails.send({from:aurelinkSender(),to:user.email,subject:"Secure password reset | Aurelink",html}); }
    catch(error) {
      await pool.query("UPDATE aurelink_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL",[user.id,hash(token)]).catch(()=>undefined);
      throw error;
    }
    if(result.error) {
      await pool.query("UPDATE aurelink_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL",[user.id,hash(token)]).catch(()=>undefined);
      throw new Error(result.error.message);
    }
    return res.json(generic);
  }catch{return res.json(generic);}
});
router.post("/aurelink/auth/password-reset/complete",async(req,res)=>{
  const parsed=z.object({token:z.string().min(20).max(300),password:z.string().min(6).max(200),confirmPassword:z.string().min(6).max(200),clientIp:z.string().min(3).max(45)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"A valid reset token and password are required."});
  if(parsed.data.password!==parsed.data.confirmPassword)return res.status(400).json({success:false,message:"The passwords do not match."});
  try{
    validPassword(parsed.data.password);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const result=await client.query("SELECT id,user_id FROM aurelink_password_resets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);
      const contextResult=await client.query("SELECT * FROM aurelink_reset_token_context WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);
      const tokenContext=contextResult.rows[0];
      if(tokenContext) {
        let currentNetwork:Awaited<ReturnType<typeof checkIP>>;
        try { currentNetwork=await checkIP(parsed.data.clientIp); } catch { await client.query("ROLLBACK"); return res.status(503).json({success:false,message:"Aurelink could not verify this network securely. Reopen the email link and try again."}); }
        const currentPrefix=parsed.data.clientIp.includes(".")?parsed.data.clientIp.split(".").slice(0,3).join(".")+".0/24":parsed.data.clientIp.split(":").filter(Boolean).slice(0,4).join(":")+"::/64";
        const currentCountry=String(currentNetwork.location?.country_code??"").toUpperCase();
        const originalCountry=String(tokenContext.country_code??"").toUpperCase();
        const currentAsn=Number(currentNetwork.asn?.asn??currentNetwork.ASN??0);
        const originalAsn=Number(tokenContext.asn??0);
        const sameBrowser=hash(agent(req))===tokenContext.user_agent_hash;
        const ipRangeMatch=currentPrefix===tokenContext.ip_prefix;
        const asnMatch=Boolean(originalAsn&&currentAsn&&originalAsn===currentAsn);
        const normalizeProvider=(value:unknown)=>{
          let name=String(value??"").toLowerCase().replace(/\\b(nigeria|nigerian|ng|ghana|gh|kenya|ke|south africa|za)\\b/g," ").replace(/[^a-z0-9]+/g," ").trim();
          return name.replace(/\\s+/g," ");
        };
        const provider=normalizeProvider(currentNetwork.company?.name??currentNetwork.ISP??currentNetwork.organization);
        const originalProvider=normalizeProvider(tokenContext.company_name);
        // Match recognizable carrier/provider names despite IPAPI country suffixes such as
        // "MTN NG" versus "MTN Nigeria". Exact normalized identity is required.
        const providerMatch=Boolean(provider&&originalProvider&&provider===originalProvider);
        // Network identity uses OR semantics: any one reliable identifier is sufficient.
        // Country/ASN/provider differences must not veto a positive match from another identifier.
        const networkMatch=ipRangeMatch||asnMatch||providerMatch;
        const mismatch=!sameBrowser||!networkMatch;
        if(mismatch) {
          await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset.context_mismatch',$2,$3,$4::jsonb)",[tokenContext.user_id,parsed.data.clientIp,agent(req),JSON.stringify({sameBrowser,ipRangeMatch,asnMatch,providerMatch,originalProvider,currentProvider:provider,originalAsn:originalAsn||null,currentAsn:currentAsn||null,originalCountry:originalCountry||null,currentCountry:currentCountry||null})]).catch(()=>undefined);
          await client.query("ROLLBACK");
          return res.status(403).json({success:false,code:"AURELINK_RESET_CONTEXT_MISMATCH",message:"For your security, this reset link must be opened in the same browser and a matching network as the request. Reopen the email on the original device and network. If your connection changed, request a new link."});
        }
      }
      const reset=result.rows[0];
      if(!reset){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Reset link is invalid or expired."});}
      const current=await client.query("SELECT password_hash,email,first_name,last_name,account_id FROM aurelink_users WHERE id=$1 FOR UPDATE",[reset.user_id]);
      if(!current.rows[0]){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"This account could not be found. Request a new reset link."});}
      if(await verifyPassword(parsed.data.password,String(current.rows[0].password_hash))){await client.query("ROLLBACK");return res.status(400).json({success:false,code:"AURELINK_PASSWORD_UNCHANGED",message:"Your new password must be different from your current password."});}
      const passwordHash=await hashPassword(parsed.data.password);
      await client.query("UPDATE aurelink_users SET password_hash=$2,updated_at=NOW() WHERE id=$1",[reset.user_id,passwordHash]);
      await client.query("UPDATE aurelink_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",[reset.user_id]);
      await client.query("UPDATE aurelink_reset_token_context SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",[reset.user_id]);
      await client.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW(),revoked_reason='password_or_reset',revoked_by='security' WHERE user_id=$1 AND revoked_at IS NULL",[reset.user_id]);
      await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset',$2,$3,$4::jsonb)",[reset.user_id,ip(req),agent(req),JSON.stringify({timezoneSource:"ip_geolocation",notification:"password_change_confirmation"})]);
      await client.query("COMMIT");

      // Send a security confirmation only after the password update has committed.
      // Resolve the display timezone from the actual client IP, not the server or UTC.
      try {
        const changedIp=parsed.data.clientIp;
        let network:Awaited<ReturnType<typeof checkIP>>|null=null;
        try { network=await checkIP(changedIp); } catch { network=null; }
        const timezone=String(network?.location?.timezone||"UTC");
        const changedAt=new Date();
        let localTime:string;
        const formatLocalTime=(zone:string)=>{
          const parts=new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"2-digit",minute:"2-digit",hour12:true,day:"numeric",month:"long",year:"numeric"}).formatToParts(changedAt);
          const part=(type:string)=>parts.find(item=>item.type===type)?.value??"";
          const day=Number(part("day"));
          const ordinal=day%100>=11&&day%100<=13?"th":day%10===1?"st":day%10===2?"nd":day%10===3?"rd":"th";
          return part("hour")+":"+part("minute")+part("dayPeriod").toLowerCase()+" "+day+ordinal+", "+part("month")+" "+part("year");
        };
        try {
          localTime=formatLocalTime(timezone);
        } catch {
          localTime=formatLocalTime("UTC")+" (UTC; IP timezone unavailable)";
        }
        const displayLocation=[network?.location?.city,network?.location?.state,network?.location?.country].filter(Boolean).map(String).join(", ")||"Unavailable";
        const firstName=escapeHtml(String(current.rows[0].first_name||"there"));
        const accountId=escapeHtml(String(current.rows[0].account_id||"Unavailable"));
        const safeIp=escapeHtml(changedIp);
        const safeLocation=escapeHtml(displayLocation);
        const loginLink=aurelinkAppBase()+"/?screen=login";
        const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#17263b"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e1e7ef;border-radius:12px;overflow:hidden"><div style="padding:26px 30px;background:#173b78;color:#fff"><div style="font-size:23px;font-weight:700;letter-spacing:3px">AURELINK</div><div style="margin-top:7px;font-size:13px;color:#dce9fa">Account Security Notification</div></div><div style="padding:30px"><p style="margin:0 0 18px">Hello ${firstName},</p><h1 style="margin:0 0 16px;font-size:23px;line-height:1.35;color:#173b78">Your password was successfully changed</h1><p style="line-height:1.65;margin:0 0 22px">This email confirms that the password for your Aurelink account was successfully changed. All existing sessions were signed out as a security precaution. Sign in again using your new password.</p><div style="padding:18px;background:#f5f8fc;border:1px solid #dce5ef;border-radius:8px"><div style="font-size:12px;font-weight:700;letter-spacing:.6px;color:#53657c;text-transform:uppercase;margin-bottom:12px">Password change details</div><p style="margin:7px 0"><strong>Account ID:</strong> ${accountId}</p><p style="margin:7px 0"><strong>IP address:</strong> ${safeIp}</p><p style="margin:7px 0"><strong>Approximate location:</strong> ${safeLocation}</p><p style="margin:7px 0"><strong>Time:</strong> On ${escapeHtml(localTime)} (${escapeHtml(timezone)})</p></div><div style="margin:24px 0;padding:17px;border-left:4px solid #c43b3b;background:#fff6f5"><p style="margin:0 0 8px;font-weight:700;color:#9f2525">Did you make this change?</p><p style="margin:0;line-height:1.6">If you did not change your password, your account may be at risk. Secure your account immediately and contact Aurelink Support. Do not ignore this notification.</p></div><h2 style="font-size:16px;color:#173b78;margin:24px 0 10px">Recommended security actions</h2><ul style="padding-left:20px;line-height:1.7;margin-top:8px"><li>Enable two-factor authentication (2FA) when available.</li><li>Whitelist only trusted IP ranges and block access from other ranges when IP access controls become available in your Aurelink dashboard.</li><li>Changing your account email will be available soon in the dashboard.</li><li>Use a unique password and never share it or your verification codes.</li></ul><p style="text-align:center;margin:28px 0"><a href="${loginLink}" style="display:inline-block;padding:14px 26px;background:#087be5;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Sign in to Aurelink</a></p><p style="font-size:12px;line-height:1.6;color:#66758a">For your protection, Aurelink Support will never ask you to email your password or one-time verification code. If this activity was not yours, contact Aurelink Support through the official Aurelink service.</p><p style="margin:24px 0 0;line-height:1.6">Regards,<br><strong>Aurelink Support</strong><br>Aurelink Account Security</p></div><div style="padding:16px 30px;background:#f7f9fc;border-top:1px solid #e7edf4;font-size:11px;color:#718096">This is an automated security notification about a change to your Aurelink account.</div></div></body></html>`;
        const notification=await resend.emails.send({from:aurelinkSender(),to:String(current.rows[0].email),subject:"Your Aurelink password was changed",html});
        if(notification.error) throw new Error(String(notification.error.message||"Email provider rejected notification"));
        await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset.notification_sent',$2,$3,$4::jsonb)",[reset.user_id,changedIp,agent(req),JSON.stringify({messageId:notification.data?.id??null,timezone,localTime})]);
      } catch(notificationError) {
        await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'auth.password_reset.notification_failed',$2,$3,$4::jsonb)",[reset.user_id,ip(req),agent(req),JSON.stringify({reason:String(notificationError instanceof Error?notificationError.message:"Notification delivery failed").slice(0,300)})]).catch(()=>undefined);
      }
      return res.json({success:true,message:"Your password was changed successfully. Please sign in again."});
    } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
    finally { client.release(); }
  }catch{return res.status(400).json({success:false,message:"Unable to reset password. The link may be invalid or expired."});}
});

const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/**
 * Account ID prefixes are registry-managed. Retiring a prefix means setting
 * status='archived'; never delete its registry row or rewrite IDs already issued.
 * Archived prefixes remain recognized because existing account IDs are stored
 * unchanged in aurelink_users.account_id.
 */
async function ensureAurelinkAccountRangeSchema(client:any){
  await client.query("CREATE TABLE IF NOT EXISTS aurelink_account_id_ranges (prefix VARCHAR(3) PRIMARY KEY, suffix_digits SMALLINT NOT NULL CHECK (suffix_digits BETWEEN 1 AND 12), status VARCHAR(16) NOT NULL CHECK (status IN ('active','archived')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), archived_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await client.query("INSERT INTO aurelink_account_id_ranges(prefix,suffix_digits,status) VALUES ('100',9,'active'),('221',9,'active'),('111',9,'active'),('152',7,'active'),('660',9,'archived'),('234',7,'archived') ON CONFLICT(prefix) DO NOTHING");
  await client.query("CREATE INDEX IF NOT EXISTS aurelink_account_id_ranges_active_idx ON aurelink_account_id_ranges(status) WHERE status='active'");
}
async function newAccountId(client:any){
  await ensureAurelinkAccountRangeSchema(client);
  const result=await client.query("SELECT prefix,suffix_digits FROM aurelink_account_id_ranges WHERE status='active' ORDER BY prefix");
  const ranges=result.rows as Array<{prefix:string;suffix_digits:number}>;
  if(!ranges.length) throw new Error("No active Aurelink account ID ranges are configured.");
  const choice=ranges[randomInt(ranges.length)];
  let digits="";
  for(let i=0;i<Number(choice.suffix_digits);i++)digits+=String(randomInt(10));
  return String(choice.prefix)+digits;
}
function aurelinkAppBase(){return "https://aurelink-react.onrender.com";}
function aurelinkSender(){return process.env.AURELINK_EMAIL_FROM??"Aurelink <noreply@wnncompany.com>";}
router.post("/aurelink/auth/signup/email/request",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Enter a valid email address."});
  const email=emailService.normalize(parsed.data.email);
  // The public signup page must submit the IP it discovered directly from the browser via IPAPI.
  // Never substitute the Render egress address for the visitor's connection.
  const suppliedIp=typeof req.body?.clientIp==="string"?req.body.clientIp.trim():"";
  const clientIp=suppliedIp;
  // Validate using Node's IP parser; hand-written regexes are easy to over-escape.
  if(!clientIp || isIP(clientIp)===0 || clientIp==="127.0.0.1" || clientIp==="::1" || clientIp.startsWith("127.")) {
    return res.status(400).json({success:false,code:"AURELINK_CLIENT_IP_REQUIRED",message:"Aurelink could not identify your device's public network address. Refresh the page and try again."});
  }
  try {
    // Enforce high-confidence network abuse signals, but never require a mobile connection.
    // Residential ISP, broadband, Wi-Fi, and ordinary carrier NAT remain eligible.
    let net: Awaited<ReturnType<typeof checkIP>>;
    try {
      net = await checkIP(clientIp);
    } catch {
      // Fail closed when reputation cannot be checked: do not silently bypass network protection.
      return res.status(503).json({success:false,code:"AURELINK_NETWORK_CHECK_UNAVAILABLE",message:"We couldn't securely verify this connection right now. Please try again shortly."});
    }
    const blocked = net.success !== true ||
      net.is_bogon === true ||
      net.is_crawler === true ||
      net.is_datacenter === true ||
      net.is_tor === true ||
      net.is_vpn === true ||
      net.is_proxy === true ||
      net.is_abuser === true ||
      net.bot_status === true ||
      net.hosting === true ||
      net.vpn === true ||
      net.proxy === true ||
      net.tor === true ||
      (typeof net.fraud_score === "number" && net.fraud_score >= 70);
    if (blocked) {
      return res.status(403).json({
        success:false,
        code:"AURELINK_NETWORK_BLOCKED",
        message:"For your security, Aurelink cannot start registration from this connection. Disable VPN, proxy, or Tor services and try again using a trusted residential, business, Wi-Fi, or mobile network."
      });
    }
    const existing=await pool.query("SELECT id FROM aurelink_users WHERE LOWER(email)=LOWER($1) LIMIT 1",[email]);
    if(existing.rows[0])return res.status(409).json({success:false,code:"AURELINK_ACCOUNT_EXISTS",message:"An Aurelink account already exists for this email. Please sign in instead."});
    // Reuse the existing live challenge; do not invalidate or spam an already-delivered link.
    const active=await pool.query("SELECT expires_at,verified_at FROM aurelink_signup_email_tokens WHERE LOWER(email)=LOWER($1) AND consumed_at IS NULL AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1",[email]);
    if(active.rows[0]) {
      const remainingSeconds=Math.max(1,Math.ceil((new Date(active.rows[0].expires_at).getTime()-Date.now())/1000));
      return res.status(409).json({success:false,code:"AURELINK_EMAIL_TOKEN_ACTIVE",expiresAt:active.rows[0].expires_at,verified:active.rows[0].verified_at!=null,remainingSeconds,message:active.rows[0].verified_at!=null?"This email is already confirmed. Continue account setup using the confirmation email link.":"An unexpired confirmation link was recently sent to this address. Check your inbox or spam folder, or wait for it to expire before requesting another."});
    }
    const token=randomBytes(32).toString("base64url");
    const expiresAt=new Date(Date.now()+5*60*1000);
    await pool.query("INSERT INTO aurelink_signup_email_tokens(email,token_hash,request_ip,country,region,city,timezone,network_type,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[email,hash(token),clientIp,net.location?.country??null,net.location?.state??null,net.location?.city??null,net.location?.timezone??null,net.company?.type??net.asn?.type??"unknown",expiresAt]);
    const link=aurelinkAppBase()+"/?screen=verify-email&token="+encodeURIComponent(token);
    const location=[net.location?.city,net.location?.country].filter(Boolean).join(", ")||"Location unavailable";
    const maskedIp=clientIp.split(".").length===4?clientIp.split(".").map((v,i)=>i===3?"•••":v).join("."):clientIp;
    const html=`<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#182230"><div style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-radius:14px"><h1 style="color:#173b78">AURELINK</h1><img src="https://aurelink-react.onrender.com/aurelink-account-preview.svg" alt="Aurelink sign-in, account creation, and account-ready screen reference" width="540" style="display:block;width:100%;max-width:540px;height:auto;margin:20px auto;border:1px solid #e1e7ef;border-radius:10px"><h2>Hello,</h2><p>Use the secure button below to confirm this email address for your Aurelink account.</p><p style="text-align:center;margin:32px 0"><a href="${link}" style="display:inline-block;background:#087be5;color:#fff;text-decoration:none;padding:15px 28px;border-radius:6px;font-weight:bold">Confirm email address</a></p><p>This one-time confirmation link expires in <strong>5 minutes</strong>. If it expires, return to Aurelink and request a new link.</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><p style="font-size:13px;color:#596579">Request location: ${escapeHtml(location)}<br>IP address: ${escapeHtml(maskedIp)}<br>Timezone: ${escapeHtml(net.location?.timezone??"Unavailable")}</p><p><strong>If you did not initiate this request, please ignore this email.</strong></p><p style="margin-top:28px">Aurelink, Inc.</p></div></body></html>`;
    const sent=await resend.emails.send({from:aurelinkSender(),to:email,subject:"Confirm your email address | Aurelink",html});
    if(sent.error){await pool.query("UPDATE aurelink_signup_email_tokens SET consumed_at=NOW() WHERE token_hash=$1",[hash(token)]);throw new Error(sent.error.message);}
    await pool.query("INSERT INTO aurelink_audit_logs(event_type,ip_address,user_agent,metadata) VALUES('signup.email_confirmation_sent',$1,$2,$3::jsonb)",[clientIp,agent(req),JSON.stringify({email,provider:"resend",messageId:sent.data?.id??null})]);
    return res.json({success:true,message:"Confirmation link sent. Please check your inbox and spam folder. The link expires in 5 minutes."});
  } catch(e) {
    const detail=e instanceof Error?e.message:"";
    if(detail.includes("duplicate key"))return res.status(409).json({success:false,message:"A confirmation request is already being processed. Please wait before trying again."});
    return res.status(503).json({success:false,message:"Aurelink could not verify this network or send the confirmation email. Please try again shortly."});
  }
});
router.post("/aurelink/auth/signup/email/verify",async(req,res)=>{
  const parsed=z.object({token:z.string().min(30).max(300)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"The confirmation link is invalid or expired."});
  try{
    const result=await pool.query("UPDATE aurelink_signup_email_tokens SET verified_at=COALESCE(verified_at,NOW()) WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() AND verified_at IS NULL RETURNING email",[hash(parsed.data.token)]);
    if(!result.rows[0]){
      const already=await pool.query("SELECT email FROM aurelink_signup_email_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() AND verified_at IS NOT NULL",[hash(parsed.data.token)]);
      if(!already.rows[0])return res.status(400).json({success:false,message:"This confirmation link is invalid, expired, or has already been used. Request a new one."});
      return res.json({success:true,email:already.rows[0].email,message:"Email confirmed. Complete your Aurelink account."});
    }
    return res.json({success:true,email:result.rows[0].email,message:"Email confirmed. Complete your Aurelink account."});
  }catch{return res.status(500).json({success:false,message:"Unable to verify this email link."});}
});
router.post("/aurelink/auth/signup/complete",async(req,res)=>{
  const parsed=z.object({token:z.string().min(30).max(300),fullName:z.string().trim().min(2).max(100),password:z.string().min(6).max(200),confirmPassword:z.string().min(6).max(200),acceptedTerms:z.literal(true)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Enter your full name, a valid password, confirm the password, and accept Aurelink Terms."});
  if(parsed.data.password!==parsed.data.confirmPassword)return res.status(400).json({success:false,message:"The passwords do not match."});
  try{
    validPassword(parsed.data.password);
    const fullName=validPersonName(parsed.data.fullName);
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("SELECT * FROM aurelink_signup_email_tokens WHERE token_hash=$1 AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);
      const challenge=found.rows[0];
      if(!challenge){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Email confirmation expired or was already used. Please start again."});}
      const email=String(challenge.email);
      const exists=await client.query("SELECT id FROM aurelink_users WHERE LOWER(email)=LOWER($1)",[email]);
      if(exists.rows[0]){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"An Aurelink account already exists for this email."});}
      const words=fullName.split(/\s+/);
      const firstName=words.shift()!;
      const lastName=words.join(" ")||firstName;
      const passwordHash=await hashPassword(parsed.data.password);
      let accountId="";
      let created:any;
      for(let attempt=0;attempt<12;attempt++){
        accountId=await newAccountId(client);
        try{created=await client.query("INSERT INTO aurelink_users(account_id,first_name,last_name,email,password_hash,email_verified,account_status) VALUES($1,$2,$3,$4,$5,TRUE,'active') RETURNING id,account_id,email,first_name,last_name,email_verified,account_status,created_at",[accountId,firstName,lastName,email,passwordHash]);break;}
        catch(err){if(!(err instanceof Error)||!err.message.includes("duplicate key")||attempt===11)throw err;}
      }
      const user=created.rows[0];
      // ASAK-24 binding is delayed until the account has completed its first 24 hours.
      await ensureAuthKeySchema(client);
      await ensureAsakMigrationSchema(client);
      await client.query("INSERT INTO aurelink_asak_migrations(user_id,account_id,status,email_status) VALUES($1,$2,'waiting_age','pending') ON CONFLICT(user_id) DO NOTHING",[user.id,String(accountId)]);
      await client.query("INSERT INTO aurelink_account_security(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[user.id]);
      await client.query("UPDATE aurelink_signup_email_tokens SET consumed_at=NOW() WHERE id=$1",[challenge.id]);
      await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'account.created',$2,$3,$4::jsonb)",[user.id,challenge.request_ip,agent(req),JSON.stringify({accountId,termsAccepted:true,termsAcceptedAt:new Date().toISOString()})]);
      await client.query("COMMIT");
      const emailHtml=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#182230"><div style="background:#173b78;color:#fff;padding:24px;border-radius:12px 12px 0 0"><h1 style="margin:0;letter-spacing:2px">AURELINK</h1><p style="margin:8px 0 0;color:#e5f0ff">Secure communications, built around your account</p></div><img src="https://aurelink-react.onrender.com/aurelink-account-preview.svg" alt="Aurelink sign-in, account creation, and account-ready screen reference" width="540" style="display:block;width:100%;max-width:540px;height:auto;margin:20px auto;border:1px solid #e1e7ef;border-radius:10px"><div style="border:1px solid #e1e7ef;padding:24px;border-radius:0 0 12px 12px"><h2>Welcome to Aurelink, ${escapeHtml(firstName)}.</h2><p>Your account has been created successfully.</p><div style="background:#f3f7fc;border:1px solid #d8e3f1;padding:18px;border-radius:8px"><div style="font-size:12px;color:#5b6b82">AURELINK ACCOUNT ID</div><div style="font-size:24px;font-weight:bold;letter-spacing:1px;margin-top:8px">${escapeHtml(accountId)}</div></div><p style="line-height:1.6">Aurelink provides secure account access and communications services. Your ASAK-24 security-key binding will begin after your account has been active for 24 hours. You do not need to create or enter a security key.</p><p>Next step: exit this screen, open a fresh Aurelink screen, and sign in with this email address and the password you just created.</p><p><a href="${aurelinkAppBase()}/?screen=login" style="display:inline-block;background:#087be5;color:#fff;text-decoration:none;padding:13px 22px;border-radius:6px;font-weight:bold">Open Aurelink sign in</a></p><p>If you did not create this account, contact Aurelink Support.</p><div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:12px;color:#596579">Aurelink Account Security<br>This email intentionally excludes phone-number and country-availability previews.</div></div></div>`;
      void resend.emails.send({from:aurelinkSender(),to:user.email,subject:"Your Aurelink account is ready",html:emailHtml}).catch(()=>undefined);
      return res.status(201).json({success:true,message:"Your Aurelink account has been created. Please sign in.",user});
    }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
  }catch(e){return res.status(500).json({success:false,message:"Aurelink could not complete account creation. Please try again."});}
});

export default router;
