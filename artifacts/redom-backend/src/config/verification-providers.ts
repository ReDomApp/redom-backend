export type VerificationRegion =
  | "africa"
  | "europe"
  | "north_america"
  | "asia"
  | "south_america"
  | "australia";

export type SmsProviderName =
  | "infobip"
  | "termii"
  | "twilio"
  | "msg91"
  | "messagebird";

export type EmailProviderName =
  | "resend";

export type KycProviderName =
  | "veriff"
  | "persona";

export interface RegionalVerificationProviders {
  sms: {
    primary:
      SmsProviderName;

    fallback?:
      SmsProviderName;
  };

  email: {
    primary:
      EmailProviderName;

    fallback?:
      EmailProviderName;
  };

  kyc: {
    primary:
      KycProviderName;

    fallback?:
      KycProviderName;
  };
}

/**
 * Provider routing.
 *
 * This is configuration.
 *
 * It is NOT OTP business logic.
 *
 * The VerificationService does not care which
 * provider is selected.
 */
export const verificationProviders: Record<
  VerificationRegion,
  RegionalVerificationProviders
> = {
  africa: {
    sms: {
      primary:
        "infobip",

      fallback:
        "termii",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "veriff",

      fallback:
        "persona",
    },
  },

  europe: {
    sms: {
      primary:
        "twilio",

      fallback:
        "messagebird",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "veriff",

      fallback:
        "persona",
    },
  },

  north_america: {
    sms: {
      primary:
        "twilio",

      fallback:
        "messagebird",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "veriff",

      fallback:
        "persona",
    },
  },

  asia: {
    sms: {
      primary:
        "msg91",

      fallback:
        "messagebird",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "veriff",

      fallback:
        "persona",
    },
  },

  south_america: {
    sms: {
      primary:
        "twilio",

      fallback:
        "messagebird",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "veriff",

      fallback:
        "persona",
    },
  },

  australia: {
    sms: {
      primary:
        "twilio",

      fallback:
        "messagebird",
    },

    email: {
      primary:
        "resend",
    },

    kyc: {
      primary:
        "persona",

      fallback:
        "veriff",
    },
  },
};