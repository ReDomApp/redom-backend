import Twilio from "twilio";

import {
  env,
} from "../config/env";

/**
 * Generic Twilio API client.
 *
 * OTP generation and verification are owned by
 * ReDom, not Twilio Verify.
 */
export const twilioClient =
  Twilio(
    env.twilio.accountSid,
    env.twilio.authToken,
  );

/**
 * Kept as an optional compatibility export for
 * other existing code that may still reference it.
 *
 */
export const twilioVerifyServiceSid =
  env.twilio.verifyServiceSid;