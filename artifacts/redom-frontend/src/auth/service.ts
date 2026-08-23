import { api } from "../api/client";

import {
  validateLoginIdentifier,
} from "./validation";

import type {
  AuthResult,
  ForgotPasswordInput,
  LoginInput,
  RefreshSessionInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
  VerifyPhoneInput,
} from "./types";

export const authService = {
  register(
    input: RegisterInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/register",
      input,
    );
  },

  async login(
    input: LoginInput,
  ): Promise<AuthResult> {
    const identifier =
      input.identifier.trim();

    const validationError =
      validateLoginIdentifier(
        identifier,
      );

    if (validationError) {
      throw new Error(
        validationError,
      );
    }

    return api.post<AuthResult>(
      "/auth/login",
      {
        ...input,
        identifier,
      },
    );
  },

  verifyEmail(
    input: VerifyEmailInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/verify-email",
      input,
    );
  },

  verifyPhone(
    input: VerifyPhoneInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/verify-phone",
      input,
    );
  },

  resendEmailCode(
    input: ResendVerificationInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/resend-email-code",
      input,
    );
  },

  resendPhoneCode(
    input: ResendVerificationInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/resend-phone-code",
      input,
    );
  },

  forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/forgot-password",
      input,
    );
  },

  resetPassword(
    input: ResetPasswordInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/reset-password",
      input,
    );
  },

  logout(): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/logout",
    );
  },

  refreshSession(
    input: RefreshSessionInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/refresh",
      input,
    );
  },
};