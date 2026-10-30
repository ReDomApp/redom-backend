import { randomUUID } from "node:crypto";

const BASE = "https://nonvoip.com/api/v1";
export type NvRow = Record<string, unknown>;
export class NonVoipError extends Error { constructor(message:string, public status=502, public code="NONVOIP_ERROR"){super(message);} }
function key(){const value=process.env.NONVOIP_API_KEY?.trim();if(!value)throw new NonVoipError("NonVoip is not configured. Aurelink support must configure NONVOIP_API_KEY in Render.",503,"NOT_CONFIGURED");return value;}
export function nvRecord(v:unknown):NvRow{return v&&typeof v==="object"&&!Array.isArray(v)?v as NvRow:{};}
export function nvRows(v:unknown):NvRow[]{if(Array.isArray(v))return v.map(nvRecord);const o=nvRecord(v);for(const k of ["products","offers","services","items","results","countries"])if(Array.isArray(o[k]))return (o[k] as unknown[]).map(nvRecord);if(o.data&&o.data!==v)return nvRows(o.data);return Object.values(o).filter(x=>x&&typeof x==="object"&&!Array.isArray(x)).map(nvRecord);}
export class NonVoipClient {
 private async request(path:string,init:RequestInit={}):Promise<NvRow>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(BASE+path,{...init,signal:controller.signal,headers:{Authorization:"Bearer "+key(),Accept:"application/json","Content-Type":"application/json",...(init.headers||{})}});
   const body=await response.json().catch(()=>({}));const root=nvRecord(body);
   if(!response.ok||root.success===false){const err=nvRecord(root.error);throw new NonVoipError(String(err.message||root.message||"NonVoip request failed."),response.status,String(err.code||"NONVOIP_REJECTED"));}
   return nvRecord(root.data??body);
  }catch(e){if(e instanceof NonVoipError)throw e;if(e instanceof Error&&e.name==="AbortError")throw new NonVoipError("NonVoip request timed out.",504,"TIMEOUT");throw new NonVoipError("Unable to reach NonVoip.",502,"NETWORK_ERROR");}finally{clearTimeout(timer);}
 }
 products(type:"long-term",countryCode?:string,page=1,perPage=50){const q=new URLSearchParams({type,page:String(page),per_page:String(perPage)});if(countryCode)q.set("country",countryCode);return this.request("/products?"+q);}
 account(){return this.request("/account");}
 createOrder(input:{serviceId:string;offerId:string;quotedPrice:string;idempotencyKey:string}){return this.request("/orders",{method:"POST",headers:{"Idempotency-Key":input.idempotencyKey},body:JSON.stringify({type:"long-term",service_id:input.serviceId,offer_id:input.offerId,quoted_price:input.quotedPrice})});}
 order(id:string){return this.request("/orders/"+encodeURIComponent(id));}
 messages(id:string){return this.request("/orders/"+encodeURIComponent(id)+"/messages?sync=0");}
 cancel(id:string){return this.request("/orders/"+encodeURIComponent(id)+"/cancel",{method:"POST",body:JSON.stringify({})});}
}
export const nonVoipClient=new NonVoipClient();
export const nonVoipIdempotencyKey=()=>randomUUID();
