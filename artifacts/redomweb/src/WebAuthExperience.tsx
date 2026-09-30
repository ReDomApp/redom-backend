import { useEffect, useMemo, useState } from "react";
import { api, post, patch, saveSession, type Session } from "./lib/api";
import { startupNetworkCheck, type NetworkProviderResponse } from "./lib/network";
import { ReDomMark, ShieldIcon, LockIcon, SearchIcon, CheckIcon } from "./components/Icons";

type User = { id:string; firstName:string; lastName:string; username:string; profilePhoto?:string|null; profileId?:string|null };
type Screen =
  | "startup"|"login"|"find-account"|"reset-code"|"reset-password"|"device-verify"|"two-factor"
  | "register-welcome"|"register-identity"|"register-birthday"|"register-gender"|"register-phone"
  | "register-email"|"register-password"|"register-review"|"register-verify"|"customizing";
type RegFlow = {
  reservationId:string; flowId:string; expiresAt:string;
  firstName?:string; lastName?:string; dateOfBirth?:string; gender?:string; pronouns?:string;
  phoneNumber?:string; phoneCountry?:string; email?:string; passwordStrength?:"weak"|"medium"|"strong";
  rememberLoginInfo?:boolean;
};
const REG_KEY = "redom.web.registration";
const DEVICE_KEY = "redom.web.device";
const readReg = ():RegFlow|null => { try { const raw=sessionStorage.getItem(REG_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const writeReg = (v:RegFlow) => sessionStorage.setItem(REG_KEY, JSON.stringify(v));
const clearReg = () => sessionStorage.removeItem(REG_KEY);
const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "web-"+Date.now()+"-"+Math.random().toString(36).slice(2); localStorage.setItem(DEVICE_KEY,id); }
  return id;
};
const ageFrom = (v:string) => { const d=new Date(v+"T00:00:00"), n=new Date(); let a=n.getFullYear()-d.getFullYear(); const m=n.getMonth()-d.getMonth(); if(m<0||(m===0&&n.getDate()<d.getDate())) a--; return a; };
const formatTime = (seconds:number) => `${Math.floor(seconds/60).toString().padStart(2,"0")}:${(seconds%60).toString().padStart(2,"0")}`;
const maskFlow = (v:string) => `${v.slice(0,4)}${"•".repeat(Math.max(0,v.length-4))}√`;
const publicIp = async () => {
  for (const url of ["https://api.ipapi.is","https://us.ipapi.is"]) {
    try { const c=new AbortController(); const t=window.setTimeout(()=>c.abort(),5000); const r=await fetch(url,{headers:{Accept:"application/json"},signal:c.signal}); clearTimeout(t); const j=await r.json(); if(r.ok && typeof j.ip==="string" && j.ip.trim()) return j.ip.trim(); } catch {}
  }
  return null;
};

function routeFromPath():Screen {
  const p=window.location.pathname.toLowerCase();
  if(p.includes("findaccount")) return "find-account";
  if(p.includes("deviceverification")) return "device-verify";
  if(p.includes("logintwofactor")) return "two-factor";
  if(p.includes("registrationwelcome")) return "register-welcome";
  if(p.includes("registrationidentity")) return "register-identity";
  if(p.includes("registrationbirthday")) return "register-birthday";
  if(p.includes("registrationgender")) return "register-gender";
  if(p.includes("registrationphone")) return "register-phone";
  if(p.includes("registrationemail")) return "register-email";
  if(p.includes("registrationpassword")) return "register-password";
  if(p.includes("registrationreview")) return "register-review";
  if(p.includes("registrationverification")) return "register-verify";
  if(p.includes("customizingexperience")) return "customizing";
  return "login";
}

export function WebAuthExperience({ initialScreen, onAuthenticated }:{initialScreen?:Screen;onAuthenticated:(user:User,session:Session)=>void}) {
  const [screen,setScreen] = useState<Screen>(initialScreen ?? routeFromPath());
  const [network,setNetwork] = useState<NetworkProviderResponse|null>(null);
  const [reg,setReg] = useState<RegFlow|null>(()=>readReg());
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(()=>{ if(screen!=="startup") return; void (async()=>{ const result=await startupNetworkCheck(api); setNetwork(result); })(); },[screen]);
  useEffect(()=>{ const onPop=()=>setScreen(routeFromPath()); window.addEventListener("popstate",onPop); return()=>window.removeEventListener("popstate",onPop); },[]);

  const go=(next:Screen, replace=false)=>{
    const pathMap:Record<Screen,string>={startup:"/app/startup",login:"/app/login","find-account":"/app/findAccount","reset-code":"/app/resetCode","reset-password":"/app/resetPassword","device-verify":"/app/deviceVerification","two-factor":"/app/loginTwoFactor","register-welcome":"/app/registrationWelcome","register-identity":"/app/registrationIdentity","register-birthday":"/app/registrationBirthday","register-gender":"/app/registrationGender","register-phone":"/app/registrationPhone","register-email":"/app/registrationEmail","register-password":"/app/registrationPassword","register-review":"/app/registrationReview","register-verify":"/app/registrationVerification",customizing:"/app/customizingExperience"};
    if(replace) window.history.replaceState({}, "", pathMap[next]); else window.history.pushState({}, "", pathMap[next]);
    setScreen(next); setError("");
  };

  const startRegistration = async()=>{
    setBusy(true); setError("");
    try { const r=await post<any>("/auth/register/flow",{deviceId:getDeviceId()}); const f={reservationId:r.reservationId,flowId:r.flowId,expiresAt:r.expiresAt}; writeReg(f); setReg(f); go("register-identity",true); }
    catch(e){setError(e instanceof Error?e.message:"Unable to start registration.");} finally{setBusy(false);}
  };

  const finishLogin = (r:any)=>{
    if(r.success&&r.user&&r.session){ saveSession(r.session); onAuthenticated(r.user,r.session); return true; }
    return false;
  };

  if(screen==="startup") return <Startup network={network} onResult={r=>{setNetwork(r); if(r.success&&r.security) go("login",true);}} />;
  if(screen==="login") return <Login network={network} busy={busy} setBusy={setBusy} error={error} setError={setError} go={go} onAuthenticated={finishLogin} />;
  if(screen==="find-account") return <FindAccount go={go} error={error} setError={setError}/>;
  if(screen==="reset-code") return <ResetCode go={go} error={error} setError={setError}/>;
  if(screen==="reset-password") return <ResetPassword go={go} error={error} setError={setError}/>;
  if(screen==="device-verify") return <LoginChallenge kind="device" go={go} onAuthenticated={finishLogin} error={error} setError={setError}/>;
  if(screen==="two-factor") return <LoginChallenge kind="2fa" go={go} onAuthenticated={finishLogin} error={error} setError={setError}/>;
  if(screen==="register-welcome") return <RegisterWelcome start={startRegistration} go={go} busy={busy} error={error}/>;
  if(!reg) return <RegisterWelcome start={startRegistration} go={go} busy={busy} error="Your registration flow is missing or expired. Start again."/>;
  if(screen==="register-identity") return <Identity flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go}/>;
  if(screen==="register-birthday") return <Birthday flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go}/>;
  if(screen==="register-gender") return <Gender flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go}/>;
  if(screen==="register-phone") return <Phone flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go} network={network}/>;
  if(screen==="register-email") return <Email flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go}/>;
  if(screen==="register-password") return <Password flow={reg} update={f=>{setReg(f);writeReg(f)}} go={go}/>;
  if(screen==="register-review") return <Review flow={reg} go={go}/>;
  if(screen==="register-verify") return <RegisterVerify flow={reg} go={go} />;
  return <Customizing flow={reg} onAuthenticated={onAuthenticated} />;
}

