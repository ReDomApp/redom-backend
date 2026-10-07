import { z } from "zod";

export const E164 = /^\+[1-9]\d{6,14}$/;

export const SendSmsSchema = z.object({
  to: z.string().regex(E164, "Recipient must be an E.164 phone number"),
  text: z.string().min(1).max(Number(process.env.SMS_MAX_MESSAGE_LENGTH ?? 1600)),
  from: z.string().min(1).max(20).optional(),
  clientReference: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.string()).optional()
});

export type SendSmsRequest = z.infer<typeof SendSmsSchema>;

export type SmsEncoding = "GSM7" | "UCS2";

export type SmsStatus =
  | "queued" | "processing" | "submitted" | "delivered"
  | "failed" | "expired" | "cancelled";

export type SmsMessage = {
  id: string;
  to: string;
  from: string;
  text: string;
  encoding: SmsEncoding;
  segments: number;
  status: SmsStatus;
  clientReference?: string;
  metadata?: Record<string,string>;
};

export type DeliveryReceipt = {
  providerMessageId: string;
  status: "delivered" | "failed" | "expired" | "rejected" | "unknown";
  errorCode?: string;
  raw?: string;
};

export interface SmsTransport {
  submit(message: SmsMessage, segmentIndex: number, payload: Buffer): Promise<{ providerMessageId: string }>;
  close(): Promise<void>;
}
