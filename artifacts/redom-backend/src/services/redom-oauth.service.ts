import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Pool } from "pg";
import { env } from "../config/env";

export const REDOM_MCP_SCOPE = "redom.account.read";
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const AUTH_CODE_TTL_MS = 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function baseUrl(): string {
  return (process.env.REDOM_MCP_BASE_URL ?? "https://redom-backend.onrender.com/redom-backend/mcp").replace(/\/+$/, "");
}

export function mcpBaseUrl(): string { return baseUrl(); }
export function oauthIssuer(): string {
  return (process.env.REDOM_OAUTH_ISSUER ?? "https://redom-backend.onrender.com/redom-backend/oauth").replace(/\/+$/, "");
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertRedirectUri(uri: string): void {
  const parsed = new URL(uri);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("OAuth redirect URI must use HTTPS.");
  }
}

export async function createAuthorizationRequest(pool: Pool, input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  state?: string;
  resource: string;
}): Promise<string> {
  if (input.codeChallengeMethod !== "S256") throw new Error("Only PKCE S256 is supported.");
  if (!input.scope.split(/\s+/).includes(REDOM_MCP_SCOPE)) throw new Error("Required ReDom read scope is missing.");
  assertRedirectUri(input.redirectUri);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO redom_oauth_authorization_requests
      (id, client_id, redirect_uri, code_challenge, code_challenge_method, scope, state, resource, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id,input.clientId,input.redirectUri,input.codeChallenge,input.codeChallengeMethod,input.scope,input.state ?? null,input.resource,new Date(Date.now()+AUTH_REQUEST_TTL_MS)]
  );
  return id;
}

export async function getAuthorizationRequest(pool: Pool, id: string) {
  const result = await pool.query(
    `SELECT * FROM redom_oauth_authorization_requests
      WHERE id=$1 AND expires_at > now() AND approved_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function approveAuthorizationRequest(pool: Pool, requestId: string, userId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query(
      `SELECT * FROM redom_oauth_authorization_requests
       WHERE id=$1 AND expires_at > now() AND approved_at IS NULL FOR UPDATE`,
      [requestId]
    );
    const row = request.rows[0];
    if (!row) throw new Error("OAuth authorization request is expired or invalid.");

    await client.query(
      `UPDATE redom_oauth_authorization_requests SET user_id=$2, approved_at=now() WHERE id=$1`,
      [requestId,userId]
    );
    await client.query(
      `INSERT INTO redom_oauth_consents (user_id,client_id,scope,granted_at,revoked_at)
       VALUES ($1,$2,$3,now(),NULL)
       ON CONFLICT (user_id,client_id)
       DO UPDATE SET scope=EXCLUDED.scope, granted_at=now(), revoked_at=NULL`,
      [userId,row.client_id,row.scope]
    );

    const rawCode = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO redom_oauth_codes
       (code_hash,request_id,user_id,client_id,redirect_uri,code_challenge,scope,resource,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [hash(rawCode),requestId,userId,row.client_id,row.redirect_uri,row.code_challenge,row.scope,row.resource,new Date(Date.now()+AUTH_CODE_TTL_MS)]
    );
    await client.query("COMMIT");
    return rawCode;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function exchangeAuthorizationCode(pool: Pool, input: {
  code: string; clientId: string; redirectUri: string; codeVerifier: string;
}) {
  const result = await pool.query(
    `SELECT * FROM redom_oauth_codes
     WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3
       AND expires_at > now() AND consumed_at IS NULL`,
    [hash(input.code),input.clientId,input.redirectUri]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Invalid or expired authorization code.");

  const expected = createPkceChallenge(input.codeVerifier);
  const a = Buffer.from(expected);
  const b = Buffer.from(row.code_challenge);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new Error("Invalid PKCE verifier.");

  const consumed = await pool.query(
    `UPDATE redom_oauth_codes SET consumed_at=now()
     WHERE code_hash=$1 AND consumed_at IS NULL RETURNING *`,
    [hash(input.code)]
  );
  if (!consumed.rows[0]) throw new Error("Authorization code has already been used.");

  const jti = randomUUID();
  const expiresAt = new Date(Date.now()+ACCESS_TOKEN_TTL_SECONDS*1000);
  const secret = process.env.REDOM_MCP_ACCESS_SECRET ?? env.authentication.jwtAccessSecret;
  const token = jwt.sign(
    { sub: row.user_id, scope: row.scope, aud: row.resource, iss: oauthIssuer(), jti, typ: "redom-mcp-access" },
    secret,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS, algorithm: "HS256" }
  );
  await pool.query(
    `INSERT INTO redom_oauth_tokens (jti,user_id,client_id,scope,resource,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [jti,row.user_id,row.client_id,row.scope,row.resource,expiresAt]
  );
  return { accessToken: token, tokenType: "Bearer", expiresIn: ACCESS_TOKEN_TTL_SECONDS, scope: row.scope };
}

export function verifyRedomAccessToken(token: string, expectedAudience: string) {
  const secret = process.env.REDOM_MCP_ACCESS_SECRET ?? env.authentication.jwtAccessSecret;
  return jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: oauthIssuer(),
    audience: expectedAudience,
  }) as { sub: string; scope: string; aud: string; iss: string; jti: string; typ: string };
}
