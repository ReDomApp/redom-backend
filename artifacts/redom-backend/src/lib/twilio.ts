import Twilio from "twilio";

import { env } from "../config/env";

export const twilioClient =
  Twilio(
    env.twilio.accountSid,
    env.twilio.authToken,
  );

export const twilioVerifyServiceSid =
  env.twilio.verifyServiceSid;