import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.AURELINK_COMMUNICATIONS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set a stable AURELINK_COMMUNICATIONS_ENCRYPTION_KEY of at least 32 characters before connecting DNS credentials.");
  return createHash("sha256").update(secret).digest();
}
export function encryptAurelinkDnsSecret(value: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptAurelinkDnsSecret(value: string): string {
  const [iv,tag,data] = value.split(".");
  if (!iv || !tag || !data) throw new Error("Stored DNS provider credential is malformed.");
  const decipher = createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
}
async function cloudflareRequest(token: string, path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path,{
    method,
    headers:{authorization:`Bearer ${token}`,accept:"application/json",...(body===undefined?{}:{"content-type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(12000),
  });
  const payload:any = await response.json().catch(()=>({}));
  if(!response.ok || payload.success!==true) {
    const message=payload.errors?.map((item:any)=>item.message).filter(Boolean).join("; ") || `Cloudflare HTTP ${response.status}`;
    throw new Error(message.slice(0,400));
  }
  return payload.result;
}
export async function validateCloudflareZoneToken(token:string,zoneId:string,domain:string):Promise<{zoneId:string;zoneName:string}> {
  if(!token||token.length<20)throw new Error("A Cloudflare API token is required.");
  if(!/^[a-f0-9]{32}$/.test(zoneId))throw new Error("Cloudflare zone ID must be a 32-character hexadecimal ID.");
  const zone=await cloudflareRequest(token,`/zones/${zoneId}`);
  const zoneName=String(zone?.name||"").toLowerCase();
  if(!zoneName||!(domain===zoneName||domain.endsWith("."+zoneName)))throw new Error("The selected Cloudflare zone does not contain this domain.");
  return {zoneId,zoneName};
}
export async function applyCloudflareDnsRecords(token:string,zoneId:string,domain:string,records:any[]) {
  const results:any[]=[];
  for(const record of records) {
    const type=String(record.type||"").toUpperCase();
    if(!["TXT","CNAME","MX"].includes(type)){results.push({type,name:record.name,status:"unsupported",message:"Aurelink only auto-applies TXT, CNAME and MX records."});continue;}
    const shortName=String(record.name||"").replace(/\.$/,"");
    const name=!shortName||shortName==="@"?domain:(shortName===domain||shortName.endsWith("."+domain)?shortName:`${shortName}.${domain}`);
    const content=String(record.value||"").trim();
    if(!content){results.push({type,name,status:"invalid",message:"Provider supplied an empty DNS value."});continue;}
    const query=new URLSearchParams({type,name,per_page:"100"});
    const existing=await cloudflareRequest(token,`/zones/${zoneId}/dns_records?${query.toString()}`);
    const rows=Array.isArray(existing)?existing:[];
    const exact=rows.find((row:any)=>String(row.content||"").replace(/\.$/,"").toLowerCase()===content.replace(/\.$/,"").toLowerCase()&&(type!=="MX"||Number(row.priority)===Number(record.priority||0)));
    if(exact){results.push({type,name,status:"already_present",recordId:exact.id});continue;}
    if(rows.length && !(type==="TXT" && !content.toLowerCase().startsWith("v=spf1"))) {
      const isSpf=type==="TXT"&&content.toLowerCase().startsWith("v=spf1");
      results.push({type,name,status:"conflict",message:isSpf?"An SPF TXT record already exists at this hostname. Merge the provider include into the existing SPF record; never publish multiple SPF records.":"A different record of this type already exists at this hostname. Aurelink will not overwrite it.",existing:rows.map((row:any)=>({content:row.content,priority:row.priority}))});
      continue;
    }
    const body:any={type,name,content,ttl:1};
    if(type==="MX")body.priority=Number(record.priority||10);
    if(type==="CNAME")body.proxied=false;
    const created=await cloudflareRequest(token,`/zones/${zoneId}/dns_records`,"POST",body);
    results.push({type,name,status:"created",recordId:created.id});
  }
  return {appliedAt:new Date().toISOString(),results,complete:results.every(item=>item.status==="created"||item.status==="already_present")};
}
