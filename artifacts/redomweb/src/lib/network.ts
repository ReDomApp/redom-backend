export type NetworkSecurity={ip:string|null;connection:string;country:string|null;countryCode:string|null;callingCode:string|null;region:string|null;city:string|null;timezone:string|null;organization:string|null;companyType:string|null;asn:number|null;datacenter:string|null;vpnService:string|null;egressService:string|null;egressProvider:string|null;proxy:boolean;vpn:boolean;tor:boolean;bot:boolean;abuser:boolean;mobile:boolean;satellite:boolean;fraudScore:number};
export type NetworkProviderResponse={success:boolean;networkProvider:string|null;termsUrl:string|null;security:NetworkSecurity|null;warning:string|null};

const PUBLIC_IP_TIMEOUT_MS=8_000;
const IPAPI_ENDPOINTS=["https://api.ipapi.is","https://us.ipapi.is"] as const;
const BACKEND_TIMEOUT_MS=25_000;

async function getPublicIp():Promise<string>{
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),PUBLIC_IP_TIMEOUT_MS);
  try{
    let response:Response|null=null;
    let lastError:unknown=null;

    for(const endpoint of IPAPI_ENDPOINTS){
      try{
        response=await fetch(endpoint,{
          method:"GET",
          headers:{Accept:"application/json"},
          signal:controller.signal,
          cache:"no-store"
        });
        break;
      }catch(error){
        lastError=error;
      }
    }

    if(!response)throw lastError instanceof Error?lastError:new Error("Unable to connect to IPAPI.");

    let payload:{ip?:unknown;error?:unknown;error_code?:unknown};
    try{
      payload=await response.json() as typeof payload;
    }catch{
      throw new Error("IPAPI returned an invalid response.");
    }

    if(!response.ok||typeof payload.ip!=="string"||!payload.ip.trim()){
      const code=typeof payload.error_code==="string"?payload.error_code:"IP_LOOKUP_FAILED";
      throw new Error(`Public IP detection failed (${code}).`);
    }

    return payload.ip.trim();
  }finally{
    window.clearTimeout(timeout);
  }
}

export async function startupNetworkCheck(api:(path:string,options?:RequestInit)=>Promise<any>):Promise<NetworkProviderResponse>{
  try{
    const ip=await getPublicIp();
    const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),BACKEND_TIMEOUT_MS);
    try{
      const result=await api("/auth/network-provider?ip="+encodeURIComponent(ip),{signal:controller.signal});
      if(result?.success&&result?.security)return result as NetworkProviderResponse;
      return {success:false,networkProvider:null,termsUrl:null,security:null,warning:result?.warning||result?.message||"ReDom could not complete the network security check."};
    }finally{
      window.clearTimeout(timer);
    }
  }catch(error){
    return {
      success:false,
      networkProvider:null,
      termsUrl:null,
      security:null,
      warning:error instanceof Error&&error.name==="AbortError"
        ?"The network security check timed out."
        :error instanceof Error&&error.message?error.message
        :"Unable to complete network security check."
    };
  }
}