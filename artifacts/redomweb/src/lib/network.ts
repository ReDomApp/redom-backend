export type NetworkSecurity={ip:string|null;connection:string;country:string|null;countryCode:string|null;callingCode:string|null;region:string|null;city:string|null;timezone:string|null;organization:string|null;companyType:string|null;asn:number|null;datacenter:string|null;vpnService:string|null;egressService:string|null;egressProvider:string|null;proxy:boolean;vpn:boolean;tor:boolean;bot:boolean;abuser:boolean;mobile:boolean;satellite:boolean;fraudScore:number};
export type NetworkProviderResponse={success:boolean;networkProvider:string|null;termsUrl:string|null;termsLabel:string|null;security:NetworkSecurity|null;warning:string|null};

const PUBLIC_IP_ENDPOINTS=["https://api.ipapi.is","https://us.ipapi.is"] as const;
const PUBLIC_IP_TIMEOUT_MS=8_000;
const BACKEND_TIMEOUT_MS=25_000;

async function fetchPublicIp(endpoint:string):Promise<string|null>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),PUBLIC_IP_TIMEOUT_MS);
  try{
    const response=await fetch(endpoint,{method:"GET",headers:{Accept:"application/json"},signal:controller.signal,cache:"no-store"});
    if(!response.ok)return null;
    const payload=await response.json() as {ip?:unknown};
    return typeof payload.ip==="string"&&payload.ip.trim()?payload.ip.trim():null;
  }catch{
    return null;
  }finally{
    window.clearTimeout(timer);
  }
}

/**
 * Restore the former Web startup behavior:
 * 1. Discover the current browser public IP when available.
 * 2. Try both IPAPI endpoints independently.
 * 3. If direct discovery is unavailable, still call the ReDom backend so
 *    startup can complete using the backend's network-resolution path.
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
  const suffix=ip?"?ip="+encodeURIComponent(ip):"";
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),BACKEND_TIMEOUT_MS);
  try{
    const result=await api("/auth/network-provider"+suffix,{signal:controller.signal});
    if(result?.success&&result?.security)return result as NetworkProviderResponse;
    return {
      success:false,
      networkProvider:null,
      termsUrl:typeof result?.termsUrl==="string"?result.termsUrl:null,
      termsLabel:typeof result?.termsLabel==="string"?result.termsLabel:null,
      security:null,
      warning:result?.warning||result?.message||"ReDom could not complete the network security check."
    };
  }catch(e){
    return {
      success:false,
      networkProvider:null,
      termsUrl:null,
      termsLabel:null,
      security:null,
      warning:e instanceof Error&&e.name==="AbortError"
        ?"The network security check timed out after the fallback endpoints were attempted. Please retry."
        :e instanceof Error&&e.message?e.message:"Unable to complete network security check."
    };
  }finally{
    window.clearTimeout(timer);
  }
}
