import net from "node:net";
import { Pool } from "pg";
import { normalizeMessage } from "./message.js";
import { MailStore, newId, type AttachmentInput } from "./store.js";
import { emitEvent } from "./webhooks.js";

function decodeMime(raw: string): { headers: Record<string,string>; text?: string; html?: string; attachments: AttachmentInput[] } {
  const separator = raw.indexOf("\r\n\r\n");
  if (separator < 0) return { headers: {}, attachments: [] };
  const headerLines = raw.slice(0, separator).split(/\r\n(?=\S)/);
  const headers: Record<string,string> = {};
  for (const line of headerLines) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0,i).toLowerCase()] = line.slice(i+1).trim();
  }
  const body = raw.slice(separator + 4);
  const contentType = headers["content-type"] ?? "text/plain";
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) return { headers, text: body, attachments: [] };

  let text: string | undefined;
  let html: string | undefined;
  const attachments: AttachmentInput[] = [];
  for (const part of body.split("--" + boundary).slice(1)) {
    if (part.trim() === "--") continue;
    const split = part.replace(/^\r\n/, "").split(/\r\n\r\n/);
    if (split.length < 2) continue;
    const ph: Record<string,string> = {};
    for (const line of split[0].split(/\r\n(?=\S)/)) {
      const i=line.indexOf(":");
      if(i>0) ph[line.slice(0,i).toLowerCase()]=line.slice(i+1).trim();
    }
    let data=split.slice(1).join("\r\n\r\n").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const encoding=ph["content-transfer-encoding"]?.toLowerCase();
    if(encoding==="base64") data=Buffer.from(data.replace(/\s/g,""),"base64").toString("binary");
    const type=ph["content-type"] ?? "text/plain";
    const disp=ph["content-disposition"] ?? "";
    const filename=disp.match(/filename="?([^";]+)"?/i)?.[1] ?? type.match(/name="?([^";]+)"?/i)?.[1];
    if(filename) {
      const content=encoding==="base64" ? Buffer.from(data,"binary") : Buffer.from(data,"utf8");
      attachments.push({filename,contentType:type.split(";")[0],contentDisposition:disp,contentId:ph["content-id"],content});
    } else if(type.startsWith("text/html")) html=data;
    else if(type.startsWith("text/plain")) text=data;
  }
  return { headers, text, html, attachments };
}

export function startInboundSmtp(pool: Pool, hostname: string, port: number, domain: string): void {
  const store = new MailStore(pool);
  const server = net.createServer((socket) => {
    socket.setTimeout(30000);
    socket.write("220 " + hostname + " ReDom Mail ESMTP\r\n");
    let buffer="";
    let mailFrom="";
    let recipients:string[]=[];
    let dataMode=false;
    let data="";
    const reply=(s:string)=>socket.write(s+"\r\n");

    socket.on("data",(chunk)=>{
      buffer += chunk.toString("utf8");
      if(dataMode) {
        const end=buffer.indexOf("\r\n.\r\n");
        if(end<0){ data += buffer; buffer=""; return; }
        data += buffer.slice(0,end); buffer=buffer.slice(end+5); dataMode=false;
        void accept();
      }
      while(!dataMode && buffer.includes("\r\n")) {
        const i=buffer.indexOf("\r\n"); const line=buffer.slice(0,i); buffer=buffer.slice(i+2);
        const [command,...rest]=line.split(" "); const arg=rest.join(" ");
        if(command.toUpperCase()==="EHLO" || command.toUpperCase()==="HELO") reply("250-"+hostname+"\r\n250-8BITMIME\r\n250-SIZE 10485760\r\n250 STARTTLS");
        else if(command.toUpperCase()==="MAIL" && /^FROM:/i.test(arg)){ mailFrom=arg.replace(/^FROM:\s*<?|>$/gi,""); recipients=[]; reply("250 2.1.0 OK"); }
        else if(command.toUpperCase()==="RCPT" && /^TO:/i.test(arg)){ const address=arg.replace(/^TO:\s*<?|>$/gi,""); if(!address.toLowerCase().endsWith("@"+domain)) reply("550 5.7.1 Relay denied"); else { recipients.push(address); reply("250 2.1.5 OK"); } }
        else if(command.toUpperCase()==="DATA"){ if(!recipients.length) reply("503 5.5.1 Need RCPT TO"); else { dataMode=true; data=""; reply("354 End data with <CR><LF>.<CR><LF>"); } }
        else if(command.toUpperCase()==="RSET"){ mailFrom=""; recipients=[]; data=""; reply("250 2.0.0 OK"); }
        else if(command.toUpperCase()==="NOOP") reply("250 2.0.0 OK");
        else if(command.toUpperCase()==="QUIT"){ reply("221 2.0.0 Bye"); socket.end(); return; }
        else reply("502 5.5.2 Command not implemented");
      }
    });

    async function accept(): Promise<void> {
      try {
        const parsed=decodeMime(data);
        const from={email:mailFrom || parsed.headers["from"] || "unknown@invalid"};
        const message=await normalizeMessage({
          from,
          to: recipients,
          subject: parsed.headers["subject"] ?? "",
          text: parsed.text ?? (parsed.html ? undefined : " "),
          html: parsed.html,
          headers: parsed.headers,
        });
        message.id=newId("in");
        const saved=await store.saveMessage(message,"inbound","received",parsed.attachments);
        await emitEvent(pool,saved.message.id,"email.received",{
          email_id:saved.message.id,
          created_at:saved.message.createdAt,
          from:message.from.email,
          to:recipients,
          subject:message.subject,
          message_id:message.headers["message-id"],
          attachments:parsed.attachments.map((a)=>({filename:a.filename,content_type:a.contentType,size:a.content.length})),
        });
        reply("250 2.0.0 Accepted as "+saved.message.id);
      } catch (error) {
        reply("451 4.3.0 Temporary processing error");
      }
    }
  });
  server.listen(port,"0.0.0.0");
}
