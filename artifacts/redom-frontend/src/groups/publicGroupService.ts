import { api } from "../api/client";

export interface PublicGroup {
  id: string;
  name: string;
  description?: string | null;
  groupPhoto?: string | null;
  coverPhoto?: string | null;
  memberCount: number;
  memberApprovalRequired?: boolean;
  role?: string;
}

export const publicGroupService = {
  discover(query?: string) {
    return api.get<{ success: boolean; groups: PublicGroup[] }>(`/public-groups${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  },
  mine() {
    return api.get<{ success: boolean; groups: PublicGroup[] }>("/public-groups/mine");
  },
  create(input: { name: string; description?: string; groupPhoto?: string; coverPhoto?: string; memberApprovalRequired?: boolean }) {
    return api.post<{ success: boolean; group: PublicGroup }>("/public-groups", input);
  },
  join(groupId: string) {
    return api.post<{ success: boolean; joined: boolean; pending: boolean; groupId: string }>(`/public-groups/${groupId}/join`, {});
  },
  leave(groupId: string) {
    return api.post<{ success: boolean; left: boolean }>(`/public-groups/${groupId}/leave`, {});
  },
};