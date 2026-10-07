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

  const pattern = /<a\s+([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi;
  let html = message.html;
  const matches = [...message.html.matchAll(pattern)];
  for (const match of matches) {
    const token = randomBytes(18).toString("hex");
    await pool.query(
      "INSERT INTO redom_mail_tracking (token,message_id,kind,target_url) VALUES ($1,$2,'click',$3)",
      [token, message.id, match[3]],
    );
    const replacement =
      "<a " + match[1] + "href=" + match[2] + root + "/t/c/" + token + match[2] + match[4] + ">";
    html = html.replace(match[0], replacement);
  }

  html += '<img src="' + root + "/t/o/" + openToken + '" width="1" height="1" alt="" style="display:none" />';
  return { ...message, html };
}
