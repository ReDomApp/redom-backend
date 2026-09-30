import { useMemo, useState } from "react";
import { ReDomMark, HomeIcon, ShieldIcon } from "./components/Icons";

export type WebRoute = { key: string; category: string; title: string; path: string; description: string };

export const WEB_SCREEN_REGISTRY: WebRoute[] = [
  { key: "Login", category: "Authentication", title: "Sign in to ReDom", path: "/app/login", description: "Web structure for the sign in to ReDom screen, aligned with the current ReDom mobile screen reference." },
  { key: "FindAccount", category: "Authentication", title: "Find an existing ReDom account", path: "/app/findAccount", description: "Web structure for the find account screen, aligned with the current ReDom mobile screen reference." },
  { key: "DeviceVerification", category: "Authentication", title: "Verify a new browser or device", path: "/app/deviceVerification", description: "Web structure for device verification." },
  { key: "LoginTwoFactor", category: "Authentication", title: "Complete two-factor authentication", path: "/app/loginTwoFactor", description: "Web structure for two-factor authentication." },
  { key: "RegistrationWelcome", category: "Registration", title: "Start protected registration", path: "/app/registrationWelcome", description: "Web structure for registration welcome." },
  { key: "RegistrationIdentity", category: "Registration", title: "Enter account identity", path: "/app/registrationIdentity", description: "Web structure for registration identity." },
  { key: "RegistrationBirthday", category: "Registration", title: "Enter date of birth", path: "/app/registrationBirthday", description: "Web structure for registration birthday." },
  { key: "RegistrationGender", category: "Registration", title: "Choose identity and pronouns", path: "/app/registrationGender", description: "Web structure for registration gender." },
  { key: "RegistrationPhone", category: "Registration", title: "Add and verify mobile number", path: "/app/registrationPhone", description: "Web structure for registration phone." },
  { key: "RegistrationEmail", category: "Registration", title: "Add email address", path: "/app/registrationEmail", description: "Web structure for registration email." },
  { key: "RegistrationPassword", category: "Registration", title: "Create a strong password", path: "/app/registrationPassword", description: "Web structure for registration password." },
  { key: "RegistrationReview", category: "Registration", title: "Review account details and policies", path: "/app/registrationReview", description: "Web structure for registration review." },
  { key: "RegistrationVerification", category: "Registration", title: "Verify registration code", path: "/app/registrationVerification", description: "Web structure for registration verification." },
  { key: "CustomizingExperience", category: "Registration", title: "Prepare account and session", path: "/app/customizingExperience", description: "Web structure for account customization." },
  { key: "HomeFeed", category: "Core", title: "Home Feed", path: "/app/homeFeed", description: "Web structure for the ReDom Home Feed." },
  { key: "Profile", category: "Core", title: "Profile", path: "/app/profile", description: "Web structure for the ReDom profile." },
  { key: "EditProfile", category: "Profile", title: "Edit profile", path: "/app/editProfile", description: "Web structure for editing profile information." },
  { key: "EditBio", category: "Profile", title: "Edit biography", path: "/app/editBio", description: "Web structure for editing a biography." },
  { key: "EditLocationSearch", category: "Profile", title: "Search location", path: "/app/editLocationSearch", description: "Web structure for location search." },
  { key: "EditLocationConfirm", category: "Profile", title: "Confirm location", path: "/app/editLocationConfirm", description: "Web structure for confirming a location." },
  { key: "EditBirthday", category: "Profile", title: "Edit birthday", path: "/app/editBirthday", description: "Web structure for editing birthday." },
  { key: "ProfilePictureAdjust", category: "Profile", title: "Adjust profile picture", path: "/app/profilePictureAdjust", description: "Web structure for profile picture adjustment." },
  { key: "ProfilePicturePreview", category: "Profile", title: "Preview profile picture", path: "/app/profilePicturePreview", description: "Web structure for profile picture preview." },
  { key: "ProfilePictureViewer", category: "Profile", title: "View profile picture", path: "/app/profilePictureViewer", description: "Web structure for profile picture viewer." },
  { key: "CoverPhotoAdjust", category: "Profile", title: "Adjust cover photo", path: "/app/coverPhotoAdjust", description: "Web structure for cover photo adjustment." },
  { key: "CoverPhotoPreview", category: "Profile", title: "Preview cover photo", path: "/app/coverPhotoPreview", description: "Web structure for cover photo preview." },
  { key: "CoverPhotoViewer", category: "Profile", title: "View cover photo", path: "/app/coverPhotoViewer", description: "Web structure for cover photo viewer." },
  { key: "Foundation", category: "Core", title: "ReDom Foundation", path: "/app/foundation", description: "Web structure for the ReDom Foundation." },
  { key: "Search", category: "Core", title: "Search ReDom", path: "/app/search", description: "Web structure for ReDom search." },
  { key: "Notifications", category: "Core", title: "Notifications", path: "/app/notifications", description: "Web structure for notifications." },
  { key: "Messages", category: "Messaging", title: "Messages", path: "/app/messages", description: "Web structure for messages." },
  { key: "Saved", category: "Content", title: "Saved", path: "/app/saved", description: "Web structure for saved content." },
  { key: "Marketplace", category: "Commerce", title: "Marketplace", path: "/app/marketplace", description: "Web structure for Marketplace." },
  { key: "Groups", category: "Groups", title: "Groups", path: "/app/groups", description: "Web structure for groups." },
  { key: "Friends", category: "Social", title: "Friends", path: "/app/friends", description: "Web structure for friends." },
  { key: "Events", category: "Social", title: "Events", path: "/app/events", description: "Web structure for events." },
  { key: "ReDomAI", category: "AI", title: "ReDom AI", path: "/app/reDomAI", description: "Web structure for ReDom AI." },
  { key: "ReDomAIInfo", category: "AI", title: "About ReDom AI", path: "/app/reDomAIInfo", description: "Web structure for ReDom AI information." },
  { key: "ReDomAIPolicy", category: "AI", title: "ReDom AI Policy", path: "/app/reDomAIPolicy", description: "Web structure for the ReDom AI policy." },
  { key: "Chat", category: "Messaging", title: "Chat", path: "/app/chat", description: "Web structure for chat." },
  { key: "ChatContactInfo", category: "Messaging", title: "Chat contact information", path: "/app/chatContactInfo", description: "Web structure for chat contact information." },
  { key: "ChatEncryptionVerification", category: "Messaging", title: "Chat encryption verification", path: "/app/chatEncryptionVerification", description: "Web structure for chat encryption verification." },
  { key: "ChatMediaGallery", category: "Messaging", title: "Chat media gallery", path: "/app/chatMediaGallery", description: "Web structure for chat media gallery." },
  { key: "AddToGroups", category: "Groups", title: "Add member to groups", path: "/app/addToGroups", description: "Web structure for adding a member to groups." },
  { key: "Call", category: "Calling", title: "Call", path: "/app/call", description: "Web structure for voice and video calling." },
  { key: "CallLinkJoin", category: "Calling", title: "Join call link", path: "/app/callLinkJoin", description: "Web structure for joining a call link." },
  { key: "CreateGroup", category: "Groups", title: "Create group", path: "/app/createGroup", description: "Web structure for creating a group." },
  { key: "CreatePublicGroup", category: "Groups", title: "Create public group", path: "/app/createPublicGroup", description: "Web structure for creating a public group." },
  { key: "GroupInfo", category: "Groups", title: "Group information", path: "/app/groupInfo", description: "Web structure for group information." },
  { key: "GroupPermissions", category: "Groups", title: "Group permissions", path: "/app/groupPermissions", description: "Web structure for group permissions." },
  { key: "GroupInvite", category: "Groups", title: "Group invite", path: "/app/groupInvite", description: "Web structure for group invitations." },
  { key: "GroupMemberChanges", category: "Groups", title: "Group member changes", path: "/app/groupMemberChanges", description: "Web structure for group member changes." },
  { key: "GroupAddMembers", category: "Groups", title: "Add group members", path: "/app/groupAddMembers", description: "Web structure for adding group members." },
  { key: "GroupSettings", category: "Groups", title: "Group settings", path: "/app/groupSettings", description: "Web structure for group settings." },
  { key: "GroupIcon", category: "Groups", title: "Group icon", path: "/app/groupIcon", description: "Web structure for group icon management." },
  { key: "GroupPrivacyInfo", category: "Groups", title: "Group privacy", path: "/app/groupPrivacyInfo", description: "Web structure for group privacy." },
  { key: "GroupAdmins", category: "Groups", title: "Group admins", path: "/app/groupAdmins", description: "Web structure for group administrators." },
  { key: "ScheduleGroupCall", category: "Calling", title: "Schedule group call", path: "/app/scheduleGroupCall", description: "Web structure for scheduling a group call." },
  { key: "GroupReport", category: "Groups", title: "Report group", path: "/app/groupReport", description: "Web structure for reporting a group." },
  { key: "Settings", category: "Settings", title: "Settings", path: "/app/settings", description: "Web structure for Settings." },
  { key: "Language", category: "Settings", title: "Language", path: "/app/language", description: "Web structure for language settings." },
  { key: "DarkMode", category: "Settings", title: "Dark mode", path: "/app/darkMode", description: "Web structure for dark mode." },
  { key: "NotificationSettings", category: "Settings", title: "Notification settings", path: "/app/notificationSettings", description: "Web structure for notification settings." },
  { key: "PrivacySettings", category: "Settings", title: "Privacy settings", path: "/app/privacySettings", description: "Web structure for privacy settings." },
  { key: "SecuritySettings", category: "Security", title: "Security settings", path: "/app/securitySettings", description: "Web structure for security settings." },
  { key: "LinkedDevices", category: "Security", title: "Linked devices", path: "/app/linkedDevices", description: "Web structure for linked devices." },
  { key: "LinkDevice", category: "Security", title: "Link a device", path: "/app/linkDevice", description: "Web structure for linking a device." },
  { key: "LinkHistory", category: "Security", title: "Link history", path: "/app/linkHistory", description: "Web structure for link history." },
  { key: "OrdersPayments", category: "Payments", title: "Orders and Payments", path: "/app/ordersPayments", description: "Web structure for Orders and Payments." },
  { key: "ReDomPayTransactions", category: "Payments", title: "ReDom Pay transactions", path: "/app/reDomPayTransactions", description: "Web structure for ReDom Pay transactions." },
  { key: "ReDomPayManage", category: "Payments", title: "ReDom Pay manage", path: "/app/reDomPayManage", description: "Web structure for managing ReDom Pay." },
  { key: "PaymentTransactionDetails", category: "Payments", title: "Payment transaction details", path: "/app/paymentTransactionDetails", description: "Web structure for payment transaction details." },
  { key: "RefundCase", category: "Payments", title: "Refund case", path: "/app/refundCase", description: "Web structure for refund cases." },
  { key: "PaymentMethods", category: "Payments", title: "Payment methods", path: "/app/paymentMethods", description: "Web structure for payment methods." },
  { key: "AddPaymentMethod", category: "Payments", title: "Add payment method", path: "/app/addPaymentMethod", description: "Web structure for adding a payment method." },
  { key: "AddCard", category: "Payments", title: "Add card", path: "/app/addCard", description: "Web structure for adding a card." },
  { key: "ReviewPaymentInfo", category: "Payments", title: "Review payment information", path: "/app/reviewPaymentInfo", description: "Web structure for reviewing payment information." },
  { key: "SavedProducts", category: "Commerce", title: "Saved products", path: "/app/savedProducts", description: "Web structure for saved products." },
  { key: "Cart", category: "Commerce", title: "Cart", path: "/app/cart", description: "Web structure for the shopping cart." },
  { key: "StarsActivity", category: "Payments", title: "ReDom Stars activity", path: "/app/starsActivity", description: "Web structure for ReDom Stars activity." },
  { key: "BuyStars", category: "Payments", title: "Buy ReDom Stars", path: "/app/buyStars", description: "Web structure for buying ReDom Stars." },
  { key: "StarsCheckout", category: "Payments", title: "Stars checkout", path: "/app/starsCheckout", description: "Web structure for ReDom Stars checkout." },
  { key: "Subscriptions", category: "Payments", title: "Subscriptions", path: "/app/subscriptions", description: "Web structure for subscriptions." },
  { key: "SubscriptionDetails", category: "Payments", title: "Subscription details", path: "/app/subscriptionDetails", description: "Web structure for subscription details." },
  { key: "PaymentSecurity", category: "Payments", title: "Payment security", path: "/app/paymentSecurity", description: "Web structure for payment security." },
  { key: "PaymentPin", category: "Payments", title: "Payment PIN", path: "/app/paymentPin", description: "Web structure for payment PIN." },
  { key: "PaymentAddresses", category: "Payments", title: "Payment addresses", path: "/app/paymentAddresses", description: "Web structure for payment addresses." },
  { key: "PaymentCurrency", category: "Payments", title: "Payment currency", path: "/app/paymentCurrency", description: "Web structure for payment currency." },
  { key: "BlockedUsers", category: "Privacy", title: "Blocked users", path: "/app/blockedUsers", description: "Web structure for blocked users." },
  { key: "Verification", category: "Security", title: "Account verification", path: "/app/verification", description: "Web structure for account verification." },
  { key: "Support", category: "Support", title: "Help and Support", path: "/app/support", description: "Web structure for Help and Support." },
  { key: "MetaPaySupport", category: "Payments", title: "Payment support", path: "/app/metaPaySupport", description: "Web structure for payment support." },
  { key: "MetaPayArticle", category: "Payments", title: "Payment support article", path: "/app/metaPayArticle", description: "Web structure for payment support articles." },
  { key: "PayoutSupport", category: "Payments", title: "Payout support", path: "/app/payoutSupport", description: "Web structure for payout support." },
  { key: "SupportInbox", category: "Support", title: "Support inbox", path: "/app/supportInbox", description: "Web structure for the support inbox." },
  { key: "SupportMessage", category: "Support", title: "Support message", path: "/app/supportMessage", description: "Web structure for support messages." },
  { key: "SubscriptionRenewal", category: "Payments", title: "Subscription renewal", path: "/app/subscriptionRenewal", description: "Web structure for subscription renewal." },
  { key: "SelectCurrency", category: "Payments", title: "Select currency", path: "/app/selectCurrency", description: "Web structure for currency selection." },
  { key: "ReportProblem", category: "Support", title: "Report a problem", path: "/app/reportProblem", description: "Web structure for reporting a problem." },
  { key: "TermsPolicies", category: "Policies", title: "Terms and Policies", path: "/app/termsPolicies", description: "Web structure for Terms and Policies." },
  { key: "Policy", category: "Policies", title: "Policy", path: "/app/policy", description: "Web structure for individual policy documents." },
];

