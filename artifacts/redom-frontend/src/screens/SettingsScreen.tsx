import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type ReDomSettings } from "../product/productService";
import { useLanguage } from "../i18n/LanguageProvider";

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { languageName, t } = useLanguage();
  const [settings, setSettings] = useState<ReDomSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await productService.getSettings(); setSettings(r.settings); }, []);
  useEffect(() => { void load(); }, [load]);
  const update = async (key: keyof ReDomSettings, value: ReDomSettings[keyof ReDomSettings]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value }); setSaving(key);
    try { const r = await productService.updateSettings({ [key]: value }); setSettings(r.settings); } catch { setSettings(settings); } finally { setSaving(null); }
  };
  const policy = (slug: RootStackParamList["Policy"]["slug"]) => navigation.navigate("Policy", { slug });
  if (!settings) return <SafeAreaView style={styles.root}><View style={styles.center}><ActivityIndicator size="large" color="#1877F2" /></View></SafeAreaView>;
  return <SafeAreaView style={styles.root}><View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.headerTitle}>Settings & privacy</Text><View style={{ width: 32 }} /></View><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.sectionTitle}>Preferences</Text>
    <Row label="Dark mode" value={settings.theme === "dark"} onValueChange={(v) => void update("theme", v ? "dark" : "light")} busy={saving === "theme"} />
    <Row label="Following feed" value={settings.followingFeed} onValueChange={(v) => void update("followingFeed", v)} busy={saving === "followingFeed"} />
    <Row label="Political content" value={settings.politicalContent} onValueChange={(v) => void update("politicalContent", v)} busy={saving === "politicalContent"} />
    <Row label="Auto-translate posts" value={settings.autoTranslatePosts} onValueChange={(v) => void update("autoTranslatePosts", v)} busy={saving === "autoTranslatePosts"} />
    <Row label="Auto-translate comments" value={settings.autoTranslateComments} onValueChange={(v) => void update("autoTranslateComments", v)} busy={saving === "autoTranslateComments"} />
    <Link label={`${t("language")} · ${languageName}`} onPress={() => navigation.navigate("Language")} />
    <Text style={styles.sectionTitle}>Accessibility</Text>
    <Row label="Reduce motion" value={settings.reduceMotion} onValueChange={(v) => void update("reduceMotion", v)} busy={saving === "reduceMotion"} />
    <Row label="High contrast" value={settings.highContrast} onValueChange={(v) => void update("highContrast", v)} busy={saving === "highContrast"} />
    <Row label="Screen reader mode" value={settings.screenReaderMode} onValueChange={(v) => void update("screenReaderMode", v)} busy={saving === "screenReaderMode"} />
    <Text style={styles.sectionTitle}>Notifications & privacy</Text>
    <Link label="Notifications" onPress={() => navigation.navigate("NotificationSettings")} />
    <Link label="Privacy" onPress={() => navigation.navigate("PrivacySettings")} />
    <Link label="Security" onPress={() => navigation.navigate("SecuritySettings")} />
    <Link label="Linked devices" onPress={() => navigation.navigate("LinkedDevices")} />
    <Link label="Blocked people" onPress={() => navigation.navigate("BlockedUsers")} />
    <Text style={styles.sectionTitle}>Account & help</Text>
    <Link label="Verification" onPress={() => navigation.navigate("Verification")} />
    <Link label="Support & reporting" onPress={() => navigation.navigate("Support")} />
    <Link label="Terms of Use" onPress={() => policy("terms")} />
    <Link label="Privacy Policy" onPress={() => policy("privacy")} />
    <Link label="Community Standards" onPress={() => policy("community")} />
    <Link label="Messaging Policy" onPress={() => policy("messaging")} />
    <Link label="Notification Policy" onPress={() => policy("notifications")} />
    <Link label="Security Policy" onPress={() => policy("security")} />
    <Link label="AI Policy" onPress={() => policy("ai")} />
    <Link label="Regional Policy" onPress={() => policy("regional")} />
    <Link label="Refund Policy" onPress={() => policy("refunds")} />
  </ScrollView></SafeAreaView>;
}
function Row({ label, value, onValueChange, busy }: { label: string; value: boolean; onValueChange: (v: boolean) => void; busy: boolean }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Switch value={value} onValueChange={onValueChange} disabled={busy} trackColor={{ false: "#D9DDE3", true: "#9FC4FF" }} thumbColor={value ? "#1877F2" : "#FFF"} /></View>; }
function Link({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable style={styles.link} onPress={onPress}><Text style={styles.label}>{label}</Text><Text style={styles.chevron}>›</Text></Pressable>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F0F2F5" }, header: { height: 58, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, back: { fontSize: 38, color: "#1877F2" }, headerTitle: { fontSize: 19, fontWeight: "800", color: "#050505" }, content: { padding: 12, paddingBottom: 40 }, sectionTitle: { fontSize: 17, fontWeight: "800", color: "#050505", marginTop: 18, marginBottom: 8 }, row: { minHeight: 54, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, link: { minHeight: 54, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, label: { color: "#050505", fontSize: 15 }, chevron: { color: "#8A8D91", fontSize: 28 }, center: { flex: 1, alignItems: "center", justifyContent: "center" } });
