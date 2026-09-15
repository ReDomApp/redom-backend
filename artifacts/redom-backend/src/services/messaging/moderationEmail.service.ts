import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.8-flash";

const BRAND = { primary: "#1877F2", text: "#1C1E21", secondary: "#65676B", background: "#F0F2F5", card: "#FFFFFF", border: "#DADDE1" } as const;
const LANGUAGES = new Set(["en", "es", "fr", "de", "pt", "it", "nl", "ar", "zh", "ja", "ko", "hi", "ru", "tr"]);
const LABELS: Record<string, { subject: string; heading: string; action: string; footer: string }> = {
  en: { subject: "ReDom safety action", heading: "ReDom safety action", action: "Action taken", footer: "This message was sent by ReDom Moderation. It is an outbound-only safety notification and is not a support or reply channel." },
  es: { subject: "Acción de seguridad de ReDom", heading: "Acción de seguridad de ReDom", action: "Acción realizada", footer: "Este mensaje fue enviado por ReDom Moderation. Es una notificación de seguridad solo de salida y no es un canal de soporte ni de respuesta." },
  fr: { subject: "Action de sécurité ReDom", heading: "Action de sécurité ReDom", action: "Action effectuée", footer: "Ce message a été envoyé par ReDom Moderation. Il s'agit d'une notification de sécurité sortante uniquement, pas d'un canal d'assistance ou de réponse." },
  de: { subject: "ReDom-Sicherheitsmaßnahme", heading: "ReDom-Sicherheitsmaßnahme", action: "Maßnahme", footer: "Diese Nachricht wurde von ReDom Moderation gesendet. Sie ist ausschließlich eine ausgehende Sicherheitsbenachrichtigung und kein Support- oder Antwortkanal." },
  pt: { subject: "Ação de segurança da ReDom", heading: "Ação de segurança da ReDom", action: "Ação tomada", footer: "Esta mensagem foi enviada pela ReDom Moderation. É uma notificação de segurança somente de saída e não é um canal de suporte ou resposta." },
  it: { subject: "Azione di sicurezza ReDom", heading: "Azione di sicurezza ReDom", action: "Azione eseguita", footer: "Questo messaggio è stato inviato da ReDom Moderation. È una notifica di sicurezza solo in uscita e non è un canale di supporto o risposta." },
  nl: { subject: "ReDom-veiligheidsactie", heading: "ReDom-veiligheidsactie", action: "Genomen actie", footer: "Dit bericht is verzonden door ReDom Moderation. Het is alleen een uitgaande veiligheidsmelding en geen support- of antwoordkanaal." },
  ar: { subject: "إجراء أمان من ReDom", heading: "إجراء أمان من ReDom", action: "الإجراء المتخذ", footer: "تم إرسال هذه الرسالة من ReDom Moderation. إنها إشعار أمان صادر فقط وليست قناة دعم أو رد." },
  zh: { subject: "ReDom 安全处理", heading: "ReDom 安全处理", action: "已采取的措施", footer: "此邮件由 ReDom Moderation 发送。它仅用于发送安全通知，不是支持或回复渠道。" },
  ja: { subject: "ReDomの安全措置", heading: "ReDomの安全措置", action: "実施された措置", footer: "このメールはReDom Moderationから送信されています。安全通知の送信専用であり、サポートや返信の窓口ではありません。" },
  ko: { subject: "ReDom 안전 조치", heading: "ReDom 안전 조치", action: "취해진 조치", footer: "이 메시지는 ReDom Moderation에서 발송되었습니다. 발신 전용 안전 알림이며 지원 또는 답장 채널이 아닙니다." },
  hi: { subject: "ReDom सुरक्षा कार्रवाई", heading: "ReDom सुरक्षा कार्रवाई", action: "की गई कार्रवाई", footer: "यह संदेश ReDom Moderation द्वारा भेजा गया है। यह केवल सुरक्षा सूचना के लिए है और सहायता या उत्तर का चैनल नहीं है।" },
  ru: { subject: "Мера безопасности ReDom", heading: "Мера безопасности ReDom", action: "Принятое действие", footer: "Это сообщение отправлено ReDom Moderation. Это одностороннее уведомление о безопасности, а не канал поддержки или ответа." },
  tr: { subject: "ReDom güvenlik işlemi", heading: "ReDom güvenlik işlemi", action: "Uygulanan işlem", footer: "Bu mesaj ReDom Moderation tarafından gönderildi. Yalnızca giden güvenlik bildirimidir; destek veya yanıt kanalı değildir." },
};

