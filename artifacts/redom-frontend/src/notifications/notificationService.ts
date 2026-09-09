import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const CHANNEL_ID = "redom-default";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationPermission() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "ReDom",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      sound: null,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function showReDomNotification(title: string, body: string, data?: Record<string, string>) {
  try {
    if (!(await ensureNotificationPermission())) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function notifyRegistrationFlow(flowId: string, body: string) {
  const masked = `${flowId.slice(0, 4)}••••`;
  return showReDomNotification("ReDom", body.replace("{flowId}", masked), { type: "registration-flow", flowId: masked });
}

export async function notifyLanguageUpdated(title: string, body: string) {
  return showReDomNotification(title, body, { type: "language-updated" });
}
