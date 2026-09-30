import {useCallback,useEffect,useMemo,useState} from "react";
import {api} from "./lib/api";
import ReDomLogo from "./assets/brand/redom-logo.svg";
import ReDomMark from "./assets/brand/redom-mark.svg";
import SearchSvg from "./assets/auth/search.svg";
import SecuritySvg from "./assets/auth/security-shield.svg";
import BackSvg from "./assets/navigation/back.svg";
import CloseSvg from "./assets/navigation/close.svg";
import MoreSvg from "./assets/navigation/more.svg";
import HomeSvg from "./assets/home-feed/home.svg";
import VideoSvg from "./assets/home-feed/video.svg";
import MarketSvg from "./assets/home-feed/marketplace.svg";
import BellSvg from "./assets/home-feed/notifications.svg";
import MenuSvg from "./assets/home-feed/menu.svg";
import MessengerSvg from "./assets/home-feed/messenger.svg";
import ProfileSvg from "./assets/home-feed/profile-placeholder.svg";
import ProfileEditSvg from "./assets/home-feed/profile-edit.svg";
import CameraSvg from "./assets/home-feed/profile-camera.svg";
import CoverCameraSvg from "./assets/home-feed/profile-cover-camera.svg";
import CoverEditSvg from "./assets/home-feed/profile-cover-edit.svg";
import CoverSearchSvg from "./assets/home-feed/profile-cover-search.svg";
import CoverMoreSvg from "./assets/home-feed/profile-cover-more.svg";
import LikeSvg from "./assets/home-feed/like.svg";
import CommentSvg from "./assets/home-feed/comment.svg";
import ShareSvg from "./assets/home-feed/share.svg";
import SavedSvg from "./assets/home-feed/saved.svg";
import CartSvg from "./assets/home-feed/cart.svg";
import StarsSvg from "./assets/home-feed/stars.svg";
import SubscriptionSvg from "./assets/home-feed/subscriptions.svg";
import PaymentSecuritySvg from "./assets/home-feed/security-controls.svg";
import SupportSvg from "./assets/home-feed/help-support.svg";
import TermsSvg from "./assets/home-feed/terms-policies.svg";
import PaypalSvg from "./assets/payment/paypal.svg";
import BankPaymentSvg from "./assets/payment/bank-payment.svg";
import VisaSvg from "./assets/payment/card-brands/visa.svg";
import MastercardSvg from "./assets/payment/card-brands/mastercard.svg";
import type {WebRoute} from "./webParity";
import {WEB_SCREEN_REGISTRY} from "./webParity";

type User={id:string;userId?:string;firstName:string;lastName:string;username:string;profilePhoto?:string|null;coverPhoto?:string|null};
type Props={user:User;onLogout:()=>void;onAuthRoute?:(key:string)=>void};

const A:{[k:string]:string}={
  home:HomeSvg,video:VideoSvg,market:MarketSvg,notifications:BellSvg,menu:MenuSvg,search:SearchSvg,messages:MessengerSvg,profile:ProfileSvg,security:SecuritySvg,saved:SavedSvg,cart:CartSvg,stars:StarsSvg,subscription:SubscriptionSvg,payment:PaymentSecuritySvg,support:SupportSvg,terms:TermsSvg
};

const byKey=(key:string)=>WEB_SCREEN_REGISTRY.find(x=>x.key===key)||null;
const keyFromPath=()=>{const p=window.location.pathname.replace(/\/$/,"");const r=WEB_SCREEN_REGISTRY.find(x=>x.path.toLowerCase()===p.toLowerCase());return r?.key||"HomeFeed"};
const go=(path:string)=>{window.history.pushState({}, "", path);window.dispatchEvent(new PopStateEvent("popstate"));window.scrollTo({top:0,behavior:"smooth"});};

