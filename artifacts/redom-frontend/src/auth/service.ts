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
} from "./types";

export const authService = {
  async register(
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

  async verifyEmail(
    input: {
      userId: string;
      code: string;
    },
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/verify-email",
      input,
    );
  },

  async verifyPhone(
    input: {
      userId: string;
      phoneNumber: string;
      code: string;
    },
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/verify-phone",
      input,
    );
  },

  async resendEmailCode(
    input: ResendVerificationInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/resend-email-code",
      input,
    );
  },

  async resendPhoneCode(
    input: ResendVerificationInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/resend-phone-code",
      input,
    );
  },

  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/forgot-password",
      input,
    );
  },

  async resetPassword(
    input: ResetPasswordInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/reset-password",
      input,
    );
  },

  async logout(): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/logout",
    );
  },

  async refreshSession(
    input: RefreshSessionInput,
  ): Promise<AuthResult> {
    return api.post<AuthResult>(
      "/auth/refresh",
      input,
    );
  },
};