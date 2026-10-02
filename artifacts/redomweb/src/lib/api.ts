export type Session = { sessionId: string; accessToken: string; refreshToken: string; expiresAt: string };
const SESSION_KEY = "redom.web.session";
const DEFAULT_API = "https://redom-backend.onrender.com/redom-backend";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API).replace(/\/+$/, "");

export function getSession(): Session | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
export function clearSession(){ saveSession(null); }

async function rawRequest(path:string, options:RequestInit={}, token?:string) {
  const headers = new Headers(options.headers);
  headers.set("Accept","application/json");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
  if (token) headers.set("Authorization",`Bearer ${token}`);
  const res = await fetch(/^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path.startsWith("/") ? path : "/"+path}`, {...options,credentials: options.credentials ?? "include",headers});
  const type=res.headers.get("content-type")||"";
  const payload=type.includes("application/json") ? await res.json().catch(()=>null) : await res.text().catch(()=>null);
  if(!res.ok){ const body=payload && typeof payload==="object" ? payload as Record<string,unknown> : {}; throw new Error(typeof body.message==="string" ? body.message : `Request failed (${res.status})`); }
  return payload;
}

export async function api<T=any>(path:string, options:RequestInit={}, retry=true):Promise<T>{
  const session=getSession();
  try { return await rawRequest(path,options,session?.accessToken); }
  catch(error){
    if(retry && (error instanceof Error) && /401|unauthorized|token/i.test(error.message) && session?.refreshToken){
      try{
        const refreshed=await rawRequest("/auth/refresh",{method:"POST",body:JSON.stringify({refreshToken:session.refreshToken})});
        if(refreshed?.session){ saveSession(refreshed.session); return await rawRequest(path,options,refreshed.session.accessToken) as T; }
      }catch{}
    }
    throw error;
  }
}
export const get=<T=any>(path:string)=>api<T>(path);
export const post=<T=any>(path:string,body?:unknown)=>api<T>(path,{method:"POST",body:body===undefined?undefined:JSON.stringify(body)});
export const patch=<T=any>(path:string,body?:unknown)=>api<T>(path,{method:"PATCH",body:body===undefined?undefined:JSON.stringify(body)});
export const del=<T=any>(path:string,body?:unknown)=>api<T>(path,{method:"DELETE",body:body===undefined?undefined:JSON.stringify(body)});
