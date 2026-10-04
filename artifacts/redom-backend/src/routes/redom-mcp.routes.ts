import { Router } from "express";
import { pool } from "../database/db";
import { mcpBaseUrl, oauthIssuer, REDOM_MCP_SCOPE, verifyRedomAccessToken } from "../services/redom-oauth.service";

const router = Router();
const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcRequest = { jsonrpc?: string; id?: string|number|null; method?: string; params?: any };
type AuthContext = { userId: string; scope: string; jti: string };

const toolDefinitions = [
  {
    name:"redom_get_profile",
    description:"Read the authenticated user's ReDom account and profile information. Never returns passwords, access tokens, payment credentials, or other secrets.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false},
    _meta:{securitySchemes:[{type:"oauth2",scopes:[REDOM_MCP_SCOPE]}],"openai/profile":true}
  },
  {
    name:"redom_get_account_security",
    description:"Read the authenticated user's account security status, two-factor status, recognized devices, and active sessions. Secret TOTP material and recovery codes are never returned.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false},
    _meta:{securitySchemes:[{type:"oauth2",scopes:[REDOM_MCP_SCOPE]}]}
  },
  {
    name:"redom_get_login_history",
    description:"Read the authenticated user's ReDom login history, including login time, device, network IP, country, region, city, source, and session status.",
    inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:100}},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false},
    _meta:{securitySchemes:[{type:"oauth2",scopes:[REDOM_MCP_SCOPE]}]}
  },
  {
    name:"redom_get_payments",
    description:"Read the authenticated user's ReDom payment transactions and subscriptions. Returns transaction/payment identifiers and status but never card numbers, CVV, provider secrets, or access credentials.",
    inputSchema:{type:"object",properties:{limit:{type:"integer",minimum:1,maximum:100}},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false},
    _meta:{securitySchemes:[{type:"oauth2",scopes:[REDOM_MCP_SCOPE]}]}
  },
  {
    name:"redom_get_account_summary",
    description:"Read a consolidated, read-only summary of the authenticated user's ReDom account, profile, security status, login history, payment identifiers, transactions, and subscriptions.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false},
    _meta:{securitySchemes:[{type:"oauth2",scopes:[REDOM_MCP_SCOPE]}]}
  }
];

function jsonRpc(id:any,result:any){ return {jsonrpc:"2.0",id,result}; }
function jsonRpcError(id:any,code:number,message:string,data?:unknown){ return {jsonrpc:"2.0",id,error:{code,message,...(data===undefined?{}:{data})}}; }

function protectedResourceMetadataUrl(): string { return `${mcpBaseUrl().replace(/\/mcp$/,"")}/oauth/.well-known/oauth-protected-resource`; }

