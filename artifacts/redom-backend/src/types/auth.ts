import type { AccountStatus } from "./userStatusEnums";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResult {
  success: boolean;
  message: string;

  userId: string;

  username: string;
  publicId: string;
  profileId: string;

  email: string | null;
  phoneNumber: string | null;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: AccountStatus;
}

export interface LoginResult
  extends AuthTokens {
  success: boolean;
  message: string;

  userId: string;

  username: string;
  publicId: string;
  profileId: string;

  email: string | null;
  phoneNumber: string | null;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: AccountStatus;
}

export interface JwtPayload {
  userId: string;
  profileId: string;
  sessionId?: string;
}

export interface AuthUser {
  userId: string;

  username: string;
  publicId: string;
  profileId: string;

  email: string | null;
  phoneNumber: string | null;

  emailVerified: boolean;
  phoneVerified: boolean;

  accountStatus: AccountStatus;
}