import { z } from "zod";
export const E164=/^\+[1-9]\d{6,14}$/;
export const SendSmsSchema=z.object({
 to:z.string().regex(E164),text:z.string().min(1).max(Number(process.env.SMS_MAX_MESSAGE_LENGTH??1600)),
 from:z.string().min(1).max(20).optional(),clientReference:z.string().min(1).max(128).optional(),
 metadata:z.record(z.string(),z.string()).optional(),scheduledAt:z.string().datetime().optional(),
 ttlSeconds:z.number().int().min(30).max(604800).optional(),routeId:z.string().max(128).optional(),
 skipOptOutCheck:z.boolean().optional()
});
export const BatchSmsSchema=z.object({messages:z.array(SendSmsSchema).min(1).max(100)});
export type SendSmsRequest=z.infer<typeof SendSmsSchema>;
export type SmsEncoding="GSM7"|"UCS2";
export type SmsStatus="queued"|"scheduled"|"processing"|"submitted"|"delivered"|"failed"|"expired"|"cancelled";
export type SmsMessage={id:string;to:string;from:string;text:string;encoding:SmsEncoding;segments:number;status:SmsStatus;clientReference?:string;metadata?:Record<string,string>};
export type DeliveryReceipt={providerMessageId:string;status:"delivered"|"failed"|"expired"|"rejected"|"unknown";errorCode?:string;raw?:string};
export type InboundSms={from:string;to:string;text:string;providerMessageId?:string;metadata?:Record<string,string>};
export interface SmsTransport{
 submit(message:SmsMessage,segmentIndex:number,payload:Buffer):Promise<{providerMessageId:string}>;
 close():Promise<void>;
}
export type SmsEvent="message.queued"|"message.submitted"|"message.delivered"|"message.failed"|"message.expired"|"message.cancelled"|"message.received"|"message.opted_out";