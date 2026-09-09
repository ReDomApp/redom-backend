import { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LanguageProvider, useLanguage } from "./LanguageProvider";

/**
 * Single app-level language enforcement boundary.
 * No ReDom screen is rendered until the system/persisted language is resolved.
 */
function LanguageGate({ children }: { children: ReactNode }) {
  const { ready } = useLanguage();
  if (!ready) {
    return <View style={styles.loading}><ActivityIndicator /></View>;
  }
  return <>{children}</>;
}

export function LanguageContainer({ children }: { children: ReactNode }) {
  return <LanguageProvider><LanguageGate>{children}</LanguageGate></LanguageProvider>;
}

export { useLanguage } from "./LanguageProvider";
export { LANGUAGES } from "./LanguageProvider";
export type { LanguageCode } from "./language";

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" } });
