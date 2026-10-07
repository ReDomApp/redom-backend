export type MailAddress = {
  email: string;
  name?: string;
};

export type SendEmailRequest = {
  from: string | MailAddress;
  to: string | string[] | MailAddress | MailAddress[];
  cc?: string | string[] | MailAddress | MailAddress[];
  bcc?: string | string[] | MailAddress | MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
};

export type NormalizedMessage = {
  id: string;
  from: MailAddress;
  recipients: MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  createdAt: string;
  attempt: number;
};

export type DeliveryResult =
  | { ok: true; id: string }
  | { ok: false; id: string; retryable: boolean; error: string };
