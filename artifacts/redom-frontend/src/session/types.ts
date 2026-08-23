export interface Session {
  id: string;

  sessionId: string;

  deviceName: string;

  deviceType: string;

  loginSource: string;

  appVersion: string | null;

  ipAddress: string;

  country: string | null;

  region: string | null;

  city: string | null;

  loginTime: string;

  lastActivity: string;

  createdAt: string;

  updatedAt: string;
}

export interface SessionListResponse {
  success: boolean;

  sessions: Session[];

  message?: string;
}

export interface SessionMutationResponse {
  success: boolean;

  message: string;
}