import { z } from "zod";

import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "../utils/usernameGenerator";

const nameRegex =
  /^[\p{L}]+(?:[ '-][\p{L}]+)*$/u;

const usernameRegex =
  /^@?[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/;

export const registerSchema =
  z
    .object({
      firstName: z
        .string()
        .trim()
        .min(
          2,
          "First name must be at least 2 characters.",
        )
        .max(
          100,
          "First name cannot exceed 100 characters.",
        )
        .regex(
          nameRegex,
          "First name may only contain letters, spaces, apostrophes, and hyphens.",
        ),

      lastName: z
        .string()
        .trim()
        .min(
          2,
          "Last name must be at least 2 characters.",
        )
        .max(
          100,
          "Last name cannot exceed 100 characters.",
        )
        .regex(
          nameRegex,
          "Last name may only contain letters, spaces, apostrophes, and hyphens.",
        ),

      username: z
        .string()
        .trim()
        .min(
          USERNAME_MIN_LENGTH,
        )
        .max(
          USERNAME_MAX_LENGTH,
        )
        .regex(
          usernameRegex,
          "Username contains unsupported characters.",
        ),

      email: z
        .string()
        .trim()
        .toLowerCase()
        .max(
          255,
          "Email cannot exceed 255 characters.",
        )
        .email(
          "Please enter a valid email address.",
        )
        .optional()
        .or(
          z.literal(""),
        ),

      phoneNumber: z
        .string()
        .trim()
        .max(
          20,
          "Phone number cannot exceed 20 characters.",
        )
        .optional()
        .or(
          z.literal(""),
        ),

      dateOfBirth: z
        .string()
        .min(
          1,
          "Date of birth is required.",
        ),

      gender: z.enum(
        [
          "male",
          "female",
          "custom",
        ],
        {
          error:
            "Please select a valid gender.",
        },
      ),

      password: z
        .string()
        .min(
          6,
          "Password must be at least 6 characters.",
        )
        .max(
          128,
          "Password cannot exceed 128 characters.",
        )
        .regex(
          /[A-Za-z]/,
          "Password must contain at least one letter.",
        )
        .regex(
          /\d/,
          "Password must contain at least one number.",
        ),
    })
    .superRefine(
      (
        data,
        context,
      ) => {
        const hasEmail =
          !!data.email &&
          data.email.length >
            0;

        const hasPhone =
          !!data.phoneNumber &&
          data.phoneNumber.length >
            0;

        if (
          !hasEmail &&
          !hasPhone
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode
                .custom,

            path: [
              "email",
            ],

            message:
              "Provide an email address or phone number.",
          });
        }
      },
    );

export const loginSchema =
  z.object({
    identifier: z
      .string()
      .trim()
      .min(
        1,
        "Login identifier is required.",
      ),

    password: z
      .string()
      .min(
        1,
        "Password is required.",
      ),
  });

export type RegisterInput =
  z.infer<
    typeof registerSchema
  >;

export type LoginInput =
  z.infer<
    typeof loginSchema
  >;