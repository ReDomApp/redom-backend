import { api } from "../api/client";

import type {
  SessionListResponse,
  SessionMutationResponse,
} from "./types";

export const sessionService = {
  async list(): Promise<SessionListResponse> {
    return api.get<SessionListResponse>(
      "/sessions",
    );
  },

  async revoke(
    sessionId: string,
  ): Promise<SessionMutationResponse> {
    return api.delete<SessionMutationResponse>(
      `/sessions/${encodeURIComponent(
        sessionId,
      )}`,
    );
  },

  async revokeAll(): Promise<SessionMutationResponse> {
    return api.post<SessionMutationResponse>(
      "/sessions/revoke-all",
    );
  },
};