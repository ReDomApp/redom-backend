import { randomBytes } from "node:crypto";
import type { NormalizedMessage } from "./types.js";
import { Pool } from "pg";

export async function decorateHtml(pool: Pool, message: NormalizedMessage, baseUrl: string): Promise<NormalizedMessage> {
  if (!message.html) return message;

  const root = baseUrl.replace(/\/$/, "");
  const openToken = randomBytes(18).toString("hex");
  await pool.query(
    "INSERT INTO redom_mail_tracking (token,message_id,kind) VALUES ($1,$2,'open')",
    [openToken, message.id],
  );

  const linkPattern = /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi;
  let html = message.html.replace(linkPattern, (_match, pre, quote, url, post) => {
    const token = randomBytes(18).toString("hex");
    void pool.query(
      "INSERT INTO redom_mail_tracking (token,message_id,kind,target_url) VALUES ($1,$2,'click',$3)",
      [token, message.id, url],
    );
    return "<a " + pre + "href=" + quote + root + "/t/c/" + token + quote + post + ">";
  });

  html += '<img src="' + root + "/t/o/" + openToken + '" width="1" height="1" alt="" style="display:none" />';
  return { ...message, html };
}