function AuthShell({children,title,subtitle,step}:{children:React.ReactNode;title?:string;subtitle?:string;step?:number}) {
  return <div className="auth-wrap"><div className="auth-card premium-auth-card"><section className="auth-content"><div className="auth-brand"><ReDomMark size={48}/><b>ReDom</b></div>{step!==undefined?<div className="stepbar">{Array.from({length:6},(_,i)=><i key={i} className={i<=step?"done":""}/>)}</div>:null}{title?<h1>{title}</h1>:null}{subtitle?<p>{subtitle}</p>:null}{children}<small className="auth-foot">ReDom Platforms, Inc. · Protected Web experience</small></section><aside className="auth-security-rail"><div className="auth-security-icon"><ShieldIcon/></div><span className="eyebrow">REDOM SECURITY</span><h2>Security is active, not decorative.</h2><p>Network, device, registration-flow and session checks are performed through the ReDom Backend before protected access is granted.</p><div className="auth-security-list"><div><b>Network boundary</b><span>Public network signals are checked before Login and during registration.</span></div><div><b>Device identity</b><span>This browser receives a stable ReDom device identifier for protected authentication actions.</span></div><div><b>Verification gates</b><span>New-browser verification and two-factor challenges can stop session creation.</span></div><div><b>Server session</b><span>Only a backend-issued session is allowed to enter the Home Feed.</span></div></div><div className="auth-security-status"><i/> Backend security boundary active</div></aside></div></div>;
}

function Startup({network,onResult}:{network:NetworkProviderResponse|null;onResult:(r:NetworkProviderResponse)=>void}) {
  const [loading,setLoading]=useState(!network); const run=async()=>{setLoading(true);const r=await startupNetworkCheck(api);setLoading(false);onResult(r);};
  useEffect(()=>{if(!network)void run();},[]);
  const s=network?.security; const warning=s?.vpn?"VPN connection detected.":s?.datacenter?"Datacenter connection detected.":s?.proxy?"Proxy connection detected.":s?.tor?"Tor connection detected.":s?.bot?"Automated traffic detected.":s?.abuser||Number(s?.fraudScore||0)>=75?"High-risk connection detected.":null;
  return <AuthShell><div className="startup-screen premium-startup"><div className="startup-card"><div className="startup-icon"><ShieldIcon/></div><span className="eyebrow">NETWORK SECURITY CHECK</span><h1>{loading?"Checking your network":network?.success?"Network check complete":"Network check required"}</h1><p>{loading?"ReDom is checking your current connection before Login opens.":network?.success?"Your connection has been assessed by the ReDom Backend.":"The network check did not complete successfully."}</p>{warning?<div className="warning-box"><ShieldIcon/><span>{warning} Review the connection before continuing.</span></div>:null}{s?<div className="security-rows"><div><span>IP</span><b>{s.ip||"Unknown"}</b></div><div><span>Connection</span><b>{s.connection||"Unknown"}</b></div><div><span>Provider</span><b>{network?.networkProvider||"Unknown"}</b></div><div><span>Location</span><b>{[s.city,s.region,s.country].filter(Boolean).join(", ")||"Unknown"}</b></div><div><span>Fraud score</span><b>{Number(s.fraudScore||0).toFixed(2)}%</b></div></div>:null}{network?.termsUrl?<a className="terms-link" href={network.termsUrl} target="_blank" rel="noreferrer">View network provider terms</a>:null}<button className="btn primary xl full" disabled={loading||!network?.success||!network?.security} onClick={()=>onResult(network!)}>{loading?"Checking…":"OK, Continue"}</button>{!loading&&!network?.success?<button className="text-btn" onClick={()=>void run()}>Retry network check</button>:null}</div></div></AuthShell>;
}

