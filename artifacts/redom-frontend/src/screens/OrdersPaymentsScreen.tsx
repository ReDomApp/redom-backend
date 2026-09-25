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
  const [stars, setStars] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([ordersPaymentsService.overview(), ordersPaymentsService.starsActivity()])
      .then(([overview, starsResult]) => {
        if (!active) return;
        setOrders(overview.orders);
        setStars(starsResult.balance);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
        <Pressable onPress={() => navigation.navigate("ReDomPay")} style={[styles.payCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.payTitle, { color: colors.text }]}>ReDom Pay</Text>
          <Text style={[styles.payDescription, { color: colors.textSecondary }]}>
            Transactions, payment methods, addresses, security, currency, support and payment terms.
          </Text>
          <View style={styles.cardLink}>
            <Text style={[styles.cardLinkText, { color: colors.primary }]}>Open ReDom Pay</Text>
            <ChevronIcon width={20} height={20} />
          </View>
        </Pressable>

        <Text style={[styles.section, { color: colors.text }]}>Balances</Text>
        <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StarsIcon width={34} height={34} color={colors.text} />
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
        <Row label="Add payment method" colors={colors} onPress={() => navigation.navigate("PaymentMethods")} />
        <Row label="Subscriptions" Icon={SubscriptionsIcon} colors={colors} onPress={() => navigation.navigate("Subscriptions")} />

        <Text style={[styles.section, { color: colors.text }]}>Manage</Text>
        <Row label="Shipping and billing addresses" colors={colors} onPress={() => navigation.navigate("PaymentAddresses")} />
        <Row label="Email" colors={colors} onPress={() => navigation.navigate("EditProfile")} />
        <Row label="Phone" colors={colors} onPress={() => navigation.navigate("EditProfile")} />
        <Row label="Security and payment PIN" Icon={SecurityIcon} colors={colors} onPress={() => navigation.navigate("PaymentSecurity")} />
        <Row label="Currency" colors={colors} onPress={() => navigation.navigate("SelectCurrency")} />
        <Row label="Help" Icon={HelpIcon} colors={colors} onPress={() => navigation.navigate("MetaPaySupport")} />
        <Row label="Terms and privacy" Icon={TermsIcon} colors={colors} onPress={() => navigation.navigate("Policy", { slug: "payments" })} />

        <Text style={[styles.section, { color: colors.text }]}>Orders</Text>
        {loading ? <ActivityIndicator color={colors.primary} /> : orders.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No marketplace orders yet.</Text>
        ) : orders.map((o) => (
          <View key={o.transactionId} style={[styles.order, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.orderTitle, { color: colors.text }]}>{o.title}</Text>
            <Text style={{ color: colors.textSecondary }}>{o.currency} {o.totalPrice}</Text>
            <Text style={{ color: colors.textSecondary }}>{o.orderStatus} · {o.transactionId}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
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
  payCard: { borderWidth: 1, borderRadius: 17, padding: 18 },
  payTitle: { fontSize: 24, fontWeight: "900" },
  payDescription: { fontSize: 15, lineHeight: 21, marginTop: 7 },
  cardLink: { flexDirection: "row", alignItems: "center", marginTop: 15 },
  cardLinkText: { fontSize: 16, fontWeight: "800", flex: 1 },
  section: { fontSize: 21, fontWeight: "900", marginTop: 28, marginBottom: 8 },
  balanceCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  balanceInfo: { flex: 1 },
  balanceTitle: { fontSize: 17, fontWeight: "800" },
  balanceSub: { fontSize: 13, marginTop: 3 },
  buyButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  buyText: { color: "#fff", fontWeight: "800" },
  row: { minHeight: 62, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  iconPlaceholder: { width: 27, height: 27 },
  label: { fontSize: 17, fontWeight: "600", flex: 1 },
  order: { padding: 14, borderWidth: 1, borderRadius: 12, marginTop: 8 },
  orderTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  empty: { fontSize: 16, paddingVertical: 15 },
});
