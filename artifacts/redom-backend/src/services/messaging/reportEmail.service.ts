import { Resend } from "resend";
import { env } from "../../config/env";

const resend = new Resend(env.email.resend.apiKey);
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODEL = "gemini-3.8-flash";

export type ReportEmailLanguage = "en" | "es" | "fr" | "de" | "pt" | "it" | "nl" | "ar" | "zh" | "ja" | "ko" | "hi" | "ru" | "tr";

export const REDOM_REPORT_EMAIL_BRAND = {
  primary: "#1877F2",
  text: "#1C1E21",
  secondary: "#65676B",
  background: "#F0F2F5",
  card: "#FFFFFF",
  border: "#DADDE1",
} as const;

const LANGUAGE_NAMES: Record<ReportEmailLanguage, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian", nl: "Dutch",
  ar: "Arabic", zh: "Chinese", ja: "Japanese", ko: "Korean", hi: "Hindi", ru: "Russian", tr: "Turkish",
};

const SUBJECTS: Record<ReportEmailLanguage, string> = {
  en: "Your ReDom AI Moderation report result",
  es: "Resultado de tu informe de moderación de ReDom AI",
  fr: "Résultat de votre signalement ReDom AI Moderation",
  de: "Ergebnis deines ReDom AI Moderation-Berichts",
  pt: "Resultado do seu relatório de moderação do ReDom AI",
  it: "Risultato della tua segnalazione ReDom AI Moderation",
  nl: "Resultaat van je ReDom AI Moderation-melding",
  ar: "نتيجة بلاغك من ReDom AI Moderation",
  zh: "你的 ReDom AI Moderation 举报结果",
  ja: "ReDom AI Moderation レポート結果",
  ko: "ReDom AI Moderation 신고 결과",
  hi: "आपकी ReDom AI Moderation रिपोर्ट का परिणाम",
  ru: "Результат вашей жалобы ReDom AI Moderation",
  tr: "ReDom AI Moderation bildirim sonucunuz",
};

const HTML_SYSTEM_PROMPT = String.raw`
You are the ReDom Reports email designer. Generate ONLY one plain, standards-compatible HTML email for a completed ReDom AI Moderation report.

This is NOT ReDom Support and NOT the user-facing ReDom AI assistant. This email is a one-time, outbound-only notification of an OpenAI moderation result. Never invite the recipient to reply. Never provide a support conversation or support address.

LANGUAGE:
- Write all human-readable email text in the supplied language.
- Preserve factual moderation values exactly in meaning. Translate labels and category names naturally, but do not invent, strengthen, weaken, or reinterpret an OpenAI finding.
- Do not switch to English unless the supplied language is en.

REDOM BRAND:
- Primary blue: #1877F2
- Text: #1C1E21
- Secondary text: #65676B
- Background: #F0F2F5
- Card: #FFFFFF
- Border: #DADDE1
- Brand the message as ReDom Reports / ReDom AI Moderation.

HTML CONTRACT:
- Include <!DOCTYPE html>, <html>, <head>, and <body>.
- Use table-based layout only: table, tr, td. No divs for layout.
- Outer table width 100%; inner content table max-width 600px.
- Every table must use cellpadding="0" cellspacing="0" border="0".
- Inline CSS only. No style tag, external stylesheet, JavaScript, forms, inputs, tracking pixels, remote fonts, remote images, or CSS background-image.
- Use Arial, Helvetica, sans-serif fallbacks.
- Use bgcolor plus CSS background-color on colored cells.
- Keep the design simple and readable on mobile.

PRIVACY:
- Do not include reported message text, private chat content, evidence text, API keys, prompts, internal implementation details, or secrets.
- The email may include report ID, group name, user's selected reason, moderation status, OpenAI finding, detected categories, evidence count, and whether the user requested exit/delete.

NO-REPLY:
- The email is outbound-only. Do not add a reply button, mailto link, support link, or invitation to respond.

Return HTML only. No markdown fences and no explanation.
`;

