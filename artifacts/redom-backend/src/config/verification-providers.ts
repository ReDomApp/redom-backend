export type VerificationRegion =
  | "africa"
  | "europe"
  | "north_america"
  | "asia"
  | "south_america"
  | "australia";

export type SmsProviderName =
  | "termii"
  | "africa_talking"
  | "twilio_verify"
  | "vonage"
  | "msg91"
  | "messagebird";

export type EmailProviderName =
  | "resend";

export type KycProviderName =
  | "smile_identity"
  | "onfido"
  | "veriff";

export interface RegionalVerificationProviders {
  sms: {
    primary: SmsProviderName;
    fallback?: SmsProviderName;
  };

  email: {
    primary: EmailProviderName;
    fallback?: EmailProviderName;
  };

  kyc: {
    primary: KycProviderName;
    fallback?: KycProviderName;
  };
}

/**
 * ReDom v7 provider routing.
 *
 * This is routing configuration, not business logic.
 *
 * Adding a new provider should not require changing
 * AuthService.
 */
export const verificationProviders: Record<
  VerificationRegion,
  RegionalVerificationProviders
> = {
  africa: {
    sms: {
      primary: "termii",
      fallback:
        "africa_talking",
    },

    email: {
      primary: "resend",
    },

    kyc: {
      primary:
        "smile_identity",
    },
  },

  europe: {
    sms: {
      primary:
        "twilio_verify",
      fallback:
        "vonage",
    },

    email: {
      primary: "resend",
      fallback: "resend",
    },

    kyc: {
      primary: "onfido",
    },
  },

  north_america: {
    sms: {
      primary:
        "twilio_verify",
      fallback:
        "vonage",
    },

    email: {
      primary: "resend",
    },

    kyc: {
      primary: "onfido",
    },
  },

  asia: {
    sms: {
      primary: "msg91",
      fallback:
        "messagebird",
    },

    email: {
      primary: "resend",
    },

    kyc: {
      primary: "veriff",
    },
  },

  south_america: {
    sms: {
      primary:
        "twilio_verify",
      fallback:
        "messagebird",
    },

    email: {
      primary: "resend",
    },

    kyc: {
      primary: "veriff",
    },
  },

  australia: {
    sms: {
      primary:
        "twilio_verify",
      fallback:
        "messagebird",
    },

    email: {
      primary: "resend",
    },

    kyc: {
      primary: "onfido",
    },
  },
};