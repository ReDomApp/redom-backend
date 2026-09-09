import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  children: ReactNode;
  footer?: ReactNode;
  keyboardAvoiding?: boolean;
  scroll?: boolean;
};

export function ReDomScreen({ children, footer, keyboardAvoiding = true, scroll = true }: Props) {
  const { width } = useWindowDimensions();
  const horizontalPadding = Math.min(28, Math.max(16, Math.round(width * 0.055)));

  const body = scroll ? (
    <ScrollView
      style={styles.body}
      contentContainerStyle={[styles.bodyContent, { paddingHorizontal: horizontalPadding }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, { paddingHorizontal: horizontalPadding }]}>{children}</View>
  );

  const screen = (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.main}>{body}</View>
      {footer ? <View style={[styles.footer, { paddingHorizontal: horizontalPadding }]}>{footer}</View> : null}
    </SafeAreaView>
  );

  return keyboardAvoiding ? (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {screen}
    </KeyboardAvoidingView>
  ) : screen;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, width: "100%", backgroundColor: "#FFFFFF" },
  main: { flex: 1, width: "100%" },
  body: { flex: 1, width: "100%" },
  bodyContent: { flexGrow: 1, width: "100%", paddingVertical: 24 },
  footer: { width: "100%", flexShrink: 0, paddingTop: 10, paddingBottom: 12, backgroundColor: "#FFFFFF" },
});
