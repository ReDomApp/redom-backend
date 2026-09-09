import { api } from "../api/client";

import { validateLoginIdentifier } from "./validation";

import type {
  AuthResult,
  ForgotPasswordInput,
  LoginInput,
  RefreshSessionInput,
  RegisterInput,
  RegistrationChallengeResult,
  RegistrationChallengeSaveResult,
  RegistrationChallengeStart,
  RegistrationCompletionResult,
  RegistrationStepData,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyLoginDeviceInput,
} from "./types";

export const authService = {
  async login(input: LoginInput): Promise<AuthResult> {
    const identifier = input.identifier.trim();
    const validationError = validateLoginIdentifier(identifier);
    if (validationError) throw new Error(validationError);
    return api.post<AuthResult>("/auth/login", { ...input, identifier });
  },

  async verifyLoginDevice(input: VerifyLoginDeviceInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/verify-login-device", input);
  },

  async register(input: RegisterInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/register", input);
  },

  async startRegistrationChallenge(input: RegistrationChallengeStart): Promise<RegistrationChallengeResult> {
    return api.post<RegistrationChallengeResult>("/auth/register/challenge", input);
  },

  async saveRegistrationStep(
    challengeId: string,
    step: RegistrationChallengeResult["currentStep"],
    data: RegistrationStepData,
  ): Promise<RegistrationChallengeSaveResult> {
    return api.patch<RegistrationChallengeSaveResult>(
      `/auth/register/challenge/${challengeId}`,
      { step, data },
    );
  },

  async completeRegistrationChallenge(
    challengeId: string,
    submitted?: { email?: string; phoneNumber?: string },
  ): Promise<RegistrationCompletionResult> {
    return api.post<RegistrationCompletionResult>(
      `/auth/register/challenge/${challengeId}/complete`,
      { submitted },
    );
  },

  async verifyRegistrationChallenge(
    registrationChallengeId: string,
    verificationChallengeId: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    return api.post<{ success: boolean; message: string }>(
      `/auth/register/challenge/${registrationChallengeId}/verify`,
      { verificationChallengeId, code },
    );
  },

  async getRegistrationFlow(challengeId: string): Promise<RegistrationChallengeResult> {
    return api.get<RegistrationChallengeResult>(`/auth/register/challenge/${challengeId}`);
  },

  async verifyEmail(input: { userId: string; code: string }): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/verify-email", input);
  },

  async verifyPhone(input: { userId: string; phoneNumber: string; code: string }): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/verify-phone", input);
  },

  async resendEmailCode(input: ResendVerificationInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/resend-email-code", input);
  },

  async resendPhoneCode(input: ResendVerificationInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/resend-phone-code", input);
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/forgot-password", input);
  },

  async resetPassword(input: ResetPasswordInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/reset-password", input);
  },

  async logout(): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/logout");
  },

  async refreshSession(input: RefreshSessionInput): Promise<AuthResult> {
    return api.post<AuthResult>("/auth/refresh", input);
  },
};
