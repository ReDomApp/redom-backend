import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type ReDomSettings } from "../product/productService";
import { useLanguage } from "../i18n/LanguageProvider";
import BackIcon from "../assets/navigation/back.svg";

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { languageName, t } = useLanguage();
  const [settings, setSettings] = useState<ReDomSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await productService.getSettings();
      setSettings(r.settings);
    } catch {
      Alert.alert("Settings", "Unable to load your settings. Please try again.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async <K extends keyof ReDomSettings>(key: K, value: ReDomSettings[K]) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(String(key));
    try {
      const r = await productService.updateSettings({ [key]: value });
      setSettings(r.settings);
    } catch {
      setSettings(previous);
      Alert.alert("Settings", "That setting could not be saved. Your previous value was restored.");
    } finally {
      setSaving(null);
    }
  };

  const cycle = <K extends keyof ReDomSettings>(key: K, values: ReDomSettings[K][]) => {
    if (!settings) return;
    const current = settings[key];
    const index = values.indexOf(current);
    const next = values[(index + 1) % values.length];
    void update(key, next);
  };

  if (!settings) {
    return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color="#1877F2" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Go back">
          <BackIcon width={24} height={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Account preferences</Text>
        <Link label="Language" value={languageName} onPress={() => navigation.navigate("Language")} />
        <Link label="Dark mode" value={settings.theme === "system" ? "Use device setting" : settings.theme === "dark" ? "On" : "Off"} onPress={() => navigation.navigate("DarkMode")} />

        <Text style={styles.sectionTitle}>Feed and content</Text>
        <Toggle label="Following feed" value={settings.followingFeed} busy={saving === "followingFeed"} onChange={(v) => void update("followingFeed", v)} />
        <Toggle label="Political content" value={settings.politicalContent} busy={saving === "politicalContent"} onChange={(v) => void update("politicalContent", v)} />
        <Toggle label="Auto-translate posts" value={settings.autoTranslatePosts} busy={saving === "autoTranslatePosts"} onChange={(v) => void update("autoTranslatePosts", v)} />
        <Toggle label="Auto-translate comments" value={settings.autoTranslateComments} busy={saving === "autoTranslateComments"} onChange={(v) => void update("autoTranslateComments", v)} />
        <Choice label="Following feed snooze" value={settings.followingFeedSnooze} busy={saving === "followingFeedSnooze"} onPress={() => cycle("followingFeedSnooze", ["off", "1h", "4h", "1d"])} />
        <Choice label="Sensitive content" value={settings.sensitiveContent} busy={saving === "sensitiveContent"} onPress={() => cycle("sensitiveContent", ["standard", "less", "more"])} />
        <Choice label="Video autoplay" value={settings.autoplayVideos} busy={saving === "autoplayVideos"} onPress={() => cycle("autoplayVideos", ["always", "wifi", "never"])} />

        <Text style={styles.sectionTitle}>Accessibility</Text>
        <Choice label="Text size" value={settings.fontSize} busy={saving === "fontSize"} onPress={() => cycle("fontSize", ["small", "medium", "large"])} />
        <Toggle label="Reduce motion" value={settings.reduceMotion} busy={saving === "reduceMotion"} onChange={(v) => void update("reduceMotion", v)} />
        <Toggle label="High contrast" value={settings.highContrast} busy={saving === "highContrast"} onChange={(v) => void update("highContrast", v)} />
        <Toggle label="Screen reader mode" value={settings.screenReaderMode} busy={saving === "screenReaderMode"} onChange={(v) => void update("screenReaderMode", v)} />
        <Choice label="Captions" value={settings.captions} busy={saving === "captions"} onPress={() => cycle("captions", ["off", "on", "auto"])} />

        <Text style={styles.sectionTitle}>Privacy and profile</Text>
        <Toggle label="Show join date on profile" value={settings.showJoinDate} busy={saving === "showJoinDate"} onChange={(v) => void update("showJoinDate", v)} />
        <Link label="Privacy Center" value="Under Development" disabled onPress={() => {}} />
        <Link label="Time management" value="Under Development" disabled onPress={() => {}} />

        <Text style={styles.sectionTitle}>Notifications & security</Text>
        <Link label="Notifications" onPress={() => navigation.navigate("NotificationSettings")} />
        <Link label="Privacy" onPress={() => navigation.navigate("PrivacySettings")} />
        <Link label="Security" onPress={() => navigation.navigate("SecuritySettings")} />
        <Link label="Linked devices" onPress={() => navigation.navigate("LinkedDevices")} />
        <Link label="Blocked people" onPress={() => navigation.navigate("BlockedUsers")} />

        <Text style={styles.sectionTitle}>Account & help</Text>
        <Link label={t("language") + " policy"} onPress={() => navigation.navigate("Policy", { slug: "language" })} />
        <Link label="Verification" onPress={() => navigation.navigate("Verification")} />
        <Link label="Support & reporting" onPress={() => navigation.navigate("Support")} />
        <Link label="Terms of Use" onPress={() => navigation.navigate("Policy", { slug: "terms" })} />
        <Link label="Privacy Policy" onPress={() => navigation.navigate("Policy", { slug: "privacy" })} />
        <Link label="Community Standards" onPress={() => navigation.navigate("Policy", { slug: "community" })} />
        <Link label="Security Policy" onPress={() => navigation.navigate("Policy", { slug: "security" })} />
        <Link label="Refund Policy" onPress={() => navigation.navigate("Policy", { slug: "refunds" })} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ label, value, onChange, busy }: { label: string; value: boolean; onChange: (v: boolean) => void; busy: boolean }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={onChange} disabled={busy} trackColor={{ false: "#D9DDE3", true: "#9FC4FF" }} thumbColor={value ? "#1877F2" : "#FFF"} /></View>;
}

function Choice({ label, value, onPress, busy }: { label: string; value: string; onPress: () => void; busy: boolean }) {
  return <Pressable style={styles.link} onPress={onPress} disabled={busy}><Text style={styles.label}>{label}</Text><View style={styles.valueWrap}><Text style={styles.value}>{busy ? "Saving…" : value}</Text><Text style={styles.chevron}>›</Text></View></Pressable>;
}

function Link({ label, value, onPress, disabled = false }: { label: string; value?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={[styles.link, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><Text style={styles.label}>{label}</Text><View style={styles.valueWrap}>{value ? <Text style={[styles.value, disabled && styles.devText]}>{value}</Text> : null}{!disabled ? <Text style={styles.chevron}>›</Text> : null}</View></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F2F5" },
  header: { height: 58, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 19, fontWeight: "800", color: "#050505" },
  content: { padding: 12, paddingBottom: 44 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#050505", marginTop: 20, marginBottom: 8 },
  row: { minHeight: 54, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { minHeight: 54, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: "#050505", fontSize: 15, flex: 1 },
  valueWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  value: { color: "#65676B", fontSize: 14, textTransform: "capitalize" },
  devText: { color: "#8A8D91", fontWeight: "700" },
  chevron: { color: "#8A8D91", fontSize: 28, lineHeight: 30 },
  disabled: { opacity: 0.9 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});