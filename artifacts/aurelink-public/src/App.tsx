import { FormEvent, useEffect, useMemo, useState } from "react";
import { getPublicIp, type PublicNetwork } from "./network";
import "./styles.css";

type Screen = "login" | "register" | "verify" | "complete";
type ApiResult = { success?: boolean; message?: string; code?: string; expiresAt?: string; remainingSeconds?: number; user?: { email?: string } };
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "https://redom-backend.onrender.com/redom-backend";

async function request<T extends ApiResult>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API_BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  let payload: T;
  try { payload = await response.json() as T; }
  catch { throw new Error("Aurelink received an invalid server response. Please try again."); }
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.message || "The request could not be completed.") as Error & { code?: string; payload?: T };
    error.code = payload.code;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function mailProvider(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Open Gmail", url: "https://mail.google.com/" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) return { label: "Open Outlook", url: "https://outlook.live.com/mail/" };
  if (domain === "yahoo.com" || domain.endsWith(".yahoo.com")) return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail" };
  return { label: "Open your email", url: "https://mail.google.com/" };
}

function Brand() {
  return <div className="brand"><div className="brand-symbol" aria-hidden="true"><i/><i/><i/><i/></div><div><strong>AURELINK</strong><span>CONNECTED. SECURE. GLOBAL.</span></div></div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);
  const [mailLink, setMailLink] = useState<{ label: string; url: string } | null>(null);
  const [network, setNetwork] = useState<PublicNetwork | null>(null);
  const [token, setToken] = useState("");
  const queryToken = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const screenParam = useMemo(() => new URLSearchParams(window.location.search).get("screen") || "", []);

  useEffect(() => {
    if (screenParam === "verify-email" && queryToken) {
      setToken(queryToken);
      setScreen("verify");
      void request<ApiResult>("/aurelink/auth/signup/email/verify", { token: queryToken })
        .then((result) => { setNotice({ kind: "success", text: result.message || "Email confirmed. Continue creating your account." }); })
        .catch((error: Error) => setNotice({ kind: "error", text: error.message }));
    }
  }, [queryToken, screenParam]);

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setBusy(true); setNotice({ kind: "info", text: "Checking your connection securely…" }); setMailLink(null);
    try {
      const ip = await getPublicIp();
      setNetwork({ ip, status: "checked" });
      const result = await request<ApiResult>("/aurelink/auth/signup/email/request", { email: email.trim(), clientIp: ip });
      setMailLink(mailProvider(email.trim()));
      setNotice({ kind: "success", text: result.message || "Mail sent. Check your inbox and spam folder." });
    } catch (error) {
      const err = error as Error & { code?: string; payload?: ApiResult };
      if (err.code === "AURELINK_EMAIL_TOKEN_ACTIVE") {
        setMailLink(mailProvider(email.trim()));
        setNotice({ kind: "info", text: err.message || "An unexpired confirmation link was recently sent to this address. Check your inbox or wait for it to expire." });
      } else {
        setNotice({ kind: "error", text: err.message || "Aurelink could not start registration." });
      }
    } finally { setBusy(false); }
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setNotice({ kind: "info", text: "Signing in securely…" });
    try {
      const result = await request<ApiResult>("/aurelink/auth/login", { email: email.trim(), password });
      if (result.user) sessionStorage.setItem("aurelink.user", JSON.stringify(result.user));
      setNotice({ kind: "success", text: result.message || "Signed in successfully." });
    } catch (error) { setNotice({ kind: "error", text: (error as Error).message || "Unable to sign in." }); }
    finally { setBusy(false); }
  }

  async function resendConfirmation() { await submitEmail(new Event("submit") as unknown as FormEvent); }

  return <main className="shell">
    <section className="visual">
      <div className="visual-grid"/>
      <Brand/>
      <div className="visual-copy"><div className="eyebrow"><span/> YOUR WORLD, CONNECTED</div><h1>One account.<br/><em>More possibility.</em></h1><p>Secure access to Aurelink services, communication and global connectivity — built around you.</p><div className="trust-row"><span>⌁ Privacy first</span><span>◈ Secure by design</span><span>◎ Global access</span></div></div>
      <div className="visual-footer"><span>© {new Date().getFullYear()} Aurelink, Inc.</span><span>ACCOUNT SECURITY / 01</span></div>
    </section>
    <section className="content">
      <div className="mobile-brand"><Brand/></div>
      <div className="auth-card">
        <div className="card-top"><div className="step-label">{screen === "verify" ? "EMAIL CONFIRMATION" : screen === "complete" ? "ACCOUNT SETUP" : "AURELINK ACCOUNT"}</div><div className="secure"><span>▣</span> Secure connection</div></div>
        {screen === "login" && <>
          <h2>Welcome back</h2><p className="subhead">Sign in to continue to your Aurelink account.</p>
          <form onSubmit={submitLogin}>
            <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required maxLength={255} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
            <div className="label-row"><label htmlFor="password">Password</label><button type="button" className="text-button" onClick={()=>setNotice({kind:"info",text:"Password recovery will be available through the account recovery flow."})}>Forgot password?</button></div>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/>
            <button className="primary" disabled={busy}>{busy ? "Please wait…" : "Sign in"} <span>→</span></button>
          </form>
          <div className="switch">New to Aurelink? <button onClick={()=>{setScreen("register");setNotice(null)}}>Create an account</button></div>
        </>}
        {screen === "register" && <>
          <h2>Create your account</h2><p className="subhead">Start with your email. We’ll send a short-lived confirmation link.</p>
          <form onSubmit={submitEmail}>
            <label htmlFor="register-email">Email address</label><input id="register-email" type="email" autoComplete="email" required maxLength={255} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
            <div className="privacy-note"><span>◈</span><p>We check connection reputation to protect accounts from automated abuse. Ordinary home, business, Wi-Fi and mobile connections are supported.</p></div>
            <button className="primary" disabled={busy}>{busy ? "Verifying connection…" : "Send confirmation email"} <span>→</span></button>
          </form>
          <div className="switch">Already have an account? <button onClick={()=>{setScreen("login");setNotice(null)}}>Sign in</button></div>
        </>}
        {screen === "verify" && <>
          <h2>Check your email</h2><p className="subhead">We’ll verify the confirmation link before you continue.</p>
          <button className="primary" onClick={()=>{setScreen("complete");setNotice({kind:"info",text:"Continue using the secure link from your confirmation email."})}}>Continue <span>→</span></button>
          <div className="switch"><button onClick={()=>setScreen("register")}>Back to registration</button></div>
        </>}
        {screen === "complete" && <>
          <h2>Finish setting up</h2><p className="subhead">Your email confirmation is the first step. Follow the confirmation link to complete secure account setup.</p>
          <button className="primary" onClick={()=>{setScreen("register");setNotice(null)}}>Return to Aurelink <span>→</span></button>
        </>}
        {notice && <div className={"notice "+notice.kind} role="status" aria-live="polite"><span className="notice-icon">{notice.kind==="success"?"✓":notice.kind==="error"?"!":"i"}</span><p>{notice.text}</p></div>}
        {mailLink && <a className="mail-link" href={mailLink.url} target="_blank" rel="noreferrer">{mailLink.label} <span>↗</span></a>}
        {network && screen === "register" && notice?.kind === "success" && <p className="network-footnote">Connection check completed. Your public IP is not displayed for privacy.</p>}
        <div className="card-bottom"><span>Protected by Aurelink security</span><span>Privacy · Terms · Help</span></div>
      </div>
      <div className="content-foot">Aurelink services are protected by layered account and network security.</div>
    </section>
  </main>;
}
