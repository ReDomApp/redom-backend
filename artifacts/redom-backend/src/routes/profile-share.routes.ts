import { Router, type Request, type Response } from "express";
import { pool } from "../database/db";
import { env } from "../config/env";

const router = Router();

const mediaUrl = (key: string | null) =>
  key ? `${env.cloudflare.r2.bucketEndpoint.replace(/\/$/, "")}/${key}` : null;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

router.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
  const fingerprints = String(process.env.REDOM_ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return res.json(
    fingerprints.map((sha256_cert_fingerprint) => ({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.redom.app",
        sha256_cert_fingerprints: [sha256_cert_fingerprint],
      },
    })),
  );
});

router.get("/.well-known/apple-app-site-association", (_req: Request, res: Response) => {
  const teamId = String(process.env.REDOM_IOS_TEAM_ID || "").trim();
  const details = teamId
    ? [{
        appIDs: [`${teamId}.com.redom.app`],
        components: [{ "/": "/profile/username/*" }],
      }]
    : [];

  return res.type("application/json").send(JSON.stringify({ applinks: { details } }));
});

router.get("/profile/username/:shareCode", async (req: Request, res: Response) => {
  try {
    const shareCode = String(req.params.shareCode || "").trim();
    if (!/^[A-Za-z0-9]{7}$/.test(shareCode)) {
      return res.status(404).type("html").send("<!doctype html><html><body><h1>Profile not found</h1></body></html>");
    }

    const result = await pool.query(
      `SELECT u.first_name,u.last_name,u.username,u.profile_share_code,p.profile_photo
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id=u.id
       WHERE u.profile_share_code=$1
       LIMIT 1`,
      [shareCode],
    );

    if (!result.rows.length) {
      return res.status(404).type("html").send("<!doctype html><html><body><h1>Profile not found</h1></body></html>");
    }

    const profile = result.rows[0];
    const name = `${profile.first_name} ${profile.last_name}`.trim();
    const url = `https://redom.app/profile/username/${profile.profile_share_code}`;
    const image = mediaUrl(profile.profile_photo);
    const title = `${name} on ReDom`;
    const description = profile.username ? `@${profile.username} on ReDom` : `View ${name}'s profile on ReDom`;
    const appUrl = `redom://profile/username/${profile.profile_share_code}`;

    res.status(200).type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
<style>body{font-family:system-ui,sans-serif;margin:0;background:#fff;color:#050505;display:grid;place-items:center;min-height:100vh}.card{width:min(92vw,420px);text-align:center}.avatar{width:112px;height:112px;border-radius:56px;object-fit:cover;background:#e4e6eb}.button{display:inline-block;margin-top:20px;padding:13px 22px;border-radius:9px;background:#1877f2;color:#fff;text-decoration:none;font-weight:700}</style>
</head>
<body>
<main class="card">
${image ? `<img class="avatar" src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : ""}
<h1>${escapeHtml(name)}</h1>
<p>${escapeHtml(description)}</p>
<a class="button" href="${appUrl}">Open in ReDom</a>
</main>
</body>
</html>`);
  } catch (error) {
    console.error("Profile share page failed", error);
    return res.status(500).type("html").send("<!doctype html><html><body><h1>Unable to load this profile</h1></body></html>");
  }
});

export default router;
