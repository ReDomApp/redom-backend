import { Platform } from "react-native";
import { getStoredSession } from "../auth/storage";
import { env } from "../config/env";
import { api } from "../api/client";
import { ensureDeviceKey, getDeviceId } from "./e2ee";
import { decryptMedia, decryptMediaKey, encryptMediaForParticipants } from "./encryptedMedia";
import { messageService, type CryptoParticipant, type ReDomMessage } from "./messageService";

function absoluteUrl(path: string) { return /^https?:\/\//i.test(path) ? path : `${env.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`; }
function bytesToBase64(bytes: Uint8Array) { let out=""; const chunk=0x8000; for(let i=0;i<bytes.length;i+=chunk) out+=String.fromCharCode(...bytes.subarray(i,i+chunk)); return globalThis.btoa(out); }
async function registerCurrentDevice() { const device=await ensureDeviceKey(); const platform=Platform.OS==="ios"?"iOS":Platform.OS==="android"?"Android":Platform.OS==="web"?"Web":Platform.OS; await api.put("/messages/crypto/device-key",{deviceId:device.deviceId,publicKey:device.publicKey,platform,deviceLabel:platform==="Web"?"ReDom web session":`${platform} device`}); return device; }
async function loadSourceDataUri(source: ReDomMessage) {
  if (!source.attachment?.fileUrl || !source.attachment.encrypted) throw new Error("This media is not available as encrypted ReDom media.");
  const session=await getStoredSession(); if(!session?.accessToken)throw new Error("Authentication required.");
  const response=await fetch(absoluteUrl(source.attachment.fileUrl),{headers:{Authorization:`Bearer ${session.accessToken}`},cache:"no-store"}); if(!response.ok)throw new Error(response.status===410?"This View Once media is unavailable.":"Media is unavailable.");
  const bytes=new Uint8Array(await response.arrayBuffer()); const ciphertext=bytesToBase64(bytes); const envelope=await messageService.getEncryptedMediaKey(source.id); const deviceId=await getDeviceId(); const key=await decryptMediaKey(envelope.envelope,source.conversationId,deviceId); const mime=source.attachment.mimeType||"application/octet-stream"; return decryptMedia(ciphertext,key,mime);
}
async function encryptForDestination(conversationId: string, dataUri: string, context: string) { const result=await messageService.getCryptoParticipants(conversationId); return encryptMediaForParticipants(dataUri,result.participants as CryptoParticipant[],context); }

export const forwardMediaService={
  async forwardMedia(sourceMessage: ReDomMessage,destinationConversationIds:string[]) {
    if(sourceMessage.lifecycle?.viewOnce)throw new Error("View Once media cannot be forwarded."); if(!sourceMessage.attachment?.encrypted)throw new Error("Only encrypted ReDom media can be forwarded."); const unique=[...new Set(destinationConversationIds)]; if(!unique.length||unique.length>5)throw new Error("Select between one and five chats.");
    const sourceDataUri=await loadSourceDataUri(sourceMessage); const results=[] as unknown[]; await registerCurrentDevice();
    for(const conversationId of unique){ const encrypted=await encryptForDestination(conversationId,sourceDataUri,conversationId); const response=await api.post<{success:boolean;message:ReDomMessage;attachment:unknown}>("/messages/forward-media",{conversationId,sourceMessageId:sourceMessage.id,type:sourceMessage.attachment.attachmentType,mimeType:encrypted.mime,ciphertextDataUri:encrypted.ciphertextDataUri,mediaEnvelopes:encrypted.envelopes,caption:sourceMessage.caption||undefined,fileName:sourceMessage.attachment.fileName||undefined,durationSeconds:sourceMessage.attachment.durationSeconds||undefined,waveform:sourceMessage.attachment.waveform?JSON.parse(sourceMessage.attachment.waveform):undefined}); results.push(response); }
    return {success:true,forwardedCount:results.length,results};
  },
};
