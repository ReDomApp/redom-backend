import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type ReDomNotification } from "../product/productService";

function destination(n: ReDomNotification): keyof RootStackParamList | null {
  if (n.notificationType.includes("message")) return "Messages";
  if (n.notificationType.includes("security")) return "SecuritySettings";
  if (n.notificationType.includes("verification")) return "Verification";
  if (n.notificationType.includes("support")) return "Support";
  if (n.notificationType.includes("profile")) return "Profile";
  return null;
}

export function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<ReDomNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const r = await productService.getNotifications(); setItems(r.notifications); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const open = async (item: ReDomNotification) => {
    if (item.unread) { setItems((current) => current.map((n) => n.id === item.id ? { ...n, unread: false } : n)); await productService.markNotificationRead(item.id).catch(() => undefined); }
    const target = destination(item);
    if (target === "Messages") navigation.navigate("Messages");
    else if (target === "SecuritySettings") navigation.navigate("SecuritySettings");
    else if (target === "Verification") navigation.navigate("Verification");
    else if (target === "Support") navigation.navigate("Support");
    else if (target === "Profile") navigation.navigate("Profile");
  };
  return <SafeAreaView style={styles.root}><View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Notifications</Text><Pressable onPress={() => void productService.markAllNotificationsRead().then(load)}><Text style={styles.readAll}>Read all</Text></Pressable></View>{loading && !items.length ? <View style={styles.center}><ActivityIndicator size="large" color="#1877F2" /></View> : <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={styles.list}>{items.map((item) => <Pressable key={item.id} onPress={() => void open(item)} style={[styles.item, item.unread && styles.unread]}><View style={styles.dot}>{item.unread ? <View style={styles.dotInner} /> : null}</View><View style={styles.copy}><Text style={styles.itemTitle}>{item.title || "ReDom notification"}</Text><Text style={styles.body}>{item.body || ""}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text></View></Pressable>)}{!items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>You're all caught up</Text><Text style={styles.body}>New ReDom activity will appear here.</Text></View> : null}</ScrollView>}</SafeAreaView>;
}
function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, header: { height: 58, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, back: { fontSize: 38, color: "#1877F2" }, title: { fontSize: 19, fontWeight: "800", color: colors.text }, readAll: { color: "#1877F2", fontWeight: "700" }, list: { padding: 10 }, item: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8 }, unread: { backgroundColor: "#EEF5FF" }, dot: { width: 12, alignItems: "center", paddingTop: 5 }, dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1877F2" }, copy: { flex: 1, marginLeft: 10 }, itemTitle: { fontSize: 15, fontWeight: "700", color: colors.text }, body: { marginTop: 3, fontSize: 14, lineHeight: 20, color: colors.textSecondary }, time: { marginTop: 6, fontSize: 11, color: colors.textSecondary }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, empty: { alignItems: "center", paddingTop: 80 }, emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 6 } }); }