function Login({network,busy,setBusy,error,setError,go,onAuthenticated}:{network:NetworkProviderResponse|null;busy:boolean;setBusy:(v:boolean)=>void;error:string;setError:(v:string)=>void;go:(s:Screen,r?:boolean)=>void;onAuthenticated:(r:any)=>boolean}) {
  const [identifier,setIdentifier]=useState(""); const [password,setPassword]=useState(""); const [show,setShow]=useState(false);
  const submit=async()=>{
    if(busy)return; setError(""); if(!identifier.trim())return setError("Enter your mobile number or email."); if(!password)return setError("Enter your password.");
    if(!network?.success||!network.security)return setError("Complete the ReDom Network Security Check before signing in.");
    setBusy(true);
    try{
      let id=identifier.trim(); if(/^0\\d+$/.test(id)&&network.security.callingCode) id="+"+String(network.security.callingCode).replace(/\\D/g,"")+id.slice(1);
      const r=await post<any>("/auth/login",{identifier:id,password,platform:"web",deviceId:getDeviceId(),deviceType:"browser",deviceName:navigator.userAgent,loginSource:"web",browser:navigator.userAgent,appVersion:"web",networkIp:network.security.ip||undefined});
      if(r.requiresVerification&&r.verification){sessionStorage.setItem("redom.login.challenge",JSON.stringify(r.verification));go("device-verify");return;}
      if(r.requiresTwoFactor&&r.twoFactorVerification){sessionStorage.setItem("redom.login.2fa",JSON.stringify(r.twoFactorVerification));go("two-factor");return;}
      if(!onAuthenticated(r))setError(r.message||"Sign in could not be completed.");
    }catch(e){setError(e instanceof Error?e.message:"Sign in failed.");}finally{setBusy(false);}
  };
  return <AuthShell title="Welcome back" subtitle="Sign in to your ReDom account."><div className="auth-form">{error?<div className="alert">{error}</div>:null}<label className="field"><span>Email, phone or username</span><input value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" disabled={busy}/></label><label className="field"><span>Password</span><div className="password-web"><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" disabled={busy}/><button type="button" onClick={()=>setShow(v=>!v)}>{show?"Hide":"Show"}</button></div></label><button className="btn primary xl full" disabled={busy} onClick={()=>void submit()}>{busy?"Signing in…":"Sign in"}</button><button className="text-btn" onClick={()=>go("find-account")}>Forgot password?</button><div className="auth-divider">or</div><button className="btn secondary xl full" onClick={()=>go("register-welcome")}>Create new account</button></div></AuthShell>;
}

function FindAccount({go,error,setError}:{go:(s:Screen)=>void;error:string;setError:(v:string)=>void}) {
  const [id,setId]=useState(""); const [methods,setMethods]=useState<any[]>([]); const [busy,setBusy]=useState(false);
  const lookup=async()=>{setBusy(true);setError("");try{const r=await post<any>("/auth/find-account",{identifier:id.trim()});setMethods(r.methods||r.channels||[]);if(!(r.methods||r.channels||[]).length)setError(r.message||"No recovery methods are available.");}catch(e){setError(e instanceof Error?e.message:"Unable to find the account.");}finally{setBusy(false);}};
  const choose=async(m:any)=>{setBusy(true);setError("");try{const r=await post<any>("/auth/password-reset/send",{identifier:id.trim(),channel:m.channel||m.type,deviceId:getDeviceId(),deviceName:navigator.userAgent,deviceType:"browser",platform:"web",browser:navigator.userAgent,appVersion:"web",language:navigator.language});sessionStorage.setItem("redom.reset",JSON.stringify({challengeId:r.challengeId,identifier:id.trim(),maskedTarget:r.maskedTarget,expiresAt:r.expiresAt}));go("reset-code");}catch(e){setError(e instanceof Error?e.message:"Unable to send the reset code.");}finally{setBusy(false);}};
  return <AuthShell title="Find your account" subtitle="Enter the email, phone number, or username connected to ReDom."><div className="auth-form">{error?<div className="alert">{error}</div>:null}<label className="field"><span>Email, phone or username</span><input value={id} onChange={e=>setId(e.target.value)}/></label><button className="btn primary xl full" disabled={busy||!id.trim()} onClick={()=>void lookup()}>{busy?"Checking…":"Find account"}</button>{methods.length?<div className="choice-list"><b>Choose where to receive your code</b>{methods.map((m,i)=><button className="choice" key={i} onClick={()=>void choose(m)}>{m.label||m.maskedTarget||m.channel||m.type}</button>)}</div>:null}<button className="text-btn" onClick={()=>go("login")}>Back to login</button></div></AuthShell>;
}

