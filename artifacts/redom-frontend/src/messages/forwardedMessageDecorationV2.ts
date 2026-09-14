import { messageService } from "./messageService";

const original=messageService.getCompletedMessages.bind(messageService);
messageService.getCompletedMessages=async(conversationId:string)=>{const result=await original(conversationId);const decorate=(message:any)=>message?.isForwarded&&!message.deletedForEveryone&&!message.deletedPlaceholder&&!String(message.message||"").startsWith("Forwarded\n")?{...message,message:`Forwarded\n${message.message||message.caption||"Media message"}`}:message;return {...result,messages:result.messages.map(decorate),replyTargets:result.replyTargets?.map(decorate)};};
