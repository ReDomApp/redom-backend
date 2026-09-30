export type NetworkSecurity={ip:string|null;connection:string;country:string|null;countryCode:string|null;callingCode:string|null;region:string|null;city:string|null;timezone:string|null;organization:string|null;companyType:string|null;asn:number|null;datacenter:string|null;vpnService:string|null;egressService:string|null;egressProvider:string|null;proxy:boolean;vpn:boolean;tor:boolean;bot:boolean;abuser:boolean;mobile:boolean;satellite:boolean;fraudScore:number};
export type NetworkProviderResponse={success:boolean;networkProvider:string|null;termsUrl:string|null;security:NetworkSecurity|null;warning:string|null};

const PUBLIC_IP_ENDPOINTS=["https://api.ipapi.is","https://us.ipapi.is"] as const;
const PUBLIC_IP_TIMEOUT_MS=8_000;
const BACKEND_TIMEOUT_MS=25_000;

function isUsablePublicIp(value:string):boolean{
  const ip=value.trim();
  if(!ip)return false;
  if(ip.includes(":")){
    const lower=ip.toLowerCase();
    return lower!=="::"&&lower!=="::1"&&!lower.startsWith("fc")&&!lower.startsWith("fd")&&!lower.startsWith("fe8")&&!lower.startsWith("fe9")&&!lower.startsWith("fea")&&!lower.startsWith("feb");
  }
  const parts=ip.split(".").map(Number);
  if(parts.length!==4||parts.some(part=>!Number.isInteger(part)||part<0||part>255))return false;
  const [a,b]=parts;
  if(a===10||a===127||a===0||a>=224)return false;
  if(a===169&&b===254)return false;
  if(a===172&&b>=16&&b<=31)return false;
  if(a===192&&b===168)return false;
  if(a===100&&b>=64&&b<=127)return false;
  return true;
}

async function fetchPublicIp(endpoint:string):Promise<string|null>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),PUBLIC_IP_TIMEOUT_MS);
  try{
    const response=await fetch(endpoint,{method:"GET",headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
    if(!response.ok)return null;
    const payload=await response.json() as {ip?:unknown};
    const ip=typeof payload.ip==="string"?payload.ip.trim():"";
    return isUsablePublicIp(ip)?ip:null;
  }catch{
    return null;
  }finally{
    window.clearTimeout(timer);
  }
}

/**
 * The browser must identify the user's current public connection directly.
 * A Vercel/Render request IP is never substituted because it belongs to the
 * hosting path rather than the user's network.
 */
async function publicIp():Promise<string|null>{
  for(const endpoint of PUBLIC_IP_ENDPOINTS){
    const ip=await fetchPublicIp(endpoint);
    if(ip)return ip;
  }
  return null;
}

export async function startupNetworkCheck(api:(path:string,options?:RequestInit)=>Promise<any>):Promise<NetworkProviderResponse>{
  const ip=await publicIp();
  if(!ip){
    return {
      success:false,
      networkProvider:null,
      termsUrl:null,
      security:null,
      warning:"ReDom could not determine the public IP of your current network. The hosting server IP is not used. Please retry the network check."
    };
  }
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),BACKEND_TIMEOUT_MS);
  try{
    const result=await api("/auth/network-provider?ip="+encodeURIComponent(ip),{signal:controller.signal});
    if(result?.success&&result?.security)return result as NetworkProviderResponse;
    return {success:false,networkProvider:null,termsUrl:null,security:null,warning:result?.warning||result?.message||"ReDom could not complete the network security check."};
  }catch(e){
    return {success:false,networkProvider:null,termsUrl:null,security:null,warning:e instanceof Error&&e.name==="AbortError"?"The network security check timed out after the current network IP was detected. Please retry.":e instanceof Error&&e.message?e.message:"Unable to complete network security check."};
  }finally{
    window.clearTimeout(timer);
  }
}