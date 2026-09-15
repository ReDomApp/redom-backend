import { api } from "../api/client";
import { rotateConversationEncryption } from "./e2ee";
export interface GroupSettings { id:string; groupName:string; groupDescription?:string|null; groupPhoto?:string|null; participantCount:number; anyoneCanEditInfo:boolean; anyoneCanInvite:boolean; anyoneCanShareInvite?:boolean; anyoneCanRemoveMembers:boolean; anyoneCanPinMessages:boolean; anyoneCanSendMessages:boolean; anyoneCanSendHistory:boolean; joinApprovalRequired:boolean; encrypted:boolean; isAdmin:boolean; inviteLink?:string|null; }
export interface GroupMember { id:string; profileId:string; role:string; joinedAt:string; online:boolean; memberTag?:string|null; displayName?:string; profilePhoto?:string|null; verified?:boolean; }
export interface GroupInvite { token:string; link:string; group:any; }
export const groupService={
 getSettings(conversationId:string){return api.get<{success:boolean;settings:GroupSettings}>(`/messages/groups/${conversationId}/settings`).then(async r=>{try{const d=await api.get<{success:boolean;group:GroupSettings}>(`/messages/groups/${conversationId}/details`);return {success:r.success,settings:{...r.settings,anyoneCanShareInvite:d.group.anyoneCanShareInvite}};}catch{return r;}});},
 getDetails(conversationId:string){return api.get<{success:boolean;group:GroupSettings;members:GroupMember[]}>(`/messages/groups/${conversationId}/details`);},
 updateSettings(conversationId:string,patch:Record<string,unknown>){return api.patch<{success:boolean}>(`/messages/groups/${conversationId}/settings`,patch);},
 updatePhoto(conversationId:string,groupPhoto:string|null){return api.patch<{success:boolean;groupPhoto:string|null}>(`/messages/groups/${conversationId}/photo`,{groupPhoto});},
 getMembers(conversationId:string){return api.get<{success:boolean;members:GroupMember[]}>(`/messages/groups/${conversationId}/members`);},
 async addMembers(conversationId:string,profileIds:string[],sendHistory=false){const result=await api.post<{success:boolean;added:number;pending:number;sendHistory:boolean}>(`/messages/groups/${conversationId}/members`,{profileIds,sendHistory});if(result.success&&result.added>0)await rotateConversationEncryption(conversationId);return result;},
 async removeMember(conversationId:string,profileId:string){await rotateConversationEncryption(conversationId,[profileId]);return api.delete<{success:boolean;removed:boolean}>(`/messages/groups/${conversationId}/members/${profileId}`);},
 setRole(conversationId:string,profileId:string,role:"admin"|"member"){return api.patch<{success:boolean;role:string}>(`/messages/groups/${conversationId}/members/${profileId}/role`,{role});},
 setMemberTag(conversationId:string,profileId:string,tag:string|null){return api.patch<{success:boolean;tag:string|null}>(`/messages/groups/${conversationId}/members/${profileId}/tag`,{tag});},
 transferOwnership(conversationId:string,profileId:string){return api.post<{success:boolean;ownerProfileId:string}>(`/messages/groups/${conversationId}/transfer-owner`,{profileId});},
 getMemberChanges(conversationId:string){return api.get<{success:boolean;changes:Array<{id:string;type:string;title:string;description:string;createdAt:string}>}>(`/messages/groups/${conversationId}/member-changes`);},
 async leave(conversationId:string){await rotateConversationEncryption(conversationId,[await import("./e2ee").then(m=>m.getDeviceId()).catch(()=>"")]);return api.post<{success:boolean;left:boolean}>(`/messages/groups/${conversationId}/leave`);},
 getInvite(conversationId:string){return api.get<{success:boolean;token:string;link:string;group:any}>(`/messages/groups/${conversationId}/invite-link`);},
 resetInvite(conversationId:string){return api.post<{success:boolean;token:string;link:string}>(`/messages/groups/${conversationId}/invite-link/reset`,{});},
 previewInvite(token:string){return api.get<{success:boolean;group:any;link:string}>(`/messages/groups/invite/${encodeURIComponent(token)}`);},
 joinInvite(token:string){return api.post<{success:boolean;joined?:boolean;pending?:boolean;conversationId:string;groupName?:string}>(`/messages/groups/invite/${encodeURIComponent(token)}/join`,{});},
 requestJoin(conversationId:string){return api.post<{success:boolean;pending?:boolean}>(`/messages/groups/${conversationId}/join-request`);},
 getJoinRequests(conversationId:string){return api.get<{success:boolean;requests:Array<{id:string;profileId:string;requestedAt:string}>}>(`/messages/groups/${conversationId}/join-requests`);},
 async approveJoin(conversationId:string,profileId:string){const result=await api.post<{success:boolean;approved:boolean}>(`/messages/groups/${conversationId}/join-requests/${profileId}/approve`);if(result.success&&result.approved)await rotateConversationEncryption(conversationId);return result;},
 rejectJoin(conversationId:string,profileId:string){return api.post<{success:boolean;rejected:boolean}>(`/messages/groups/${conversationId}/join-requests/${profileId}/reject`);},
};