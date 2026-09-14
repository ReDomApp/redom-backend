import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { db } from "../database/db";
import { activityLog } from "../database/activityLog";
import { notifications } from "../database/notifications";
import { userSettings } from "../database/userSettings";

const router = Router();

const POLICY_DOCUMENTS: Record<string, { title: string; summary: string; sections: Array<{ heading: string; body: string }> }> = {
  terms: {
    title: "ReDom Terms of Use",
    summary: "The rules governing access to and use of ReDom services.",
    sections: [
      { heading: "Using ReDom", body: "Use ReDom lawfully, respect other people, protect your account, and follow feature-specific rules." },
      { heading: "Your account", body: "You are responsible for keeping your credentials and verification methods secure. ReDom may require additional verification when security signals require it." },
      { heading: "Content and conduct", body: "Do not use ReDom to facilitate abuse, fraud, scams, malware, unlawful activity, or other prohibited conduct. Feature-specific standards may apply." },
      { heading: "Changes", body: "ReDom may update these terms. The application should show the effective version and relevant notices before material changes take effect where required." },
    ],
  },
  privacy: {
    title: "ReDom Privacy Policy",
    summary: "How ReDom collects, uses, protects and shares information.",
    sections: [
      { heading: "Information we use", body: "ReDom uses information needed to provide accounts, authentication, social features, security, support, personalization and disclosed product services." },
      { heading: "Visibility and control", body: "Privacy controls determine who can see supported profile and content information. Server-side authorization remains the source of truth." },
      { heading: "Security", body: "Security events, verification and device/session information may be processed to protect accounts and the platform." },
      { heading: "Your choices", body: "ReDom provides settings and supported account controls for privacy, security, notifications, language and account management." },
    ],
  },
  community: {
    title: "ReDom Community Standards",
    summary: "Safety and conduct standards for the ReDom community.",
    sections: [
      { heading: "Safety", body: "Threats, targeted abuse, exploitation, dangerous scams and other harmful conduct may be restricted or removed." },
      { heading: "Authenticity", body: "Do not impersonate people or use ReDom to deceive others about identity, affiliation or transactions." },
      { heading: "Spam and abuse", body: "Automated abuse, unsolicited bulk activity and attempts to manipulate platform systems may be restricted." },
      { heading: "Reports and appeals", body: "Supported reports and appeals are handled through ReDom's moderation and support processes." },
    ],
  },
  messaging: {
    title: "ReDom Messaging Policy",
    summary: "Privacy, safety and controls for ReDom conversations and messages.",
    sections: [
      { heading: "Private conversations", body: "Conversation access is controlled by authentication, participant membership, privacy rules and server-side authorization." },
      { heading: "Message controls", body: "Supported conversations may provide replies, reactions, media, read state, deletion, mute, archive, blocking and reporting controls." },
      { heading: "Safety systems", body: "ReDom may apply security and abuse protections to messages and conversations. These systems do not give AI permission to bypass privacy controls." },
      { heading: "Notifications", body: "Message notifications can be controlled globally and, where supported, per conversation." },
    ],
  },
  notifications: {
    title: "ReDom Notification Policy",
    summary: "How ReDom notification events and controls work.",
    sections: [
      { heading: "Notification types", body: "ReDom may notify you about messages, reactions, comments, follows, friend activity, security events, verification, support and other enabled product events." },
      { heading: "Controls", body: "Notification preferences determine which supported events can be delivered. Device-level notification permissions also apply." },
      { heading: "Deep links", body: "A notification may open the specific ReDom destination associated with the event after authorization is checked again." },
      { heading: "Privacy", body: "Notification previews must not expose information the recipient is no longer authorized to view." },
    ],
  },
  security: {
    title: "ReDom Security Policy",
    summary: "Account, device, authentication and platform security controls.",
    sections: [
      { heading: "Authentication", body: "ReDom uses authentication, verification challenges, device security and supported two-factor controls to protect accounts." },
      { heading: "Sessions and devices", body: "Authenticated users can review supported active sessions and revoke sessions they own." },
      { heading: "Risk controls", body: "Security checks may require additional verification or restrict an action when risk signals indicate it is necessary." },
      { heading: "Secrets", body: "Passwords, verification codes, access tokens and provider credentials are security-sensitive and are not exposed through user-facing AI or policy surfaces." },
    ],
  },
  verification: {
    title: "ReDom Verification Policy",
    summary: "Eligibility, security and review principles for account verification.",
    sections: [
      { heading: "Eligibility", body: "Verification is subject to ReDom's current product requirements and applicable regional policy." },
      { heading: "Identity", body: "Where identity verification is required, ReDom may request supported verification information through an approved verification flow." },
      { heading: "Review", body: "AI can explain requirements but does not independently grant or deny verification." },
      { heading: "Privacy", body: "Verification information is security-sensitive and is handled according to the applicable privacy and retention rules." },
    ],
  },
  ai: {
    title: "ReDom AI Policy",
    summary: "How ReDom AI can assist without bypassing platform controls.",
    sections: [
      { heading: "What ReDom AI can do", body: "ReDom AI can explain product behavior, assist with supported content and language tasks, and guide users through available workflows." },
      { heading: "What it cannot do", body: "AI cannot bypass authentication or privacy, expose secrets, grant verification, change ownership, approve refunds, or override regional restrictions." },
      { heading: "Refusals", body: "When a request conflicts with privacy, safety, authorization or product policy, ReDom AI should explain the limitation and provide a safe supported path where possible." },
      { heading: "Language", body: "AI responses should follow the language used by the user when the requested operation supports localization." },
    ],
  },
  regional: {
    title: "ReDom Regional Policy",
    summary: "Country and region-specific availability and policy controls.",
    sections: [
      { heading: "Availability", body: "Features can differ by country or region based on product availability, provider support and applicable requirements." },
      { heading: "Server enforcement", body: "Regional restrictions are enforced by the ReDom backend; changing a client setting does not override server policy." },
      { heading: "Policy versions", body: "Regional policies are versioned and may have effective dates so product behavior can be audited." },
    ],
  },
  refunds: {
    title: "ReDom Refund Policy",
    summary: "Product and country-specific rules for supported refund requests.",
    sections: [
      { heading: "Availability", body: "Refunds are available only when the applicable ReDom refund policy and product configuration permit them." },
      { heading: "Verification", body: "A supported refund request may require transaction details, Account Profile ID and verification through a linked contact method." },
      { heading: "Review", body: "Refund decisions are made by the authorized refund workflow, not by ReDom AI or a frontend client." },
      { heading: "Status", body: "The application must show only backend-confirmed refund states and must never invent approval, processing or completion." },
    ],
  },
  support: {
    title: "ReDom Support and Reporting Policy",
    summary: "How users can get help, report problems and follow supported cases.",
    sections: [
      { heading: "Support", body: "Use supported ReDom support channels for account, product and safety issues." },
      { heading: "Reports", body: "Reports should include enough information for ReDom to evaluate the selected issue without exposing unrelated private information." },
      { heading: "Case updates", body: "Support state shown in the application should come from the backend and should not be fabricated by AI." },
    ],
  },
};

