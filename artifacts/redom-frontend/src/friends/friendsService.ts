import { api } from "../api/client";
export type FriendPerson={userId:string;profileId:string;firstName:string;lastName:string;username?:string|null;profilePhoto?:string|null;currentCity?:string|null;hometown?:string|null;profileType?:string|null;verified?:boolean;friend:boolean;requestSent:boolean;requestReceived:boolean;following:boolean;requestId?:string|null;outgoingRequestId?:string|null;incomingRequestId?:string|null};
export const friendsService={
 list(q?:string){return api.get<{success:boolean;people:FriendPerson[]}>(`/friends${q?`?q=${encodeURIComponent(q)}`:""}`);},
 following(){return api.get<{success:boolean;people:FriendPerson[]}>("/friends/following");},
 profileFriends(userId:string){return api.get<{success:boolean;people:FriendPerson[]}>(`/friends/profile/${userId}`)},
 suggested(q?:string){return api.get<{success:boolean;people:FriendPerson[]}>(`/friends/suggested${q?`?q=${encodeURIComponent(q)}`:""}`);},
 common(){return api.get<{success:boolean;people:FriendPerson[]}>("/friends/common");},
 requests(){return api.get<{success:boolean;incoming:FriendPerson[];outgoing:FriendPerson[]}>("/friends/requests");},
 add(userId:string){return api.post<{success:boolean;requestId:string}>(`/friends/requests/${userId}`,{});},
 cancel(userId:string){return api.delete<{success:boolean}>(`/friends/requests/${userId}`);},
 accept(requestId:string){return api.post<{success:boolean}>(`/friends/requests/${requestId}/accept`,{});},
 decline(requestId:string){return api.post<{success:boolean}>(`/friends/requests/${requestId}/decline`,{});},
 unfriend(userId:string){return api.delete<{success:boolean}>(`/friends/${userId}`);},
 unfollow(userId:string){return api.post<{success:boolean}>(`/friends/unfollow/${userId}`,{});},
 block(userId:string){return api.post<{success:boolean}>(`/friends/block/${userId}`,{});},
};