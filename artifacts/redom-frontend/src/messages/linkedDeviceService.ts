import { api } from "../api/client";

export interface LinkDeviceRequest {
  requestId: string;
  code: string;
  expiresAt: string;
}

export const linkedDeviceService = {
  start(deviceId: string, publicKey: string, deviceLabel?: string, platform?: string) {
    return api.post<{ success: boolean; requestId: string; code: string; expiresAt: string }>("/messages/crypto/link/start", {
      deviceId,
      publicKey,
      ...(deviceLabel ? { deviceLabel } : {}),
      ...(platform ? { platform } : {}),
    });
  },
  approve(code: string) {
    return api.post<{ success: boolean; deviceId: string; deviceLabel?: string | null; platform?: string | null; approved: boolean }>("/messages/crypto/link/approve", { code: code.trim().toUpperCase() });
  },
};