function bearer(req:any): string | null {
  const value=String(req.headers.authorization??"");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

async function authenticate(req:any,res:any):Promise<AuthContext|null>{
  const token=bearer(req);
  if(!token){
    res.setHeader("WWW-Authenticate",`Bearer resource_metadata="${protectedResourceMetadataUrl()}", scope="${REDOM_MCP_SCOPE}"`);
    res.status(401).json({jsonrpc:"2.0",error:{code:-32001,message:"Authentication required."}});
    return null;
  }
  try{
    const payload=verifyRedomAccessToken(token,mcpBaseUrl());
    if(payload.typ!=="redom-mcp-access" || !payload.sub || !payload.scope.split(/\s+/).includes(REDOM_MCP_SCOPE)) throw new Error("Invalid scope.");
    const tokenRow=await pool.query(
      "SELECT user_id, revoked_at, expires_at, scope FROM redom_oauth_tokens WHERE jti=$1 AND user_id=$2",
      [payload.jti,payload.sub]
    );
    const row=tokenRow.rows[0];
    if(!row || row.revoked_at || new Date(row.expires_at).getTime()<=Date.now() || !String(row.scope).split(/\s+/).includes(REDOM_MCP_SCOPE)) throw new Error("Token revoked or expired.");
    return {userId:payload.sub,scope:payload.scope,jti:payload.jti};
  }catch{
    res.setHeader("WWW-Authenticate",`Bearer resource_metadata="${mcpBaseUrl()}/../oauth/.well-known/oauth-protected-resource", scope="${REDOM_MCP_SCOPE}"`);
    res.status(401).json({jsonrpc:"2.0",error:{code:-32001,message:"Invalid or expired access token."}});
    return null;
  }
}

async function getProfile(userId:string){
  const r=await pool.query(`
    SELECT u.id AS "userId",u.public_id AS "publicId",u.profile_id AS "profileId",u.username,
      u.first_name AS "firstName",u.last_name AS "lastName",u.email,u.phone_number AS "phoneNumber",
      u.email_verified AS "emailVerified",u.phone_verified AS "phoneVerified",u.account_status AS "accountStatus",
      u.date_of_birth AS "dateOfBirth",u.gender,u.created_at AS "createdAt",u.updated_at AS "updatedAt",
      p.display_name AS "displayName",p.profile_photo AS "profilePhoto",p.cover_photo AS "coverPhoto",
      p.bio,p.website,p.occupation,p.education,p.hometown,p.current_city AS "currentCity",
      p.relationship_status AS "relationshipStatus",p.pronouns,p.profile_visibility AS "profileVisibility",
      p.verified,p.profile_completion AS "profileCompletion",p.follower_count AS "followerCount",
      p.following_count AS "followingCount",p.friend_count AS "friendCount",p.post_count AS "postCount"
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=$1
  `,[userId]);
  return r.rows[0]??null;
}

async function getSecurity(userId:string){
  const [security,devices,sessions]=await Promise.all([
    pool.query(`SELECT two_factor_enabled AS "twoFactorEnabled",two_factor_method AS "twoFactorMethod",totp_enabled AS "totpEnabled",created_at AS "createdAt",updated_at AS "updatedAt" FROM account_security WHERE user_id=$1`,[userId]),
    pool.query(`SELECT rd.id,rd.device_type AS "deviceType",rd.platform,rd.browser,rd.device_name AS "deviceName",rd.created_at AS "createdAt",rd.last_used_at AS "lastUsedAt",rd.revoked_at AS "revokedAt" FROM recognized_device_accounts rda JOIN recognized_devices rd ON rd.id=rda.device_id WHERE rda.user_id=$1 AND rda.active=true AND rd.revoked_at IS NULL ORDER BY rd.last_used_at DESC`,[userId]),
    pool.query(`SELECT id,session_id AS "sessionId",device_name AS "deviceName",device_type AS "deviceType",login_source AS "loginSource",app_version AS "appVersion",ip_address AS "ipAddress",country,region,city,login_time AS "loginTime",last_activity AS "lastActivity",created_at AS "createdAt",updated_at AS "updatedAt" FROM active_sessions WHERE user_id=$1 ORDER BY last_activity DESC`,[userId])
  ]);
  return {security:security.rows[0]??null,recognizedDevices:devices.rows,activeSessions:sessions.rows};
}

async function getLogins(userId:string,limit:number){
  const r=await pool.query(`SELECT id,session_id AS "sessionId",device_name AS "deviceName",device_type AS "deviceType",login_source AS "loginSource",app_version AS "appVersion",ip_address AS "ipAddress",country,region,city,login_time AS "loginTime",logout_time AS "logoutTime",active,session_status AS "sessionStatus",created_at AS "createdAt",updated_at AS "updatedAt" FROM login_history WHERE user_id=$1 AND hidden_by_user=false ORDER BY login_time DESC LIMIT $2`,[userId,limit]);
  return r.rows;
}

async function getPayments(userId:string,limit:number){
  const [tx,subs]=await Promise.all([
    pool.query(`SELECT id,reference AS "reference",redom_transaction_id AS "redomTransactionId",payment_provider AS "paymentProvider",provider_transaction_id AS "providerTransactionId",external_transaction_id AS "externalTransactionId",amount_minor AS "amountMinor",currency,purpose,status,gateway_status AS "gatewayStatus",paid_at AS "paidAt",created_at AS "createdAt",updated_at AS "updatedAt",refund_status AS "refundStatus",refund_id AS "refundId",refund_amount_minor AS "refundAmountMinor",refund_requested_at AS "refundRequestedAt",refund_processed_at AS "refundProcessedAt" FROM payment_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,[userId,limit]),
    pool.query(`SELECT id,external_subscription_code AS "externalSubscriptionCode",external_customer_code AS "externalCustomerCode",status,next_payment_at AS "nextPaymentAt",disabled_at AS "disabledAt",created_at AS "createdAt",updated_at AS "updatedAt" FROM payment_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,[userId,limit])
  ]);
  return {transactions:tx.rows,subscriptions:subs.rows};
}

async function callTool(name:string,args:any,userId:string){
  if(name==="redom_get_profile") return await getProfile(userId);
  if(name==="redom_get_account_security") return await getSecurity(userId);
  if(name==="redom_get_login_history") return await getLogins(userId,Math.min(Math.max(Number(args?.limit??50),1),100));
  if(name==="redom_get_payments") return await getPayments(userId,Math.min(Math.max(Number(args?.limit??50),1),100));
  if(name==="redom_get_account_summary"){
    const [profile,security,loginHistory,payments]=await Promise.all([getProfile(userId),getSecurity(userId),getLogins(userId,50),getPayments(userId,50)]);
    return {profile,security,loginHistory,payments};
  }
  throw new Error("Unknown tool.");
}

router.post("/mcp", async (req,res)=>{
  const body=req.body as JsonRpcRequest;
  if(body?.jsonrpc!=="2.0" || !body?.method) return res.status(400).json(jsonRpcError(body?.id??null,-32600,"Invalid JSON-RPC request."));
  if(body.method==="initialize"){
    return void res.json(jsonRpc(body.id,{
      protocolVersion:PROTOCOL_VERSION,
      capabilities:{tools:{}},
      serverInfo:{name:"redom-account",version:"1.0.0"}
    }));
  }
  if(body.method==="notifications/initialized") return void res.status(202).end();
  if(body.method==="tools/list"){
    return void res.json(jsonRpc(body.id,{tools:toolDefinitions}));
  }
  if(body.method==="tools/call"){
    const auth=await authenticate(req,res); if(!auth)return;
    try{
      const name=String(body.params?.name??"");
      const result=await callTool(name,body.params?.arguments??{},auth.userId);
      return void res.json(jsonRpc(body.id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:false}));
    }catch(error){
      return void res.json(jsonRpc(body.id,{content:[{type:"text",text:error instanceof Error?error.message:"Unable to read ReDom account."}],isError:true}));
    }
  }
  return void res.json(jsonRpcError(body.id??null,-32601,"Method not found."));
});

export default router;
