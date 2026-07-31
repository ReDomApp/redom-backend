import { z } from "zod";

const nameRegex =
  /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u;

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "First name must be at least 2 characters.")
    .max(100, "First name cannot exceed 100 characters.")
    .regex(
      nameRegex,
      "First name may only contain letters, spaces, apostrophes, and hyphens.",
    ),

  lastName: z
    .string()
    .trim()
    .min(2, "Last name must be at least 2 characters.")
    .max(100, "Last name cannot exceed 100 characters.")
    .regex(
      nameRegex,
      "Last name may only contain letters, spaces, apostrophes, and hyphens.",
    ),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255, "Email cannot exceed 255 characters.")
    .email("Please enter a valid email address."),

  phoneNumber: z
    .string()
    .trim()
    .min(7, "Please enter a valid phone number.")
    .max(20, "Please enter a valid phone number."),

  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required."),

  gender: z.enum(
    ["male", "female", "custom"],
    {
      error: "Please select a valid gender.",
    },
  ),

  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password cannot exceed 128 characters.")
    .regex(
      /[A-Za-z]/,
      "Password must contain at least one letter.",
    )
    .regex(
      /\d/,
      "Password must contain at least one number.",
    ),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address."),

  password: z
    .string()
    .min(1, "Password is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;