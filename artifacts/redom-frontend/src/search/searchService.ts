import { api } from "../api/client";
export interface SearchResult { userId: string; firstName: string; lastName: string; username: string; publicId: string; profileId: string; profilePhoto: string | null; verified: boolean; }
export const searchService = { search(query: string) { return api.get<{ success: boolean; query: string; results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`); } };
