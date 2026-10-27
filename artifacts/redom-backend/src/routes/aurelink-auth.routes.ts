import { Router, type Request } from "express";
import { isIP } from "node:net";
import { z } from "zod";
import { randomBytes, randomUUID, randomInt, createHash } from "node:crypto";
import { checkIP } from "../lib/ipapi";
import { resend } from "../lib/resend";
import jwt from "jsonwebtoken";
import { pool } from "../database/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { emailService } from "../services/auth/email.service";
import { loginNotificationService } from "../services/auth/login-notification.service";

const router = Router();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ip = (req: Request) => String(req.ip ?? "").replace(/^::ffff:/, "").slice(0,45);
const agent = (req: Request) => String(req.get("user-agent") ?? "").slice(0,1000);

function describeDevice(ua:string, supplied?:unknown) {
  const explicit=typeof supplied==="string"?supplied.trim():"";
  if(explicit && explicit.length<160) return explicit;
  if(/iPhone/i.test(ua)) return "iPhone (model unavailable to browser)";
  if(/iPad/i.test(ua)) return "iPad (model unavailable to browser)";
  if(/Android/i.test(ua)) {
    const match=ua.match(/Android[^;)]*;\\s*(?:[a-z]{2}-[A-Z]{2};\\s*)?(?:wv;\\s*)?([^;)/]+?)(?:\\s+Build\\/[^;)]*)?[;)]/i);
    const model=match?.[1]?.trim();
    if(model && !/^(Linux|Android|K|wv)$/i.test(model)) return model.slice(0,150);
    return "Android device (model not disclosed by browser)";
  }
  if(/Windows NT/i.test(ua)) return "Windows PC";
  if(/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if(/CrOS/i.test(ua)) return "Chromebook";
  if(/Linux/i.test(ua)) return "Linux device";
  return "Device not identifiable from browser";
}
function platformFor(ua:string) {
  if(/Android/i.test(ua)) return "Android";
  if(/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if(/Windows/i.test(ua)) return "Windows";
  if(/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if(/CrOS/i.test(ua)) return "ChromeOS";
  if(/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}
function browserFor(ua:string) {
  if(/Edg\\//i.test(ua)) return "Microsoft Edge";
  if(/Firefox\\//i.test(ua)) return "Firefox";
  if(/CriOS\\//i.test(ua)) return "Chrome (iOS)";
  if(/Chrome\\//i.test(ua)) return "Chrome";
  if(/Safari\\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if(/SamsungBrowser\\//i.test(ua)) return "Samsung Internet";
  return "Browser not identifiable";
}
\nfunction jwtSecret() { const v=process.env.JWT_ACCESS_SECRET; if(!v) throw new Error("JWT_ACCESS_SECRET is not configured."); return v; }
function refreshSecret() { const v=process.env.JWT_REFRESH_SECRET; if(!v) throw new Error("JWT_REFRESH_SECRET is not configured."); return v; }
function validPassword(v:string) { if(v.length<10 || !/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) throw new Error("Password must be at least 10 characters and contain a letter and a number."); }
async function startSession(req:Request,user:{id:string;email:string;first_name?:string;last_name?:string},network:Awaited<ReturnType<typeof checkIP>>) {
  const sessionId=randomUUID(), ua=agent(req), deviceName=describeDevice(ua,req.body?.deviceName);
  const platform=platformFor(ua), browser=browserFor(ua), addr=ip(req);
  const accessToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},jwtSecret(),{expiresIn:"15m"});
  const refreshToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},refreshSecret(),{expiresIn:"30d"});
  await pool.query("INSERT INTO aurelink_sessions(id,user_id,refresh_token_hash,device_id,device_name,platform,browser,user_agent,ip_address,country,region,city,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()+INTERVAL '30 days')",[sessionId,user.id,hash(refreshToken),String(req.body?.deviceId??"").slice(0,255)||null,deviceName,platform,browser,ua,addr,network.location?.country??null,network.location?.state??null,network.location?.city??null]);
  await pool.query("INSERT INTO aurelink_login_history(user_id,session_id,ip_address,user_agent,event_type,success,device_name,platform,browser,country,region,city,login_time) VALUES($1,$2,$3,$4,'login',TRUE,$5,$6,$7,$8,$9,$10,NOW())",[user.id,sessionId,addr,ua,deviceName,platform,browser,network.location?.country??null,network.location?.state??null,network.location?.city??null]);
  await pool.query("UPDATE aurelink_users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1",[user.id]);
  const previous=await pool.query("SELECT id FROM aurelink_sessions WHERE user_id=$1 AND id<>$2 AND device_name=$3 AND revoked_at IS NULL LIMIT 1",[user.id,sessionId,deviceName]);
  const isNewDevice=previous.rowCount===0;
  // Login remains successful if email delivery is temporarily unavailable; the event is already persisted.
  void loginNotificationService.send({email:user.email,firstName:user.first_name??"",lastName:user.last_name??"",ipAddress:addr,eventAt:new Date(),deviceName,deviceUserAgent:ua,ipapi:network}).catch(()=>undefined);
  return {accessToken,refreshToken,expiresIn:900,sessionId,deviceName,platform,browser,location:{city:network.location?.city??null,region:network.location?.state??null,country:network.location?.country??null},isNewDevice};
}
router.post("/aurelink/auth/register",(_req,res)=>res.status(410).json({success:false,message:"Direct registration is disabled. Use the email-confirmation signup flow."}));
router.post("/aurelink/auth/login",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255),password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Valid email and password are required."});
  try{
    const email=emailService.normalize(parsed.data.email);
    const found=await pool.query("SELECT id,email,first_name,last_name,password_hash,email_verified,account_status FROM aurelink_users WHERE LOWER(email)=LOWER($1) LIMIT 1",[email]);
    const user=found.rows[0];
    if(!user || user.email_verified!==true || !await verifyPassword(parsed.data.password,String(user.password_hash))) {
      await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,failure_reason) VALUES($1,'login',FALSE,$2,$3,'invalid_credentials')",[user?.id??null,ip(req),agent(req)]).catch(()=>undefined);
      return res.status(401).json({success:false,message:"Invalid email or password."});
    }
    if(user.account_status!=="active")return res.status(403).json({success:false,message:"This Aurelink account is not active."});
    let network:Awaited<ReturnType<typeof checkIP>>;
    try { network=await checkIP(ip(req)); }
    catch { await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,failure_reason) VALUES($1,'login',FALSE,$2,$3,'network_check_unavailable')",[user.id,ip(req),agent(req)]).catch(()=>undefined); return res.status(503).json({success:false,code:"AURELINK_NETWORK_CHECK_UNAVAILABLE",message:"We couldn't securely verify this network. Please try again shortly."}); }
    const networkBlocked=network.is_bogon===true||network.is_crawler===true||network.is_datacenter===true||network.is_tor===true||network.is_proxy===true||network.is_vpn===true||network.is_abuser===true||network.bot_status===true||network.hosting===true||Boolean(network.egress_service)||network.fraud_score>=50;
    if(networkBlocked) {
      await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,failure_reason) VALUES($1,'login',FALSE,$2,$3,$4)",[user.id,ip(req),agent(req),"network_risk_blocked"]).catch(()=>undefined);
      return res.status(403).json({success:false,code:"AURELINK_NETWORK_BLOCKED",message:"This connection could not be accepted because it matched a high-risk network signal. Turn off VPN or proxy services and try a normal connection."});
    }
    const sec=await pool.query("SELECT two_factor_enabled,two_factor_method FROM aurelink_account_security WHERE user_id=$1",[user.id]);
    if(sec.rows[0]?.two_factor_enabled) return res.status(501).json({success:false,code:"AURELINK_2FA_SETUP_REQUIRED",message:"Two-factor authentication is enabled, but challenge delivery is not yet available for this account. Contact Aurelink support; password-only login is blocked."});
    const session=await startSession(req,{id:user.id,email:user.email,first_name:user.first_name,last_name:user.last_name},network);
    await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'auth.login',$2,$3)",[user.id,ip(req),agent(req)]);
    delete user.password_hash;
    return res.json({success:true,user,session});
  }catch(e){return res.status(500).json({success:false,message:"Aurelink login failed."});}
});
router.get("/aurelink/auth/me",aurelinkAuthMiddleware,async(req,res)=>{
  const r=await pool.query("SELECT id,email,first_name,last_name,email_verified,phone_number,phone_verified,account_status,created_at,last_login_at FROM aurelink_users WHERE id=$1",[req.user!.userId]);
  if(!r.rows[0])return res.status(404).json({success:false,message:"Account not found."});
  const security=await pool.query("SELECT two_factor_enabled,two_factor_method,totp_enabled FROM aurelink_account_security WHERE user_id=$1",[req.user!.userId]);
  return res.json({success:true,user:r.rows[0],security:security.rows[0]??{two_factor_enabled:false,two_factor_method:"off",totp_enabled:false}});
});
router.post("/aurelink/auth/logout",aurelinkAuthMiddleware,async(req,res)=>{
  await pool.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW() WHERE id=$1 AND user_id=$2",[req.user!.sessionId,req.user!.userId]);
  await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'auth.logout',$2,$3)",[req.user!.userId,ip(req),agent(req)]);
  return res.json({success:true,message:"Signed out."});
});
router.post("/aurelink/auth/refresh",async(req,res)=>{
  const parsed=z.object({refreshToken:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Refresh token is required."});
  try{
    const payload=jwt.verify(parsed.data.refreshToken,refreshSecret()) as {userId?:string;sessionId?:string;audience?:string};
    if(payload.audience!=="aurelink"||!payload.userId||!payload.sessionId)throw new Error("invalid");
    const session=await pool.query("SELECT s.id,u.email,u.account_status FROM aurelink_sessions s JOIN aurelink_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.refresh_token_hash=$3 AND s.last_activity_at>NOW()-INTERVAL '10 minutes'",[payload.sessionId,payload.userId,hash(parsed.data.refreshToken)]);
    if(!session.rows[0]||session.rows[0].account_status!=="active")throw new Error("invalid");
    const accessToken=jwt.sign({userId:payload.userId,sessionId:payload.sessionId,audience:"aurelink"},jwtSecret(),{expiresIn:"15m"});
    const refreshToken=jwt.sign({userId:payload.userId,sessionId:payload.sessionId,audience:"aurelink"},refreshSecret(),{expiresIn:"30d"});
    await pool.query("UPDATE aurelink_sessions SET refresh_token_hash=$2,expires_at=NOW()+INTERVAL '30 days',updated_at=NOW() WHERE id=$1",[payload.sessionId,hash(refreshToken)]);
    return res.json({success:true,session:{accessToken,refreshToken,expiresIn:900,sessionId:payload.sessionId}});
  }catch{return res.status(401).json({success:false,message:"Invalid, expired or revoked Aurelink refresh token."});}
});
router.post("/aurelink/auth/password-reset/request",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"A valid email address is required."});
  const generic={success:true,message:"If an Aurelink account exists for this email, password recovery instructions will be sent."};
  try{
    const found=await pool.query("SELECT id,email,first_name FROM aurelink_users WHERE LOWER(email)=LOWER($1) AND account_status='active'",[emailService.normalize(parsed.data.email)]);
    const user=found.rows[0]; if(!user)return res.json(generic);
    const token=randomBytes(32).toString("base64url"); const expiresAt=new Date(Date.now()+30*60*1000);
    await pool.query("INSERT INTO aurelink_password_resets(user_id,token_hash,expires_at,request_ip) VALUES($1,$2,$3,$4)",[user.id,hash(token),expiresAt,ip(req)]);
    const base=(process.env.AURELINK_PUBLIC_URL??"https://aurelink-public.onrender.com").replace(/\/$/,"");
    const result=await (await import("../lib/resend")).resend.emails.send({from:process.env.AURELINK_EMAIL_FROM??"Aurelink <noreply@wnncompany.com>",to:user.email,subject:"Reset your Aurelink password",html:`<div style="font-family:Arial,sans-serif"><h2>Reset your Aurelink password</h2><p>Use the secure link below within 30 minutes.</p><p><a href="${base}/?screen=reset-password&token=${encodeURIComponent(token)}">Reset password</a></p><p>If you did not request this, ignore this email.</p></div>`});
    if(result.error)throw new Error(result.error.message);
    return res.json(generic);
  }catch{return res.json(generic);}
});
router.post("/aurelink/auth/password-reset/complete",async(req,res)=>{
  const parsed=z.object({token:z.string().min(20).max(300),password:z.string().min(10).max(200)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"A valid reset token and password are required."});
  try{
    validPassword(parsed.data.password);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const result=await client.query("SELECT id,user_id FROM aurelink_password_resets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);
      const reset=result.rows[0];
      if(!reset){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Reset link is invalid or expired."});}
      const passwordHash=await hashPassword(parsed.data.password);
      await client.query("UPDATE aurelink_users SET password_hash=$2,updated_at=NOW() WHERE id=$1",[reset.user_id,passwordHash]);
      await client.query("UPDATE aurelink_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",[reset.user_id]);
      await client.query("UPDATE aurelink_sessions SET revoked_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL",[reset.user_id]);
      await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'auth.password_reset',$2,$3)",[reset.user_id,ip(req),agent(req)]);
      await client.query("COMMIT");
      return res.json({success:true,message:"Password reset. Please sign in again."});
    } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; }
    finally { client.release(); }
  }catch{return res.status(400).json({success:false,message:"Unable to reset password. The link may be invalid or expired."});}
});