function ResetCode({go,error,setError}:{go:(s:Screen)=>void;error:string;setError:(v:string)=>void}) {
  const d=JSON.parse(sessionStorage.getItem("redom.reset")||"null")||{}; const [code,setCode]=useState(""); const [left,setLeft]=useState(()=>Math.max(0,Math.ceil((new Date(d.expiresAt||Date.now()).getTime()-Date.now())/1000)));
  useEffect(()=>{const t=setInterval(()=>setLeft(v=>Math.max(0,v-1)),1000);return()=>clearInterval(t)},[]);
  const verify=async()=>{if(code.length!==5)return setError("Enter the 5-digit verification code.");try{const r=await post<any>("/auth/password-reset/verify",{challengeId:d.challengeId,code,deviceId:getDeviceId(),deviceName:navigator.userAgent,deviceType:"browser",platform:"web",appVersion:"web",language:navigator.language});if(!r.success||!r.resetToken)throw new Error(r.message||"Verification code is incorrect.");sessionStorage.setItem("redom.resetToken",r.resetToken);go("reset-password");}catch(e){setError(e instanceof Error?e.message:"Verification failed.");}};
  return <AuthShell title="Enter your code" subtitle={`Code sent to ${d.maskedTarget||"your recovery method"}.`}><div className="auth-form">{error?<div className="alert">{error}</div>:null}<label className="field"><span>5-digit verification code</span><input inputMode="numeric" maxLength={5} value={code} onChange={e=>setCode(e.target.value.replace(/\\D/g,"").slice(0,5))}/></label><button className="btn primary xl full" disabled={code.length!==5||left<=0} onClick={()=>void verify()}>Verify code</button><small className="auth-note">{left>0?"Code expires in "+formatTime(left):"Code expired"}</small><button className="text-btn" onClick={()=>go("login")}>Back to login</button></div></AuthShell>;
}

function ResetPassword({go,error,setError}:{go:(s:Screen)=>void;error:string;setError:(v:string)=>void}) {
  const [a,setA]=useState(""); const [b,setB]=useState(""); const letters=/\\p{L}/u.test(a),numbers=/\\p{N}/u.test(a),common=/^(123456|1234567|12345678|password|password1|qwerty|qwerty123|abcdef|abcdefg|111111|000000|letmein)$/iu.test(a); let percent=Math.min(50,Math.max(0,Math.round((a.length-6)*8.34)))+(letters?25:0)+(numbers?25:0); if(!letters||!numbers)percent=Math.min(percent,49); if(common)percent=Math.min(percent,23);
  const save=async()=>{if(percent!==100||a!==b)return setError(percent!==100?"Create a 100% Strong password.":"Passwords do not match.");try{const r=await post<any>("/auth/password-reset/change",{resetToken:sessionStorage.getItem("redom.resetToken"),password:a,deviceId:getDeviceId(),deviceName:navigator.userAgent,deviceType:"browser",platform:"web",browser:navigator.userAgent,appVersion:"web",language:navigator.language});if(!r.success)throw new Error(r.message||"Unable to change password.");sessionStorage.removeItem("redom.reset");sessionStorage.removeItem("redom.resetToken");go("login");}catch(e){setError(e instanceof Error?e.message:"Unable to change password.");}};
  return <AuthShell title="Create a new password" subtitle="Choose a strong password for your ReDom account."><div className="auth-form">{error?<div className="alert">{error}</div>:null}<label className="field"><span>New password</span><input type="password" value={a} onChange={e=>setA(e.target.value)}/></label><label className="field"><span>Confirm password</span><input type="password" value={b} onChange={e=>setB(e.target.value)}/></label><div className="strength"><div><span>Password strength</span><b>{percent===100?"Strong":percent>=75?"Good":percent>=50?"Fair":percent>0?"Weak":"Too short"}</b><span>{percent}%</span></div><div className="strength-bar"><i style={{width:percent+"%"}}/></div></div><button className="btn primary xl full" disabled={percent!==100||a!==b} onClick={()=>void save()}>Save password</button></div></AuthShell>;
}

function LoginChallenge({kind,go,onAuthenticated,error,setError}:{kind:"device"|"2fa";go:(s:Screen)=>void;onAuthenticated:(r:any)=>boolean;error:string;setError:(v:string)=>void}) {
  const key=kind==="device"?"redom.login.challenge":"redom.login.2fa"; const d=JSON.parse(sessionStorage.getItem(key)||"null")||{}; const [code,setCode]=useState(""); const [busy,setBusy]=useState(false); const [left,setLeft]=useState(()=>Math.max(0,Math.ceil((new Date(d.expiresAt||Date.now()).getTime()-Date.now())/1000)));
  useEffect(()=>{const t=setInterval(()=>setLeft(v=>Math.max(0,v-1)),1000);return()=>clearInterval(t)},[]);
  const submit=async()=>{if(code.length!==6||busy||left<=0)return;setBusy(true);setError("");try{const path=kind==="device"?"/auth/verify-login-device":"/auth/verify-login-2fa";const r=await post<any>(path,{challengeId:d.challengeId,code,deviceId:getDeviceId(),deviceName:navigator.userAgent,deviceType:"browser",platform:"web",loginSource:"web",browser:navigator.userAgent,appVersion:"web"});if(kind==="device"&&r.requiresTwoFactor&&r.twoFactorVerification){sessionStorage.setItem("redom.login.2fa",JSON.stringify(r.twoFactorVerification));go("two-factor");return;}if(!onAuthenticated(r))setError(r.message||"Verification failed.");}catch(e){setError(e instanceof Error?e.message:"Verification failed.");}finally{setBusy(false);}};
  return <AuthShell title={kind==="device"?"Verify this browser":"Two-factor authentication"} subtitle={`Enter the 6-digit code sent by ${d.channel==="sms"?"text message":d.channel||"verification"} to ${d.maskedTarget||"your verified contact"}.`}><div className="auth-form"><div className="code-grid">{Array.from({length:6},(_,i)=><div className={i===code.length?"code-box active":"code-box"} key={i}>{code[i]||""}</div>)}</div><input className="otp-capture" inputMode="numeric" autoFocus maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\\D/g,"").slice(0,6))}/>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={busy||code.length!==6||left<=0} onClick={()=>void submit()}>{busy?"Verifying…":"Verify"}</button><small className="auth-note">{left>0?"Code expires in "+formatTime(left):"Code expired"}</small><button className="text-btn" onClick={()=>go("login")}>Back to login</button></div></AuthShell>;
}