const CATEGORIES = ["All", ...Array.from(new Set(WEB_SCREEN_REGISTRY.map((route) => route.category)))];

function routeFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return WEB_SCREEN_REGISTRY.find((route) => route.path === path) ?? WEB_SCREEN_REGISTRY.find((route) => route.key === "HomeFeed")!;
}

export function WebParity({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [route, setRoute] = useState(routeFromLocation);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Core");
  const visible = useMemo(
    () => WEB_SCREEN_REGISTRY.filter((item) => (!query || `${item.title} ${item.key}`.toLowerCase().includes(query.toLowerCase())) && (category === "All" || item.category === category)),
    [query, category],
  );
  const navigate = (next: WebRoute) => {
    window.history.pushState({}, "", next.path);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goHome = () => navigate(WEB_SCREEN_REGISTRY.find((x) => x.key === "HomeFeed")!);
  return (
    <div className="web-parity">
      <header className="web-parity-header">
        <button className="web-parity-brand" onClick={goHome}><ReDomMark size={38}/><span>ReDom</span></button>
        <div className="web-parity-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search web screens" /></div>
        <div className="web-parity-user"><span>{user?.firstName || "ReDom"}</span><button onClick={onLogout}>Log out</button></div>
      </header>
      <div className="web-parity-body">
        <aside className="web-parity-sidebar">
          <button className="web-parity-home" onClick={goHome}><HomeIcon/> <span>Home Feed</span></button>
          <div className="web-parity-section-title">Screen structure</div>
          {CATEGORIES.map((item) => <button key={item} className={category === item ? "web-nav active" : "web-nav"} onClick={() => setCategory(item)}>{item}<b>{item === "All" ? WEB_SCREEN_REGISTRY.length : WEB_SCREEN_REGISTRY.filter((x) => x.category === item).length}</b></button>)}
        </aside>
        <main className="web-parity-main">
          <div className="web-breadcrumb">ReDom Web <span>/</span> {route.category} <span>/</span> {route.title}</div>
          <section className="web-route-hero">
            <div className="web-route-icon"><ShieldIcon/></div>
            <div><span className="eyebrow">MOBILE PARITY STRUCTURE</span><h1>{route.title}</h1><p>{route.description}</p></div>
          </section>
          <section className="web-route-card">
            <div className="web-route-card-head"><div><h2>{route.title}</h2><p>Route: <code>{route.path}</code></p></div><span className="web-status-pill">Web ready</span></div>
            <div className="web-route-grid">
              <div><span>Reference</span><b>redom-frontend/src/screens/{route.key}.tsx</b></div>
              <div><span>Web language</span><b>TypeScript + React + Vite</b></div>
              <div><span>Shared backend</span><b>ReDom Backend API</b></div>
              <div><span>Deployment target</span><b>ReDom Web / Vercel</b></div>
            </div>
            <div className="web-route-note"><b>Parity baseline</b><p>This route is registered from the current mobile navigation structure so the web application can be upgraded screen-by-screen without changing the backend/frontend boundaries.</p></div>
          </section>
          <section className="web-screen-list">
            <div className="web-list-head"><h2>{query || category !== "Core" ? "Matching screens" : "Current web structure"}</h2><span>{visible.length} routes</span></div>
            <div className="web-route-list">{visible.map((item) => <button key={item.key} className={item.key === route.key ? "web-route-item selected" : "web-route-item"} onClick={() => navigate(item)}><span><b>{item.title}</b><small>{item.category} · {item.path}</small></span><strong>›</strong></button>)}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
