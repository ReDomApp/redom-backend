import { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Screen = 'login' | 'forgot' | 'signup-soon';
type Notice = { kind: 'error' | 'info' | 'success'; text: string } | null;

function BrandMark() {
  return <img className="brand-mark" src="/aurelink-mark.svg" alt="AURELINK" />;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="field-icon"><rect x="3.5" y="5.5" width="17" height="13" rx="1.8"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>;
}

function LockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="field-icon"><rect x="4.5" y="10" width="15" height="10" rx="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    document.title = screen === 'login' ? 'Sign in · AURELINK' : screen === 'forgot' ? 'Password help · AURELINK' : 'Create account · AURELINK';
  }, [screen]);

  function changeScreen(next: Screen) {
    setNotice(null);
    setScreen(next);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      setNotice({ kind: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (!password) {
      setNotice({ kind: 'error', text: 'Enter your password.' });
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
      if (!base) {
        setNotice({ kind: 'error', text: 'Login is not available yet. Please try again later.' });
        return;
      }
      const response = await fetch(base + '/redom-backend/aurelink/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; code?: string };
      if (response.ok) {
        setNotice({ kind: 'success', text: 'Login successful. Your account session has been created.' });
      } else if (response.status === 404 || payload.code === 'ACCOUNT_NOT_FOUND') {
        setNotice({ kind: 'error', text: 'Account not found. Check your email or create an account when registration becomes available.' });
      } else if (response.status === 401 || payload.code === 'INVALID_CREDENTIALS') {
        setNotice({ kind: 'error', text: 'Password incorrect. Check your password and try again.' });
      } else {
        setNotice({ kind: 'error', text: payload.message || payload.error || 'Login failed. Please try again.' });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof DOMException && error.name === 'AbortError' ? 'Login timed out. Please try again.' : 'Unable to connect securely. Please try again shortly.' });
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  function comingSoon(provider: string) {
    setNotice({ kind: 'info', text: `${provider} sign-in is coming soon and is not available yet.` });
  }

  return (
    <div className="page-shell">
      <header className="brand-header">
        <BrandMark />
        <div className="brand-wordmark">
          <div className="brand-name">AURELINK</div>
          <div className="brand-tagline">REAL MOBILE NETWORKS. CONNECTED.</div>
        </div>
      </header>

      <main className="main-content">
        <section className="login-card" aria-labelledby="screen-title">
          <div className="card-heading">
            <span className="heading-rule" />
            <h1 id="screen-title">{screen === 'login' ? 'Sign in to your account' : screen === 'forgot' ? 'Password assistance' : 'Create an account'}</h1>
            <span className="heading-rule" />
          </div>

          {screen === 'login' && <>
            <p className="intro-copy">Please enter your email and password to log in.</p>
            <p className="brand-description">AURELINK connects with real mobile providers and telecommunications networks — no VoIP numbers.</p>
            <form className="login-form" onSubmit={handleLogin} noValidate>
              <label className="input-wrap">
                <MailIcon />
                <span className="sr-only">Email</span>
                <input type="email" name="email" autoComplete="username" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" disabled={busy} />
              </label>
              <label className="input-wrap">
                <LockIcon />
                <span className="sr-only">Password</span>
                <input type="password" name="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password" disabled={busy} />
              </label>
              <div className="forgot-row"><button type="button" className="text-link" onClick={() => changeScreen('forgot')}>Forgot My Password? Change Password</button></div>
              {notice && <div className={`notice notice-${notice.kind}`} role="status" aria-live="polite">{notice.text}</div>}
              <button className="login-button" type="submit" disabled={busy}>
                {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : <>Login <span className="button-arrow" aria-hidden="true">›</span></>}
              </button>
            </form>
            <div className="signup-prompt">Don't have an account? <button className="inline-link" onClick={() => changeScreen('signup-soon')}>Create an account</button></div>
            <div className="divider-label"><span>OR CONTINUE WITH</span></div>
            <div className="provider-list">
              <button type="button" className="provider-button google-button" onClick={() => comingSoon('Google')}><span className="provider-symbol"><GoogleIcon /></span><span>Login with Google <small>Coming soon</small></span></button>
              <button type="button" className="provider-button redom-button" onClick={() => comingSoon('ReDom')}><span className="provider-symbol"><ReDomIcon /></span><span>Login with ReDom <small>Not available yet</small></span></button>
              <button type="button" className="provider-button github-button" onClick={() => comingSoon('GitHub')}><span className="provider-symbol"><GitHubIcon /></span><span>Login with GitHub <small>Coming soon</small></span></button>
            </div>
          </>}

          {screen === 'forgot' && <div className="placeholder-screen"><p>Password recovery and change-password tools are coming in the next screen.</p><button className="login-button" onClick={() => changeScreen('login')}>Back to Login</button></div>}
          {screen === 'signup-soon' && <div className="placeholder-screen"><p>AURELINK account registration is coming soon.</p><button className="login-button" onClick={() => changeScreen('login')}>Back to Login</button></div>}
        </section>
      </main>

      <footer className="site-footer">
        <p>© {new Date().getFullYear()} Aurelink, Inc. All rights reserved.</p>
        <a href="https://www.google.com/maps/search/?api=1&query=1500+North+Grant+STE+C+Denver+CO+80203" target="_blank" rel="noreferrer">1500 North Grant, STE C, Denver, CO 80203</a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
