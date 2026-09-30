import { useState } from "react";

const features = [
  {
    title: "Connect",
    text: "Keep up with people, communities, and conversations that matter to you.",
  },
  {
    title: "Share",
    text: "Publish posts, photos, videos, stories, and moments from one place.",
  },
  {
    title: "Discover",
    text: "Find new people, content, and opportunities across the ReDom network.",
  },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="site">
      <header className="topbar">
        <a className="brand-link" href="/" aria-label="ReDom home">
          <img src="/logo.svg" alt="" className="brand-mark" />
          <span>ReDom</span>
        </a>

        <nav className={`nav-links ${menuOpen ? "is-open" : ""}`} aria-label="Primary navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#download" onClick={() => setMenuOpen(false)}>Get ReDom</a>
        </nav>

        <div className="nav-actions">
          <button className="button button-ghost" type="button">Sign in</button>
          <button className="button button-primary" type="button">Create account</button>
        </div>

        <button
          className="menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="status-dot" /> ReDom is here</div>
            <h1>Your world.<br /><span>Connected.</span></h1>
            <p>
              ReDom is a social platform built for sharing, discovering, and
              staying connected with the people and communities around you.
            </p>
            <div className="hero-actions">
              <button className="button button-primary button-large" type="button">Create account</button>
              <button className="button button-secondary button-large" type="button">Sign in</button>
            </div>
            <p className="small-note">Available on ReDom mobile and web.</p>
          </div>

          <div className="hero-visual" aria-label="ReDom preview">
            <div className="glow" />
            <div className="preview-card">
              <div className="preview-header">
                <div className="mini-brand">
                  <img src="/logo.svg" alt="" />
                  <strong>ReDom</strong>
                </div>
                <div className="preview-pill">Home</div>
              </div>
              <div className="story-row">
                <div className="story story-add"><span>+</span><small>Your story</small></div>
                <div className="story"><div className="story-avatar avatar-one" /><small>Alex</small></div>
                <div className="story"><div className="story-avatar avatar-two" /><small>Jordan</small></div>
                <div className="story"><div className="story-avatar avatar-three" /><small>Taylor</small></div>
              </div>
              <article className="post-card">
                <div className="post-head">
                  <div className="post-avatar" />
                  <div><strong>ReDom</strong><span>Just now</span></div>
                </div>
                <p>Welcome to ReDom. This is where your social experience begins.</p>
                <div className="post-media"><img src="/logo.svg" alt="" /></div>
                <div className="post-actions"><span>Like</span><span>Comment</span><span>Share</span></div>
              </article>
            </div>
          </div>
        </section>

        <section className="feature-section" id="features">
          <div className="section-heading">
            <span className="section-kicker">Built for connection</span>
            <h2>Everything starts with people.</h2>
            <p>One platform for the conversations, content, and communities you care about.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature, index) => (
              <article className="feature-card" key={feature.title}>
                <div className="feature-number">0{index + 1}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section" id="about">
          <div>
            <span className="section-kicker">The ReDom experience</span>
            <h2>One identity across your ReDom world.</h2>
          </div>
          <p>
            Your ReDom account connects your social experience across supported
            devices and services. The web experience is being built alongside
            the ReDom mobile application and shared platform backend.
          </p>
        </section>

        <section className="download-section" id="download">
          <div className="download-card">
            <img src="/logo.svg" alt="" />
            <div>
              <span className="section-kicker">ReDom</span>
              <h2>Join the network.</h2>
              <p>Sign in to your account or create your ReDom account to get started.</p>
            </div>
            <button className="button button-primary" type="button">Get started</button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <a className="brand-link" href="/" aria-label="ReDom home">
          <img src="/logo.svg" alt="" className="brand-mark" />
          <span>ReDom</span>
        </a>
        <span>© {new Date().getFullYear()} ReDom Platforms, Inc.</span>
        <div className="footer-links">
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <a href="#download">Get ReDom</a>
        </div>
      </footer>
    </div>
  );
}