function languageOf(value: string): string { return LANGUAGES.has(value) ? value : "en"; }
function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function extractHtml(payload: unknown): string | null {
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as Record<string, unknown>;
    const content = Array.isArray(step.content) ? step.content : [];
    for (let j = content.length - 1; j >= 0; j -= 1) {
      const block = content[j] as Record<string, unknown>;
      if (typeof block.text === "string") return block.text;
    }
  }
  return null;
}
function fallbackHtml(input: { language: string; displayName: string; groupName: string; actions: string[] }): string {
  const labels = LABELS[language];
  const actionRows = input.actions.map((action) => `<tr><td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:21px;color:${BRAND.text};">${escapeHtml(action)}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:${BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};"><tr><td align="center" style="padding:32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:${BRAND.card};border:1px solid ${BRAND.border};"><tr><td bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};padding:24px 28px;color:#FFFFFF;font-size:28px;line-height:34px;font-weight:700;">ReDom</td></tr><tr><td style="padding:28px;"><p style="margin:0 0 8px;color:${BRAND.secondary};font-size:12px;line-height:16px;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(labels.heading)}</p><p style="margin:0 0 18px;font-size:16px;line-height:24px;">${escapeHtml(input.displayName)}, ReDom took a safety action in <strong>${escapeHtml(input.groupName)}</strong>.</p><p style="margin:0 0 8px;font-size:13px;line-height:18px;color:${BRAND.secondary};">${escapeHtml(labels.action)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BRAND.border};">${actionRows}</table><p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${BRAND.border};color:${BRAND.secondary};font-size:12px;line-height:18px;">${escapeHtml(labels.footer)}</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendModerationActionEmail(input: { to: string; displayName: string; groupName: string; actions: string[]; language: string }): Promise<{ sent: boolean; error?: string }> {
  const language = languageOf(input.language);
  const labels = LABELS[language];
  const context = JSON.stringify({ brand: BRAND, language, displayName: input.displayName, groupName: input.groupName, actions: input.actions, subject: labels.subject, rules: ["Generate ONLY HTML.", "Do not mention a report, reporter, reporting user, or how the safety signal was obtained.", "State only that ReDom reviewed content for safety and took the supplied actions.", "Do not include message text, private content, secrets, prompts, or internal moderation data.", "Use ReDom branding and the requested language.", "Table-based HTML only; inline CSS; no scripts, forms, remote assets, external URLs or reply invitation."] });
  let html = fallbackHtml({ ...input, language });
  try {
    const response = await fetch(GEMINI_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey }, body: JSON.stringify({ model: GEMINI_MODEL, system_instruction: "You are the ReDom Moderation email designer. Return only a complete safe HTML email document following the supplied contract.", input: context }) });
    if (response.ok) {
      const generated = extractHtml(await response.json())?.trim().replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
      if (generated && /^<!doctype html/i.test(generated) && /<html[\s>]/i.test(generated) && /<table[\s>]/i.test(generated) && !/<\s*(script|iframe|object|embed|form|input|base|video|audio|style)\b/i.test(generated) && !/\bon\w+\s*=/i.test(generated) && !/javascript\s*:/i.test(generated) && !/https?:\/\//i.test(generated)) html = generated;
    }
  } catch {
    // Branded deterministic fallback is intentionally used if Gemini is unavailable.
  }
  try {
    const { error } = await resend.emails.send({ from: env.email.moderationFrom, to: [input.to], replyTo: env.email.moderationReplyTo, subject: labels.subject, text: `${labels.heading}: ${input.actions.join("; ")}`, html });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Moderation email could not be sent." };
  }
}
