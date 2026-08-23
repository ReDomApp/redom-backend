import { api } from "../api/client";

import type {
  SessionListResponse,
} from "./types";

export const sessionService = {
  async list(): Promise<SessionListResponse> {
    return api.get<SessionListResponse>(
      "/sessions",
    );
  },

  async revoke(
    sessionId: string,
  ): Promise<void> {
    await api.delete(
      `/sessions/${encodeURIComponent(sessionId)}`,
    );
  },
};