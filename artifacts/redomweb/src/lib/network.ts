export type NetworkSecurity={ip:string|null;connection:string;country:string|null;countryCode:string|null;callingCode:string|null;region:string|null;city:string|null;timezone:string|null;organization:string|null;companyType:string|null;asn:number|null;datacenter:string|null;vpnService:string|null;egressService:string|null;egressProvider:string|null;proxy:boolean;vpn:boolean;tor:boolean;bot:boolean;abuser:boolean;mobile:boolean;satellite:boolean;fraudScore:number};
export type NetworkProviderResponse={success:boolean;networkProvider:string|null;termsUrl:string|null;termsLabel:string|null;security:NetworkSecurity|null;warning:string|null};

// Browser startup security is resolved by the ReDom backend; never perform a
// public-IP/provider lookup directly from the login page.
const BACKEND_TIMEOUT_MS=25_000;

function normalizeSecurity(value:unknown):NetworkSecurity|null{
  if(!value||typeof value!=="object")return null;
  const s=value as Record<string,unknown>;
  return {
    ip:typeof s.ip==="string"?s.ip:null,
    connection:typeof s.connection==="string"?s.connection:"Unknown",
    country:typeof s.country==="string"?s.country:null,
    countryCode:typeof s.countryCode==="string"?s.countryCode:null,
    callingCode:typeof s.callingCode==="string"?s.callingCode:null,
    region:typeof s.region==="string"?s.region:null,
    city:typeof s.city==="string"?s.city:null,
    timezone:typeof s.timezone==="string"?s.timezone:null,
    organization:typeof s.organization==="string"?s.organization:null,
    companyType:typeof s.companyType==="string"?s.companyType:null,
    asn:typeof s.asn==="number"?s.asn:null,
    datacenter:typeof s.datacenter==="string"?s.datacenter:null,
    vpnService:typeof s.vpnService==="string"?s.vpnService:null,
    egressService:typeof s.egressService==="string"?s.egressService:null,
    egressProvider:typeof s.egressProvider==="string"?s.egressProvider:null,
    proxy:s.proxy===true,vpn:s.vpn===true,tor:s.tor===true,bot:s.bot===true,abuser:s.abuser===true,
    mobile:s.mobile===true,satellite:s.satellite===true,
    fraudScore:Number.isFinite(Number(s.fraudScore))?Number(s.fraudScore):0
  };
}

export async function startupNetworkCheck(api:(path:string,options?:RequestInit)=>Promise<any>):Promise<NetworkProviderResponse>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),BACKEND_TIMEOUT_MS);
  try{
    const result=await api("/auth/network-provider",{signal:controller.signal});
    const security=normalizeSecurity(result?.security);
    if(result?.success&&security){
      return {
        success:true,
        networkProvider:typeof result.networkProvider==="string"?result.networkProvider:null,
        termsUrl:typeof result.termsUrl==="string"?result.termsUrl:null,
        termsLabel:typeof result.termsLabel==="string"?result.termsLabel:null,
        security,
        warning:typeof result.warning==="string"?result.warning:null
      };
    }
    return {
      success:false,networkProvider:null,termsUrl:null,termsLabel:null,security:null,
      warning:typeof result?.warning==="string"?result.warning:
        typeof result?.message==="string"?result.message:
        "ReDom could not complete the network security check."
    };
  }catch(error){
    return {
      success:false,networkProvider:null,termsUrl:null,termsLabel:null,security:null,
      warning:error instanceof Error&&error.name==="AbortError"
        ?"The network security check timed out."
        :error instanceof Error&&error.message
          ?error.message
          :"Unable to complete network security check."
    };
  }finally{
    window.clearTimeout(timer);
  }
}
