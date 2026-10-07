export type MailAddress = { email: string; name?: string };

export type MailAttachment = {
  filename: string;
  content?: string;
  path?: string;
  contentType?: string;
  contentDisposition?: "attachment" | "inline";
  contentId?: string;
};

export type SendEmailRequest = {
  from: string | MailAddress;
  to: string | string[] | MailAddress | MailAddress[];
  cc?: string | string[] | MailAddress | MailAddress[];
  bcc?: string | string[] | MailAddress | MailAddress[];
  replyTo?: string | string[] | MailAddress | MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
  tags?: Array<{ name: string; value: string }>;
  scheduledAt?: string | Date;
};

export type NormalizedMessage = {
  id: string;
  from: MailAddress;
  recipients: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  replyTo?: MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  createdAt: string;
  attempt: number;
};

export type DeliveryResult =
  | { ok: true; id: string }
  | { ok: false; id: string; retryable: boolean; error: string };
