import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid) {
  throw new Error("TWILIO_ACCOUNT_SID is missing.");
}

if (!authToken) {
  throw new Error("TWILIO_AUTH_TOKEN is missing.");
}

if (!verifyServiceSid) {
  throw new Error("TWILIO_VERIFY_SERVICE_SID is missing.");
}

export const twilioClient = Twilio(
  accountSid,
  authToken,
);

export const twilioVerifyServiceSid =
  verifyServiceSid;