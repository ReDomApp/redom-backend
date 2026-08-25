import Constants from "expo-constants";

import { z } from "zod";

const environmentSchema =
  z.object({
    EXPO_PUBLIC_API_BASE_URL:
      z.string().url(),
  });

const extra =
  Constants.expoConfig?.extra ??
  {};

const rawEnvironment = {
  EXPO_PUBLIC_API_BASE_URL:
    process.env
      .EXPO_PUBLIC_API_BASE_URL ??
    extra.EXPO_PUBLIC_API_BASE_URL ??
    "https://redom-backend.onrender.com",
};

const parsed =
  environmentSchema.safeParse(
    rawEnvironment,
  );

if (!parsed.success) {
  throw new Error(
    `Invalid ReDom frontend environment: ${parsed.error.message}`,
  );
}

export const env = {
  apiBaseUrl:
    parsed.data
      .EXPO_PUBLIC_API_BASE_URL
      .replace(/\/+$/, ""),
} as const;