import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY =
  "redom.device.id";

function generateDeviceId(): string {
  return [
    Date.now().toString(36),

    Math.random()
      .toString(36)
      .slice(2),

    Math.random()
      .toString(36)
      .slice(2),
  ].join("-");
}

export async function getDeviceId(): Promise<string> {
  const existing =
    await SecureStore.getItemAsync(
      DEVICE_ID_KEY,
    );

  if (existing) {
    return existing;
  }

  const deviceId =
    generateDeviceId();

  await SecureStore.setItemAsync(
    DEVICE_ID_KEY,
    deviceId,
  );

  return deviceId;
}