const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function newAccountId(){const prefixes=[{p:"100",n:9},{p:"221",n:9},{p:"660",n:9},{p:"234",n:7}];const choice=prefixes[randomInt(prefixes.length)];let digits="";for(let i=0;i<choice.n;i++)digits+=String(randomInt(10));return choice.p+digits;}
function publicBase(){return (process.env.AURELINK_PUBLIC_URL??"https://aurelink-public.onrender.com").replace(/\/$/,"");}
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
    const link=publicBase()+"/?screen=verify-email&token="+encodeURIComponent(token);
    const location=[net.location?.city,net.location?.country].filter(Boolean).join(", ")||"Location unavailable";
    const maskedIp=clientIp.split(".").length===4?clientIp.split(".").map((v,i)=>i===3?"•••":v).join("."):clientIp;
    const html=`<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#182230"><div style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-radius:14px"><h1 style="color:#173b78">AURELINK</h1><h2>Hello,</h2><p>Use the secure button below to confirm this email address for your Aurelink account.</p><p style="text-align:center;margin:32px 0"><a href="${link}" style="display:inline-block;background:#087be5;color:#fff;text-decoration:none;padding:15px 28px;border-radius:6px;font-weight:bold">Confirm email address</a></p><p>This one-time confirmation link expires in <strong>5 minutes</strong>. If it expires, return to Aurelink and request a new link.</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><p style="font-size:13px;color:#596579">Request location: ${escapeHtml(location)}<br>IP address: ${escapeHtml(maskedIp)}<br>Timezone: ${escapeHtml(net.location?.timezone??"Unavailable")}</p><p><strong>If you did not initiate this request, please ignore this email.</strong></p><p style="margin-top:28px">Aurelink, Inc.</p></div></body></html>`;
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
  const parsed=z.object({token:z.string().min(30).max(300),fullName:z.string().trim().min(2).max(200),password:z.string().min(10).max(200),confirmPassword:z.string().min(10).max(200),acceptedTerms:z.literal(true)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Enter your full name, a valid password, confirm the password, and accept Aurelink Terms."});
  if(parsed.data.password!==parsed.data.confirmPassword)return res.status(400).json({success:false,message:"The passwords do not match."});
  try{
    validPassword(parsed.data.password);
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query("SELECT * FROM aurelink_signup_email_tokens WHERE token_hash=$1 AND verified_at IS NOT NULL AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE",[hash(parsed.data.token)]);
      const challenge=found.rows[0];
      if(!challenge){await client.query("ROLLBACK");return res.status(400).json({success:false,message:"Email confirmation expired or was already used. Please start again."});}
      const email=String(challenge.email);
      const exists=await client.query("SELECT id FROM aurelink_users WHERE LOWER(email)=LOWER($1)",[email]);
      if(exists.rows[0]){await client.query("ROLLBACK");return res.status(409).json({success:false,message:"An Aurelink account already exists for this email."});}
      const words=parsed.data.fullName.trim().split(/\s+/);
      const firstName=words.shift()!;
      const lastName=words.join(" ")||firstName;
      const passwordHash=await hashPassword(parsed.data.password);
      let accountId="";
      let created:any;
      for(let attempt=0;attempt<12;attempt++){
        accountId=newAccountId();
        try{created=await client.query("INSERT INTO aurelink_users(account_id,first_name,last_name,email,password_hash,email_verified,account_status) VALUES($1,$2,$3,$4,$5,TRUE,'active') RETURNING id,account_id,email,first_name,last_name,email_verified,account_status,created_at",[accountId,firstName,lastName,email,passwordHash]);break;}
        catch(err){if(!(err instanceof Error)||!err.message.includes("duplicate key")||attempt===11)throw err;}
      }
      const user=created.rows[0];
      await client.query("INSERT INTO aurelink_account_security(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[user.id]);
      await client.query("UPDATE aurelink_signup_email_tokens SET consumed_at=NOW() WHERE id=$1",[challenge.id]);
      await client.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent,metadata) VALUES($1,'account.created',$2,$3,$4::jsonb)",[user.id,challenge.request_ip,agent(req),JSON.stringify({accountId,termsAccepted:true,termsAcceptedAt:new Date().toISOString()})]);
      await client.query("COMMIT");
      const session=await startSession(req,{id:user.id,email:user.email});
      const emailHtml=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1 style="color:#173b78">AURELINK</h1><h2>Welcome to Aurelink, ${escapeHtml(firstName)}!</h2><p>Your account has been created successfully.</p><p><strong>Aurelink Account ID:</strong> ${escapeHtml(accountId)}</p><p>If you did not create this account, contact Aurelink support immediately.</p><p>Aurelink, Inc.</p></div>`;
      void resend.emails.send({from:aurelinkSender(),to:user.email,subject:"Your Aurelink account is ready",html:emailHtml}).catch(()=>undefined);
      return res.status(201).json({success:true,message:"Your Aurelink account has been created.",user,session});
    }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
  }catch(e){return res.status(500).json({success:false,message:"Aurelink could not complete account creation. Please try again."});}
});

export default router;
