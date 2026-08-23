export interface AuthUser {
  id: string;

  username: string;

  publicId: string;

  profileId: string;

  firstName: string;

  lastName: string;

  email: string | null;

  phoneNumber: string | null;

  emailVerified: boolean;

  phoneVerified: boolean;

  accountStatus: string;
}

export interface AuthSession {
  sessionId: string;

  accessToken: string;

  refreshToken: string;

  expiresAt: string;
}

export interface AuthResult {
  success: boolean;

  message: string;

  user?: AuthUser;

  session?: AuthSession;
}

export interface AuthState {
  status:
    | "loading"
    | "authenticated"
    | "unauthenticated";

  user: AuthUser | null;

  session: AuthSession | null;
}

export interface RegisterInput {
  firstName: string;

  lastName: string;

  username: string;

  email?: string;

  phoneNumber?: string;

  password: string;

  dateOfBirth?: string;

  gender?:
    | "male"
    | "female"
    | "custom";

  ipAddress?: string;

  country?: string;

  region?: string;

  city?: string;

  userAgent?: string;

  platform?: string;

  browser?: string;

  deviceName?: string;

  deviceId?: string;

  deviceType?: string;

  loginSource?: string;

  appVersion?: string;
}

export interface LoginInput {
  identifier: string;

  password: string;

  ipAddress?: string;

  country?: string;

  region?: string;

  city?: string;

  userAgent?: string;

  platform?: string;

  browser?: string;

  deviceName?: string;

  deviceId?: string;

  deviceType?: string;

  loginSource?: string;

  appVersion?: string;
}

export interface ResendVerificationInput {
  userId: string;
}

export interface ForgotPasswordInput {
  identifier: string;
}

export interface ResetPasswordInput {
  userId: string;

  code: string;

  password: string;
}

export interface RefreshSessionInput {
  refreshToken: string;
}