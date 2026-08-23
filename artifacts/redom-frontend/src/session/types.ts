export interface Session {
  id: string;
  userId: string;

  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;

  lastActivity?: string;

  deviceId?: string;
  userAgent?: string;

  region?: string;
  city?: string;
}

export interface SessionListResponse {
  sessions: Session[];
}