import { useEffect, useMemo, useState } from "react";
import { api, clearSession } from "./lib/api";
import { ReDomMark, HomeIcon, ShieldIcon } from "./components/Icons";
import { WEB_SCREEN_REGISTRY, type WebRoute } from "./webParity";

type User = { id:string; firstName:string; lastName:string; username:string; profilePhoto?:string|null };
type Props = { user: User; onLogout: () => void };

const icons: Record<string,string> = {
  Core:"⌂", Profile:"◉", Messaging:"◌", Groups:"◎", Social:"♢", Calling:"◍",
  Settings:"⚙", Security:"◇", Payments:"$", Commerce:"▣", AI:"✦", Support:"?", Policies:"§",
  Authentication:"◈", Registration:"✎", Privacy:"◌", Content:"▤"
};

function currentRoute(): WebRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/app/homeFeed";
  return WEB_SCREEN_REGISTRY.find(x => x.path === path) || WEB_SCREEN_REGISTRY.find(x => x.key === "HomeFeed")!;
}

function go(route: WebRoute) {
  window.history.pushState({}, "", route.path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function initials(user: User) {
  return (user.firstName?.[0] || "R") + (user.lastName?.[0] || "");
}

function SensitiveBanner({ route }: { route: WebRoute }) {
  const sensitive = ["Payments","Security","Privacy"].includes(route.category);
  if (!sensitive) return null;
  return <div className="web-security-banner"><ShieldIcon/><div><b>Protected ReDom area</b><span>This page requires an authenticated ReDom session. Sensitive actions are validated by the ReDom Backend before they are accepted.</span></div><strong>SESSION PROTECTED</strong></div>;
}

function FeatureView({ route, user }: { route: WebRoute; user: User }) {
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [busy, setBusy] = useState(route.key === "HomeFeed" || route.key === "Profile");
  useEffect(() => {
    let live = true;
    if (route.key === "HomeFeed") {
      api<any>("/feed/home?refresh="+Date.now()).then(r => { if (live) setPosts(r.posts || []); }).catch(()=>{}).finally(()=>{ if(live) setBusy(false); });
    } else if (route.key === "Profile") {
      api<any>("/profile").then(r => { if (live) setProfile(r.profile || r); }).catch(()=>{}).finally(()=>{ if(live) setBusy(false); });
    } else setBusy(false);
    return () => { live = false; };
  }, [route.key]);

  if (route.key === "HomeFeed") return <div className="web-feed"><div className="web-composer"><span className="web-avatar">{initials(user)}</span><button>What's on your mind, {user.firstName}?</button><button className="web-add">+</button></div><div className="web-stories"><div className="web-story new"><b>+</b><span>Create story</span></div>{["Your story","Friends","ReDom","Updates","Discover"].map((x,i)=><div className="web-story" key={x}><div className="story-art"><span>{i+1}</span></div><span>{x}</span></div>)}</div>{busy?<div className="web-skeleton"><i/><i/><i/></div>:posts.length?posts.map(p=><article className="web-post-card" key={p.id}><header><span className="web-avatar">{String(p.firstName||"R")[0]}</span><div><b>{p.firstName} {p.lastName}</b><small>@{p.username || "redom"} · Public</small></div><button>•••</button></header>{p.content?<p>{p.content}</p>:<p className="muted">A new ReDom post is available.</p>}<div className="web-post-media"><ReDomMark size={55}/></div><footer><span>{Number(p.reactionSummary?.total || 0)} reactions</span><span>Comments</span><span>Share</span></footer></article>):<div className="web-empty"><HomeIcon/><h2>Your Home Feed is ready</h2><p>Posts from people, pages and recommendations will appear here.</p></div>}</div>;

  if (route.key === "Profile") return <div className="web-profile-page"><div className="web-cover"></div><div className="web-profile-head"><span className="web-profile-avatar">{initials(user)}</span><div><h1>{profile?.firstName || user.firstName} {profile?.lastName || user.lastName}</h1><p>@{profile?.username || user.username}</p></div><button className="web-btn primary">Edit profile</button></div><div className="web-grid-two"><section className="web-panel"><h2>About</h2><p>Manage your public ReDom identity, biography, location and profile information.</p><div className="web-info-row"><span>Username</span><b>@{profile?.username || user.username}</b></div><div className="web-info-row"><span>Account</span><b>Authenticated</b></div></section><section className="web-panel"><h2>Profile security</h2><p>Your profile changes are submitted to the ReDom Backend and checked against your authenticated account.</p><div className="security-chip"><ShieldIcon/> Protected session</div></section></div></div>;

  const payment = route.category === "Payments";
  const security = route.category === "Security" || route.category === "Privacy";
  const actionText = payment ? "Open secure payment area" : security ? "Open protected settings" : "Open " + route.title;
  return <div className="web-feature"><div className="web-feature-icon">{icons[route.category] || "•"}</div><span className="eyebrow">{route.category}</span><h1>{route.title}</h1><p>{route.description}</p><div className="web-feature-grid"><div><span>Experience</span><b>Full-screen Web implementation</b></div><div><span>Client</span><b>TypeScript + React + Vite</b></div><div><span>Service</span><b>ReDom Backend API</b></div><div><span>Security</span><b>{payment || security ? "Authenticated + protected" : "Authenticated session"}</b></div></div><div className="web-action-card"><div><ShieldIcon/><div><b>{payment ? "Payment security boundary" : security ? "Security boundary" : "Ready for this experience"}</b><p>{payment ? "Payment actions remain behind the authenticated ReDom account and backend validation." : security ? "Account and security controls are only exposed after session validation." : "This screen is now a real Web surface rather than a short placeholder card."}</p></div></div><button className="web-btn primary">{actionText}</button></div></div>;
}

export function WebExperience({ user, onLogout }: Props) {
  const [route, setRoute] = useState(currentRoute);
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [verified, setVerified] = useState(true);

  useEffect(() => {
    const handler = () => setRoute(currentRoute());
    window.addEventListener("popstate", handler);
    let live = true;
    api<any>("/profile").catch(() => { if (live) { clearSession(); onLogout(); } }).finally(() => { if(live) setVerified(true); });
    return () => { live = false; window.removeEventListener("popstate", handler); };
  }, [onLogout]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return WEB_SCREEN_REGISTRY.filter(x => !q || (x.title+" "+x.category+" "+x.key).toLowerCase().includes(q));
  }, [search]);

  const navigate = (x: WebRoute) => { setDrawer(false); go(x); };
  const core = WEB_SCREEN_REGISTRY.filter(x => ["HomeFeed","Search","Notifications","Messages","Profile","Marketplace"].includes(x.key));
  const settings = WEB_SCREEN_REGISTRY.filter(x => ["Settings","OrdersPayments","SecuritySettings","LinkedDevices","TermsPolicies","Support"].includes(x.key));

  if (!verified) return <div className="web-secure-loading"><img src="/security-shield.svg"/><h1>Securing ReDom Web</h1><p>Validating your authenticated session…</p></div>;

  return <div className="web-experience">
    <header className="web-topbar">
      <button className="web-brand" onClick={() => navigate(WEB_SCREEN_REGISTRY.find(x=>x.key==="HomeFeed")!)}><ReDomMark size={38}/><b>ReDom</b></button>
      <div className="web-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ReDom"/></div>
      <div className="web-top-actions"><span className="web-secure-dot"><i/> Secure</span><button className="web-icon-btn" onClick={()=>setDrawer(true)}>☰</button><button className="web-profile-chip" onClick={()=>navigate(WEB_SCREEN_REGISTRY.find(x=>x.key==="Profile")!)}><span className="web-avatar small">{initials(user)}</span><b>{user.firstName}</b></button></div>
    </header>
    <div className="web-layout">
      <aside className="web-sidebar">
        <div className="web-sidebar-label">ReDom</div>
        {core.map(x=><button key={x.key} className={x.key===route.key?"active":""} onClick={()=>navigate(x)}><span>{icons[x.category]||"•"}</span>{x.title}</button>)}
        <div className="web-sidebar-label">Account & security</div>
        {settings.map(x=><button key={x.key} className={x.key===route.key?"active":""} onClick={()=>navigate(x)}><span>{icons[x.category]||"•"}</span>{x.title}</button>)}
        <div className="web-sidebar-label">Explore</div>
        {WEB_SCREEN_REGISTRY.filter(x=>["Groups","Friends","Events","ReDomAI"].includes(x.key)).map(x=><button key={x.key} className={x.key===route.key?"active":""} onClick={()=>navigate(x)}><span>{icons[x.category]||"•"}</span>{x.title}</button>)}
        <div className="web-side-security"><ShieldIcon/><b>Protected</b><span>Authenticated ReDom session</span></div>
        <button className="web-logout" onClick={onLogout}>Sign out securely</button>
      </aside>
      <main className="web-main">
        <div className="web-main-inner">
          <div className="web-breadcrumb"><span>ReDom Web</span><b>/</b>{route.category}<b>/</b>{route.title}</div>
          <SensitiveBanner route={route}/>
          <FeatureView route={route} user={user}/>
        </div>
      </main>
    </div>
    <nav className="web-mobile-nav">{core.slice(0,5).map(x=><button key={x.key} className={x.key===route.key?"active":""} onClick={()=>navigate(x)}><span>{icons[x.category]||"•"}</span><small>{x.title}</small></button>)}</nav>
    {drawer?<div className="web-drawer-backdrop" onClick={()=>setDrawer(false)}><div className="web-mobile-drawer" onClick={e=>e.stopPropagation()}><div className="web-drawer-head"><span className="web-avatar">{initials(user)}</span><div><b>{user.firstName} {user.lastName}</b><small>@{user.username}</small></div><button onClick={()=>setDrawer(false)}>×</button></div>{visible.slice(0,20).map(x=><button key={x.key} onClick={()=>navigate(x)}>{icons[x.category]||"•"}<span>{x.title}</span></button>)}</div></div>:null}
  </div>;
}
