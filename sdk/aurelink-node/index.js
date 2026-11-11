import { createHmac, timingSafeEqual } from "node:crypto";
export class AurelinkError extends Error {
  constructor(message,{status=0,code="AURELINK_ERROR",requestId=null,retryAfter=null,rateLimitLimit=null,rateLimitRemaining=null,details=null}={}){super(message);this.name="AurelinkError";this.status=status;this.code=code;this.requestId=requestId;this.retryAfter=retryAfter;this.rateLimitLimit=rateLimitLimit;this.rateLimitRemaining=rateLimitRemaining;this.details=details;}
}
export class Aurelink {
  constructor({apiKey,baseUrl="https://redom-backend.onrender.com/redom-backend/v1",fetch:fetchImpl=globalThis.fetch,timeoutMs=20000}={}){
    if(!apiKey||typeof apiKey!=="string")throw new TypeError("Aurelink apiKey is required.");
    if(typeof fetchImpl!=="function")throw new TypeError("Aurelink requires a Fetch-compatible implementation.");
    this.apiKey=apiKey;this.baseUrl=String(baseUrl).replace(/\/+$/,"");this.fetch=fetchImpl;this.timeoutMs=timeoutMs;
    this.services={list:(query)=>this.request("GET","/aurelink/catalog/services",{query})};
    this.countries={list:(query)=>this.request("GET","/aurelink/catalog/countries",{query})};
    this.orders={list:(query)=>this.request("GET","/aurelink/orders",{query})};
    this.wallet={retrieve:()=>this.request("GET","/aurelink/wallet"),ledger:(query)=>this.request("GET","/aurelink/wallet/ledger",{query})};
    this.communications={
      overview:()=>this.request("GET","/aurelink/communications/overview"),
      analytics:(query)=>this.request("GET","/aurelink/communications/analytics",{query}),
      billing:{
        overview:()=>this.request("GET","/aurelink/communications/billing/overview"),
        usage:(query)=>this.request("GET","/aurelink/communications/billing/usage",{query}),
        statement:(month)=>this.request("GET","/aurelink/communications/billing/statement",{query:{month}})
      },
      reputation:{
        retrieve:()=>this.request("GET","/aurelink/communications/reputation"),
        acknowledge:(id)=>this.request("POST","/aurelink/communications/reputation/alerts/"+encodeURIComponent(id)+"/acknowledge")
      },
      team:{
        members:()=>this.request("GET","/aurelink/communications/team/members"),
        invite:(body)=>this.request("POST","/aurelink/communications/team/invitations",{body}),
        acceptInvitation:(token)=>this.request("POST","/aurelink/communications/team/invitations/accept",{body:{token}}),
        changeRole:(id,role)=>this.request("PATCH","/aurelink/communications/team/members/"+encodeURIComponent(id)+"/role",{body:{role}}),
        revoke:(id)=>this.request("DELETE","/aurelink/communications/team/members/"+encodeURIComponent(id))
      },
      domains:{
        list:()=>this.request("GET","/aurelink/communications/domains"),
        create:(body)=>this.request("POST","/aurelink/communications/domains",{body}),
        check:(id)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/check"),
        suspend:(id,reason)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/suspend",{body:{reason}}),
        resume:(id)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/resume"),
        remove:(id)=>this.request("DELETE","/aurelink/communications/domains/"+encodeURIComponent(id)),
        setTrackingDomain:(id,trackingDomain)=>this.request("PUT","/aurelink/communications/domains/"+encodeURIComponent(id)+"/tracking-domain",{body:{trackingDomain}}),
        verifyTrackingDomain:(id)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/tracking-domain/verify"),
        verify:(id)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/verify"),tracking:(id,body)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/tracking",{body}),
        applyDns:(id)=>this.request("POST","/aurelink/communications/domains/"+encodeURIComponent(id)+"/apply-dns"),
        connectCloudflare:(body)=>this.request("POST","/aurelink/communications/dns/cloudflare/connect",{body}),
        cloudflareConnections:()=>this.request("GET","/aurelink/communications/dns/cloudflare/connections")
      },
      emailSenders:{
        list:()=>this.request("GET","/aurelink/communications/email-senders"),
        create:(body)=>this.request("POST","/aurelink/communications/email-senders",{body}),
        check:(id)=>this.request("POST","/aurelink/communications/email-senders/"+encodeURIComponent(id)+"/check")
      },
      senders:{
        list:()=>this.request("GET","/aurelink/communications/senders"),
        request:(body)=>this.request("POST","/aurelink/communications/senders",{body})
      },
      smtp:{
        credentials:{
          list:()=>this.request("GET","/aurelink/communications/smtp/credentials"),
          create:(body)=>this.request("POST","/aurelink/communications/smtp/credentials",{body}),
          revoke:(id)=>this.request("DELETE","/aurelink/communications/smtp/credentials/"+encodeURIComponent(id))
        }
      },
      templates:{list:(query)=>this.request("GET","/aurelink/communications/templates",{query}),create:(body)=>this.request("POST","/aurelink/communications/templates",{body}),update:(id,body)=>this.request("PATCH","/aurelink/communications/templates/"+encodeURIComponent(id),{body}),archive:(id)=>this.request("DELETE","/aurelink/communications/templates/"+encodeURIComponent(id))},
      messages:{list:(query)=>this.request("GET","/aurelink/communications/messages",{query}),retrieve:(id)=>this.request("GET","/aurelink/communications/messages/"+encodeURIComponent(id)),retry:(id,options)=>this.request("POST","/aurelink/communications/messages/"+encodeURIComponent(id)+"/retry",{...options})},
      contacts:{list:(query)=>this.request("GET","/aurelink/communications/contacts",{query}),upsert:(body)=>this.request("POST","/aurelink/communications/contacts",{body})},
      sms:{send:(body,options)=>this.request("POST","/aurelink/communications/sms/send",{body,...options})},
      email:{send:(body,options)=>this.request("POST","/aurelink/communications/email/send",{body,...options})},
      campaigns:{
        list:()=>this.request("GET","/aurelink/communications/campaigns"),
        create:(body)=>this.request("POST","/aurelink/communications/campaigns",{body}),
        send:(id,body)=>this.request("POST","/aurelink/communications/campaigns/"+encodeURIComponent(id)+"/send",{body})
      }
    };
    this.verify={
      start:(body,options)=>this.request("POST","/aurelink/verify/start",{body,...options}),
      check:(id,code)=>this.request("POST","/aurelink/verify/"+encodeURIComponent(id)+"/check",{body:{code}})
    };
    this.activations={
      quote:(body)=>this.request("POST","/aurelink/quotes",{body}),
      create:(body,options)=>this.request("POST","/aurelink/activations",{body,...options}),
      retrieve:(id)=>this.request("GET","/aurelink/activations/"+encodeURIComponent(id)+"/status"),
      messages:(id)=>this.request("GET","/aurelink/activations/"+encodeURIComponent(id)+"/messages"),
      resend:(id,body={})=>this.request("POST","/aurelink/activations/"+encodeURIComponent(id)+"/resend",{body}),
      cancel:(id,body={})=>this.request("POST","/aurelink/activations/"+encodeURIComponent(id)+"/cancel",{body})
    };
    this.rentals={
      list:(query)=>this.request("GET","/aurelink/catalog/rentals",{query}),
      services:(rentalId,query)=>this.request("GET","/aurelink/catalog/rentals/"+encodeURIComponent(rentalId)+"/services",{query}),
      pricing:(rentalId,query)=>this.request("GET","/aurelink/catalog/rentals/"+encodeURIComponent(rentalId)+"/pricing",{query}),
      quote:(body)=>this.request("POST","/aurelink/rental-quotes",{body}),
      create:(body,options)=>this.request("POST","/aurelink/rentals",{body,...options}),
      retrieve:(id)=>this.request("GET","/aurelink/rentals/"+encodeURIComponent(id)+"/status"),
      messages:(id)=>this.request("GET","/aurelink/rentals/"+encodeURIComponent(id)+"/messages"),
      renew:(id,body={},options)=>this.request("POST","/aurelink/rentals/"+encodeURIComponent(id)+"/renew",{body,...options}),
      cancel:(id,body={})=>this.request("POST","/aurelink/rentals/"+encodeURIComponent(id)+"/cancel",{body})
    };
    this.nonVoip={
      countries:()=>this.request("GET","/aurelink/nonvoip/countries"),
      products:(query)=>this.request("GET","/aurelink/nonvoip/products",{query}),
      create:(body,options)=>this.request("POST","/aurelink/nonvoip/orders",{body,...options}),
      messages:(id)=>this.request("GET","/aurelink/nonvoip/orders/"+encodeURIComponent(id)+"/messages"),
      cancel:(id,body={})=>this.request("POST","/aurelink/nonvoip/orders/"+encodeURIComponent(id)+"/cancel",{body})
    };
    this.dedicated={
      countries:()=>this.request("GET","/aurelink/dedicated/countries"),
      quote:(body)=>this.request("POST","/aurelink/dedicated/quote",{body}),
      create:(body,options)=>this.request("POST","/aurelink/dedicated/orders",{body,...options}),
      messages:(id)=>this.request("GET","/aurelink/dedicated/orders/"+encodeURIComponent(id)+"/messages"),
      setAutoRenew:(id,enabled)=>this.request("PATCH","/aurelink/dedicated/orders/"+encodeURIComponent(id)+"/auto-renew",{body:{enabled}}),
      cancel:(id,body={})=>this.request("POST","/aurelink/dedicated/orders/"+encodeURIComponent(id)+"/cancel",{body})
    };
  }
  async request(method,path,{query,body,headers={},idempotencyKey,timeoutMs}={}){
    const url=new URL(this.baseUrl+path);
    if(query&&typeof query==="object")for(const [key,value] of Object.entries(query)){if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));}
    const requestHeaders={Accept:"application/json",Authorization:"Bearer "+this.apiKey,...headers};
    if(body!==undefined)requestHeaders["Content-Type"]="application/json";
    if(idempotencyKey)requestHeaders["Idempotency-Key"]=String(idempotencyKey);
    let response;
    try{response=await this.fetch(url,{method,headers:requestHeaders,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeoutMs||this.timeoutMs),redirect:"error"});}
    catch(error){throw new AurelinkError(error instanceof Error?error.message:"Aurelink network request failed.",{code:"NETWORK_ERROR"});}
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.success===false)throw new AurelinkError(data?.message||"Aurelink API request failed.",{status:response.status,code:data?.code||"AURELINK_API_ERROR",requestId:response.headers.get("x-aurelink-request-id"),retryAfter:response.headers.get("retry-after"),rateLimitLimit:response.headers.get("x-aurelink-ratelimit-limit"),rateLimitRemaining:response.headers.get("x-aurelink-ratelimit-remaining"),details:data});
    return data;
  }
}
export function verifyAurelinkWebhook({payload,signature,timestamp,secret,toleranceSeconds=300}){
  if(payload==null||!signature||!timestamp||!secret)return false;
  const ts=Number(timestamp);if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>toleranceSeconds)return false;
  const expected=createHmac("sha256",secret).update(String(timestamp)+".").update(payload).digest("hex"),supplied=String(signature).replace(/^v1=/,"");
  if(!/^[a-f0-9]{64}$/i.test(supplied))return false;
  const a=Buffer.from(expected,"hex"),b=Buffer.from(supplied,"hex");return a.length===b.length&&timingSafeEqual(a,b);
}
