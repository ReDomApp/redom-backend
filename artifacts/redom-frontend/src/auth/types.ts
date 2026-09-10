export interface AuthUser { id: string; username: string; publicId: string; profileId: string; firstName: string; lastName: string; email: string | null; phoneNumber: string | null; emailVerified: boolean; phoneVerified: boolean; accountStatus: string; }
export interface AuthSession { sessionId: string; accessToken: string; refreshToken: string; expiresAt: string; }
export interface LoginVerification { challengeId: string; channel: "sms" | "email" | "whatsapp"; target: string; maskedTarget: string; codeLength: number; expiresAt: string; }
export interface AuthResult { success: boolean; message: string; requiresVerification?: boolean; user?: AuthUser; session?: AuthSession; verification?: LoginVerification; }
export interface AuthState { status: "loading" | "authenticated" | "unauthenticated"; user: AuthUser | null; session: AuthSession | null; }
export interface LoginInput { identifier: string; password: string; platform?: string; browser?: string; deviceName?: string; deviceId?: string; deviceType?: string; loginSource?: string; appVersion?: string; }
export interface VerifyLoginDeviceInput { challengeId: string; code: string; deviceId: string; deviceName?: string; deviceType?: string; platform?: string; browser?: string; loginSource?: string; appVersion?: string; }
export interface RegisterInput { firstName: string; lastName: string; username: string; email?: string; phoneNumber?: string; password: string; dateOfBirth?: string; gender?: "male" | "female" | "custom"; userAgent?: string; platform?: string; browser?: string; deviceName?: string; deviceId?: string; deviceType?: string; loginSource?: string; appVersion?: string; }
export interface RegistrationFlowReservation { success: boolean; reservationId: string; flowId: string; expiresAt: string; }
export interface RegistrationFlowNameSaveResult { success: boolean; reservationId: string; flowId: string; expiresAt: string; }
export interface RegistrationFlowBirthdaySaveResult { success: boolean; reservationId: string; flowId: string; expiresAt: string; age: number; ageBand: "underage" | "teen" | "adult"; flowStatus: "active" | "completed"; }
export interface RegistrationChallengeStart { contactType: "phone" | "email"; target: string; deviceId?: string; reservationId?: string; flowId?: string; }
export interface RegistrationChallengeResult { success: boolean; challengeId: string; flowId: string; contactType: "phone" | "email"; maskedTarget: string; expiresAt: string; currentStep: "contact" | "identity" | "username" | "profile" | "password" | "review"; }
export interface RegistrationChallengeSaveResult { success: boolean; challengeId: string; flowId: string; maskedTarget: string; expiresAt: string; currentStep: RegistrationChallengeResult["currentStep"]; }
export interface RegistrationCompletionResult { success: boolean; flowId: string; user: AuthUser; verification: LoginVerification; }
export interface RegistrationStepData { firstName?: string; lastName?: string; username?: string; email?: string; phoneNumber?: string; dateOfBirth?: string; gender?: "male" | "female" | "custom"; password?: string; }
export interface ResendVerificationInput { userId: string; }
export interface ForgotPasswordInput { identifier: string; }
export interface ResetPasswordInput { userId: string; code: string; password: string; }
export interface RefreshSessionInput { refreshToken: string; }