function normalizeLanguage(language: string | null | undefined): ReportEmailLanguage {
  const code = (language ?? "en").toLowerCase().split(/[-_]/)[0] as ReportEmailLanguage;
  return code in LANGUAGE_NAMES ? code : "en";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fallbackHtml(input: {
  language: ReportEmailLanguage;
  displayName: string;
  reportId: string;
  groupName: string;
  reason: string;
  status: string;
  decision: string;
  categories: string[];
  evidenceCount: number;
  exitAfterReport: boolean;
}): string {
  const labels: Record<ReportEmailLanguage, Record<string, string>> = {
    en: { greeting: "Hello", intro: "Your ReDom AI Moderation report check is complete.", report: "Report", group: "Group", reason: "Reason", status: "Status", finding: "OpenAI finding", categories: "Categories", evidence: "Evidence checked", exit: "Exit requested", yes: "Yes", no: "No", none: "No harmful-content category was detected", footer: "This is a one-time ReDom Reports notification. Please do not reply to this message." },
    es: { greeting: "Hola", intro: "La comprobación de tu informe mediante ReDom AI Moderation ha finalizado.", report: "Informe", group: "Grupo", reason: "Motivo", status: "Estado", finding: "Resultado de OpenAI", categories: "Categorías", evidence: "Evidencia comprobada", exit: "Salida solicitada", yes: "Sí", no: "No", none: "No se detectó ninguna categoría de contenido dañino", footer: "Esta es una notificación única de ReDom Reports. No respondas a este mensaje." },
    fr: { greeting: "Bonjour", intro: "La vérification de votre signalement par ReDom AI Moderation est terminée.", report: "Signalement", group: "Groupe", reason: "Motif", status: "Statut", finding: "Résultat OpenAI", categories: "Catégories", evidence: "Éléments vérifiés", exit: "Sortie demandée", yes: "Oui", no: "Non", none: "Aucune catégorie de contenu nuisible n'a été détectée", footer: "Ceci est une notification unique de ReDom Reports. Merci de ne pas répondre à ce message." },
    de: { greeting: "Hallo", intro: "Die Prüfung deines Berichts durch ReDom AI Moderation ist abgeschlossen.", report: "Bericht", group: "Gruppe", reason: "Grund", status: "Status", finding: "OpenAI-Ergebnis", categories: "Kategorien", evidence: "Geprüfte Belege", exit: "Beenden angefordert", yes: "Ja", no: "Nein", none: "Keine Kategorie für schädliche Inhalte wurde erkannt", footer: "Dies ist eine einmalige Benachrichtigung von ReDom Reports. Bitte antworte nicht auf diese Nachricht." },
    pt: { greeting: "Olá", intro: "A verificação do seu relatório pelo ReDom AI Moderation foi concluída.", report: "Relatório", group: "Grupo", reason: "Motivo", status: "Status", finding: "Resultado da OpenAI", categories: "Categorias", evidence: "Evidências verificadas", exit: "Saída solicitada", yes: "Sim", no: "Não", none: "Nenhuma categoria de conteúdo prejudicial foi detectada", footer: "Esta é uma notificação única do ReDom Reports. Não responda a esta mensagem." },
    it: { greeting: "Ciao", intro: "Il controllo della tua segnalazione tramite ReDom AI Moderation è completato.", report: "Segnalazione", group: "Gruppo", reason: "Motivo", status: "Stato", finding: "Risultato OpenAI", categories: "Categorie", evidence: "Elementi verificati", exit: "Uscita richiesta", yes: "Sì", no: "No", none: "Non è stata rilevata alcuna categoria di contenuto dannoso", footer: "Questa è una notifica una tantum di ReDom Reports. Non rispondere a questo messaggio." },
    nl: { greeting: "Hallo", intro: "De controle van je melding door ReDom AI Moderation is voltooid.", report: "Melding", group: "Groep", reason: "Reden", status: "Status", finding: "OpenAI-resultaat", categories: "Categorieën", evidence: "Gecontroleerd bewijs", exit: "Vertrek aangevraagd", yes: "Ja", no: "Nee", none: "Er is geen categorie voor schadelijke inhoud gedetecteerd", footer: "Dit is een eenmalige melding van ReDom Reports. Beantwoord dit bericht niet." },
    ar: { greeting: "مرحبًا", intro: "اكتمل فحص بلاغك بواسطة ReDom AI Moderation.", report: "البلاغ", group: "المجموعة", reason: "السبب", status: "الحالة", finding: "نتيجة OpenAI", categories: "الفئات", evidence: "الأدلة التي تم فحصها", exit: "طلب الخروج", yes: "نعم", no: "لا", none: "لم يتم اكتشاف فئة محتوى ضار", footer: "هذا إشعار لمرة واحدة من ReDom Reports. يرجى عدم الرد على هذه الرسالة." },
    zh: { greeting: "你好", intro: "ReDom AI Moderation 已完成对你举报的检查。", report: "举报", group: "群组", reason: "原因", status: "状态", finding: "OpenAI 结果", categories: "类别", evidence: "已检查证据", exit: "请求退出", yes: "是", no: "否", none: "未检测到有害内容类别", footer: "这是 ReDom Reports 的一次性通知。请勿回复此消息。" },
    ja: { greeting: "こんにちは", intro: "ReDom AI Moderation によるレポートの確認が完了しました。", report: "レポート", group: "グループ", reason: "理由", status: "ステータス", finding: "OpenAI の判定", categories: "カテゴリ", evidence: "確認した証拠", exit: "退出をリクエスト", yes: "はい", no: "いいえ", none: "有害コンテンツのカテゴリは検出されませんでした", footer: "これは ReDom Reports からの一度限りの通知です。このメッセージには返信しないでください。" },
    ko: { greeting: "안녕하세요", intro: "ReDom AI Moderation의 신고 확인이 완료되었습니다.", report: "신고", group: "그룹", reason: "사유", status: "상태", finding: "OpenAI 결과", categories: "카테고리", evidence: "확인한 증거", exit: "나가기 요청", yes: "예", no: "아니요", none: "유해 콘텐츠 카테고리가 감지되지 않았습니다", footer: "ReDom Reports의 일회성 알림입니다. 이 메시지에 회신하지 마세요." },
    hi: { greeting: "नमस्ते", intro: "ReDom AI Moderation ने आपकी रिपोर्ट की जाँच पूरी कर ली है।", report: "रिपोर्ट", group: "ग्रुप", reason: "कारण", status: "स्थिति", finding: "OpenAI निष्कर्ष", categories: "श्रेणियाँ", evidence: "जाँचे गए साक्ष्य", exit: "बाहर निकलने का अनुरोध", yes: "हाँ", no: "नहीं", none: "हानिकारक सामग्री की कोई श्रेणी नहीं मिली", footer: "यह ReDom Reports की एक बार भेजी जाने वाली सूचना है। कृपया इस संदेश का जवाब न दें।" },
    ru: { greeting: "Здравствуйте", intro: "Проверка вашей жалобы с помощью ReDom AI Moderation завершена.", report: "Жалоба", group: "Группа", reason: "Причина", status: "Статус", finding: "Результат OpenAI", categories: "Категории", evidence: "Проверенные материалы", exit: "Запрошен выход", yes: "Да", no: "Нет", none: "Категории вредоносного контента не обнаружены", footer: "Это разовое уведомление от ReDom Reports. Не отвечайте на это сообщение." },
    tr: { greeting: "Merhaba", intro: "ReDom AI Moderation rapor kontrolünüzü tamamladı.", report: "Bildirim", group: "Grup", reason: "Neden", status: "Durum", finding: "OpenAI bulgusu", categories: "Kategoriler", evidence: "Kontrol edilen kanıt", exit: "Çıkış istendi", yes: "Evet", no: "Hayır", none: "Zararlı içerik kategorisi tespit edilmedi", footer: "Bu, ReDom Reports tarafından gönderilen tek seferlik bir bildirimdir. Lütfen bu mesaja yanıt vermeyin." },
  };
  const t = labels[input.language];
  const categories = input.categories.length ? input.categories.join(", ") : t.none;
  const rows = [
    [t.report, input.reportId], [t.group, input.groupName], [t.reason, input.reason], [t.status, input.status], [t.finding, input.decision], [t.categories, categories], [t.evidence, `${input.evidenceCount}`], [t.exit, input.exitAfterReport ? t.yes : t.no],
  ].map(([label, value]) => `<tr><td style="padding:9px 0;color:${REDOM_REPORT_EMAIL_BRAND.secondary};font-size:14px;line-height:20px;">${escapeHtml(label)}</td><td style="padding:9px 0;color:${REDOM_REPORT_EMAIL_BRAND.text};font-size:14px;line-height:20px;font-weight:600;">${escapeHtml(value)}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="${input.language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:${REDOM_REPORT_EMAIL_BRAND.background};font-family:Arial,Helvetica,sans-serif;color:${REDOM_REPORT_EMAIL_BRAND.text};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${REDOM_REPORT_EMAIL_BRAND.background}" style="width:100%;background-color:${REDOM_REPORT_EMAIL_BRAND.background};"><tr><td align="center" style="padding:32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${REDOM_REPORT_EMAIL_BRAND.card};border:1px solid ${REDOM_REPORT_EMAIL_BRAND.border};"><tr><td bgcolor="${REDOM_REPORT_EMAIL_BRAND.primary}" style="background-color:${REDOM_REPORT_EMAIL_BRAND.primary};padding:24px 28px;color:#FFFFFF;font-size:26px;line-height:32px;font-weight:700;">ReDom Reports</td></tr><tr><td style="padding:28px;"><p style="margin:0 0 8px;font-size:18px;line-height:26px;font-weight:700;">${escapeHtml(t.greeting)} ${escapeHtml(input.displayName)}</p><p style="margin:0 0 24px;color:${REDOM_REPORT_EMAIL_BRAND.secondary};font-size:15px;line-height:23px;">${escapeHtml(t.intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table><p style="margin:26px 0 0;padding-top:18px;border-top:1px solid ${REDOM_REPORT_EMAIL_BRAND.border};color:${REDOM_REPORT_EMAIL_BRAND.secondary};font-size:12px;line-height:18px;">${escapeHtml(t.footer)}</p></td></tr></table></td></tr></table></body></html>`;
}

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

function sanitizeGeneratedHtml(html: string, input: Parameters<typeof fallbackHtml>[0]): string {
  const output = html.trim().replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  if (!/^<!doctype html/i.test(output) || !/<html[\s>]/i.test(output) || !/<table[\s>]/i.test(output)) return fallbackHtml(input);
  if (/<\s*(script|iframe|object|embed|form|input|base|video|audio)\b/i.test(output) || /\bon\w+\s*=/i.test(output) || /javascript\s*:/i.test(output) || /data:text\/html/i.test(output) || /<style\b/i.test(output) || /https?:\/\//i.test(output)) return fallbackHtml(input);
  if (!output.includes(input.reportId) || !output.includes(input.status) || !output.includes(input.decision)) return fallbackHtml(input);
  return output;
}

export async function sendReportResultEmail(input: {
  to: string;
  displayName: string;
  reportId: string;
  groupName: string;
  reason: string;
  status: string;
  decision: string;
  categories: string[];
  evidenceCount: number;
  exitAfterReport: boolean;
  language?: string | null;
}): Promise<{ sent: boolean; language: ReportEmailLanguage; error?: string }> {
  const language = normalizeLanguage(input.language);
  const fallbackInput = { ...input, language };
  const context = JSON.stringify({
    language,
    languageName: LANGUAGE_NAMES[language],
    brand: REDOM_REPORT_EMAIL_BRAND,
    reportId: input.reportId,
    groupName: input.groupName,
    reason: input.reason,
    status: input.status,
    openAiFinding: input.decision,
    openAiCategories: input.categories,
    evidenceCount: input.evidenceCount,
    exitAfterReport: input.exitAfterReport,
    displayName: input.displayName,
  });

  let html = fallbackHtml(fallbackInput);
  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.gemini.apiKey },
      body: JSON.stringify({ model: GEMINI_MODEL, system_instruction: HTML_SYSTEM_PROMPT, input: context }),
    });
    if (response.ok) {
      const generated = extractHtml(await response.json());
      if (generated) html = sanitizeGeneratedHtml(generated, fallbackInput);
    }
  } catch {
    // The deterministic fallback keeps report notifications deliverable in the requested language.
  }

  const replyTo = env.email.reportsFrom.replace(/^reports@/i, "no-reply@");
  const { error } = await resend.emails.send({
    from: env.email.reportsFrom,
    to: [input.to],
    replyTo,
    subject: SUBJECTS[language],
    text: `${SUBJECTS[language]} — ${input.reportId}`,
    html,
  });
  if (error) return { sent: false, language, error: error.message.slice(0, 2000) };
  return { sent: true, language };
}
