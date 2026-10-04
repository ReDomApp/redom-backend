import { Router } from "express";
import { createAuthorizationRequest, getAuthorizationRequest, approveAuthorizationRequest, exchangeAuthorizationCode, mcpBaseUrl, oauthIssuer } from "../services/redom-oauth.service";
import { pool } from "../database/db";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/.well-known/oauth-authorization-server", (_req,res) => {
  res.json({
    issuer: oauthIssuer(),
    authorization_endpoint: `${oauthIssuer()}/authorize`,
    token_endpoint: `${oauthIssuer()}/token`,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["redom.account.read"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
  });
});

router.get("/authorize", async (req,res) => {
  try {
    const clientId = String(req.query.client_id ?? "");
    const redirectUri = String(req.query.redirect_uri ?? "");
    const codeChallenge = String(req.query.code_challenge ?? "");
    const codeChallengeMethod = String(req.query.code_challenge_method ?? "");
    const scope = String(req.query.scope ?? "");
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const resource = String(req.query.resource ?? mcpBaseUrl());
    if (!clientId || !redirectUri || !codeChallenge || !scope) throw new Error("Missing OAuth authorization parameters.");

    const requestId = await createAuthorizationRequest(pool,{clientId,redirectUri,codeChallenge,codeChallengeMethod,scope,state,resource});
    const loginUrl = new URL(`${process.env.REDOM_WEB_URL ?? envWebFallback()}/app/login`);
    loginUrl.searchParams.set("oauth_request",requestId);
    res.redirect(loginUrl.toString());
  } catch (error) {
    res.status(400).json({ error:"invalid_request", error_description:error instanceof Error?error.message:"Invalid OAuth request." });
  }
});

router.get("/request/:requestId", async (req,res) => {
  const row = await getAuthorizationRequest(pool,String(req.params.requestId));
  if (!row) return void res.status(404).json({ error:"invalid_request", error_description:"Authorization request expired or invalid." });
  res.json({
    requestId: row.id,
    clientId: row.client_id,
    scope: row.scope,
    resource: row.resource,
    status: row.user_id ? "authenticated" : "login_required",
  });
});

router.post("/request/:requestId/approve", authMiddleware, async (req,res) => {
  try {
    const code = await approveAuthorizationRequest(pool,String(req.params.requestId),req.user!.userId);
    res.json({ success:true, code });
  } catch (error) {
    res.status(400).json({ success:false, message:error instanceof Error?error.message:"Unable to approve authorization." });
  }
});

router.post("/token", async (req,res) => {
  try {
    if (req.body?.grant_type !== "authorization_code") return res.status(400).json({error:"unsupported_grant_type"});
    const result = await exchangeAuthorizationCode(pool,{
      code:String(req.body.code ?? ""),
      clientId:String(req.body.client_id ?? ""),
      redirectUri:String(req.body.redirect_uri ?? ""),
      codeVerifier:String(req.body.code_verifier ?? ""),
    });
    res.json({ access_token:result.accessToken, token_type:result.tokenType, expires_in:result.expiresIn, scope:result.scope });
  } catch (error) {
    res.status(400).json({error:"invalid_grant",error_description:error instanceof Error?error.message:"Unable to exchange authorization code."});
  }
});

function envWebFallback(){ return "https://www.wnncompany.com"; }

export default router;
