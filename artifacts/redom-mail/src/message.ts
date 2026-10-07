import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { NormalizedMessage, SendEmailRequest, MailAttachment } from "./types.js";
import { formatAddress, listAddresses, parseAddress } from "./address.js";
import { messageId, smtpMessageId } from "./ids.js";

function foldHeader(name: string, value: string): string {
  const safe = value.replace(/[\r\n]+/g, " ").trim();
  return name + ": " + safe;
}
function escapeMime(text: string): string { return text.replace(/\r?\n/g, "\r\n"); }
function b64(buf: Buffer): string { return buf.toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd(); }

export async function loadAttachments(input: SendEmailRequest): Promise<Array<{ filename:string; contentType:string; contentDisposition?:string; contentId?:string; content:Buffer }>> {
  const result = [];
  for (const a of input.attachments ?? []) {
    let content: Buffer;
    if (a.content) content = Buffer.from(a.content, "base64");
    else if (a.path) {
      if (/^https?:\/\//i.test(a.path)) {
        const r = await fetch(a.path, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("Attachment fetch failed: " + r.status);
        content = Buffer.from(await r.arrayBuffer());
      } else content = await readFile(a.path);
    } else throw new Error("Attachment requires content or path");
    if (content.length > 25 * 1024 * 1024) throw new Error("Attachment exceeds 25 MB");
    result.push({
      filename: a.filename,
      contentType: a.contentType ?? "application/octet-stream",
      contentDisposition: a.contentDisposition ?? "attachment",
      contentId: a.contentId,
      content,
    });
  }
  return result;
}

export async function normalizeMessage(input: SendEmailRequest): Promise<NormalizedMessage> {
  const from = parseAddress(input.from);
  const to = listAddresses(input.to);
  const cc = listAddresses(input.cc);
  const bcc = listAddresses(input.bcc);
  const replyTo = listAddresses(input.replyTo);
  if (![...to, ...cc, ...bcc].length) throw new Error("At least one recipient is required");
  if (!input.text && !input.html) throw new Error("Either text or html is required");
  if (input.subject.length > 998) throw new Error("Subject is too long");
  const id = messageId();
  return {
    id, from, recipients: to, cc, bcc, replyTo,
    subject: input.subject, text: input.text, html: input.html,
    headers: { ...(input.headers ?? {}), "Message-ID": smtpMessageId(id), "Date": new Date().toUTCString() },
    tags: input.tags,
    createdAt: new Date().toISOString(), attempt: 0,
  };
}

export function renderMessage(message: NormalizedMessage, attachments: Array<{filename:string;contentType:string;contentDisposition?:string;contentId?:string;content:Buffer}> = []): string {
  const mixed = attachments.length > 0;
  const alt = Boolean(message.text && message.html);
  const outer = "=_ReDomMixed_" + createHash("sha256").update(message.id).digest("hex").slice(0, 24);
  const inner = "=_ReDomAlt_" + createHash("sha256").update(message.id).digest("hex").slice(0, 20);
  const headers = [
    foldHeader("From", formatAddress(message.from)),
    foldHeader("To", message.recipients.map(formatAddress).join(", ")),
    ...(message.cc?.length ? [foldHeader("Cc", message.cc.map(formatAddress).join(", "))] : []),
    ...(message.replyTo?.length ? [foldHeader("Reply-To", message.replyTo.map(formatAddress).join(", "))] : []),
    foldHeader("Subject", message.subject),
    foldHeader("Message-ID", message.headers["Message-ID"]),
    foldHeader("Date", message.headers["Date"]),
    "MIME-Version: 1.0",
  ];
  for (const [name,value] of Object.entries(message.headers)) if (!["Message-ID","Date"].includes(name)) headers.push(foldHeader(name,value));

  const bodyParts:string[]=[];
  if (alt) bodyParts.push("Content-Type: multipart/alternative; boundary=\"" + inner + "\"", "", "--"+inner,
    "Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: 8bit","",escapeMime(message.text!),
    "--"+inner,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: 8bit","",escapeMime(message.html!),"--"+inner+"--");
  else if (message.html) bodyParts.push("Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: 8bit","",escapeMime(message.html));
  else bodyParts.push("Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: 8bit","",escapeMime(message.text!));

  if (!mixed) return headers.concat(bodyParts).join("\r\n") + "\r\n";
  const mixedBody = ["Content-Type: multipart/mixed; boundary=\"" + outer + "\"", "", "--"+outer,...bodyParts,
    ...attachments.flatMap(a => ["--"+outer, "Content-Type: "+a.contentType, "Content-Transfer-Encoding: base64",
      "Content-Disposition: "+(a.contentDisposition ?? "attachment") + '; filename="' + a.filename.replace(/"/g,"'") + '"',
      ...(a.contentId ? ["Content-ID: <"+a.contentId+">"] : []), "", b64(a.content)]),
    "--"+outer+"--"];
  return headers.concat(mixedBody).join("\r\n") + "\r\n";
}