function Img({src,alt="",className=""}:{src:string;alt?:string;className?:string}){return <img src={src} alt={alt} className={className}/>;}
function Avatar({user,size=46}:{user:any;size?:number}){const src=user?.profilePhoto||user?.profile?.profilePhoto;return src?<img src={src} alt="" className="parity-avatar" style={{width:size,height:size}}/>:<span className="parity-avatar-fallback" style={{width:size,height:size}}><Img src={ProfileSvg}/></span>;}
function Button({children,onClick,kind="primary",disabled=false}:{children:any;onClick?:()=>void;kind?:"primary"|"secondary"|"ghost"|"danger";disabled?:boolean}){return <button className={"parity-btn parity-"+kind} onClick={onClick} disabled={disabled}>{children}</button>;}
function Field({label,value,onChange,type="text",placeholder=""}:{label:string;value:string;onChange:(v:string)=>void;type?:string;placeholder?:string}){return <label className="parity-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></label>;}
function Shell({user,onLogout,children}:{user:User;onLogout:()=>void;children:any}){const nav=[["HomeFeed","Home",HomeSvg],["Search","Search",SearchSvg],["Messages","Messages",MessengerSvg],["Notifications","Notifications",BellSvg],["Profile","Profile",ProfileSvg],["Marketplace","Marketplace",MarketSvg],["Groups","Groups",MenuSvg],["Settings","Settings",PaymentSecuritySvg]];return <div className="parity-app"><header className="parity-top"><button className="parity-brand" onClick={()=>go("/app/homeFeed")}><Img src={ReDomLogo} className="parity-logo"/><span>ReDom</span></button><div className="parity-search"><Img src={SearchSvg}/><input aria-label="Search ReDom" placeholder="Search ReDom" onKeyDown={e=>{if(e.key==="Enter")go("/app/search")}}/></div><div className="parity-top-actions"><button aria-label="Messages" onClick={()=>go("/app/messages")}><Img src={MessengerSvg}/></button><button aria-label="Notifications" onClick={()=>go("/app/notifications")}><Img src={BellSvg}/></button><button aria-label="Menu" onClick={()=>go("/app/settings")}><Img src={MenuSvg}/></button><button className="parity-user" onClick={()=>go("/app/profile")}><Avatar user={user} size={36}/><span>{user.firstName}</span></button></div></header><div className="parity-layout"><aside className="parity-sidebar">{nav.map(([k,label,icon])=><button key={String(k)} onClick={()=>go("/app/"+String(k).replace(/[A-Z]/g,m=>m.toLowerCase()).replace("homefeed","homeFeed"))}><Img src={String(icon)}/><span>{label}</span></button>)}<div className="parity-sidebar-spacer"/><button onClick={onLogout}><Img src={TermsSvg}/><span>Log out</span></button></aside><main className="parity-main">{children}</main></div></div>;}

function Header({route,title,subtitle}:{route:WebRoute;title?:string;subtitle?:string}){return <div className="parity-head"><button className="parity-back" aria-label="Back" onClick={()=>go("/app/homeFeed")}><Img src={BackSvg}/></button><div><div className="parity-eyebrow">{route.category}</div><h1>{title||route.title}</h1>{subtitle||route.description?<p>{subtitle||route.description}</p>:null}</div></div>;}

function HomeFeed({user}:{user:User}){const[posts,setPosts]=useState<any[]>([]),[stories,setStories]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");const load=useCallback(async()=>{setLoading(true);try{const r=await api<any>("/feed/home?refresh="+Date.now());setPosts(r.posts||[]);setStories(r.stories||r.friendStories||[]);setError("")}catch(e){setError(e instanceof Error?e.message:"Unable to load Home Feed.")}finally{setLoading(false)}},[]);useEffect(()=>{void load()},[load]);return <><Header route={byKey("HomeFeed")!} title="Home Feed" subtitle="Your ReDom feed, stories and people you follow."/><section className="parity-composer"><Avatar user={user}/><button onClick={()=>go("/app/createPost")}>What's on your mind, {user.firstName}?</button><Button kind="secondary">Add media</Button></section><section className="parity-section"><div className="parity-section-title"><h2>Stories</h2><button onClick={()=>go("/app/homeFeed")}>See all</button></div><div className="parity-story-row">{<div className="parity-story"><Avatar user={user} size={58}/><b>Create story</b></div>}{stories.slice(0,10).map(s=><div className="parity-story" key={s.id}><Avatar user={s} size={58}/><b>{s.firstName||s.name||"ReDom"}</b></div>)}</div></section>{error?<div className="parity-error">{error}<Button kind="secondary" onClick={()=>void load()}>Retry</Button></div>:null}{loading?<div className="parity-loading">Loading your Home Feed…</div>:posts.length?posts.map(p=><Post key={p.id} post={p}/>):<Empty title="Your Home Feed is ready" text="Posts from your ReDom network will appear here when available."/>}</>;}
function Post({post}:{post:any}){const[liked,setLiked]=useState(!!post.reactionSummary?.myReaction),[busy,setBusy]=useState(false);const react=async()=>{if(busy)return;setBusy(true);try{await api("/feed/post-reaction",{method:"POST",body:JSON.stringify({postId:post.id,reactionType:liked?"":"like"})});setLiked(!liked)}catch{}finally{setBusy(false)}};return <article className="parity-post"><header><Avatar user={post}/><div><b>{post.firstName} {post.lastName}</b><small>{post.publishedAt?new Date(post.publishedAt).toLocaleString():"ReDom post"}</small></div><button aria-label="More"><Img src={MoreSvg}/></button></header>{post.content?<p>{post.content}</p>:null}{post.media?.[0]?.objectKey?<img className="parity-post-image" src={post.media[0].objectKey} alt=""/>:null}<div className="parity-post-meta"><span>{post.reactionSummary?.total||0} reactions</span></div><div className="parity-post-actions"><button onClick={()=>void react()} disabled={busy}><Img src={LikeSvg}/>{liked?"Liked":"Like"}</button><button><Img src={CommentSvg}/>Comment</button><button><Img src={ShareSvg}/>Share</button></div></article>;}
function Empty({title,text}:{title:string;text:string}){return <div className="parity-empty"><Img src={ReDomMark} className="parity-empty-mark"/><h2>{title}</h2><p>{text}</p></div>;}

function Profile({user}:{user:User}){const[profile,setProfile]=useState<any>(user),[loading,setLoading]=useState(true);useEffect(()=>{api<any>("/profile").then(r=>setProfile(r.profile||r)).catch(()=>{}).finally(()=>setLoading(false))},[]);return <><Header route={byKey("Profile")!} title="Profile" subtitle="Your ReDom profile and profile controls."/><section className="parity-profile"><div className="parity-cover">{profile.coverPhoto?<img src={profile.coverPhoto} alt="Cover photo"/>:null}<button aria-label="Edit cover" onClick={()=>go("/app/coverPhotoAdjust")}><Img src={CoverEditSvg}/></button><button aria-label="View cover" onClick={()=>go("/app/coverPhotoViewer")}><Img src={CoverSearchSvg}/></button></div><div className="parity-profile-head"><div className="parity-profile-avatar"><Avatar user={profile} size={118}/><button aria-label="Edit profile picture" onClick={()=>go("/app/profilePictureAdjust")}><Img src={CameraSvg}/></button></div><div><h2>{profile.firstName} {profile.lastName}</h2><p>@{profile.username}</p><div className="parity-actions"><Button onClick={()=>go("/app/editProfile")}>Edit profile</Button><Button kind="secondary" onClick={()=>go("/app/profilePictureViewer")}>View profile picture</Button></div></div></div><div className="parity-profile-tabs"><button>Posts</button><button>About</button><button>Friends</button><button>Photos</button></div>{loading?<div className="parity-loading">Loading profile…</div>:<div className="parity-profile-grid"><div><h3>About</h3><p>{profile.bio||"No bio has been added."}</p><p>{profile.currentCity||profile.location||"Location not provided."}</p></div><div><h3>Profile controls</h3><button onClick={()=>go("/app/editBio")}><Img src={ProfileEditSvg}/> Edit bio</button><button onClick={()=>go("/app/editBirthday")}><Img src={ProfileEditSvg}/> Edit birthday</button><button onClick={()=>go("/app/editLocationSearch")}><Img src={ProfileEditSvg}/> Edit location</button></div></div>}</section></>;}

function Search(){const[q,setQ]=useState(""),[results,setResults]=useState<any[]>([]),[loading,setLoading]=useState(false),[searched,setSearched]=useState(false);const run=async()=>{if(!q.trim())return;setLoading(true);setSearched(true);try{const r=await api<any>("/search?q="+encodeURIComponent(q));setResults(r.results||[])}catch{setResults([])}finally{setLoading(false)}};return <><Header route={byKey("Search")!} title="Search" subtitle="Find people and ReDom content."/><form className="parity-search-form" onSubmit={e=>{e.preventDefault();void run()}}><Img src={SearchSvg}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search ReDom"/><Button>Search</Button></form>{loading?<div className="parity-loading">Searching…</div>:results.map(x=><button className="parity-result" key={x.userId||x.id} onClick={()=>go("/app/profile?userId="+encodeURIComponent(x.userId||x.id))}><Avatar user={x}/><span><b>{x.firstName} {x.lastName}</b><small>@{x.username}</small></span></button>)}{searched&&!loading&&!results.length?<Empty title="No results" text="Try another name or username."/>:null}</>;}

function Notifications(){const[items,setItems]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");useEffect(()=>{api<any>("/product/notifications").then(r=>setItems(r.notifications||[])).catch(e=>setError(e instanceof Error?e.message:"Unable to load notifications.")).finally(()=>setLoading(false))},[]);return <><Header route={byKey("Notifications")!} title="Notifications" subtitle="Activity, account and security notifications."/><div className="parity-toolbar"><Button kind="secondary" onClick={()=>void api("/product/notifications/read-all",{method:"POST"})}>Mark all as read</Button></div>{error?<div className="parity-error">{error}</div>:null}{loading?<div className="parity-loading">Loading notifications…</div>:items.map(n=><article className={"parity-notification "+(n.unread?"unread":"")} key={n.id}><Img src={n.notificationType?.includes("security")?SecuritySvg:BellSvg}/><div><b>{n.title||"ReDom notification"}</b><p>{n.body||""}</p><small>{n.createdAt?new Date(n.createdAt).toLocaleString():""}</small></div></article>)}{!loading&&!items.length?<Empty title="You're all caught up" text="New ReDom activity will appear here."/>:null}</>;}

function Messages(){const[items,setItems]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");useEffect(()=>{api<any>("/messages").then(r=>setItems(r.conversations||r.items||[])).catch(e=>setError(e instanceof Error?e.message:"Unable to load messages.")).finally(()=>setLoading(false))},[]);return <><Header route={byKey("Messages")!} title="Messages" subtitle="Your ReDom conversations."/><div className="parity-toolbar"><Button onClick={()=>go("/app/reDomAI")}>ReDom AI</Button></div>{error?<div className="parity-error">{error}</div>:null}{loading?<div className="parity-loading">Loading conversations…</div>:items.map(x=><button className="parity-conversation" key={x.id||x.conversationId} onClick={()=>go("/app/chat?conversationId="+encodeURIComponent(x.id||x.conversationId))}><Avatar user={x.participant||x}/><span><b>{x.name||x.displayName||"Conversation"}</b><small>{x.lastMessage?.content||x.lastMessage||"Open conversation"}</small></span><time>{x.updatedAt?new Date(x.updatedAt).toLocaleString():""}</time></button>)}{!loading&&!items.length?<Empty title="No conversations yet" text="Your ReDom messages will appear here."/>:null}</>;}

function GenericDataScreen({route,user}:{route:WebRoute;user:User}){const[key,setKey]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[items,setItems]=useState<any[]>([]),[value,setValue]=useState("");const config=screenConfig(route.key);const refresh=async()=>{setLoading(true);setError("");const endpoint=config.endpoint;try{if(endpoint){const r=await api<any>(endpoint);const arr=r.items||r.data||r.results||r.notifications||r.cases||r.paymentMethods||r.transactions||r.groups||r.products||[];setItems(Array.isArray(arr)?arr:[r]);}else setItems([])}catch(e){setError(e instanceof Error?e.message:"Unable to load this ReDom screen.")}finally{setLoading(false);setKey(v=>v+1)}};useEffect(()=>{void refresh()},[route.key]);const action=async()=>{if(!config.action)return;setLoading(true);setError("");try{await api(config.action.path,{method:config.action.method||"POST",body:config.action.body?JSON.stringify(config.action.body):undefined});await refresh()}catch(e){setError(e instanceof Error?e.message:"The action could not be completed.")}finally{setLoading(false)}};return <><Header route={route} title={config.title} subtitle={config.subtitle}/><div className="parity-screen-grid"><section className="parity-card"><div className="parity-card-icon"><Img src={config.icon}/></div><h2>{config.title}</h2><p>{config.subtitle}</p>{config.fields?.map(f=><Field key={f} label={f} value={value} onChange={setValue} placeholder={f}/>) }{config.notice?<div className="parity-notice">{config.notice}</div>:null}{config.action?<Button onClick={()=>void action()} disabled={loading}>{loading?"Processing…":config.action.label}</Button>:null}</section><section className="parity-card"><div className="parity-section-title"><h2>{config.dataTitle}</h2><Button kind="secondary" onClick={()=>void refresh()} disabled={loading}>Refresh</Button></div>{error?<div className="parity-error">{error}</div>:null}{loading?<div className="parity-loading">Loading…</div>:items.length?items.map((x,i)=><div className="parity-list-item" key={x.id||x.caseNumber||x.userId||i}><Avatar user={x.author||x.user||x}/><div><b>{x.name||x.title||x.subject||x.displayName||x.firstName&&((x.firstName+" "+(x.lastName||"")).trim())||config.itemLabel}</b><p>{x.description||x.body||x.status||x.message||x.content||"Open to view details."}</p></div><span>{x.amount!=null?String(x.amount)+" "+(x.currency||""):x.updatedAt?new Date(x.updatedAt).toLocaleDateString():""}</span></div>):<Empty title={config.emptyTitle} text={config.emptyText}/>}</section></div><div className="parity-screen-actions"><Button kind="secondary" onClick={()=>go("/app/homeFeed")}>Back to Home Feed</Button></div></>;}

type Config={title:string;subtitle:string;dataTitle:string;itemLabel:string;emptyTitle:string;emptyText:string;icon:string;endpoint?:string;fields?:string[];notice?:string;action?:{label:string;path:string;method?:string;body?:any}};
function screenConfig(key:string):Config{
 const common=(title:string,subtitle:string,icon:string,extra:Partial<Config>={}):Config=>({title,subtitle,icon,dataTitle:"Available information",itemLabel:title,emptyTitle:"Nothing to show yet",emptyText:"ReDom has no data available for this screen yet. No placeholder data is being fabricated.",...extra});
 switch(key){
 case"Foundation":return common("ReDom Foundation","The ReDom foundation and account platform information.",ReDomLogo);
 case"EditProfile":return common("Edit profile","Update your profile details through the authenticated profile service.",ProfileEditSvg,{fields:["First name","Last name","Username","Bio"],endpoint:"/profile"});
 case"EditBio":return common("About you","Edit your biography and audience settings.",ProfileEditSvg,{fields:["Bio"],endpoint:"/profile"});
 case"EditLocationSearch":return common("Search location","Search ReDom-supported profile locations.",SearchSvg,{fields:["Location search"],endpoint:"/profile/edit/locations"});
 case"EditLocationConfirm":return common("Confirm location","Confirm the selected profile location and its audience.",ProfileEditSvg,{fields:["Selected location"],endpoint:"/profile"});
 case"EditBirthday":return common("Edit birthday","Update your birthday and its audience setting.",ProfileEditSvg,{fields:["Birthday"],endpoint:"/profile"});
 case"ProfilePictureAdjust":return common("Adjust profile picture","Crop and position the selected profile picture before preview.",CameraSvg,{notice:"Select an image in the browser, then use the preview/adjust controls before saving."});
 case"ProfilePicturePreview":return common("Profile picture preview","Review the selected image before uploading it.",ProfileEditSvg,{notice:"The Web implementation keeps the selected browser image local until the upload action is confirmed."});
 case"ProfilePictureViewer":return common("Profile picture","View the current profile picture and its supported social actions.",ProfileSvg,{endpoint:"/profile/media/current"});
 case"CoverPhotoAdjust":return common("Adjust cover photo","Crop and position the selected cover photo.",CoverCameraSvg);
 case"CoverPhotoPreview":return common("Cover photo preview","Review the cover photo before uploading.",CoverEditSvg);
 case"CoverPhotoViewer":return common("Cover photo","View the current cover photo.",CoverSearchSvg,{endpoint:"/profile/media/current"});
 case"Saved":return common("Saved","Saved ReDom content and marketplace items.",SavedSvg,{endpoint:"/saved"});
 case"Marketplace":return common("Marketplace","Browse available ReDom marketplace products.",MarketSvg,{endpoint:"/marketplace"});
 case"SavedProducts":return common("Saved products","Products you saved in Marketplace.",SavedSvg,{endpoint:"/marketplace/saved"});
 case"Cart":return common("Cart","Review products currently in your ReDom cart.",CartSvg,{endpoint:"/marketplace/cart"});
 case"Groups":return common("Groups","Discover and manage your ReDom groups.",MenuSvg,{endpoint:"/groups"});
 case"Friends":return common("Friends","Friends, requests and people connected to you.",ProfileSvg,{endpoint:"/friends"});
 case"Events":return common("Events","Create, discover and manage ReDom events.",HomeSvg,{endpoint:"/events"});
 case"ReDomAI":return common("ReDom AI","Use the authenticated ReDom AI experience.",ReDomMark,{notice:"AI requests remain within the ReDom application and authenticated backend boundary.",fields:["Message"]});
 case"ReDomAIInfo":return common("ReDom AI information","Learn how ReDom AI works within the product.",ReDomMark);
 case"ReDomAIPolicy":return common("ReDom AI policy","Review the current ReDom AI policy content.",TermsSvg,{endpoint:"/policies/reDom-ai"});
 case"Chat":return common("Chat","Open a specific ReDom conversation and send messages.",MessengerSvg,{fields:["Message"]});
 case"ChatContactInfo":return common("Chat contact info","View the participant information and available contact actions.",ProfileSvg);
 case"ChatEncryptionVerification":return common("Chat encryption verification","Review the actual end-to-end encryption verification state.",SecuritySvg,{notice:"Verification state is read from the ReDom messaging service; this page never fabricates a verified result."});
 case"ChatMediaGallery":return common("Chat media gallery","View media available in the selected conversation.",MarketSvg);
 case"AddToGroups":return common("Add to groups","Choose a group for the selected conversation or member action.",MenuSvg,{endpoint:"/messages/groups"});
 case"Call":return common("Call","ReDom calling interface.",MessengerSvg,{notice:"The browser screen only reports a connected call when the calling service establishes one."});
 case"CallLinkJoin":return common("Join call","Validate a ReDom call link before joining.",MessengerSvg,{fields:["Call link"]});
 case"CreateGroup":return common("Create group","Create a ReDom group with validation and member selection.",MenuSvg,{fields:["Group name","Description"]});
 case"CreatePublicGroup":return common("Create public group","Create a public ReDom group with public-group controls.",MenuSvg,{fields:["Group name","Description"],notice:"Public-group approval and visibility settings are preserved separately from regular group creation."});
 case"GroupInfo":return common("Group information","View the selected group's information and actions.",MenuSvg,{endpoint:"/messages/groups"});
 case"GroupPermissions":return common("Group permissions","Manage invite and member permissions for the selected group.",SecuritySvg);
 case"GroupInvite":return common("Group invite","Create, copy or share a group invitation when permitted.",MessengerSvg);
 case"GroupMemberChanges":return common("Group member changes","Review member-change activity for the selected group.",ProfileSvg);
 case"GroupAddMembers":return common("Add group members","Search and select members for the selected group.",ProfileSvg);
 case"GroupSettings":return common("Group settings","Manage notifications, disappearing messages and other group settings.",PaymentSecuritySvg);
 case"GroupIcon":return common("Group icon","Choose and upload a group icon.",CameraSvg);
 case"GroupPrivacyInfo":return common("Group privacy","Understand the privacy protections applied to group conversations.",SecuritySvg);
 case"GroupAdmins":return common("Group admins","Manage administrators and the group creator's controls.",ProfileSvg);
 case"ScheduleGroupCall":return common("Schedule group call","Schedule a group call with a date, time and description.",HomeSvg,{fields:["When","Description"]});
 case"GroupReport":return common("Report group","Submit a report about a group using the ReDom reporting flow.",SupportSvg,{fields:["Reason","Details"]});
 case"Settings":return common("Settings","Your ReDom account and application settings hub.",PaymentSecuritySvg);
 case"Language":return common("Language","Choose the language used by ReDom.",TermsSvg,{notice:"Language changes are applied to the Web application and persisted through the current ReDom language provider."});
 case"DarkMode":return common("Dark mode","Choose how ReDom Web displays its appearance.",HomeSvg,{notice:"The Web theme control updates the browser application theme; it is not a decorative switch."});
 case"NotificationSettings":return common("Notification settings","Control ReDom notification preferences.",BellSvg);
 case"PrivacySettings":return common("Privacy settings","Manage profile, audience and privacy controls.",SecuritySvg);
 case"SecuritySettings":return common("Security settings","Review account security controls and protected actions.",SecuritySvg);
 case"LinkedDevices":return common("Linked devices","View authenticated devices linked to your ReDom account.",SecuritySvg,{endpoint:"/linked-devices"});
 case"LinkDevice":return common("Link device","Create and verify a new device-linking flow.",SecuritySvg,{fields:["Linking code"]});
 case"LinkHistory":return common("Link history","Review device-link history and available clearing controls.",TermsSvg);
 case"OrdersPayments":return common("Orders & Payments","Open ReDom Pay, orders, subscriptions and payment support.",CartSvg);
 case"ReDomPayTransactions":return common("ReDom Pay transactions","Transactions grouped by All, Money transfer, Orders, Donations and Cards.",ReDomMark,{endpoint:"/payments/transactions"});
 case"ReDomPayManage":return common("ReDom Pay manage","Manage saved payment methods, balances, Stars and recent transactions.",PaymentSecuritySvg,{endpoint:"/payments/payment-methods"});
 case"PaymentTransactionDetails":return common("Payment transaction details","View provider-authoritative transaction details.",ReDomMark);
 case"RefundCase":return common("Refund case","Track a real refund case, verification state and support messages.",SupportSvg);
 case"PaymentMethods":return common("Payment methods","Manage saved payment methods and safe provider metadata.",PaymentSecuritySvg,{endpoint:"/payments/payment-methods"});
 case"AddPaymentMethod":return common("Add payment method","Choose a supported payment method.",PaymentSecuritySvg,{notice:"Credit/Debit Card is supported through Stripe. PayPal is Coming Soon. Bank Payment Method is Under Development."});
 case"AddCard":return common("Add card","Securely add a card through Stripe's Web payment flow.",VisaSvg,{fields:["Cardholder name","Country","Address","Address line 2","City","State / Province","ZIP"],notice:"Card number and CVV are collected only through the secure Stripe payment interface. They are not sent to or stored by ReDom."});
 case"ReviewPaymentInfo":return common("Review payment information","Review safe payment metadata before saving a payment method.",VisaSvg);
 case"StarsActivity":return common("Stars activity","Review actual ReDom Stars activity and purchases.",StarsSvg,{endpoint:"/payments/stars/activity"});
 case"BuyStars":return common("Buy ReDom Stars","Choose an existing Stars package from the current backend catalog.",StarsSvg,{endpoint:"/payments/stars/packages"});
 case"StarsCheckout":return common("Stars checkout","Complete the selected Stars purchase using the selected transaction currency.",StarsSvg,{fields:["Package","Currency","Payment method"],notice:"The receipt currency must match the currency actually charged by the payment provider."});
 case"Subscriptions":return common("Subscriptions","Review available and active ReDom subscriptions.",SubscriptionSvg,{endpoint:"/payments/subscriptions"});
 case"SubscriptionDetails":return common("Subscription details","Review the selected subscription's actual state.",SubscriptionSvg);
 case"PaymentSecurity":return common("Payment security","Manage payment-security controls.",PaymentSecuritySvg);
 case"PaymentPin":return common("Payment PIN","Set or change the payment PIN without exposing its value.",SecuritySvg,{fields:["New PIN","Confirm PIN"]});
 case"PaymentAddresses":return common("Payment addresses","Manage saved payment addresses.",CartSvg,{fields:["Address","City","State / Province","Postal code","Country"]});
 case"PaymentCurrency":return common("Payment currency","Review and change the account payment currency subject to product rules.",StarsSvg);
 case"BlockedUsers":return common("Blocked users","Review users blocked by this account and unblock when allowed.",SecuritySvg,{endpoint:"/privacy/blocked-users"});
 case"Verification":return common("Verification","Review the actual ReDom verification state and available actions.",SecuritySvg);
 case"Support":return common("Support","Open ReDom support, cases and reporting.",SupportSvg);
 case"MetaPaySupport":return common("ReDom Pay support","Browse payment support topics and route to the relevant article or support flow.",SupportSvg);
 case"MetaPayArticle":return common("ReDom Pay article","Read the selected payment-support article and send feedback.",TermsSvg);
 case"PayoutSupport":return common("Payout support","Submit a payout-related support request.",SupportSvg,{fields:["Issue","Message"]});
 case"SupportInbox":return common("Support inbox","Review your actual ReDom support cases.",SupportSvg,{endpoint:"/support/cases"});
 case"SupportMessage":return common("Support message","Read and continue a specific ReDom support case.",SupportSvg);
 case"SubscriptionRenewal":return common("Subscription renewal","Renew a current subscription using an actual payment result.",SubscriptionSvg,{notice:"The Web client does not mark a renewal successful until the backend/payment provider confirms it."});
 case"SelectCurrency":return common("Select currency","Choose the transaction currency from ReDom's supported currency data.",StarsSvg,{fields:["Currency"]});
 case"ReportProblem":return common("Report a problem","Submit a technical problem with diagnostics or supported attachments.",SupportSvg,{fields:["Problem description"],notice:"The Web browser only submits information explicitly selected by the user."});
 case"TermsPolicies":return common("Terms & Policies","Open the current ReDom Terms, Privacy, Security, AI and product policy documents.",TermsSvg);
 case"Policy":return common("Policy","Open the requested official ReDom policy document.",TermsSvg,{endpoint:"/policies"});
 default:return common(routeTitle(key),routeTitle(key)+" is available through the ReDom Web navigation.",ReDomMark);
 }}
function routeTitle(k:string){return k.replace(/([a-z])([A-Z])/g,"$1 $2");}

export function WebParityRouter({user,onLogout}:{user:User;onLogout:()=>void}){const[,setTick]=useState(0);useEffect(()=>{const f=()=>setTick(v=>v+1);window.addEventListener("popstate",f);return()=>window.removeEventListener("popstate",f)},[]);const key=keyFromPath();const route=byKey(key)||WEB_SCREEN_REGISTRY[0];let content:any;if(key==="HomeFeed")content=<HomeFeed user={user}/>;else if(key==="Profile")content=<Profile user={user}/>;else if(key==="Search")content=<Search/>;else if(key==="Notifications")content=<Notifications/>;else if(key==="Messages")content=<Messages/>;else content=<GenericDataScreen route={route} user={user}/>;return <Shell user={user} onLogout={onLogout}>{content}</Shell>;}

export function webParityRouteAudit(){const mobile=WEB_SCREEN_REGISTRY;const paths=new Set(mobile.map(x=>x.path));return {mobileCount:mobile.length,webCount:paths.size,duplicateMobileKeys:mobile.length-new Set(mobile.map(x=>x.key)).size,duplicatePaths:mobile.length-paths.size,missing:mobile.filter(x=>!paths.has(x.path)).map(x=>x.key)};}
