import { createHash, createSign } from "node:crypto";
import { readFileSync } from "node:fs";

type DkimConfig = {
  domain: string;
  selector: string;
  privateKeyPath: string;
};

function canonicalBody(body: string): string {
  const normalized = body.replace(/\r?\n/g, "\r\n");
  const withoutTrailingEmpty = normalized.replace(/(?:\r\n)*$/, "");
  return withoutTrailingEmpty + "\r\n";
}

function canonicalHeader(name: string, value: string): string {
  const unfolded = value.replace(/\r?\n[ \\t]+/g, " ").replace(/[ \\t]+/g, " ").trim();
  return `${name.toLowerCase()}:${unfolded}`;
}

export function signDkim(rawMessage: string, config: DkimConfig): string {
  const separator = rawMessage.indexOf("\r\n\r\n");
  if (separator < 0) throw new Error("Invalid MIME message");

  const headerBlock = rawMessage.slice(0, separator);
  const body = rawMessage.slice(separator + 4);
  const headers = headerBlock.split("\r\n");
  const values = new Map<string, string>();

  for (const line of headers) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const name = line.slice(0, index).toLowerCase();
    const value = line.slice(index + 1).trim();
    if (!values.has(name)) values.set(name, value);
  }

  const signedHeaders = ["from", "to", "subject", "date", "message-id"];
  const missing = signedHeaders.filter((name) => !values.has(name));
  if (missing.length) throw new Error(`Missing DKIM headers: ${missing.join(", ")}`);

  const bodyHash = createHash("sha256")
    .update(canonicalBody(body), "utf8")
    .digest("base64");

  const dkimWithoutSignature =
    `v=1; a=rsa-sha256; c=relaxed/simple; d=${config.domain}; s=${config.selector}; ` +
    `q=dns/txt; bh=${bodyHash}; h=${signedHeaders.join(":")}; b=`;

  const signingData =
    signedHeaders.map((name) => canonicalHeader(name, values.get(name)!)).join("\r\n") +
    "\r\n" +
    canonicalHeader("DKIM-Signature", dkimWithoutSignature);

  const signer = createSign("RSA-SHA256");
  signer.update(signingData, "utf8");
  const signature = signer.sign(readFileSync(config.privateKeyPath), "base64");

  return `DKIM-Signature: ${dkimWithoutSignature}${signature}`;
}