function FlowHeader({flow,step}:{flow:RegFlow;step:number}) {
  const [left,setLeft]=useState(()=>Math.max(0,Math.floor((new Date(flow.expiresAt).getTime()-Date.now())/1000)));
  useEffect(()=>{const t=setInterval(()=>setLeft(Math.max(0,Math.floor((new Date(flow.expiresAt).getTime()-Date.now())/1000))),1000);return()=>clearInterval(t)},[flow.expiresAt]);
  return <><div className="flow-header"><LockIcon/><span>Flow ID: {maskFlow(flow.flowId)}</span><b>{formatTime(left)}</b></div></>;
}

function FlowShell({flow,step,title,subtitle,children}:{flow:RegFlow;step:number;title:string;subtitle:string;children:React.ReactNode}) {
  return <AuthShell step={step} title={title} subtitle={subtitle}><FlowHeader flow={flow} step={step}/>{children}</AuthShell>;
}

function Identity({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void}) {
  const [first,setFirst]=useState(flow.firstName||""); const [last,setLast]=useState(flow.lastName||""); const [error,setError]=useState("");
  const sanitize=(v:string)=>v.normalize("NFC").replace(/[^\\p{L}\\s.,'-]/gu,"").replace(/\\s+/g," ");
  const valid=(v:string,label:string)=>{const x=v.trim().replace(/\\s+/g," "); if(x.length<3)return label+" must contain at least 3 characters.";if(!/^[\\p{L}][\\p{L}\\s.,'-]*$/u.test(x))return "Enter a valid "+label.toLowerCase()+".";if(/^[.,'-]|[.,'-]$/.test(x)||/[.,'-]{2,}/.test(x))return "Remove unsupported punctuation from the "+label.toLowerCase()+".";if(new Set(["test","testing","asdf","qwerty","admin","name","firstname","lastname","unknown","none","null"]).has(x.toLowerCase()))return "Enter the real "+label.toLowerCase()+" you use in everyday life.";return "";};
  const next=async()=>{const e=valid(first,"First name")||valid(last,"Last name");if(e)return setError(e);setError("");try{await patch("/auth/register/flow/"+flow.reservationId+"/name",{flowId:flow.flowId,deviceId:getDeviceId(),firstName:first.trim().replace(/\\s+/g," "),lastName:last.trim().replace(/\\s+/g," ")});update({...flow,firstName:first.trim(),lastName:last.trim()});go("register-birthday");}catch(e){setError(e instanceof Error?e.message:"Unable to save your name.");}};
  return <FlowShell flow={flow} step={1} title="What's your name?" subtitle="Use the name you use in everyday life."><div className="auth-form"><div className="two"><label className="field"><span>First name</span><input value={first} onChange={e=>{setFirst(sanitize(e.target.value));setError("")}}/></label><label className="field"><span>Last name</span><input value={last} onChange={e=>{setLast(sanitize(e.target.value));setError("")}}/></label></div>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" onClick={()=>void next()}>Continue</button></div></FlowShell>;
}

function Birthday({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void}) {
  const now=new Date(); const [date,setDate]=useState(flow.dateOfBirth||`${Math.min(2010,now.getFullYear()-13)}-01-01`); const [warning,setWarning]=useState<"child"|"teen"|null>(null); const [ack,setAck]=useState(false); const [error,setError]=useState("");
  const next=async()=>{setError("");try{const r=await patch<any>("/auth/register/flow/"+flow.reservationId+"/birthday",{flowId:flow.flowId,deviceId:getDeviceId(),dateOfBirth:date});const nextFlow={...flow,dateOfBirth:date,reservationId:r.reservationId||flow.reservationId,flowId:r.flowId||flow.flowId,expiresAt:r.expiresAt||flow.expiresAt};update(nextFlow);if(r.ageBand==="underage"||ageFrom(date)<13)setWarning("child");else if(r.ageBand==="teen"||ageFrom(date)<17){setAck(false);setWarning("teen");}else go("register-gender");}catch(e){setError(e instanceof Error?e.message:"Unable to save your birthday.");}};
  const discontinue=()=>{clearReg();go("login",true);};
  return <FlowShell flow={flow} step={2} title="What's your birthday?" subtitle="Choose your date of birth. It must be the birthday you use in everyday life."><div className="auth-form"><label className="field"><span>Date of birth</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" onClick={()=>void next()}>Continue</button></div>{warning?<div className="modal-inline"><ShieldIcon/><h3>{warning==="child"?"We can't continue with this account.":"A safety reminder before you continue"}</h3><p>{warning==="child"?"The birthday entered indicates the person is under 13. This registration flow is revoked and cannot continue.":"Because you are 13–16, protect your password and private information, avoid sharing sensitive information with people you do not know, and tell a trusted adult if something online makes you uncomfortable."}</p>{warning==="teen"?<label className="check-row"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I understand the safety reminder.</span></label>:null}<button className="btn primary xl full" disabled={warning==="teen"&&!ack} onClick={()=>warning==="child"?discontinue():go("register-gender")}>{warning==="child"?"OK":"I understand & continue"}</button></div>:null}</FlowShell>;
}

function Gender({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void}) {
  const [gender,setGender]=useState(flow.gender||""); const [pronouns,setPronouns]=useState(flow.pronouns||""); const [error,setError]=useState("");
  const next=async()=>{if(!["female","male","custom"].includes(gender))return setError("Choose your gender.");if(gender==="custom"&&!pronouns)return setError("Choose your pronouns.");try{const r=await patch<any>("/auth/register/flow/"+flow.reservationId+"/gender",{flowId:flow.flowId,deviceId:getDeviceId(),gender,pronouns:gender==="custom"?pronouns:undefined});const f={...flow,gender,pronouns,reservationId:r.reservationId||flow.reservationId,flowId:r.flowId||flow.flowId,expiresAt:r.expiresAt||flow.expiresAt};update(f);go("register-phone");}catch(e){setError(e instanceof Error?e.message:"Unable to save this step.");}};
  return <FlowShell flow={flow} step={3} title="What's your gender?" subtitle="Choose your gender. It must be your real gender as it appears on your identification."><div className="choice-grid">{["female","male","custom"].map(v=><button className={gender===v?"choice selected":"choice"} key={v} onClick={()=>{setGender(v);if(v!=="custom")setPronouns("")}}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div>{gender==="custom"?<div className="choice-grid compact">{["She / Her","He / Him","They / Them","Prefer not to say"].map(v=><button className={pronouns===v?"choice selected":"choice"} key={v} onClick={()=>setPronouns(v)}>{v}</button>)}</div>:null}{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" onClick={()=>void next()}>Continue</button></FlowShell>;
}

function Phone({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void;network:NetworkProviderResponse|null}) {
  const [phone,setPhone]=useState(flow.phoneNumber||""); const [country,setCountry]=useState(flow.phoneCountry||"NG"); const [security,setSecurity]=useState<any>(null); const [consent,setConsent]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const block=(s:any)=>{const text=`${s?.connection||""} ${s?.companyType||""}`.toLowerCase();const hosting=s?.ipapi?.isDatacenter===true||text.includes("hosting")||text.includes("datacenter");return Number(s?.fraudScore||0)>=50||s?.vpn===true||Boolean(s?.vpnService)||s?.proxy===true||s?.tor===true||Boolean(s?.datacenter)||hosting||Boolean(s?.egressService)||s?.bot===true||s?.bogon===true;};
  const inspect=async()=>{setBusy(true);setError("");try{const digits=phone.replace(/\\D/g,"");if(digits.length<5)throw new Error("Enter a valid mobile number.");const ip=await publicIp();const prefix=country==="NG"?"234":country==="US"?"1":country==="GB"?"44":country==="DE"?"49":country==="CA"?"1":"";if(!prefix)throw new Error("Select a supported country.");const national=phone.trim().startsWith("+")?digits.slice(prefix.length):digits.replace(/^0+/,"");const number=`+${prefix}${national}`;const locale=navigator.language.split("-")[1]?.toUpperCase();await patch("/auth/register/flow/"+flow.reservationId+"/phone",{flowId:flow.flowId,deviceId:getDeviceId(),phoneNumber:number,countryCode:country,deviceRegion:locale,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,ip});const r=await api<any>("/auth/register/flow/"+flow.reservationId+"/security?flowId="+encodeURIComponent(flow.flowId)+"&deviceId="+encodeURIComponent(getDeviceId())+"&ip="+encodeURIComponent(ip||""));setSecurity(r.security);if(block(r.security))throw new Error("This connection cannot continue registration because the ReDom network security check detected elevated risk.");setConsent(false);}catch(e){setError(e instanceof Error?e.message:"Unable to complete the registration security check.");}finally{setBusy(false);}};
  const accept=async()=>{if(!security||!consent)return;setBusy(true);try{const ip=security.ip||await publicIp();await post("/auth/register/flow/"+flow.reservationId+"/security/consent?flowId="+encodeURIComponent(flow.flowId)+"&deviceId="+encodeURIComponent(getDeviceId())+"&ip="+encodeURIComponent(ip||""));update({...flow,phoneNumber:phone,phoneCountry:country});go("register-password");}catch(e){setError(e instanceof Error?e.message:"Unable to save network security details.");}finally{setBusy(false);}};
  return <FlowShell flow={flow} step={4} title="What's your mobile number?" subtitle="Enter the mobile number where you can be contacted. Nobody will see this on your profile."><div className="auth-form"><label className="field"><span>Country code</span><select value={country} onChange={e=>setCountry(e.target.value)} disabled={busy}><option value="NG">Nigeria (+234)</option><option value="US">United States (+1)</option><option value="GB">United Kingdom (+44)</option><option value="DE">Germany (+49)</option><option value="CA">Canada (+1)</option></select></label><label className="field"><span>Mobile number</span><input value={phone} onChange={e=>{setPhone(e.target.value);setSecurity(null);setError("");}} inputMode="tel" disabled={busy}/></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={busy||phone.replace(/\\D/g,"").length<5} onClick={()=>void inspect()}>{busy?"Checking…":"Continue"}</button><button className="text-btn" disabled={busy} onClick={()=>go("register-email")}>Don't have a phone number? Sign up with Email</button></div>{security?<div className="security-review"><div className="security-review-head"><ShieldIcon/><div><b>Network security review</b><span>These network signals are used for registration protection.</span></div></div>{[["IP",security.ip],["Connection",security.connection],["Country",security.country],["Region",security.region],["City",security.city],["Organization",security.organization],["Company type",security.companyType],["ASN",security.asn?"AS"+security.asn:"Unknown"],["Datacenter",security.datacenter||"None detected"],["Fraud risk",String(security.fraudScore??0)+"%"]].map(([a,b])=><div className="security-row" key={String(a)}><span>{a}</span><b>{String(b||"Unknown")}</b></div>)}<label className="check-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I understand and consent to this network security check being used for registration protection.</span></label><button className="btn primary xl full" disabled={!consent||busy} onClick={()=>void accept()}>{busy?"Saving…":"I understand & continue"}</button></div>:null}</FlowShell>;
}

function Email({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void}) {
  const [email,setEmail]=useState(flow.email||""); const [error,setError]=useState("");
  const next=async()=>{if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()))return setError("Enter a valid email address.");try{await patch("/auth/register/flow/"+flow.reservationId+"/email",{flowId:flow.flowId,deviceId:getDeviceId(),email:email.trim().toLowerCase(),ip:(await publicIp())||""});update({...flow,email:email.trim().toLowerCase()});go("register-password");}catch(e){setError(e instanceof Error?e.message:"Unable to save your email.");}};
  return <FlowShell flow={flow} step={4} title="What's your email?" subtitle="Enter the email address where you can be contacted."><div className="auth-form"><label className="field"><span>Email address</span><input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("")}} autoComplete="email"/></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" onClick={()=>void next()}>Continue</button><button className="text-btn" onClick={()=>go("register-phone")}>Use a mobile number instead</button></div></FlowShell>;
}

function Password({flow,update,go}:{flow:RegFlow;update:(f:RegFlow)=>void;go:(s:Screen)=>void}) {
  const [password,setPassword]=useState(""); const [remember,setRemember]=useState(false); const letters=/\\p{L}/u.test(password),numbers=/\\p{N}/u.test(password),common=/^(123456|1234567|12345678|password|password1|qwerty|qwerty123|abcdef|abcdefg|111111|000000|letmein)$/iu.test(password); let percent=Math.min(50,Math.max(0,Math.round((password.length-6)*8.34)))+(letters?25:0)+(numbers?25:0);if(!letters||!numbers)percent=Math.min(percent,49);if(common)percent=Math.min(percent,23);const [error,setError]=useState("");
  const next=async()=>{if(percent!==100)return setError("Create a 100% Strong password.");try{await patch("/auth/register/flow/"+flow.reservationId+"/password",{flowId:flow.flowId,deviceId:getDeviceId(),password,strength:"strong",rememberLoginInfo:remember});update({...flow,passwordStrength:"strong",rememberLoginInfo:remember});go("register-review");}catch(e){setError(e instanceof Error?e.message:"Unable to save your password.");}};
  return <FlowShell flow={flow} step={5} title="Create a password" subtitle="Use letters and numbers. Any character is allowed."><div className="auth-form"><label className="field"><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="strength"><div><span>Password strength</span><b>{percent===100?"Strong":percent>=75?"Good":percent>=50?"Fair":percent>0?"Weak":"Too short"}</b><span>{percent}%</span></div><div className="strength-bar"><i style={{width:percent+"%"}}/></div><p>{percent===100?"100% Strong. This password is long enough and contains letters and numbers.":"Use at least 6 characters, with at least one letter and one number."}</p></div><label className="check-row"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Remember login info on this device</span></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={percent!==100} onClick={()=>void next()}>Continue</button></div></FlowShell>;
}

function RegisterWelcome({start,go,busy,error}:{start:()=>void;go:(s:Screen)=>void;busy:boolean;error:string}) {
  return <AuthShell title="Join ReDom today" subtitle="Create your account through the protected ReDom registration flow."><div className="auth-form">{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={busy} onClick={start}>{busy?"Preparing…":"Create account"}</button><button className="btn secondary xl full" onClick={()=>go("login")}>Already have an account? Login</button></div></AuthShell>;
}

function Review({flow,go}:{flow:RegFlow;go:(s:Screen)=>void}) {
  const [memory,setMemory]=useState<any>(null); const [agreed,setAgreed]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  useEffect(()=>{void (async()=>{try{const r=await api<any>("/auth/register/flow/"+flow.reservationId+"/memory?flowId="+encodeURIComponent(flow.flowId)+"&deviceId="+encodeURIComponent(getDeviceId()));setMemory(r.memory);}catch(e){setError(e instanceof Error?e.message:"Unable to load your registration details.");}})();},[flow.flowId,flow.reservationId]);
  const submit=async()=>{if(!memory||!agreed)return;setBusy(true);setError("");try{const contact=memory.email?.address||memory.phoneLookup?.phoneNumber;const challenge=await post<any>("/auth/register/challenge",{contactType:memory.email?"email":"phone",target:contact,deviceId:getDeviceId(),reservationId:flow.reservationId,flowId:flow.flowId});const first=memory.identity?.firstName||flow.firstName||"";const last=memory.identity?.lastName||flow.lastName||"";const base=(first+last).toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,36)||"redomuser";const username=base+Math.floor(1000+Math.random()*9000);await patch("/auth/register/challenge/"+challenge.challengeId,{step:"review",data:{firstName:first,lastName:last,username,email:memory.email?.address,phoneNumber:memory.phoneLookup?.phoneNumber,dateOfBirth:memory.birthday?.dateOfBirth,gender:memory.gender?.gender}});const done=await post<any>("/auth/register/challenge/"+challenge.challengeId+"/complete",{submitted:memory.email?{email:memory.email.address}:{phoneNumber:memory.phoneLookup?.phoneNumber}});sessionStorage.setItem("redom.register.verification",JSON.stringify(done.verification));go("register-verify");}catch(e){setError(e instanceof Error?e.message:"Unable to start verification.");}finally{setBusy(false);}};
  return <FlowShell flow={flow} step={5} title="Review your account" subtitle="Review your information and agree to ReDom's terms before verification."><div className="review-card">{memory?<><div className="flow-summary"><b>Registration Flow ID</b><strong>{flow.flowId}</strong></div>{[["Name",`${memory.identity?.firstName||""} ${memory.identity?.lastName||""}`],["Date of birth",memory.birthday?.dateOfBirth||"Not provided"],["Gender",memory.gender?.gender||"Not provided"],["Phone",memory.phoneLookup?.phoneNumber?"Protected":"Not provided"],["Email",memory.email?.address||"Not provided"],["Network",memory.networkSecurity?.connection||memory.networkSecurity?.organization||"Protected"],["Location",[memory.networkSecurity?.country,memory.networkSecurity?.region,memory.networkSecurity?.city].filter(Boolean).join(", ")||"Protected"],["Fraud risk",typeof memory.networkSecurity?.fraudScore==="number"?memory.networkSecurity.fraudScore+"%":"Protected"]].map(([a,b])=><div className="review-row" key={String(a)}><span>{a}</span><b>{String(b||"Not provided")}</b></div>)}</>:<div className="skeleton"><i/><i/><i/></div>}<label className="check-row"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span>By selecting Sign Up, you agree to the ReDom Terms and Privacy Policy and understand that registration uses security and abuse-prevention checks.</span></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={!memory||!agreed||busy} onClick={()=>void submit()}>{busy?"Preparing verification…":"I Understand, Sign Up"}</button></div></FlowShell>;
}

function RegisterVerify({flow,go}:{flow:RegFlow;go:(s:Screen)=>void}) {
  const d=JSON.parse(sessionStorage.getItem("redom.register.verification")||"null")||{}; const [challengeId,setChallengeId]=useState(d.challengeId); const [code,setCode]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [left,setLeft]=useState(120); const [verified,setVerified]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setLeft(v=>Math.max(0,v-1)),1000);return()=>clearInterval(t)},[]);
  const verify=async()=>{if(code.length!==6||busy)return;setBusy(true);setError("");try{const r=await post<any>("/auth/register/verification/"+challengeId+"/verify",{verificationChallengeId:challengeId,code});if(!r.success)throw new Error(r.message||"Verification failed.");setVerified(true);setTimeout(()=>go("customizing",true),450);}catch(e){const m=e instanceof Error?e.message:"Verification failed.";setError(/expired/i.test(m)?"Verification code has expired.":/invalid|incorrect/i.test(m)?"Verification Code Is Incorrect.":m);}finally{setBusy(false);}};
  const resend=async()=>{if(left>0||busy)return;setBusy(true);try{const r=await post<any>("/auth/register/verification/"+challengeId+"/resend",{verificationChallengeId:challengeId,reservationId:flow.reservationId,flowId:flow.flowId,deviceId:getDeviceId()});setChallengeId(r.verificationChallengeId);sessionStorage.setItem("redom.register.verification",JSON.stringify(r));setLeft(120);setCode("");}catch(e){setError(e instanceof Error?e.message:"Unable to resend the verification code.");}finally{setBusy(false);}};
  return <AuthShell title={verified?"Registration verified":"Verify your registration"} subtitle={verified?"ReDom is preparing your account and session.":`Enter the 6-digit code sent to ${d.maskedTarget||"your verified contact"}.`}><div className="auth-form">{!verified?<><label className="field code-field"><span>Verification code</span><input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\\D/g,"").slice(0,6))} autoFocus/></label>{error?<div className="alert">{error}</div>:null}<button className="btn primary xl full" disabled={busy||code.length!==6} onClick={()=>void verify()}>{busy?"Verifying…":"Verify registration"}</button><div className="resend-row"><span>{left>0?"Resend available in "+formatTime(left):"I didn't receive the code?"}</span><button className="text-btn" disabled={left>0||busy} onClick={()=>void resend()}>{left>0?"Resend":"Resend code"}</button></div></>:<div className="success-box"><CheckIcon/> Verification code successful. Your account is verified.</div>}</div></AuthShell>;
}