router.get("/policies/:slug", (req, res) => {
  const document = POLICY_DOCUMENTS[req.params.slug];
  if (!document) {
    res.status(404).json({ success: false, code: "POLICY_NOT_FOUND", message: "Policy not found." });
    return;
  }
  res.json({ success: true, slug: req.params.slug, version: "1.0.0", effectiveAt: "2026-09-13T00:00:00.000Z", document });
});

router.get("/notifications", authMiddleware, async (req, res) => {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  const rows = await db.select().from(notifications)
    .where(and(eq(notifications.recipientUserId, req.user.userId), eq(notifications.deleted, false)))
    .orderBy(desc(notifications.createdAt)).limit(100);
  res.json({ success: true, notifications: rows });
});

router.post("/notifications/:id/read", authMiddleware, async (req, res) => {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ success: false, message: "Invalid notification id." });
    return;
  }
  await db.update(notifications).set({ unread: false, read: true, readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.id, id.data), eq(notifications.recipientUserId, req.user.userId)));
  res.json({ success: true });
});

router.post("/notifications/read-all", authMiddleware, async (req, res) => {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  await db.update(notifications).set({ unread: false, read: true, readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.recipientUserId, req.user.userId), eq(notifications.deleted, false), eq(notifications.unread, true)));
  res.json({ success: true });
});

router.get("/settings", authMiddleware, async (req, res) => {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, req.user.userId)).limit(1);
  res.json({ success: true, settings: settings ?? { theme: "system", language: "system", politicalContent: true, followingFeed: true, followingFeedSnooze: "off", sensitiveContent: "standard", autoplayVideos: "off", autoTranslatePosts: true, autoTranslateComments: true, fontSize: "medium", reduceMotion: false, highContrast: false, screenReaderMode: false, captions: "automatic", showJoinDate: true } });
});

router.patch("/settings", authMiddleware, async (req, res) => {
  if (!req.user?.userId) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  const parsed = z.object({
    theme: z.enum(["system", "light", "dark"]).optional(),
    language: z.string().min(2).max(20).optional(),
    politicalContent: z.boolean().optional(),
    followingFeed: z.boolean().optional(),
    followingFeedSnooze: z.enum(["off", "1h", "8h", "24h", "7d"]).optional(),
    sensitiveContent: z.enum(["standard", "less", "more"]).optional(),
    autoplayVideos: z.enum(["off", "wifi", "always"]).optional(),
    autoTranslatePosts: z.boolean().optional(),
    autoTranslateComments: z.boolean().optional(),
    fontSize: z.enum(["small", "medium", "large"]).optional(),
    reduceMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    screenReaderMode: z.boolean().optional(),
    captions: z.enum(["automatic", "on", "off"]).optional(),
    showJoinDate: z.boolean().optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ success: false, message: "No valid settings were supplied." });
    return;
  }
  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, req.user.userId)).limit(1);
  const now = new Date();
  if (existing) {
    await db.update(userSettings).set({ ...parsed.data, updatedAt: now }).where(eq(userSettings.userId, req.user.userId));
  } else {
    await db.insert(userSettings).values({ userId: req.user.userId, ...parsed.data, updatedAt: now, createdAt: now });
  }
  await db.insert(activityLog).values({ userId: req.user.userId, activityType: "settings_updated", activityCategory: "account", activityTitle: "Settings updated", activityDescription: "A supported ReDom setting was changed.", status: "success", triggeredBy: "user", source: "app", undoSupported: false, hidden: false, archived: false });
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, req.user.userId)).limit(1);
  res.json({ success: true, settings });
});

export default router;
