/**
 * ReDom Messaging Knowledge Contract
 *
 * AI-facing product knowledge for the messaging surface. It follows WhatsApp
 * public Help Center behavior as a product reference while keeping ReDom's
 * own authorization, privacy, E2EE and regional rules authoritative.
 */
export const REDOM_MESSAGING_KNOWLEDGE_VERSION = "2.1.0";
export const REDOM_MESSAGING_KNOWLEDGE = {
  product: "ReDom Messenger",
  reference: "WhatsApp Help Center behavior is a reference for discoverability and user expectations; ReDom is not a WhatsApp client and does not use WhatsApp as its message transport.",
  privacy: {
    privateMessages: "Message content is intended to remain end-to-end encrypted on supported devices.",
    serverSearchBoundary: "The backend may search users and conversation metadata but must not decrypt or index private message plaintext.",
    aiSharing: "ReDom AI is optional. Normal private chats are not automatically exposed to ReDom AI. Chat text may be sent to AI only when the user explicitly submits it to the AI experience.",
  },
  navigation: {
    messages: [
      { action: "back", result: "return to the previous authenticated screen" },
      { action: "new-message", result: "open New Message and search eligible people" },
      { action: "re-dom-ai", result: "open the separate general-purpose ReDom AI conversation" },
      { action: "search-messages", result: "search locally available/decrypted conversation content and conversation metadata without server-side plaintext indexing" },
      { action: "open-conversation", result: "open the authorized chat" },
      { action: "group-info", result: "open Group Info for an authorized group" },
      { action: "voice-call", result: "start an authorized voice call" },
      { action: "video-call", result: "start an authorized video call" },
      { action: "create-group", result: "open Create Group" },
    ],
    newMessage: [
      { action: "back", result: "return to Messages" },
      { action: "search", result: "query the authenticated public-profile search API" },
      { action: "select-person", result: "open that person's permitted profile or continue to Message" },
      { action: "message", result: "create or retrieve the direct conversation through the backend, then open Chat" },
      { action: "group", result: "open Create Group" },
    ],
    chat: [
      { action: "back", result: "return to Messages" },
      { action: "conversation-info", result: "open the conversation or Group Info screen" },
      { action: "search", result: "search permitted local conversation content/metadata" },
      { action: "re-dom-ai", result: "open ReDom AI without automatically exposing the current private conversation" },
      { action: "voice-call", result: "start a backend-authorized voice call" },
      { action: "video-call", result: "start a backend-authorized video call" },
      { action: "text-send", result: "encrypt and send a message" },
      { action: "reply", result: "compose a reply bound to a message in the same conversation" },
      { action: "reaction", result: "add, change or remove the authenticated user's reaction" },
      { action: "attachment", result: "open supported media/document/share actions" },
      { action: "voice-record", result: "record and send a voice message when OS permission is granted" },
      { action: "view-once", result: "send eligible photo, video or voice as View Once" },
      { action: "disappearing", result: "open supported conversation timer controls" },
      { action: "edit", result: "edit an eligible message inside the backend-enforced window" },
      { action: "delete", result: "delete for me or delete for everyone when authorized" },
      { action: "block", result: "block the other account through the backend" },
      { action: "report", result: "submit an authorized report for selected content/account" },
    ],
    groupInfo: [
      { action: "members", result: "view authorized members" },
      { action: "add-members", result: "add eligible members when permitted" },
      { action: "remove-member", result: "remove a member when owner/admin permission permits" },
      { action: "role", result: "change member role when owner/admin permission permits" },
      { action: "join-approval", result: "request, approve or reject group entry according to role" },
      { action: "leave", result: "leave the group, with owner transfer protection" },
      { action: "group-settings", result: "change settings only when authorized" },
    ],
  },
  messageCapabilities: [
    "text", "reply", "reaction", "photo", "video", "voice", "audio", "document", "GIF", "sticker", "shared content", "View Once", "disappearing messages",
  ],
  privacyAndSafetyFeatures: [
    "block", "report", "read receipts", "typing indicators", "notification controls", "chat mute", "notification previews", "disappearing messages", "View Once", "group join approval", "linked-device security",
  ],
  limits: {
    editWindow: "15 minutes",
    deleteForEveryoneWindow: "48 hours",
    viewOnceUnopenedExpiry: "14 days",
    disappearingOptions: ["off", "24 hours", "7 days", "90 days"],
    groupActiveMembers: 1024,
  },
  receipts: ["sent", "delivered", "read", "typing", "missed-call", "call-ended"],
  aiRules: [
    "ReDom AI is a general-purpose AI experience, separate from ReDom Support AI.",
    "ReDom AI can answer general questions, explain concepts, brainstorm, write, translate, reason and use web search for current information.",
    "AI explains navigation and policy; it never fabricates UI state.",
    "AI cannot read private message plaintext merely because a user asks.",
    "Only content the user explicitly supplies to the AI request may be used as chat context.",
    "AI cannot bypass encryption, blocks, group permissions, regional policy or authentication.",
    "AI cannot approve reports, refunds, verification, membership, ownership changes or security changes.",
    "When a capability is unavailable, AI must say it is unavailable rather than inventing a success state.",
  ],
} as const;

export function getReDomMessagingKnowledge() {
  return REDOM_MESSAGING_KNOWLEDGE;
}
