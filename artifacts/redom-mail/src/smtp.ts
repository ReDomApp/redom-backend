import net from "node:net";
import tls from "node:tls";
import type { NormalizedMessage } from "./types.js";
import { renderMessage } from "./message.js";
import { signDkim } from "./dkim.js";

type SmtpConfig = {
  host: string;
  heloName: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
  maxMessageBytes: number;
  attachments?: Array<{ filename:string; contentType:string; contentDisposition?:string; contentId?:string; content:Buffer }>;
  dkim?: { domain: string; selector: string; privateKeyPath: string };
};

type Reply = { code: number; lines: string[] };

function readReply(socket: net.Socket | tls.TLSSocket, timeoutMs: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP command timeout"));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\d{3} /.test(line)) {
          cleanup();
          resolve({
            code: Number(line.slice(0, 3)),
            lines: [...lines.slice(0, i + 1)],
          });
          return;
        }
      }
    };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function sendCommand(
  socket: net.Socket | tls.TLSSocket,
  command: string,
  timeoutMs: number,
): Promise<Reply> {
  socket.write(command + "\r\n");
  return readReply(socket, timeoutMs);
}

function dotStuff(body: string): string {
  return body
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
}

export async function deliverDirect(
  message: NormalizedMessage,
  config: SmtpConfig,
): Promise<{ retryable: boolean; response: string }> {
  const unsigned = renderMessage(message, config.attachments ?? []);
  const raw = config.dkim ? signDkim(unsigned, config.dkim) + "\r\n" + unsigned : unsigned;
  if (Buffer.byteLength(raw, "utf8") > config.maxMessageBytes) {
    return { retryable: false, response: "Message exceeds configured size limit" };
  }

  const domainGroups = new Map<string, string[]>();
  for (const recipient of [...message.recipients, ...(message.cc ?? []), ...(message.bcc ?? [])]) {
    const domain = recipient.email.split("@")[1].toLowerCase();
    const group = domainGroups.get(domain) ?? [];
    group.push(recipient.email);
    domainGroups.set(domain, group);
  }

  for (const [domain, recipients] of domainGroups) {
    const mx = await resolveMx(domain);
    if (!mx.length) return { retryable: false, response: `No MX record for ${domain}` };

    let delivered = false;
    let lastError = "";
    for (const host of mx) {
      try {
        await smtpSession(host, message.from.email, recipients, raw, config);
        delivered = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!delivered) return { retryable: true, response: lastError || `Delivery failed for ${domain}` };
  }

  return { retryable: false, response: "250 delivered" };
}

async function resolveMx(domain: string): Promise<string[]> {
  const { promises: dns } = await import("node:dns");
  const records = await dns.resolveMx(domain);
  return records.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
}

async function smtpSession(
  host: string,
  sender: string,
  recipients: string[],
  rawMessage: string,
  config: SmtpConfig,
): Promise<void> {
  const socket = net.createConnection({ host, port: 25 });
  socket.setTimeout(config.connectTimeoutMs);

  const greeting = await readReply(socket, config.commandTimeoutMs);
  if (greeting.code >= 400) throw new Error(`SMTP greeting ${greeting.code}`);

  const ehlo = await sendCommand(socket, `EHLO ${config.heloName}`, config.commandTimeoutMs);
  if (ehlo.code >= 400) throw new Error(`EHLO ${ehlo.code}`);

  let active: net.Socket | tls.TLSSocket = socket;
  const startTls = ehlo.lines.some((line) => /250[ -]STARTTLS/i.test(line));
  if (startTls) {
    const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: true });
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", () => resolve());
      tlsSocket.once("error", reject);
    });
    active = tlsSocket;
    const ehloTls = await sendCommand(active, `EHLO ${config.heloName}`, config.commandTimeoutMs);
    if (ehloTls.code >= 400) throw new Error(`EHLO after STARTTLS ${ehloTls.code}`);
  }

  const mailFrom = await sendCommand(active, `MAIL FROM:<${sender}>`, config.commandTimeoutMs);
  if (mailFrom.code >= 400) throw new Error(`MAIL FROM ${mailFrom.code}`);

  for (const recipient of recipients) {
    const rcpt = await sendCommand(active, `RCPT TO:<${recipient}>`, config.commandTimeoutMs);
    if (rcpt.code >= 500) throw new Error(`RCPT TO ${rcpt.code} for ${recipient}`);
  }

  const data = await sendCommand(active, "DATA", config.commandTimeoutMs);
  if (data.code !== 354) throw new Error(`DATA ${data.code}`);

  active.write(dotStuff(rawMessage) + "\r\n.\r\n");
  const accepted = await readReply(active, config.commandTimeoutMs);
  if (accepted.code >= 400) throw new Error(`message rejected ${accepted.code}: ${accepted.lines.join(" ")}`);

  await sendCommand(active, "QUIT", config.commandTimeoutMs).catch(() => undefined);
  active.destroy();
}
