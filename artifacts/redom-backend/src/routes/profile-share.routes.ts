import { Router, type Request, type Response } from "express";
import { pool } from "../database/db";
import { env } from "../config/env";
import { decodeProfileShareToken, encodeProfileShareToken } from "../utils/profileShareToken";

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

const notFound = (res: Response) =>
  res.status(404).json({ success: false, message: "Profile not found." });

async function resolveProfile(token: string, username: string) {
  const profileId = decodeProfileShareToken(token);
  if (!profileId) return null;

  const result = await pool.query(
    `SELECT u.id,u.first_name,u.last_name,u.username,u.profile_id,
            u.profile_share_code,p.profile_photo,p.cover_photo,p.bio,
            p.profile_visibility,p.verified,p.friend_count,p.follower_count,p.post_count
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id=u.id
     WHERE u.profile_id=$1
       AND lower(u.username)=lower($2)
     LIMIT 1`,
    [profileId, username],
  );

  return result.rows[0] || null;
}

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
        components: [{ "/": "/@*" }],
      }]
    : [];

  return res.type("application/json").send(JSON.stringify({ applinks: { details } }));
});

/**
 * Public JSON resolver for the Web client.
 *
 * The opaque token is authoritative; username is checked as an additional
 * consistency guard. The raw profile_id is never returned.
 */
router.get("/profile/share/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token || "").trim();
    const username = String(req.query.username || "").trim();
    if (!username) return notFound(res);

    const profile = await resolveProfile(token, username);
    if (!profile) return notFound(res);

    const shareToken = encodeProfileShareToken(profile.profile_id);
    return res.json({
      success: true,
      profile: {
        userId: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        username: profile.username,
        shareToken,
        shareUrl: `https://wnncompany.com/@${encodeURIComponent(profile.username)}?_r=1&_t=${shareToken}`,
        profilePhoto: mediaUrl(profile.profile_photo),
        coverPhoto: mediaUrl(profile.cover_photo),
        bio: profile.profile_visibility === "private" ? null : (profile.bio || null),
        friendCount: profile.friend_count ?? 0,
        followerCount: profile.follower_count ?? 0,
        postCount: profile.post_count ?? 0,
        verified: !!profile.verified,
      },
    });
  } catch (error) {
    console.error("Profile share resolver failed", error);
    return res.status(500).json({ success: false, message: "Unable to load this profile." });
  }
});

/**
 * Browser entry point:
 *   https://wnncompany.com/@username?_r=1&_t=ZS-XXXXXXXXX
 *
 * The embedded token resolves the stable profile identity while the
 * username remains human-readable.
 */
router.get("/@:username", async (req: Request, res: Response) => {
  try {
    const username = String(req.params.username || "").trim();
    const token = String(req.query._t || "").trim();
    const profile = await resolveProfile(token, username);

    if (!profile) {
      return res.status(404).type("html").send("<!doctype html><html><body><h1>Profile not found</h1></body></html>");
    }

    const shareToken = encodeProfileShareToken(profile.profile_id);
    const url = `https://wnncompany.com/@${encodeURIComponent(profile.username)}?_r=1&_t=${shareToken}`;
    const image = mediaUrl(profile.profile_photo);
    const name = `${profile.first_name} ${profile.last_name}`.trim();
    const title = `${name} on ReDom`;
    const description = profile.username ? `@${profile.username} on ReDom` : `View ${name}'s profile on ReDom`;
    const appUrl = `redom://@${encodeURIComponent(profile.username)}?_r=1&_t=${shareToken}`;

    return res.status(200).type("html").send(`<!doctype html>
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
