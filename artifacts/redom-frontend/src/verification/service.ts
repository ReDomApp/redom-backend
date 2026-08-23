import { api } from "../api/client";

import {
  VERIFICATION_ENDPOINTS,
} from "./constants";

import {
  validateEmailOtp,
  validatePhoneNumber,
  validatePhoneOtp,
  validateUserId,
} from "./validation";

import type {
  ResendEmailCodeInput,
  ResendPhoneCodeInput,
  VerificationResponse,
  VerifyEmailInput,
  VerifyPhoneInput,
} from "./types";

export const verificationService = {
  async verifyEmail(
    input: VerifyEmailInput,
  ): Promise<VerificationResponse> {
    const userIdError =
      validateUserId(
        input.userId,
      );

    if (userIdError) {
      throw new Error(
        userIdError,
      );
    }

    const codeError =
      validateEmailOtp(
        input.code,
      );

    if (codeError) {
      throw new Error(
        codeError,
      );
    }

    return api.post<VerificationResponse>(
      VERIFICATION_ENDPOINTS.verifyEmail,
      {
        userId:
          input.userId.trim(),

        code:
          input.code.trim(),
      },
    );
  },

  async verifyPhone(
    input: VerifyPhoneInput,
  ): Promise<VerificationResponse> {
    const userIdError =
      validateUserId(
        input.userId,
      );

    if (userIdError) {
      throw new Error(
        userIdError,
      );
    }

    const phoneError =
      validatePhoneNumber(
        input.phoneNumber,
      );

    if (phoneError) {
      throw new Error(
        phoneError,
      );
    }

    const codeError =
      validatePhoneOtp(
        input.code,
      );

    if (codeError) {
      throw new Error(
        codeError,
      );
    }

    return api.post<VerificationResponse>(
      VERIFICATION_ENDPOINTS.verifyPhone,
      {
        userId:
          input.userId.trim(),

        phoneNumber:
          input.phoneNumber.trim(),

        code:
          input.code.trim(),
      },
    );
  },

  async resendEmailCode(
    input: ResendEmailCodeInput,
  ): Promise<VerificationResponse> {
    const userIdError =
      validateUserId(
        input.userId,
      );

    if (userIdError) {
      throw new Error(
        userIdError,
      );
    }

    return api.post<VerificationResponse>(
      VERIFICATION_ENDPOINTS.resendEmail,
      {
        userId:
          input.userId.trim(),
      },
    );
  },

  async resendPhoneCode(
    input: ResendPhoneCodeInput,
  ): Promise<VerificationResponse> {
    const userIdError =
      validateUserId(
        input.userId,
      );

    if (userIdError) {
      throw new Error(
        userIdError,
      );
    }

    return api.post<VerificationResponse>(
      VERIFICATION_ENDPOINTS.resendPhone,
      {
        userId:
          input.userId.trim(),
      },
    );
  },
};