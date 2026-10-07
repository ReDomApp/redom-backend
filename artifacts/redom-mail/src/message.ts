import { createHash } from "node:crypto";
import type { NormalizedMessage, SendEmailRequest } from "./types.js";
import { formatAddress, listAddresses, parseAddress } from "./address.js";
import { messageId, smtpMessageId } from "./ids.js";

function foldHeader(name: string, value: string): string {
  const safe = value.replace(/[\\r\\n]+/g, " ").trim();
  return `${name}: ${safe}`;
}

function escapeMime(text: string): string {
  return text.replace(/\\r?\\n/g, "\r\n");
}

export function normalizeMessage(input: SendEmailRequest): NormalizedMessage {
  const from = parseAddress(input.from);
  const recipients = [
    ...listAddresses(input.to),
    ...listAddresses(input.cc),
    ...listAddresses(input.bcc),
  ];

  if (!recipients.length) throw new Error("At least one recipient is required");
  if (!input.text && !input.html) throw new Error("Either text or html is required");
  if (input.subject.length > 998) throw new Error("Subject is too long");

  const id = messageId();
  return {
    id,
    from,
    recipients,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: {
      ...input.headers,
      "Message-ID": smtpMessageId(id),
      "Date": new Date().toUTCString(),
    },
    createdAt: new Date().toISOString(),
    attempt: 0,
  };
}

export function renderMessage(message: NormalizedMessage): string {
  const boundary = `=_ReDom_${createHash("sha256").update(message.id).digest("hex").slice(0, 24)}`;
  const headers = [
    foldHeader("From", formatAddress(message.from)),
    foldHeader("To", message.recipients.map(formatAddress).join(", ")),
    foldHeader("Subject", message.subject),
    foldHeader("Message-ID", message.headers["Message-ID"]),
    foldHeader("Date", message.headers["Date"]),
    "MIME-Version: 1.0",
  ];

  if (message.text && message.html) {
    headers.push(
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeMime(message.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeMime(message.html),
      `--${boundary}--`,
    );
  } else if (message.html) {
    headers.push(
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeMime(message.html),
    );
  } else {
    headers.push(
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeMime(message.text!),
    );
  }

  for (const [name, value] of Object.entries(message.headers)) {
    if (["Message-ID", "Date"].includes(name)) continue;
    headers.push(foldHeader(name, value));
  }

  return headers.join("\r\n").replace(/\r?\n$/, "") + "\r\n";
}
