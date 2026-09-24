import * as SecureStore from "expo-secure-store";
import type { AuthSession, AuthUser } from "./types";

export interface DeviceAccount {
  user: AuthUser;
  session: AuthSession;
  addedAt: string;
}

const KEY = "redom.device.accounts";

async function read(): Promise<DeviceAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.user?.id && item?.session?.refreshToken) as DeviceAccount[];
  } catch {
    return [];
  }
}

async function write(accounts: DeviceAccount[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(accounts.slice(0, 8)), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getDeviceAccounts(): Promise<DeviceAccount[]> {
  return read();
}

export async function rememberDeviceAccount(user: AuthUser, session: AuthSession): Promise<void> {
  const accounts = await read();
  const next = [{ user, session, addedAt: new Date().toISOString() }, ...accounts.filter((item) => item.user.id !== user.id)];
  await write(next);
}

export async function removeDeviceAccount(userId: string): Promise<void> {
  await write((await read()).filter((item) => item.user.id !== userId));
}
