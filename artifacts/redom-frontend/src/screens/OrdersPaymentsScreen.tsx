import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type OrderSummary } from "../services/ordersPaymentsService";

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
          <Text style={[styles.back, { color: colors.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Orders and payments</Text>
        <Pressable onPress={() => navigation.navigate("Cart")} accessibilityRole="button" accessibilityLabel="Cart">
          <Text style={[styles.headerAction, { color: colors.text }]}>🛒</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.navigate("MetaPaySupport")} style={[styles.payCard, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.payTitle, { color: colors.text }]}>ReDom Pay</Text>
          <Text style={[styles.payDescription, { color: colors.textSecondary }]}>
            Transactions, credit cards, debit cards, shipping info and supported payment providers
          </Text>
        </Pressable>

        <Text style={[styles.section, { color: colors.text }]}>Balances</Text>
        <Row label="ReDom Stars" icon="☆" colors={colors} onPress={() => navigation.navigate("StarsActivity")} />

        <Text style={[styles.section, { color: colors.text }]}>Payment information</Text>
        <Row label="Subscriptions" icon="▣" colors={colors} onPress={() => navigation.navigate("Subscriptions")} />

        <Text style={[styles.section, { color: colors.text }]}>Settings</Text>
        <Row label="Security and controls" icon="♢" colors={colors} onPress={() => navigation.navigate("PaymentSecurity")} />
        <Row label="Help" icon="?" colors={colors} onPress={() => navigation.navigate("Support")} />
        <Row label="Terms and privacy" icon="▤" colors={colors} onPress={() => navigation.navigate("Policy", { slug: "payments" })} />

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

function Row({ label, icon, colors, onPress }: { label: string; icon: string; colors: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]} accessibilityRole="button">
      <Text style={[styles.icon, { color: colors.text }]}>{icon}</Text>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  back: { fontSize: 40, width: 42 },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: "800", textAlign: "center" },
  headerAction: { fontSize: 23, width: 42, textAlign: "right" },
  content: { padding: 16, paddingBottom: 40 },
  payCard: { borderWidth: 1, borderRadius: 16, padding: 18, minHeight: 140, elevation: 2 },
  payTitle: { fontSize: 23, fontWeight: "800" },
  payDescription: { fontSize: 15, lineHeight: 21, marginTop: 8 },
  section: { fontSize: 20, fontWeight: "800", marginTop: 28, marginBottom: 8 },
  row: { minHeight: 64, borderBottomWidth: 1, flexDirection: "row", alignItems: "center" },
  icon: { fontSize: 29, width: 48 },
  label: { fontSize: 17, fontWeight: "600", flex: 1 },
  chevron: { fontSize: 30 },
  order: { padding: 14, borderWidth: 1, borderRadius: 12, marginTop: 8 },
  orderTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  loader: { marginTop: 18 },
});