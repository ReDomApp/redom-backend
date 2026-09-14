import { Router } from "express";

const router = Router();
const document = {
  title: "ReDom Messaging Policy",
  summary: "ReDom messaging behavior for encrypted conversations, forwarding, media, attachments, calls, call links, groups, profiles and AI.",
  version: "2.4.0",
  effectiveAt: "2026-09-14T00:00:00.000Z",
  sections: [
    { heading: "Encryption", body: "Private message text and message media are encrypted on the user's device. Each active recipient device receives its own envelope. The server routes ciphertext and authorized metadata and does not need private-chat plaintext to deliver it." },
    { heading: "Message actions", body: "Eligible messages expose dedicated icon-backed actions for Copy, Share, Reply, React, Edit/Delete, Forward, View Profile and Report. View Once and deleted content are excluded from actions that would expose unavailable content." },
    { heading: "Forwarding", body: "Users can forward an eligible message to up to five existing individual or group conversations. A forwarded message can be sent to up to five destinations with no more than one group destination. A chain at five or more hops is limited to one destination and is marked Forwarded many times. Every destination receives a new encryption envelope. The source conversation is never granted to the destination." },
    { heading: "Encrypted media forwarding", body: "Photos, videos, voice messages, audio, documents, GIFs and stickers can be forwarded by decrypting the already-authorized source media locally and re-encrypting it for the selected destination devices. View Once, deleted and unavailable media cannot be forwarded. The backend never receives the source media plaintext during forwarding." },
    { heading: "Forwarded indicators", body: "Forwarded messages are visibly marked in the conversation. Messages at or beyond the documented forwarding-chain threshold use a Forwarded many times state. The indicator is metadata and does not reveal the source conversation." },
    { heading: "Attachments", body: "The chat attachment surface supports Gallery, Camera, Location, Contact, Document, Audio, Poll and Event. Each action has a dedicated SVG icon. Media uses the encrypted media pipeline; shared structured content is encrypted before transmission." },
    { heading: "Location", body: "A user may explicitly share their current location or a selected map location. Location data is shared only after the user invokes the Location action. The recipient sees the shared location content inside the conversation; ReDom does not silently expose device location." },
    { heading: "Contacts", body: "A user may explicitly share a ReDom contact/profile from the attachment surface. Profile identity uses ReDom display names rather than phone-number-centric presentation." },
    { heading: "Polls and events", body: "Polls and events are explicit shared conversation objects. Their structured payload is encrypted for authorized conversation devices. Voting/event details are not stored as server-readable private message plaintext." },
    { heading: "Calls", body: "Voice and video calls require authorized conversation membership and operating-system permissions. Calls remain encrypted and backend-authorized, with ringing, connecting, active, ended, declined, missed, cancelled and failed states." },
    { heading: "Call links", body: "An authorized participant may create a shareable voice/video call link. A link can require approval before a non-member joins. Links expire, can be revoked by the creator, and never expose call signaling credentials. The app can share the link through the native share sheet." },
    { heading: "Call approval", body: "When approval is required, a join request is created for the active call and the call owner/authorized participant approves or rejects the request. Approval is enforced server-side; a client cannot self-approve." },
    { heading: "Groups", body: "Groups support backend-enforced membership, ownership, admin roles, join approval and group calls. Group membership and permissions are authoritative on the server." },
    { heading: "Profiles", body: "Direct chats and message profile actions use the person's ReDom display name and profile. Phone numbers are not the primary identity presentation in the messaging UI." },
    { heading: "AI boundary", body: "ReDom AI is a separate user-invoked workflow. It can use general knowledge and web search and can process explicitly supplied text, images, voice prompts and files. It does not silently read private chats or bypass E2EE." },
    { heading: "Rate limits", body: "Normal chat, messaging, reactions, calls, linked-device and in-chat AI traffic does not use the general rate-limit bucket. Authentication, membership, device authorization, input validation and abuse controls remain authoritative." },
    { heading: "Safety", body: "Deleted, View Once, blocked, revoked-device and unauthorized content remains inaccessible through server-side authorization. Security-sensitive actions are audit logged where supported." },
  ],
};

router.get("/policies/messaging", (_req, res) => res.json({ success: true, slug: "messaging", document }));
export default router;
