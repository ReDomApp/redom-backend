export type NetworkSecurity={ip:string|null;connection:string;country:string|null;countryCode:string|null;callingCode:string|null;region:string|null;city:string|null;timezone:string|null;organization:string|null;companyType:string|null;asn:number|null;datacenter:string|null;vpnService:string|null;egressService:string|null;egressProvider:string|null;proxy:boolean;vpn:boolean;tor:boolean;bot:boolean;abuser:boolean;mobile:boolean;satellite:boolean;fraudScore:number};
export type NetworkProviderResponse={success:boolean;networkProvider:string|null;termsUrl:string|null;security:NetworkSecurity|null;warning:string|null};

async function publicIp(){
  const endpoints=["https://api.ipapi.is","https://us.ipapi.is"];
  for(const endpoint of endpoints){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),5000);
      const r=await fetch(endpoint,{headers:{Accept:"application/json"},signal:controller.signal});
      clearTimeout(timer);
      const j=await r.json();
      if(r.ok&&typeof j.ip==="string"&&j.ip.trim()) return j.ip.trim();
    }catch{}
  }
  return null;
}

export async function startupNetworkCheck(api:(path:string,options?:RequestInit)=>Promise<any>):Promise<NetworkProviderResponse>{
  const ip=await publicIp();
  const suffix=ip?"?ip="+encodeURIComponent(ip):"";
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      return await api("/auth/network-provider"+suffix,{signal:controller.signal});
    }finally{
      clearTimeout(timer);
    }
  }catch(e){
    return {
      success:false,
      networkProvider:null,
      termsUrl:null,
      security:null,
      warning:e instanceof Error && e.name==="AbortError"
        ?"The network security check timed out. Please retry."
        :e instanceof Error?e.message:"Unable to complete network security check."
    };
  }
}
