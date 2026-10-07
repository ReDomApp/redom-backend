import { randomBytes } from "node:crypto";

export function messageId(): string {
  const time = Date.now().toString(36);
  const entropy = randomBytes(8).toString("hex");
  return `rm_${time}_${entropy}`;
}

export function smtpMessageId(id: string): string {
  return `<${id}@wnncompany.com>`;
}
