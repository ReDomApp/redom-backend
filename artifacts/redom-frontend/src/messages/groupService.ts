import { api } from "../api/client";

export interface GroupSettings {
  id: string;
  groupName: string;
  groupDescription?: string | null;
  groupPhoto?: string | null;
  participantCount: number;
  anyoneCanEditInfo: boolean;
  anyoneCanInvite: boolean;
  anyoneCanRemoveMembers: boolean;
  anyoneCanPinMessages: boolean;
  anyoneCanSendMessages: boolean;
  anyoneCanSendHistory: boolean;
  joinApprovalRequired: boolean;
  encrypted: boolean;
  isAdmin: boolean;
  inviteLink?: string | null;
}
export interface GroupMember { id: string; profileId: string; role: string; joinedAt: string; online: boolean; memberTag?: string | null; }
export interface GroupInvite { token: string; link: string; group: { id: string; groupName: string; groupDescription?: string | null; groupPhoto?: string | null; participantCount: number; joinApprovalRequired: boolean; encrypted: boolean; }; }

export const groupService = {
  getSettings(conversationId: string) { return api.get<{ success: boolean; settings: GroupSettings }>(`/messages/groups/${conversationId}/settings`); },
  updateSettings(conversationId: string, patch: Partial<Pick<GroupSettings, "groupName" | "groupDescription" | "anyoneCanEditInfo" | "anyoneCanInvite" | "anyoneCanRemoveMembers" | "anyoneCanPinMessages" | "anyoneCanSendMessages" | "anyoneCanSendHistory" | "joinApprovalRequired">>) { return api.patch<{ success: boolean }>(`/messages/groups/${conversationId}/settings`, patch); },
  getMembers(conversationId: string) { return api.get<{ success: boolean; members: GroupMember[] }>(`/messages/groups/${conversationId}/members`); },
  addMembers(conversationId: string, profileIds: string[], sendHistory = false) { return api.post<{ success: boolean; added: number; pending: number; sendHistory: boolean }>(`/messages/groups/${conversationId}/members`, { profileIds, sendHistory }); },
  removeMember(conversationId: string, profileId: string) { return api.delete<{ success: boolean; removed: boolean }>(`/messages/groups/${conversationId}/members/${profileId}`); },
  setRole(conversationId: string, profileId: string, role: "admin" | "member") { return api.patch<{ success: boolean; role: string }>(`/messages/groups/${conversationId}/members/${profileId}/role`, { role }); },
  setMemberTag(conversationId: string, profileId: string, tag: string | null) { return api.patch<{ success: boolean; tag: string | null }>(`/messages/groups/${conversationId}/members/${profileId}/tag`, { tag }); },
  transferOwnership(conversationId: string, profileId: string) { return api.post<{ success: boolean; ownerProfileId: string }>(`/messages/groups/${conversationId}/transfer-owner`, { profileId }); },
  getMemberChanges(conversationId: string) { return api.get<{ success: boolean; changes: Array<{ id: string; type: string; title: string; description: string; createdAt: string }> }>(`/messages/groups/${conversationId}/member-changes`); },
  leave(conversationId: string) { return api.post<{ success: boolean; left: boolean }>(`/messages/groups/${conversationId}/leave`); },
  getInvite(conversationId: string) { return api.get<{ success: boolean; token: string; link: string; group: GroupInvite["group"] }>(`/messages/groups/${conversationId}/invite-link`); },
  resetInvite(conversationId: string) { return api.post<{ success: boolean; token: string; link: string }>(`/messages/groups/${conversationId}/invite-link/reset`, {}); },
  previewInvite(token: string) { return api.get<{ success: boolean; group: GroupInvite["group"]; link: string }>(`/messages/groups/invite/${encodeURIComponent(token)}`); },
  joinInvite(token: string) { return api.post<{ success: boolean; joined?: boolean; pending?: boolean; conversationId: string; groupName?: string }>(`/messages/groups/invite/${encodeURIComponent(token)}/join`, {}); },
  requestJoin(conversationId: string) { return api.post<{ success: boolean; pending?: boolean }>(`/messages/groups/${conversationId}/join-request`); },
  getJoinRequests(conversationId: string) { return api.get<{ success: boolean; requests: Array<{ id: string; profileId: string; requestedAt: string }> }>(`/messages/groups/${conversationId}/join-requests`); },
  approveJoin(conversationId: string, profileId: string) { return api.post<{ success: boolean; approved: boolean }>(`/messages/groups/${conversationId}/join-requests/${profileId}/approve`); },
  rejectJoin(conversationId: string, profileId: string) { return api.post<{ success: boolean; rejected: boolean }>(`/messages/groups/${conversationId}/join-requests/${profileId}/reject`); },
};