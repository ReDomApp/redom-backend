import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

const API_BASE = (import.meta.env.VITE_AURELINK_API_BASE || "https://redom-backend.onrender.com/redom-backend").replace(/\/$/, "");
type View = "login" | "recovery" | "register" | "verify" | "signup" | "reset" | "success" | "dashboard" | "reset-success";
type ApiResult = { success?: boolean; message?: string; code?: string; email?: string; user?: Record<string, unknown>; session?: { accessToken?: string; refreshToken?: string }; };
const readToken = () => new URLSearchParams(location.search).get("token") || "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const namePattern = /^[\p{L}][\p{L}\p{M} .'-]{1,99}$/u;
function validatePassword(value: string) {
  if (value.length < 12 || value.length > 128) return "Use 12–128 characters.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) return "Use a letter, a number and a symbol.";
  if (/(.)\1{3,}/i.test(value) || /^(password|qwerty|123456|letmein|welcome)/i.test(value)) return "Choose a stronger password that is not a common pattern.";
  return "";
}
async function publicIp() {
  const response = await fetch("https://api.ipapi.is", { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("Aurelink could not verify your public network address. Please retry.");
  const data = await response.json() as { ip?: string };
  if (!data.ip || !/^[0-9a-f:.]+$/i.test(data.ip)) throw new Error("Public IP verification did not return a valid address.");
  return data.ip;
}
async function api(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(API_BASE + path, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "omit", body: JSON.stringify(body) });
  } catch { throw new Error("Aurelink could not be reached. Check your connection and try again."); }
  const data = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok || data.success === false) { const error = new Error(data.message || "The request could not be completed.") as Error & { code?: string }; error.code = data.code; throw error; }
  return data;
}
function App() {
  const [view, setView] = useState<View>("login");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"error" | "success" | "info">("info");
  const [signupToken, setSignupToken] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [user, setUser] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const resetToken = useMemo(readToken, []);
  const setMessage = (message: string, kind: "error" | "success" | "info" = "info") => { setNotice(message); setNoticeKind(kind); };
  const changeView = (next: View) => { setNotice(""); setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const submit = async (event: FormEvent, task: () => Promise<void>) => { event.preventDefault(); if (busy) return; setBusy(true); setNotice(""); try { await task(); } catch (error) { const err = error as Error & { code?: string }; setMessage(err.message || "Something went wrong.", "error"); } finally { setBusy(false); } };
  useEffect(() => {
    const screen = new URLSearchParams(location.search).get("screen");
    if (resetToken && screen === "verify-email") {
      void api("/aurelink/auth/signup/email/verify", { token: resetToken }).then(data => { setSignupToken(resetToken); setVerifiedEmail(data.email || ""); changeView("signup"); }).catch(error => { setMessage((error as Error).message, "error"); changeView("verify"); });
    } else if (resetToken && (screen === "reset-password" || screen === "reset")) changeView("reset");
    else {
      const token = sessionStorage.getItem("aurelink.accessToken");
      const savedUser = sessionStorage.getItem("aurelink.user");
      if (token && savedUser) { try { setUser(JSON.parse(savedUser) as Record<string, unknown>); setView("dashboard"); } catch { sessionStorage.removeItem("aurelink.accessToken"); } }
    }
  // Initial deep-link/session restoration only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const saveSession = (data: ApiResult) => {
    if (data.session?.accessToken) sessionStorage.setItem("aurelink.accessToken", data.session.accessToken);
    if (data.session?.refreshToken) sessionStorage.setItem("aurelink.refreshToken", data.session.refreshToken);
    const nextUser = data.user || {};
    sessionStorage.setItem("aurelink.user", JSON.stringify(nextUser));
    setUser(nextUser);
  };
  const login = (event: FormEvent) => submit(event, async () => {
    if (!emailPattern.test(email.trim())) throw new Error("Enter a valid email address.");
    const data = await api("/aurelink/auth/login", { email: email.trim(), password });
    if (!data.session?.accessToken || !data.session?.refreshToken) throw new Error("The secure sign-in response was incomplete.");
    saveSession(data); setPassword(""); changeView("dashboard");
  });
  const requestRecovery = (event: FormEvent) => submit(event, async () => {
    if (!emailPattern.test(email.trim())) throw new Error("Enter a valid email address.");
    const clientIp = await publicIp();
    const data = await api("/aurelink/auth/password-reset/request", { email: email.trim(), clientIp });
    setMessage(data.message || "If an Aurelink account matches this email, recovery instructions will be sent.", "success");
  });
  const requestSignup = (event: FormEvent) => submit(event, async () => {
    if (!emailPattern.test(email.trim())) throw new Error("Enter a valid email address.");
    const clientIp = await publicIp();
    const data = await api("/aurelink/auth/signup/email/request", { email: email.trim(), clientIp });
    setMessage(data.message || "Check your inbox for a secure confirmation link.", "success");
  });
  const finishSignup = (event: FormEvent) => submit(event, async () => {
    const cleanName = fullName.trim().replace(/\s+/g, " ");
    if (!namePattern.test(cleanName) || /\d|[^\p{L}\p{M} .'-]/u.test(cleanName)) throw new Error("Enter your real name using letters, spaces, apostrophes, periods or hyphens only. Numbers and emoji are not accepted.");
    const passwordError = validatePassword(password); if (passwordError) throw new Error(passwordError);
    if (password !== confirmPassword) throw new Error("The passwords do not match.");
    if (!terms) throw new Error("Accept the Aurelink Terms and Privacy Notice to continue.");
    if (!signupToken) throw new Error("Your email confirmation has expired. Request a new confirmation link.");
    const data = await api("/aurelink/auth/signup/complete", { token: signupToken, fullName: cleanName, password, confirmPassword, acceptedTerms: true });
    setAccountId(String(data.user?.account_id || "Created")); setUser(data.user || {}); changeView("success");
  });
  const finishReset = (event: FormEvent) => submit(event, async () => {
    const passwordError = validatePassword(password); if (passwordError) throw new Error(passwordError);
    if (password !== confirmPassword) throw new Error("The passwords do not match.");
    if (!resetToken) throw new Error("This password-reset link is missing its token. Request a new link.");
    const clientIp = await publicIp();
    await api("/aurelink/auth/password-reset/complete", { token: resetToken, password, confirmPassword, clientIp });
    history.replaceState(null, "", location.pathname + "?screen=reset-success"); setPassword(""); setConfirmPassword(""); changeView("reset-success");
  });
  const logout = async () => {
    const token = sessionStorage.getItem("aurelink.accessToken");
    try { if (token) await fetch(API_BASE + "/aurelink/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + token } }); } finally {
      ["aurelink.accessToken", "aurelink.refreshToken", "aurelink.user"].forEach(key => sessionStorage.removeItem(key)); setUser({}); setPassword(""); changeView("login");
    }
  };
  const field = (label: string, value: string, setter: (value: string) => void, type = "text", props: Record<string, unknown> = {}) => <label className="field"><span>{label}</span><input type={type} value={value} onChange={e => setter(e.target.value)} autoComplete={type === "email" ? "email" : type === "password" ? "current-password" : "name"} required {...props} /></label>;
  const passwordField = (label: string, value: string, setter: (value: string) => void, autocomplete: string) => <label className="field"><span>{label}</span><div className="password-wrap"><input type={showPassword ? "text" : "password"} value={value} onChange={e => setter(e.target.value)} autoComplete={autocomplete} required minLength={12} maxLength={128} /><button type="button" className="reveal" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>;
  const card = (title: string, intro: string, children: ReactNode) => <section className="auth-card"><div className="card-heading"><div className="eyebrow">AURELINK ACCOUNT</div><h2>{title}</h2><p>{intro}</p></div>{children}</section>;
  const action = (label: string, handler: (event: FormEvent) => void, children: ReactNode) => <form onSubmit={handler} className="auth-form">{children}<button className="primary" disabled={busy}>{busy ? "Please wait…" : label}</button></form>;
  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="/" onClick={e => { e.preventDefault(); changeView("login"); }}><span className="brand-mark"><i/><i/><i/><i/></span><span><strong>AURELINK</strong><small>SECURE COMMUNICATIONS</small></span></a><div className="top-meta"><span className="secure-dot"/> Secure account portal</div></header>
    <div className="content-grid"><section className="story-panel"><div className="story-label">YOUR CONNECTION, UNDER YOUR CONTROL</div><h1>Communications built around <em>your world.</em></h1><p>One secure account for Aurelink communications services. Sign in or create an account to get started.</p><div className="story-rule"/><div className="security-note"><span className="shield">✓</span><div><strong>Security comes first</strong><small>Protected account access, network verification and session controls.</small></div></div><div className="story-foot">AURELINK · ACCOUNT SECURITY</div></section>
    <section className="form-column">
      {view === "login" && card("Sign in to Aurelink", "Use the email address and password associated with your account.", action("Sign in securely", login, <>{field("Email address", email, setEmail, "email")}{passwordField("Password", password, setPassword, "current-password")}<div className="form-links"><button type="button" onClick={() => changeView("recovery")}>Forgot password?</button></div></>))}
      {view === "recovery" && card("Recover your account", "We will email a one-time password reset link if an account matches.", action("Send recovery link", requestRecovery, <>{field("Email address", email, setEmail, "email")}<p className="hint">For security, recovery links expire after five minutes and can only be used once.</p></>))}
      {view === "register" && card("Create your account", "Start by confirming that you own this email address.", action("Send confirmation email", requestSignup, <>{field("Email address", email, setEmail, "email")}<p className="hint">A one-time confirmation link will be sent to your inbox. It expires in five minutes.</p></>))}
      {view === "verify" && card("Confirm your email", "Open the confirmation link sent to your email, or request another one.", <><p className="hint">This link may have expired or already been used.</p><button className="primary" onClick={() => changeView("register")}>Request a new link</button></>)}
      {view === "signup" && card("Finish creating your account", "Your email has been confirmed. Complete your account details below.", <><div className="verified-email"><small>CONFIRMED EMAIL</small><strong>{verifiedEmail}</strong></div>{action("Create Aurelink account", finishSignup, <>{field("Full legal name", fullName, setFullName, "text", { maxLength: 100, autoComplete: "name" })}{passwordField("Create password", password, setPassword, "new-password")}{passwordField("Confirm password", confirmPassword, setConfirmPassword, "new-password")}<p className="hint">Use at least 12 characters with letters, numbers and symbols. Common or repeated patterns are rejected.</p><label className="terms"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}/><span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Aurelink Terms</a> and acknowledge the Privacy Notice.</span></label></>)}</>)}
      {view === "reset" && card("Choose a new password", "Create a strong password to secure your Aurelink account.", action("Reset password", finishReset, <>{passwordField("New password", password, setPassword, "new-password")}{passwordField("Confirm new password", confirmPassword, setConfirmPassword, "new-password")}<p className="hint">At least 12 characters, including letters, numbers and symbols. Common passwords are rejected.</p></>))}
      {view === "success" && card("Your account is ready", "Your Aurelink account has been created successfully.", <div className="success-state"><div className="success-mark">✓</div><p>Your Aurelink Account ID</p><strong className="account-id">{accountId}</strong><p className="hint">For security, sign in from a fresh screen using the email address and password you just created.</p><button className="primary" onClick={() => { history.replaceState(null, "", location.pathname); setEmail(String(user.email || verifiedEmail)); changeView("login"); }}>Continue to sign in</button></div>)}
      {view === "reset-success" && card("Password updated", "Your password has been changed and existing sessions have been revoked.", <div className="success-state"><div className="success-mark">✓</div><p>You can now sign in with your new password.</p><button className="primary" onClick={() => { history.replaceState(null, "", location.pathname); changeView("login"); }}>Return to sign in</button></div>)}
      {view === "dashboard" && card("Welcome to Aurelink", "Your account is active.", <div className="success-state"><div className="verified-email"><small>SIGNED IN AS</small><strong>{String(user.email || "Aurelink account")}</strong></div><p className="hint">Your account session is active. Aurelink communications services are available through your account.</p><button className="secondary" onClick={() => void logout()}>Sign out securely</button></div>)}
      {notice && <div className={"notice " + noticeKind} role="status" aria-live="polite">{notice}</div>}
      {view !== "login" && view !== "dashboard" && view !== "success" && view !== "reset-success" && <button className="back-link" onClick={() => changeView("login")}>← Back to sign in</button>}
      {view === "login" && <div className="register-prompt">New to Aurelink? <button onClick={() => changeView("register")}>Create an account</button></div>}
      <div className="legal">By continuing, you agree to Aurelink's account security checks. <span>© {new Date().getFullYear()} Aurelink</span></div>
    </section></div>
    <footer className="footer"><span>AURELINK</span><span>SECURE ACCOUNT ACCESS</span></footer>
  </main>;
}
export default App;
