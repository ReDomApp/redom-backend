import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type OrderSummary, type PaymentTransactionSummary } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";
import CartIcon from "../assets/home-feed/cart.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import SubscriptionsIcon from "../assets/home-feed/subscriptions.svg";
import SecurityIcon from "../assets/home-feed/security-controls.svg";
import HelpIcon from "../assets/home-feed/help-support.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

type TransactionTab = "all" | "money_transfer" | "orders" | "donations";

export function OrdersPaymentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [tab, setTab] = useState<TransactionTab>("all");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [payments, setPayments] = useState<PaymentTransactionSummary[]>([]);
  const [stars, setStars] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([ordersPaymentsService.overview(), ordersPaymentsService.starsActivity()])
      .then(([overview, starsResult]) => {
        if (!active) return;
        setOrders(overview.orders);
        setPayments(overview.payments);
        setStars(starsResult.balance);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visiblePayments = useMemo(() => payments.filter((p) => {
    const purpose = p.purpose.toLowerCase();
    if (tab === "all") return true;
    if (tab === "money_transfer") return ["money_transfer", "transfer", "p2p_transfer"].includes(purpose);
    if (tab === "donations") return ["donation", "donations"].includes(purpose);
    return ["order", "marketplace_order", "stars_purchase", "subscription", "subscription_renewal", "payment_method_setup"].includes(purpose);
  }), [payments, tab]);

  const visibleOrders = tab === "all" || tab === "orders" ? orders : [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={24} height={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Orders and payments</Text>
        <Pressable onPress={() => navigation.navigate("Cart")} accessibilityRole="button" accessibilityLabel="Cart">
          <CartIcon width={24} height={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: colors.text, marginTop: 0 }]}>Transactions</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {([["all", "All"], ["money_transfer", "Money transfer"], ["orders", "Orders"], ["donations", "Donations"]] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, { backgroundColor: tab === key ? colors.primary : colors.surface, borderColor: tab === key ? colors.primary : colors.border }]}>
              <Text style={{ color: tab === key ? "#fff" : colors.text, fontWeight: "800" }}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : visibleOrders.length === 0 && visiblePayments.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No transactions in this section yet.</Text>
        ) : (
          <>
            {visiblePayments.map((p) => (
              <Pressable key={"payment-" + p.id} onPress={() => navigation.navigate("PaymentTransactionDetails", { transactionId: p.id })} style={[styles.transaction, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={"View " + purposeLabel(p.purpose) + " transaction"}>
                <Text style={[styles.transactionTitle, { color: colors.text }]}>{purposeLabel(p.purpose)}</Text>
                <Text style={{ color: colors.textSecondary }}>{p.currency} {(Number(p.amountMinor) / 100).toFixed(2)} · {p.status}</Text>
                <Text style={{ color: colors.textSecondary }}>{p.redomTransactionId || p.reference}</Text>
              </Pressable>
            ))}
            {visibleOrders.map((o) => (
              <View key={"order-" + o.transactionId} style={[styles.transaction, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.transactionTitle, { color: colors.text }]}>{o.title}</Text>
                <Text style={{ color: colors.textSecondary }}>Order · {o.currency} {o.totalPrice}</Text>
                <Text style={{ color: colors.textSecondary }}>{o.orderStatus} · {o.transactionId}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.section, { color: colors.text }]}>Balances</Text>
        <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StarsIcon width={32} height={32} color={colors.text} />
          <View style={styles.balanceInfo}>
            <Text style={[styles.balanceTitle, { color: colors.text }]}>ReDom Stars</Text>
            <Text style={[styles.balanceSub, { color: colors.textSecondary }]}>{stars.toLocaleString()} Stars available</Text>
          </View>
          <Pressable onPress={() => navigation.navigate("BuyStars")} style={[styles.buyButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.buyText}>Buy Stars</Text>
          </Pressable>
        </View>
        <Row label="Stars activity" Icon={StarsIcon} colors={colors} onPress={() => navigation.navigate("StarsActivity")} />

        <Text style={[styles.section, { color: colors.text }]}>Payment information</Text>
        <Row label="Payment methods" colors={colors} onPress={() => navigation.navigate("PaymentMethods")} />
        <Row label="Add payment method" colors={colors} onPress={() => navigation.navigate("AddPaymentMethod")} />
        <Row label="Subscriptions" Icon={SubscriptionsIcon} colors={colors} onPress={() => navigation.navigate("Subscriptions")} />

        <Text style={[styles.section, { color: colors.text }]}>Manage</Text>
        <Row label="Shipping and billing addresses" colors={colors} onPress={() => navigation.navigate("PaymentAddresses")} />
        <Row label="Email" colors={colors} onPress={() => navigation.navigate("EditProfile")} />
        <Row label="Phone" colors={colors} onPress={() => navigation.navigate("EditProfile")} />
        <Row label="Security and payment PIN" Icon={SecurityIcon} colors={colors} onPress={() => navigation.navigate("PaymentSecurity")} />
        <Row label="Currency" colors={colors} onPress={() => navigation.navigate("SelectCurrency")} />
        <Row label="Help" Icon={HelpIcon} colors={colors} onPress={() => navigation.navigate("MetaPaySupport")} />
        <Row label="Terms and privacy" Icon={TermsIcon} colors={colors} onPress={() => navigation.navigate("Policy", { slug: "payments" })} />

      </ScrollView>
    </SafeAreaView>
  );
}

function purposeLabel(purpose: string): string {
  const labels: Record<string, string> = {
    stars_purchase: "ReDom Stars purchase",
    subscription: "Subscription",
    subscription_renewal: "Subscription renewal",
    donation: "Donation",
    donations: "Donation",
    money_transfer: "Money transfer",
    transfer: "Money transfer",
    p2p_transfer: "Money transfer",
    payment_method_setup: "Payment method verification",
  };
  return labels[purpose] || "Payment";
}

function Row({ label, Icon, colors, onPress }: { label: string; Icon?: ComponentType<{ width?: number; height?: number; color?: string }>; colors: any; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]} accessibilityRole="button">
      {Icon ? <Icon width={27} height={27} color={colors.text} /> : <View style={styles.iconPlaceholder} />}
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <ChevronIcon width={20} height={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  headerTitle: { fontSize: 19, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 50 },
  section: { fontSize: 21, fontWeight: "900", marginTop: 28, marginBottom: 8 },
  tabs: { gap: 8, paddingBottom: 8 },
  tab: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22, borderWidth: 1 },
  loader: { marginTop: 20 },
  empty: { fontSize: 16, paddingVertical: 18 },
  transaction: { padding: 14, borderWidth: 1, borderRadius: 13, marginTop: 8 },
  transactionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  balanceCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  balanceInfo: { flex: 1 },
  balanceTitle: { fontSize: 17, fontWeight: "800" },
  balanceSub: { fontSize: 13, marginTop: 3 },
  buyButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  buyText: { color: "#fff", fontWeight: "800" },
  row: { minHeight: 62, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  iconPlaceholder: { width: 27, height: 27 },
  label: { fontSize: 17, fontWeight: "600", flex: 1 },
});
