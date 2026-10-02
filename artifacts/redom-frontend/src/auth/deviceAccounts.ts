import type { AuthSession, AuthUser } from "./types";
import { api } from "../api/client";
import { getDeviceId } from "../utils/device";

export interface DeviceAccount {
  user: AuthUser & { profilePhoto?: string | null; displayName?: string };
  addedAt: string;
}

export async function getDeviceAccounts(): Promise<DeviceAccount[]> {
  const deviceCredential = await getDeviceId();
  const response = await api.post<{ success: boolean; accounts: DeviceAccount[] }>("/auth/device/recognized", {
    method: "POST",
    body: JSON.stringify({
      deviceCredential,
      deviceType: "mobile",
      platform: "react-native",
      deviceName: "ReDom Mobile",
    }),
  });
  return response.accounts || [];
}

export async function rememberDeviceAccount(user: AuthUser, _session: AuthSession): Promise<void> {
  // The backend creates/reactivates the device-account association after a
  // password + device/2FA authenticated login. No local session copy is used
  // as proof of recognition.
  void user;
}

export async function removeDeviceAccount(userId: string): Promise<void> {
  const deviceCredential = await getDeviceId();
  await api.delete(`/auth/device/recognized/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    body: JSON.stringify({ deviceCredential }),
  });
}
