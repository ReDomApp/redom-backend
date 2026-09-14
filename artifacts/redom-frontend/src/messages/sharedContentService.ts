import { api } from "../api/client";
import { encryptForRecipient, ensureDeviceKey } from "./e2ee";
import { messageService, type CryptoParticipant, type ReDomMessage } from "./messageService";

export type SharedContentType="location"|"contact"|"poll"|"event";
async function encryptedPayload(conversationId:string,payload:unknown){const device=await ensureDeviceKey();const result=await messageService.getCryptoParticipants(conversationId);const text=JSON.stringify(payload);const envelopes:Record<string,unknown>={};for(const participant of result.participants as CryptoParticipant[]){if(!participant.public_key||!participant.device_id)throw new Error("A selected chat participant is missing an encryption device.");envelopes[participant.device_id]=await encryptForRecipient(text,participant.public_key,`${conversationId}|shared|${Date.now()}`);}if(!envelopes[device.deviceId])throw new Error("This ReDom device is not registered for encrypted messaging.");return envelopes;}
export const sharedContentService={
  async send(conversationId:string,messageType:SharedContentType,payload:unknown,parentMessageId?:string){const encryptedPayload=await encryptedPayloadFor(conversationId,payload);return api.post<{success:boolean;message:ReDomMessage}>(`/messages/conversations/${conversationId}/shared`,{messageType,encryptedPayload,...(parentMessageId?{parentMessageId}:{})});},
};
async function encryptedPayloadFor(conversationId:string,payload:unknown){return encryptedPayload(conversationId,payload);}
