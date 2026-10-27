import { Router, type Request } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../database/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { aurelinkAuthMiddleware } from "../middleware/aurelink-auth.middleware";
import { emailService } from "../services/auth/email.service";

const router = Router();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ip = (req: Request) => String(req.ip ?? "").replace(/^::ffff:/, "").slice(0,45);
const agent = (req: Request) => String(req.get("user-agent") ?? "").slice(0,1000);
function jwtSecret() { const v=process.env.JWT_ACCESS_SECRET; if(!v) throw new Error("JWT_ACCESS_SECRET is not configured."); return v; }
function refreshSecret() { const v=process.env.JWT_REFRESH_SECRET; if(!v) throw new Error("JWT_REFRESH_SECRET is not configured."); return v; }
function validPassword(v:string) { if(v.length<10 || !/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) throw new Error("Password must be at least 10 characters and contain a letter and a number."); }
async function startSession(req:Request,user:{id:string;email:string}) {
  const sessionId = randomBytes(16).toString("hex");
  const accessToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},jwtSecret(),{expiresIn:"15m"});
  const refreshToken=jwt.sign({userId:user.id,sessionId,audience:"aurelink"},refreshSecret(),{expiresIn:"30d"});
  await pool.query("INSERT INTO aurelink_sessions(id,user_id,refresh_token_hash,device_id,device_name,platform,browser,user_agent,ip_address,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()+INTERVAL '30 days')",[sessionId,user.id,hash(refreshToken),String(req.body?.deviceId??"").slice(0,255)||null,String(req.body?.deviceName??"").slice(0,255)||null,String(req.body?.platform??"").slice(0,100)||null,String(req.body?.browser??"").slice(0,100)||null,agent(req),ip(req)]);
  await pool.query("INSERT INTO aurelink_login_history(user_id,session_id,ip_address,user_agent,event_type) VALUES($1,$2,$3,$4,'login')",[user.id,sessionId,ip(req),agent(req)]);
  await pool.query("UPDATE aurelink_users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1",[user.id]);
  return {accessToken,refreshToken,expiresIn:900,sessionId};
}
router.post("/aurelink/auth/register", async(req,res)=>{
  const parsed=z.object({firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.string().email().max(255),password:z.string().min(10).max(200)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Provide a valid name, email and password (at least 10 characters)."});
  try{
    validPassword(parsed.data.password);
    const email=emailService.validate(parsed.data.email);
    const passwordHash=await hashPassword(parsed.data.password);
    const result=await pool.query("INSERT INTO aurelink_users(first_name,last_name,email,password_hash,account_status) VALUES($1,$2,$3,$4,'active') RETURNING id,email,first_name,last_name,account_status,created_at",[parsed.data.firstName,parsed.data.lastName,email,passwordHash]);
    const user=result.rows[0];
    await pool.query("INSERT INTO aurelink_account_security(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[user.id]);
    await pool.query("INSERT INTO aurelink_audit_logs(user_id,event_type,ip_address,user_agent) VALUES($1,'account.registered',$2,$3)",[user.id,ip(req),agent(req)]);
    const session=await startSession(req,{id:user.id,email:user.email});
    return res.status(201).json({success:true,user,session});
  }catch(e){const msg=e instanceof Error?e.message:"Registration failed.";return res.status(msg.includes("duplicate key")?409:400).json({success:false,message:msg.includes("duplicate key")?"An Aurelink account already exists for this email.":msg});}
});
router.post("/aurelink/auth/login",async(req,res)=>{
  const parsed=z.object({email:z.string().email().max(255),password:z.string().min(1).max(200)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:"Valid email and password are required."});
  try{
    const email=emailService.normalize(parsed.data.email);
    const found=await pool.query("SELECT id,email,first_name,last_name,password_hash,email_verified,account_status FROM aurelink_users WHERE LOWER(email)=LOWER($1) LIMIT 1",[email]);
    const user=found.rows[0];
    if(!user || !await verifyPassword(parsed.data.password,String(user.password_hash))) {
      await pool.query("INSERT INTO aurelink_login_history(user_id,event_type,success,ip_address,user_agent,failure_reason) VALUES($1,'login',FALSE,$2,$3,'invalid_credentials')",[user?.id??null,ip(req),agent(req)]).catch(()=>undefined);
      return res.status(401).json({success:false,message:"Invalid email or password."});
    }
    if(user.account_status!=="active")return res.status(403).json({success:false,message:"This Aurelink account is not active."});
    const sec=await pool.query("SELECT two_factor_enabled,two_factor_method FROM aurelink_account_security WHERE user_id=$1",[user.id]);
    if(sec.rows[0]?.two_factor_enabled) return res.status(501).json({success:false,code:"AURELINK_2FA_SETUP_REQUIRED",message:"Two-factor authentication is enabled, but challenge delivery is not yet available for this account. Contact Aurelink support; password-only login is blocked."});
    const session=await startSession(req,{id:user.id,email:user.email});
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
    const session=await pool.query("SELECT s.id,u.email,u.account_status FROM aurelink_sessions s JOIN aurelink_users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.refresh_token_hash=$3",[payload.sessionId,payload.userId,hash(parsed.data.refreshToken)]);
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
export default router;
