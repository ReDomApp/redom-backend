import React, { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Screen = 'login' | 'forgot' | 'reset-code' | 'reset-password' | 'signup-soon';
type Notice = { kind: 'error' | 'info' | 'success'; text: string } | null;
type RecoveryMethod = { channel?: string; type?: string; label?: string; maskedTarget?: string; target?: string };

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://redom-backend.onrender.com/redom-backend').replace(/\\/+$/, '');
const DEVICE_KEY = 'aurelink.web.device';
const RESET_KEY = 'aurelink.password-reset';

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `aurelink-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `aurelink-web-${navigator.userAgent.slice(0, 32)}`;
  }
}

async function api<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    credentials: 'include',
    headers,
    signal: options.signal,
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};
  if (!response.ok) {
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    throw new Error(typeof data.message === 'string' ? data.message : `Request failed (${response.status}).`);
  }
  return body as T;
}

function saveSession(session: unknown) {
  try {
    localStorage.setItem('redom.web.session', JSON.stringify(session));
  } catch {
    // A browser may block storage; the server-side cookie remains available.
  }
}

function BrandMark() {
  return <img className="brand-mark" src="/aurelink-mark.svg" alt="AURELINK" />;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="field-icon"><rect x="3.5" y="5.5" width="17" height="13" rx="1.8"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>;
}

function LockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="field-icon"><rect x="4.5" y="10" width="15" height="10" rx="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
}

function EyeIcon({ visible }: { visible: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="eye-icon">{visible
    ? <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></>
    : <><path d="M3 3 21 21"/><path d="M10.6 6.2A9.5 9.5 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16 16 0 0 1-3.1 3.7M6.2 6.9C3.8 8.5 2.5 12 2.5 12s3.4 6 9.5 6a9 9 0 0 0 3.3-.6"/><path d="M9.8 9.8a3 3 0 0 0 4.4 4.4"/></>
  }</svg>;
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="provider-icon"><path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.95h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.91-4.2 2.91-7.25Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.93-3.31.93-2.54 0-4.69-1.71-5.46-4.02H3.3v2.53A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.54 13.85a5.86 5.86 0 0 1 0-3.7V7.62H3.3a9.75 9.75 0 0 0 0 8.76l3.24-2.53Z"/><path fill="#EA4335" d="M12 6.13c1.43 0 2.72.49 3.73 1.47l2.8-2.8C16.83 3.2 14.62 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.37l3.24 2.53C7.31 7.84 9.46 6.13 12 6.13Z"/></svg>;
}

function GitHubIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="provider-icon github-icon"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.54v-2.08c-3.1.68-3.75-1.31-3.75-1.31-.5-1.29-1.24-1.63-1.24-1.63-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15 1 .1.76 2.02 3.6 1.54.1-.72.39-1.21.7-1.49-2.47-.28-5.06-1.24-5.06-5.5 0-1.22.44-2.21 1.15-2.99-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.06 1.14a10.62 10.62 0 0 1 5.57 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.12 2.96.72.78 1.15 1.77 1.15 2.99 0 4.27-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.06v3.05c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg>;
}

function ReDomIcon() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="provider-icon"><path fill="#1877F2" d="m16 2 13 7.5v13L16 30 3 22.5v-13L16 2Z"/><path fill="#fff" d="m16 7 8.5 5-8.5 5-8.5-5L16 7Zm-8.5 9 8.5 5 8.5-5v3L16 29l-8.5-10v-3Z" opacity=".95"/></svg>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [recoveryMethods, setRecoveryMethods] = useState<RecoveryMethod[]>([]);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    const titles: Record<Screen, string> = {
      login: 'Sign in · AURELINK',
      forgot: 'Account recovery · AURELINK',
      'reset-code': 'Verify recovery code · AURELINK',
      'reset-password': 'Choose a new password · AURELINK',
      'signup-soon': 'Create account · AURELINK',
    };
    document.title = titles[screen];
  }, [screen]);

  function changeScreen(next: Screen) {
    setNotice(null);
    setScreen(next);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const identifier = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(identifier)) {
      setNotice({ kind: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (!password) {
      setNotice({ kind: 'error', text: 'Enter your password.' });
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      await api('/auth/device/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ deviceType: 'browser', platform: 'web', browser: navigator.userAgent, deviceName: navigator.userAgent }),
        signal: controller.signal,
      });
      const payload = await api<{
        success?: boolean;
        message?: string;
        user?: Record<string, unknown>;
        session?: unknown;
        requiresVerification?: boolean;
        verification?: Record<string, unknown>;
        requiresTwoFactor?: boolean;
        twoFactorVerification?: Record<string, unknown>;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          password,
          platform: 'web',
          deviceId: deviceId(),
          deviceType: 'browser',
          deviceName: navigator.userAgent,
          browser: navigator.userAgent,
          loginSource: 'aurelink-public',
          appVersion: 'web',
        }),
        signal: controller.signal,
      });

      if (payload.requiresVerification && payload.verification) {
        sessionStorage.setItem('redom.login.challenge', JSON.stringify(payload.verification));
        setNotice({ kind: 'info', text: 'This browser needs verification. Continue signing in through ReDom account security.' });
        return;
      }
      if (payload.requiresTwoFactor && payload.twoFactorVerification) {
        sessionStorage.setItem('redom.login.2fa', JSON.stringify(payload.twoFactorVerification));
        setNotice({ kind: 'info', text: 'Two-factor authentication is enabled. Complete verification in your ReDom account security flow.' });
        return;
      }
      if (!payload.success || !payload.session) {
        setNotice({ kind: 'error', text: payload.message || 'Sign-in could not be completed.' });
        return;
      }
      saveSession(payload.session);
      setNotice({ kind: 'success', text: `Signed in successfully${typeof payload.user?.firstName === 'string' ? `, ${payload.user.firstName}` : ''}. Your session is saved.` });
      setPassword('');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof DOMException && error.name === 'AbortError' ? 'Login timed out. Check your connection and try again.' : error instanceof Error ? error.message : 'Unable to connect securely. Please try again shortly.' });
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  async function handleFindAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identifier = email.trim();
    if (!identifier) {
      setNotice({ kind: 'error', text: 'Enter the email or phone number connected to your account.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ methods?: RecoveryMethod[]; channels?: RecoveryMethod[]; message?: string }>('/auth/find-account', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      const methods = result.methods || result.channels || [];
      if (!methods.length) {
        setRecoveryMethods([]);
        setNotice({ kind: 'info', text: result.message || 'No recovery methods are available for this account.' });
        return;
      }
      setRecoveryMethods(methods);
      setNotice({ kind: 'info', text: 'Choose a verified destination to receive your recovery code.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to find the account.' });
    } finally {
      setBusy(false);
    }
  }

  async function sendRecoveryCode(method: RecoveryMethod) {
    setBusy(true);
    setNotice(null);
    try {
      const channel = method.channel || method.type;
      if (!channel) throw new Error('This recovery method is missing its channel.');
      const result = await api<{ challengeId: string; maskedTarget?: string; expiresAt?: string }>('/auth/password-reset/send', {
        method: 'POST',
        body: JSON.stringify({
          identifier: email.trim(),
          channel,
          deviceId: deviceId(),
          deviceName: navigator.userAgent,
          deviceType: 'browser',
          platform: 'web',
          browser: navigator.userAgent,
          appVersion: 'web',
        }),
      });
      sessionStorage.setItem(RESET_KEY, JSON.stringify({ challengeId: result.challengeId, identifier: email.trim(), maskedTarget: result.maskedTarget, expiresAt: result.expiresAt }));
      setResetCode('');
      setNotice(null);
      changeScreen('reset-code');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to send the recovery code.' });
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = JSON.parse(sessionStorage.getItem(RESET_KEY) || 'null') as { challengeId?: string; maskedTarget?: string } | null;
    if (!data?.challengeId || !/^\d{5}$/.test(resetCode)) {
      setNotice({ kind: 'error', text: 'Enter the 5-digit recovery code.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ success?: boolean; resetToken?: string; message?: string }>('/auth/password-reset/verify', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: data.challengeId,
          code: resetCode,
          deviceId: deviceId(),
          deviceName: navigator.userAgent,
          deviceType: 'browser',
          platform: 'web',
          appVersion: 'web',
          language: navigator.language,
        }),
      });
      if (!result.success || !result.resetToken) throw new Error(result.message || 'The recovery code could not be verified.');
      sessionStorage.setItem('aurelink.reset-token', result.resetToken);
      changeScreen('reset-password');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Code verification failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem('aurelink.reset-token');
    if (!token) {
      setNotice({ kind: 'error', text: 'Your password-reset session has expired. Start recovery again.' });
      changeScreen('forgot');
      return;
    }
    const strong = newPassword.length >= 8 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
    if (!strong) {
      setNotice({ kind: 'error', text: 'Use at least 8 characters with at least one letter and one number.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: 'error', text: 'The passwords do not match.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ success?: boolean; message?: string }>('/auth/password-reset/change', {
        method: 'POST',
        body: JSON.stringify({
          resetToken: token,
          password: newPassword,
          deviceId: deviceId(),
          deviceName: navigator.userAgent,
          deviceType: 'browser',
          platform: 'web',
          browser: navigator.userAgent,
          appVersion: 'web',
          language: navigator.language,
        }),
      });
      if (!result.success) throw new Error(result.message || 'The password could not be changed.');
      sessionStorage.removeItem(RESET_KEY);
      sessionStorage.removeItem('aurelink.reset-token');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryMethods([]);
      changeScreen('login');
      setNotice({ kind: 'success', text: 'Password changed successfully. Sign in with your new password.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to change your password.' });
    } finally {
      setBusy(false);
    }
  }

  function comingSoon(provider: string) {
    setNotice({ kind: 'info', text: `${provider} sign-in is not connected yet. Use your email and password for now.` });
  }

  return (
    <div className="page-shell">
      <header className="brand-header">
        <BrandMark />
        <div className="brand-wordmark">
          <div className="brand-name">AURELINK</div>
          <div className="brand-tagline">REAL MOBILE NETWORKS. CONNECTED.</div>
        </div>
        <div className="header-status"><span /> SECURE ACCESS</div>
      </header>

      <main className="main-content">
        <section className="login-card" aria-labelledby="screen-title">
          <div className="card-heading">
            <span className="heading-rule" />
            <h1 id="screen-title">{screen === 'login' ? 'Sign in to your account' : screen === 'forgot' ? 'Recover your account' : screen === 'reset-code' ? 'Verify your identity' : screen === 'reset-password' ? 'Create a new password' : 'Create an account'}</h1>
            <span className="heading-rule" />
          </div>

          {screen === 'login' && <>
            <p className="intro-copy">Welcome back. Sign in to continue to AURELINK.</p>
            <p className="brand-description">Your mobile services, account activity and verified connections in one secure place.</p>
            <form className="login-form" onSubmit={handleLogin} noValidate>
              <label className="input-wrap">
                <MailIcon />
                <span className="sr-only">Email</span>
                <input type="email" name="email" autoComplete="username" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email address" disabled={busy} />
              </label>
              <label className="input-wrap password-wrap">
                <LockIcon />
                <span className="sr-only">Password</span>
                <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" disabled={busy} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} disabled={busy}><EyeIcon visible={showPassword} /></button>
              </label>
              <div className="forgot-row"><button type="button" className="text-link" onClick={() => changeScreen('forgot')}>Forgot password?</button></div>
              {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
              <button className="login-button" type="submit" disabled={busy}>
                {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : <>Sign in <span className="button-arrow" aria-hidden="true">↗</span></>}
              </button>
            </form>
            <div className="signup-prompt">New to AURELINK? <button className="inline-link" onClick={() => changeScreen('signup-soon')}>Create an account</button></div>
            <div className="divider-label"><span>OR SIGN IN WITH</span></div>
            <div className="provider-list">
              <button type="button" className="provider-button google-button" onClick={() => comingSoon('Google')}><span className="provider-symbol"><GoogleIcon /></span><span>Continue with Google</span><span className="provider-chevron">↗</span></button>
              <button type="button" className="provider-button github-button" onClick={() => comingSoon('GitHub')}><span className="provider-symbol"><GitHubIcon /></span><span>Continue with GitHub</span><span className="provider-chevron">↗</span></button>
              <button type="button" className="provider-button redom-button" onClick={() => comingSoon('ReDom')}><span className="provider-symbol"><ReDomIcon /></span><span>Continue with ReDom</span><span className="provider-chevron">↗</span></button>
            </div>
          </>}

          {screen === 'forgot' && <>
            <p className="intro-copy">Find your account to receive a one-time recovery code.</p>
            <p className="brand-description">We only show recovery destinations already connected to your account.</p>
            <form className="login-form" onSubmit={handleFindAccount}>
              <label className="input-wrap"><MailIcon /><span className="sr-only">Email or mobile number</span><input type="text" inputMode="email" autoComplete="username" placeholder="Email or mobile number" value={email} onChange={e => { setEmail(e.target.value); setRecoveryMethods([]); setNotice(null); }} disabled={busy} /></label>
              {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
              <button className="login-button full-width-button" type="submit" disabled={busy}>{busy ? 'Finding account…' : 'Find account'} <span className="button-arrow" aria-hidden="true">→</span></button>
            </form>
            {recoveryMethods.length > 0 && <div className="recovery-list"><div className="recovery-heading">Choose a recovery destination</div>{recoveryMethods.map((method, i) => <button key={(method.channel || method.type || 'method') + i} className="recovery-choice" type="button" onClick={() => void sendRecoveryCode(method)} disabled={busy}><span className="recovery-dot">{(method.channel || method.type || '').toLowerCase() === 'email' ? '✉' : '↗'}</span><span><b>{method.label || (method.channel || method.type || 'Recovery method').replace(/^./, x => x.toUpperCase())}</b><small>{method.maskedTarget || method.target || 'Verified destination'}</small></span><span className="provider-chevron">→</span></button>)}</div>}
            <button type="button" className="back-link" onClick={() => changeScreen('login')}>← Back to sign in</button>
          </>}

          {screen === 'reset-code' && <>
            <p className="intro-copy">Enter the five-digit code sent to your verified recovery destination.</p>
            <form className="login-form" onSubmit={verifyRecoveryCode}>
              <label className="input-wrap"><span className="sr-only">Verification code</span><input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={5} placeholder="5-digit verification code" value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 5))} disabled={busy} /></label>
              {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
              <button className="login-button full-width-button" type="submit" disabled={busy || resetCode.length !== 5}>{busy ? 'Verifying…' : 'Verify code'} <span className="button-arrow" aria-hidden="true">→</span></button>
            </form>
            <button type="button" className="back-link" onClick={() => changeScreen('forgot')}>← Back to account recovery</button>
          </>}

          {screen === 'reset-password' && <>
            <p className="intro-copy">Choose a strong password that you haven’t used before.</p>
            <form className="login-form" onSubmit={changePassword}>
              <label className="input-wrap password-wrap"><LockIcon /><span className="sr-only">New password</span><input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={busy} /><button type="button" className="password-toggle" onClick={() => setShowNewPassword(v => !v)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}><EyeIcon visible={showNewPassword} /></button></label>
              <label className="input-wrap"><LockIcon /><span className="sr-only">Confirm new password</span><input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} /></label>
              <p className="password-hint">At least 8 characters, including a letter and a number.</p>
              {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
              <button className="login-button full-width-button" type="submit" disabled={busy || !newPassword || !confirmPassword}>{busy ? 'Updating password…' : 'Update password'} <span className="button-arrow" aria-hidden="true">→</span></button>
            </form>
            <button type="button" className="back-link" onClick={() => changeScreen('login')}>← Back to sign in</button>
          </>}

          {screen === 'signup-soon' && <div className="placeholder-screen"><p>Account registration will be available here once AURELINK’s registration flow is connected.</p><button className="login-button full-width-button" onClick={() => changeScreen('login')}>Back to sign in</button></div>}
          <div className="card-bottom-line"><span className="secure-dot" /> Authentication protected by ReDom infrastructure</div>
        </section>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} AURELINK. All rights reserved.</p>
        <span>Secure access · Mobile network services</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
