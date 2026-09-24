import { api } from "../api/client";

export interface LinkHistoryEntry {
  id: string;
  url: string;
  title: string | null;
  domain: string;
  source: string | null;
  openedAt: string;
}

export const linkHistoryService = {
  list() { return api.get<{ success: boolean; links: LinkHistoryEntry[] }>("/link-history"); },
  record(input: { url: string; title?: string | null; source?: string | null }) { return api.post<{ success: boolean; id: string; openedAt: string }>("/link-history", input); },
  remove(id: string) { return api.delete<{ success: boolean }>(`/link-history/${encodeURIComponent(id)}`); },
  clear() { return api.delete<{ success: boolean }>("/link-history"); },
};
