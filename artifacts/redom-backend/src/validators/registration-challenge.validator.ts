import { z } from "zod";

export const reserveRegistrationFlowSchema = z.object({
  deviceId: z.string().trim().min(1).max(255).optional(),
});

export const saveRegistrationFlowNameSchema = z.object({
  flowId: z.string().regex(/^\d{6,16}$/),
  deviceId: z.string().trim().min(1).max(255).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const saveRegistrationFlowBirthdaySchema = z.object({
  flowId: z.string().regex(/^\d{6,16}$/),
  deviceId: z.string().trim().min(1).max(255).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const saveRegistrationFlowGenderSchema = z.object({
  flowId: z.string().regex(/^\d{6,16}$/),
  deviceId: z.string().trim().min(1).max(255).optional(),
  gender: z.enum(["female", "male", "custom"]),
  pronouns: z.enum(["She / Her", "He / Him", "They / Them", "Prefer not to say"]).optional(),
});

export const saveRegistrationFlowPhoneSchema = z.object({
  flowId: z.string().regex(/^\d{6,16}$/),
  deviceId: z.string().trim().min(1).max(255).optional(),
  // Keep syntactically short E.164-like input valid long enough for Twilio Basic Lookup
  // to return the authoritative TOO_SHORT / INVALID_LENGTH result instead of Zod leaking
  // an internal validation object to Screen 4.
  phoneNumber: z.string().regex(/^\+[1-9]\d{4,14}$/),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  deviceRegion: z.string().regex(/^[A-Z]{2}$/).optional(),
  timeZone: z.string().trim().min(1).max(120).optional(),
});

export const startRegistrationChallengeSchema = z.object({
  contactType: z.enum(["phone", "email"]),
  target: z.string().trim().min(1).max(255),
  reservationId: z.string().uuid().optional(),
  flowId: z.string().regex(/^\d{6,16}$/).optional(),
  deviceId: z.string().trim().min(1).max(255).optional(),
});

export const saveRegistrationStepSchema = z.object({
  step: z.enum(["contact", "identity", "username", "profile", "password", "review"]),
  data: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    dateOfBirth: z.string().optional(),
    gender: z.enum(["male", "female", "custom"]).optional(),
    password: z.string().optional(),
  }).default({}),
});

export const completeRegistrationChallengeSchema = z.object({
  submitted: z.object({ email: z.string().optional(), phoneNumber: z.string().optional() }).optional(),
});

export const verifyRegistrationChallengeSchema = z.object({
  verificationChallengeId: z.string().uuid(),
  code: z.string().trim().min(1).max(15),
});
