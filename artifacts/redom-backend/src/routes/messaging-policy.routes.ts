import { Router } from "express";

const router = Router();
const document = {
  title: "ReDom Messaging Policy",
  summary: "The complete ReDom Messenger navigation, actions, permissions, privacy and safety contract.",
  navigation: [
    { screen: "Messages", actions: ["Back", "New Group", "New Message", "Search Chats", "Open Conversation", "Group Info", "Voice Call", "Video Call", "Refresh"] },
    { screen: "New Message", actions: ["Back", "Search People", "Find People", "Open Profile", "Message", "New Group"] },
    { screen: "Chat", actions: ["Back", "Conversation Info", "Search", "Voice Call", "Video Call", "Send Text", "Reply", "Reaction", "Photo", "Video", "Document", "GIF", "Sticker", "Voice Message", "View Once", "Disappearing Messages", "Edit", "Delete for Me", "Delete for Everyone", "Block", "Report"] },
    { screen: "Group Info", actions: ["Back", "Members", "Add Members", "Remove Member", "Change Role", "Join Approval", "Group Settings", "Leave Group"] },
  ],
  flows: [
    { name: "New Message", steps: ["Authenticated user opens Messages", "Tap New Message", "Backend search queries eligible public profiles", "Select a person", "Tap Message", "Backend authenticates and authorizes the direct-conversation request", "Existing conversation is reused or a new one is created", "Chat opens only after backend confirmation"] },
    { name: "Search People", steps: ["Enter at least one search character", "Request is authenticated and rate limited", "Only viewer-eligible public profiles are returned", "Client displays results", "Opening a profile uses normal profile authorization"] },
    { name: "New Group", steps: ["Open Create Group", "Choose eligible members", "Set group information", "Backend enforces membership, role and 1,024 active-member limits", "Group is persisted", "Chat/Group Info opens only after success"] },
    { name: "Message Send", steps: ["Compose locally", "Client encrypts supported private text", "Backend validates membership and encrypted envelope", "Backend persists ciphertext and delivery state", "Recipient receives authorized notification", "Client displays confirmed send state"] },
    { name: "Call", steps: ["Tap voice/video", "Backend validates conversation membership and call eligibility", "OS microphone/camera permission is requested", "Call state and signaling are backend controlled", "Client displays ringing/connecting/active/ended/declined/missed/cancelled/failed states"] },
  ],
  sections: [
    { heading: "Conversation access", body: "Messaging requires authentication and an active authorized relationship with the conversation. Client navigation, deep links, altered identifiers and AI requests cannot grant access." },
    { heading: "End-to-end encryption", body: "Private text is encrypted on supported devices before transmission. The backend stores ciphertext/envelopes and must not decrypt private message plaintext for ordinary search, analytics or AI. The current cryptographic implementation must continue to be hardened toward a production-grade multi-device protocol." },
    { heading: "Message search", body: "ReDom may search public people and conversation metadata on the backend. Private message-content search must operate locally over decrypted messages or a future device-local index; the server must not add a plaintext message search index to imitate another product." },
    { heading: "Message types", body: "The messaging surface supports text, replies, reactions, photos, video, voice messages, audio, documents, GIFs, stickers and supported shared content. Availability can be limited by device capability, authorization and regional policy." },
    { heading: "Edit", body: "A sender may edit an eligible message only inside the 15-minute backend-enforced window. The client cannot extend the window or edit another user's message." },
    { heading: "Delete", body: "Delete for me affects the authenticated user's copy. Delete for everyone is available only inside the supported 48-hour window and produces a deletion placeholder rather than returning readable deleted content. Group-admin deletion is permission controlled." },
    { heading: "Disappearing messages", body: "New-message timers support Off, 24 hours, 7 days and 90 days. Timers do not retroactively rewrite existing messages. Group permission rules apply to timer changes." },
    { heading: "View Once", body: "Eligible photo, video and voice messages can be sent as View Once. Opening is recorded and the content is not returned as normal attachment content afterward. View Once is not forward/copy/save/star eligible inside ReDom and expires unopened after 14 days. ReDom cannot guarantee prevention of external recording or screenshots at the physical-device level." },
    { heading: "Replies and reactions", body: "A reply target must belong to the same authorized conversation. Reactions are scoped to the authenticated user and may be changed or removed. Deleted or inaccessible content cannot be recovered through reply or reaction APIs." },
    { heading: "Groups", body: "Groups have owner/admin/member roles. Adding members, removing members, role changes, group settings, join approval and leaving are backend-authorized. Maximum active membership is 1,024. The owner must transfer ownership before leaving." },
    { heading: "Calls", body: "Voice and video calls require authorized conversation membership and OS permissions. Backend call state controls the lifecycle. Provider credentials and private signaling details are never exposed to users or AI." },
    { heading: "Notifications and receipts", body: "Message delivery, read state, typing state and call state originate from backend events. Notification previews obey user preferences. A client cannot fabricate a read, delivery or notification state." },
    { heading: "Block and report", body: "Blocking prevents supported direct messaging and calls with the blocked profile. Reports submit only the selected content/account and enter the applicable moderation workflow. AI can explain the process but cannot make the final moderation decision." },
    { heading: "Media privacy", body: "Message media requires authorized conversation access. Encrypted media uses device-controlled decryption keys and protected ReDom Media Storage access. A media URL does not grant conversation membership." },
    { heading: "Linked devices", body: "A linked device must establish its own authorized cryptographic identity. History, keys and sessions are limited to what that device is authorized to receive. Key changes and session revocation are security-sensitive operations." },
    { heading: "AI boundaries", body: "ReDom AI can explain navigation and official policy, but cannot read private messages on demand, bypass encryption or blocks, grant group membership, change ownership, approve reports/refunds/verification, or invent delivery, read, call or moderation state." },
    { heading: "Regional policy", body: "Messaging, calls, notifications, media and related capabilities may vary by country. Backend regional policy is authoritative and cannot be overridden by the client, AI or vendor response." },
    { heading: "Audit and analytics", body: "Security-sensitive actions may create audit/activity events. Product analytics may measure navigation and reliability events without exposing private message plaintext to ordinary analytics." },
  ],
};

router.get("/policies/messaging", (_req, res) => {
  res.json({ success: true, slug: "messaging", version: "2.0.0", effectiveAt: new Date().toISOString(), document });
});

export default router;
