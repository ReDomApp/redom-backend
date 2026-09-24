import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type OrderSummary } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";
import CartIcon from "../assets/home-feed/cart.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import SubscriptionsIcon from "../assets/home-feed/subscriptions.svg";
import SecurityIcon from "../assets/home-feed/security-controls.svg";
import HelpIcon from "../assets/home-feed/help-support.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

export function OrdersPaymentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void ordersPaymentsService.overview().then((r) => setOrders(r.orders)).catch(() => setOrders([])).finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={24} height={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Orders and payments</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("Cart")} accessibilityRole="button" accessibilityLabel="Cart" style={styles.headerButton}>
            <CartIcon width={24} height={24} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Menu" style={styles.headerButton}>
            <MenuIcon width={24} height={24} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.navigate("PaymentMethods")} style={[styles.payCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.payTitle, { color: colors.text }]}>ReDom Pay</Text>
          <Text style={[styles.payDescription, { color: colors.textSecondary }]}>
            Transactions, credit cards, debit cards, shipping info and supported payment providers
          </Text>
        </Pressable>

        <Text style={[styles.section, { color: colors.text }]}>Balances</Text>
        <Row label="ReDom Stars" Icon={StarsIcon} colors={colors} onPress={() => navigation.navigate("StarsActivity")} />

        <Text style={[styles.section, { color: colors.text }]}>Payment information</Text>
        <Row label="Subscriptions" Icon={SubscriptionsIcon} colors={colors} onPress={() => navigation.navigate("Subscriptions")} />

        <Text style={[styles.section, { color: colors.text }]}>Settings</Text>
        <Row label="Security and controls" Icon={SecurityIcon} colors={colors} onPress={() => navigation.navigate("PaymentSecurity")} />
        <Row label="Help" Icon={HelpIcon} colors={colors} onPress={() => navigation.navigate("Support")} />
        <Row label="Terms and privacy" Icon={TermsIcon} colors={colors} onPress={() => navigation.navigate("Policy", { slug: "payments" })} />

        {!loading && orders.length > 0 ? (
          <>
            <Text style={[styles.section, { color: colors.text }]}>Orders</Text>
            {orders.map((o) => (
              <View key={o.transactionId} style={[styles.order, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.orderTitle, { color: colors.text }]}>{o.title}</Text>
                <Text style={{ color: colors.textSecondary }}>Order {o.transactionId} · {o.orderStatus}</Text>
                <Text style={{ color: colors.textSecondary }}>{o.currency} {o.totalPrice}</Text>
              </View>
            ))}
          </>
        ) : null}
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, Icon, colors, onPress }: { label: string; Icon: ComponentType<{ width?: number; height?: number; color?: string }>; colors: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]} accessibilityRole="button">
      <Icon width={28} height={28} color={colors.text} />
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <ChevronIcon width={20} height={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  headerButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  back: { fontSize: 40, width: 42 },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: "800", textAlign: "center" },
  headerAction: { fontSize: 23, width: 42, textAlign: "right" },
  content: { padding: 16, paddingBottom: 40 },
  payCard: { borderWidth: 1, borderRadius: 16, padding: 18, minHeight: 140, elevation: 2 },
  payTitle: { fontSize: 23, fontWeight: "800" },
  payDescription: { fontSize: 15, lineHeight: 21, marginTop: 8 },
  section: { fontSize: 20, fontWeight: "800", marginTop: 28, marginBottom: 8 },
  row: { minHeight: 64, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 16 },
  
  label: { fontSize: 17, fontWeight: "600", flex: 1 },
  
  order: { padding: 14, borderWidth: 1, borderRadius: 12, marginTop: 8 },
  orderTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  loader: { marginTop: 18 },
});