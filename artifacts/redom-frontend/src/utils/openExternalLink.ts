import { Linking } from "react-native";
import { linkHistoryService } from "../linkHistory/linkHistoryService";

export async function openExternalLink(url: string, title?: string, source?: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) {
    try { return await Linking.openURL(url); } catch { return false; }
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await linkHistoryService.record({ url, title: title ?? null, source: source ?? "app" }).catch(() => undefined);
    await Linking.openURL(url);
    return true;
  } catch { return false; }
}