function Customizing({flow,onAuthenticated}:{flow:RegFlow;onAuthenticated:(u:User,s:Session)=>void}) {
  const [step,setStep]=useState(0); const [error,setError]=useState(""); const [attempt,setAttempt]=useState(0);
  const steps=["Preparing ReDom","Customizing your experience","Creating your session","Securing your account","Preparing your Home Feed","Finishing up"];
  useEffect(()=>{const t=setInterval(()=>setStep(v=>Math.min(5,v+1)),6000);return()=>clearInterval(t)},[attempt]);
  useEffect(()=>{let cancelled=false;const started=Date.now();void (async()=>{try{const r=await post<any>("/auth/register/initialize",{verificationChallengeId:JSON.parse(sessionStorage.getItem("redom.register.verification")||"{}").verificationChallengeId,reservationId:flow.reservationId,flowId:flow.flowId,deviceId:getDeviceId(),language:navigator.language,deviceType:"browser",platform:"web",browser:navigator.userAgent,appVersion:"web"});const remaining=Math.max(0,36000-(Date.now()-started));await new Promise(res=>setTimeout(res,remaining));if(cancelled)return;if(!r.success||!r.user||!r.session)throw new Error("Unable to finish account setup.");saveSession(r.session);onAuthenticated(r.user,r.session);}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Unable to finish account setup.");}})();return()=>{cancelled=true}},[attempt,flow.flowId,flow.reservationId,onAuthenticated]);
  return <div className="customizing-screen"><div className="customizing-glow"/><div className="customizing-content"><ReDomMark size={58}/><h1>Preparing your ReDom experience</h1><p>Please wait while ReDom prepares your account, session, security and Home Feed.</p><div className="customizing-card"><div className="customizing-icon"><ShieldIcon/></div><b>{steps[step]}</b><span>Setting up your account securely…</span><div className="progress-track"><i style={{width:`${Math.round(((step+1)/6)*100)}%`}}/></div><strong>{Math.round(((step+1)/6)*100)}%</strong></div>{error?<div className="alert"><b>We couldn't finish preparing ReDom.</b><div>{error}</div><button className="text-btn" onClick={()=>setAttempt(v=>v+1)}>Try again</button></div>:null}<small>Flow ID: {flow.flowId}</small></div><div className="customizing-footer">ReDom Platforms, Inc.</div></div>;
}
