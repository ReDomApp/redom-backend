export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  success: boolean;
  message: string;

  userId: string;
  profileId: string;

  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface LoginResult extends AuthTokens {
  success: boolean;
  message: string;

  userId: string;
  profileId: string;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: string;
}

export interface JwtPayload {
  userId: string;
  profileId: string;
  sessionId?: string;
}

export interface AuthUser {
  userId: string;
  profileId: string;

  email: string;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: string;
}