import { randomInt, randomUUID } from "node:crypto";
import { Router } from "express";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { pool } from "../database/db";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimit } from "../middleware/rate-limit.middleware";
import { sendBugReportEmail, type BugReportEmailInput } from "../services/bugReportEmail.service";

const router=Router();
const r2=new S3Client({region:env.cloudflare.r2.region||"auto",endpoint:env.cloudflare.r2.endpoint,credentials:{accessKeyId:env.cloudflare.r2.accessKeyId,secretAccessKey:env.cloudflare.r2.secretAccessKey}});
const input=z.object({
  product:z.string().trim().min(1).max(120),
  category:z.string().trim().min(1).max(100),
  problem:z.string().trim().min(1).max(12000),
  fixRequired:z.string().trim().min(1).max(12000),
  includeDiagnostics:z.boolean().default(true),
  diagnostics:z.record(z.unknown()).default({}),
  attachments:z.array(z.object({filename:z.string().trim().min(1).max(255),contentType:z.string().trim().min(1).max(120),dataUrl:z.string().min(1)})).max(2).default([]),
});
function reportNumber(){return String(randomInt(100000000,999999999));}
function parseDataUrl(value:string){
  const m=/^data:((?:image\/(?:jpeg|jpg|png|webp)|video\/(?:mp4|quicktime|webm)));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!m)throw new Error("Only screenshots and common video formats are supported.");
  const body=Buffer.from(m[2],"base64");
  if(!body.length||body.length>8*1024*1024)throw new Error("Each attachment must be 8 MB or smaller.");
  return {contentType:m[1]==="image/jpg"?"image/jpeg":m[1],body,base64:m[2]};
}
function safeName(value:string){return value.replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,180)||"attachment";}
async function createUniqueReportId(){
  for(let i=0;i<15;i+=1){const id=reportNumber();const r=await pool.query("SELECT 1 FROM bug_reports WHERE report_id=$1",[id]);if(!r.rowCount)return id;}
  throw new Error("Unable to allocate a report ID.");
}
router.post("/",authMiddleware,authRateLimit,async(req,res)=>{
  const parsed=input.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({success:false,message:parsed.error.issues[0]?.message||"Invalid problem report."});
  const v=parsed.data;
  const parsedAttachments=[];
  let total=0;
  try{
    for(const a of v.attachments){
      const p=parseDataUrl(a.dataUrl); total+=p.body.length;
      if(total>10*1024*1024)throw new Error("The combined attachment size must be 10 MB or smaller.");
      parsedAttachments.push({...a,...p});
    }
    const user=await pool.query("SELECT id,first_name,last_name,email FROM users WHERE id=$1 LIMIT 1",[req.user!.userId]);
    if(!user.rowCount)return res.status(401).json({success:false,message:"Account not found."});
    const reportId=await createUniqueReportId();
    const sender=v.category.toLowerCase().includes("bug")||v.category.toLowerCase().includes("crash")||v.category.toLowerCase().includes("performance")?env.email.bugsFrom:env.email.problemFrom;
    const inserted=await pool.query(`INSERT INTO bug_reports(report_id,user_id,product,category,description,fix_required,include_diagnostics,diagnostics,status,email_from) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9) RETURNING id`,[reportId,user.rows[0].id,v.product,v.category,v.problem,v.fixRequired,v.includeDiagnostics,v.includeDiagnostics?v.diagnostics:{},sender]);
    const reportUuid=String(inserted.rows[0].id);
    const emailAttachments:BugReportEmailInput["attachments"]=[];
    for(const a of parsedAttachments){
      const key=`bug-reports/${reportId}/${randomUUID()}-${safeName(a.filename)}`;
      await r2.send(new PutObjectCommand({Bucket:env.cloudflare.r2.bucketName,Key:key,Body:a.body,ContentType:a.contentType}));
      await pool.query("INSERT INTO bug_report_attachments(report_id,storage_key,filename,content_type,byte_size) VALUES($1,$2,$3,$4,$5)",[reportUuid,key,safeName(a.filename),a.contentType,a.body.length]);
      emailAttachments.push({filename:safeName(a.filename),contentType:a.contentType,contentBase64:a.base64,sizeBytes:a.body.length});
    }
    const userName=`${user.rows[0].first_name||""} ${user.rows[0].last_name||""}`.trim()||"ReDom user";
    const emailInput:BugReportEmailInput={reportId,product:v.product,category:v.category,problem:v.problem,fixRequired:v.fixRequired,includeDiagnostics:v.includeDiagnostics,diagnostics:v.diagnostics as Record<string,unknown>,userName,userEmail:String(user.rows[0].email||"not available"),submittedAt:new Date().toISOString(),attachments:emailAttachments};
    try{
      const messageId=await sendBugReportEmail(emailInput);
      await pool.query("UPDATE bug_reports SET status='emailed',email_status='sent',emailed_at=now(),updated_at=now() WHERE id=$1",[reportUuid]);
      return res.status(201).json({success:true,reportId,status:"emailed",emailMessageId:messageId});
    }catch(error){
      const message=error instanceof Error?error.message:"Unable to send problem report.";
      await pool.query("UPDATE bug_reports SET status='email_failed',email_status='failed',email_error=$2,updated_at=now() WHERE id=$1",[reportUuid,message]);
      req.log?.error?.({err:error,reportId},"Bug report email failed");
      return res.status(502).json({success:false,reportId,message:"Your report was saved, but ReDom could not deliver it to the technical team. Please try again shortly."});
    }
  }catch(error){
    req.log?.error?.({err:error},"Problem report submission failed");
    return res.status(400).json({success:false,message:error instanceof Error?error.message:"Unable to submit problem report."});
  }
});
export default router;
