import "dotenv/config";

function required(name: string): string { const value = process.env[name]; if (!value || value.trim().length === 0) throw new Error(`${name} is required but is not configured.`); return value; }
function optional(name: string): string | undefined { const value = process.env[name]; if (!value || value.trim().length === 0) return undefined; return value; }
function requiredNumber(name: string): number { const value = Number(required(name)); if (!Number.isFinite(value)) throw new Error(`${name} must be a valid number.`); return value; }
function optionalBoolean(name: string, defaultValue: boolean): boolean { const value = optional(name); if (value === undefined) return defaultValue; return value.toLowerCase() === "true"; }

export const env = {
  application: { nodeEnv: required("NODE_ENV"), port: requiredNumber("PORT") },
  database: { url: required("DATABASE_URL"), neonApiKey: required("NEON_API_KEY") },
  authentication: { jwtAccessSecret: required("JWT_ACCESS_SECRET"), jwtRefreshSecret: required("JWT_REFRESH_SECRET"), sessionSecret: required("SESSION_SECRET") },
  email: {
    resend: { apiKey: required("RESEND_API_KEY"), webhookSecret: optional("RESEND_WEBHOOK_SECRET") },
    supportFrom: optional("SUPPORT_EMAIL_FROM") ?? "support@wnncompany.com",
    reportsFrom: optional("REPORTS_EMAIL_FROM") ?? "reports@wnncompany.com",
    moderationFrom: optional("MODERATION_EMAIL_FROM") ?? "moderation@wnncompany.com",
    moderationReplyTo: optional("MODERATION_EMAIL_REPLY_TO") ?? "no-reply@wnncompany.com",
    bugReportsFrom: optional("BUG_REPORTS_EMAIL_FROM") ?? "bugs@wnncompany.com",
    problemReportsFrom: optional("PROBLEM_REPORTS_EMAIL_FROM") ?? "problem@wnncompany.com",
    paymentFrom: optional("PAYMENT_EMAIL_FROM") ?? "payment@wnncompany.com",
    bugReportRecipients: (optional("BUG_REPORT_RECIPIENTS") ?? "admin@wnncompany.com,christianuzamaosahuo@gmail.com").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
  },
  payments: { paystack: { secretKey: required("PAYSTACK_SECRET_KEY"), publicKey: required("PAYSTACK_PUBLIC_KEY") } },
  refunds: { enabled: optionalBoolean("REDOM_REFUNDS_ENABLED", false), from: optional("REFUND_EMAIL_FROM") ?? "refund@wnncompany.com" },
  twilio: { accountSid: required("TWILIO_ACCOUNT_SID"), authToken: required("TWILIO_AUTH_TOKEN"), verifyServiceSid: required("TWILIO_VERIFY_SERVICE_SID"), phoneNumber: required("TWILIO_PHONE_NUMBER"), whatsappFrom: optional("TWILIO_WHATSAPP_FROM") },
  msg91: { authKey: required("MSG91_AUTH_KEY"), senderId: required("MSG91_SENDER_ID") },
  cloudflare: { r2: { accountId: required("R2_ACCOUNT_ID"), apiToken: required("R2_API_TOKEN"), accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY"), bucketName: required("R2_BUCKET_NAME"), endpoint: required("R2_ENDPOINT"), bucketEndpoint: required("R2_BUCKET_ENDPOINT"), region: required("R2_REGION") }, stream: { accountId: required("STREAM_ACCOUNT_ID"), customerSubdomain: required("STREAM_CUSTOMER_SUBDOMAIN") } },
  turnstile: { siteKey: required("TURNSTILE_SITE_KEY"), secretKey: required("TURNSTILE_SECRET_KEY") },
  oneSignal: { appId: required("ONESIGNAL_APP_ID"), restApiKey: required("ONESIGNAL_REST_API_KEY") },
  redis: { url: required("REDIS_URL"), token: required("REDIS_TOKEN"), endpoint: required("REDIS_ENDPOINT"), port: requiredNumber("REDIS_PORT") },
  qstash: { url: required("QSTASH_URL"), token: required("QSTASH_TOKEN"), currentSigningKey: required("QSTASH_CURRENT_SIGNING_KEY"), nextSigningKey: required("QSTASH_NEXT_SIGNING_KEY") },
  meilisearch: { host: required("MEILISEARCH_HOST"), masterKey: required("MEILISEARCH_MASTER_KEY"), adminApiKey: required("MEILISEARCH_ADMIN_API_KEY"), searchApiKey: required("MEILISEARCH_SEARCH_API_KEY"), readonlyApiKey: required("MEILISEARCH_READONLY_API_KEY"), chatApiKey: required("MEILISEARCH_CHAT_API_KEY") },
  ipApi: { apiKey: required("IPAPI_API_KEY") },
  abstract: { apiKey: optional("ABSTRACT_API_KEY") },
  maxMind: { accountId: required("MAXMIND_ACCOUNT_ID"), licenseKey: required("MAXMIND_LICENSE_KEY") },
  mapbox: { username: required("MAPBOX_USERNAME"), accessToken: required("MAPBOX_ACCESS_TOKEN"), secretToken: required("MAPBOX_SECRET_TOKEN") },
  sentry: { dsn: required("SENTRY_DSN") },
  postHog: { apiKey: required("POSTHOG_API_KEY"), host: required("POSTHOG_HOST") },
  openAI: { apiKey: required("OPENAI_API_KEY") },
  gemini: { apiKey: required("GEMINI_API_KEY") },
} as const;
