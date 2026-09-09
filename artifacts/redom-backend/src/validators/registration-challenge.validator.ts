import { z } from "zod";

export const startRegistrationChallengeSchema = z.object({
  contactType: z.enum(["phone", "email"]),
  target: z.string().trim().min(1).max(255),
});

export const saveRegistrationStepSchema = z.object({
  step: z.enum([
    "contact",
    "identity",
    "username",
    "profile",
    "password",
    "review",
  ]),
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
  submitted: z.object({
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
  }).optional(),
});

export const verifyRegistrationChallengeSchema = z.object({
  verificationChallengeId: z.string().uuid(),
  code: z.string().trim().min(1).max(15),
});
