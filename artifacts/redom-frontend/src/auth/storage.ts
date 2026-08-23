import * as SecureStore from "expo-secure-store";

import type { AuthSession } from "./types";

const SESSION_KEY =
  "redom.auth.session";

export async function getStoredSession(): Promise<AuthSession | null> {
  try {
    const value =
      await SecureStore.getItemAsync(
        SESSION_KEY,
      );

    if (!value) {
      return null;
    }

    const parsed =
      JSON.parse(value) as Partial<AuthSession>;

    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      await clearStoredSession();
      return null;
    }

    return parsed as AuthSession;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function storeSession(
  session: AuthSession,
): Promise<void> {
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify(session),
    {
      keychainAccessible:
        SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(
    SESSION_KEY,
  );
}