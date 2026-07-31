import { checkIP } from "../../lib/ipqs";
import { lookup } from "../../lib/maxmind";
import { verifyTurnstileToken } from "../../lib/turnstile";

export interface FraudCheckResult {
  success: boolean;
  country?: string;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  fraudScore: number;
  message?: string;
}

export class FraudService {
  /**
   * Verify Cloudflare Turnstile token.
   */
  async verifyTurnstile(
    token: string,
  ): Promise<void> {
    const valid =
      await verifyTurnstileToken(token);

    if (!valid) {
      throw new Error(
        "Turnstile verification failed.",
      );
    }
  }

  /**
   * Detect country from IP.
   */
  async detectCountry(
  ipAddress: string,
): Promise<string | undefined> {
  const result = lookup(ipAddress);

  return (
    (result as any)?.country?.iso_code ??
    undefined
  );
  }

  /**
   * Check IP reputation.
   */
  async checkIp(
    ipAddress: string,
  ): Promise<FraudCheckResult> {
    const result =
      await checkIP(ipAddress);

    return {
      success: result.success,
      country: await this.detectCountry(
        ipAddress,
      ),
      isVpn: result.vpn ?? false,
      isProxy: result.proxy ?? false,
      isTor: result.tor ?? false,
      fraudScore:
        result.fraud_score ?? 0,
    };
  }

  /**
   * Registration fraud check.
   */
  async checkRegistration(params: {
    userId: string;
    email: string;
    phoneNumber: string;
    ipAddress?: string;
    country?: string;
    userAgent?: string;
  }): Promise<FraudCheckResult> {
    if (!params.ipAddress) {
      return {
        success: true,
        country: params.country,
        isVpn: false,
        isProxy: false,
        isTor: false,
        fraudScore: 0,
      };
    }

    const result =
      await this.checkIp(
        params.ipAddress,
      );

    if (result.fraudScore >= 90) {
      throw new Error(
        "Registration blocked because of a high fraud score.",
      );
    }

    return result;
  }

  /**
   * Login fraud check.
   */
  async checkLogin(params: {
    userId: string;
    ipAddress?: string;
    country?: string;
    userAgent?: string;
  }): Promise<FraudCheckResult> {
    if (!params.ipAddress) {
      return {
        success: true,
        country: params.country,
        isVpn: false,
        isProxy: false,
        isTor: false,
        fraudScore: 0,
      };
    }

    const result =
      await this.checkIp(
        params.ipAddress,
      );

    if (result.fraudScore >= 95) {
      throw new Error(
        "Login blocked because of a high fraud score.",
      );
    }

    return result;
  }

  /**
   * Password reset fraud check.
   */
  async checkPasswordReset(params: {
    ipAddress?: string;
    country?: string;
  }): Promise<FraudCheckResult> {
    if (!params.ipAddress) {
      return {
        success: true,
        country: params.country,
        isVpn: false,
        isProxy: false,
        isTor: false,
        fraudScore: 0,
      };
    }

    return this.checkIp(
      params.ipAddress,
    );
  }
}

export const fraudService =
  new FraudService();