import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type PaymentTransactionDetails } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";

export function PaymentTransactionDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PaymentTransactionDetails">>();
  const { colors } = useTheme();
  const [transaction, setTransaction] = useState<PaymentTransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    ordersPaymentsService.transactionDetails(route.params.transactionId)
      .then((result) => {
        if (!active) return;
        setTransaction(result.transaction);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load transaction details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route.params.transactionId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
            <BackIcon width={25} height={25} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Transaction</Text>
          <View style={{ width: 25 }} />
        </View>
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Transaction unavailable</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error || "This transaction could not be found."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const status = displayStatus(transaction);
  const statusText = statusLabel(status);
  const total = formatMoney(transaction.totalAmountMinor, transaction.currency);
  const productName = transaction.productName;
  const providerReference = transaction.providerReference || transaction.reference;
  const transactionId = transaction.redomTransactionId || transaction.reference;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={25} height={25} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Transaction details</Text>
        <View style={{ width: 25 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.productHeader}>
          <View style={[styles.productIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.productIconText, { color: colors.primary }]}>R</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { color: colors.text }]}>{productName}</Text>
            <Text style={[styles.status, { color: statusColor(status, colors) }]}>{statusText}</Text>
            <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(transaction.paidAt || transaction.createdAt)}</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction details</Text>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <DetailRow label={productName} value={total} colors={colors} first />
          <DetailRow label="Subtotal" value={total} colors={colors} />
          <DetailRow label="Total" value={total} colors={colors} total />
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <InfoRow label="Transaction ID" value={transactionId} colors={colors} />
          <InfoRow label="Provider Reference" value={providerReference} colors={colors} />
          {transaction.refundStatus ? <InfoRow label="Refund status" value={refundStatusLabel(transaction.refundStatus)} colors={colors} /> : null}
          {transaction.failureMessage ? <InfoRow label="Reason" value={transaction.failureMessage} colors={colors} /> : null}
        </View>

        <Pressable
          onPress={() => navigation.navigate("MetaPaySupport")}
          style={[styles.help, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <View style={[styles.helpIcon, { borderColor: colors.text }]}>
            <Text style={[styles.helpQuestion, { color: colors.text }]}>?</Text>
          </View>
          <Text style={[styles.helpText, { color: colors.text }]}>Get help</Text>
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, colors, first = false, total = false }: { label: string; value: string; colors: any; first?: boolean; total?: boolean }) {
  return (
    <View style={[styles.detailRow, !first && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <Text style={[total ? styles.totalLabel : styles.detailLabel, { color: total ? colors.text : first ? colors.text : colors.textSecondary }]}>{label}</Text>
      <Text style={[total ? styles.totalValue : styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} selectable>{value}</Text>
    </View>
  );
}

function displayStatus(t: PaymentTransactionDetails): string {
  if (t.refundStatus === "processed") return "refunded";
  if (t.refundStatus === "pending" || t.refundStatus === "processing" || t.refundStatus === "needs-attention") return "refund_processing";
  if (t.refundStatus === "failed") return "refund_failed";
  return t.status;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    paid: "Completed",
    success: "Completed",
    refunded: "Refunded",
    refund_processing: "Refund under review",
    refund_failed: "Refund failed",
    failed: "Failed",
    abandoned: "Abandoned",
    reversed: "Reversed",
    pending: "Pending",
    ongoing: "Processing",
    processing: "Processing",
    initialized: "Payment started",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function refundStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Under review",
    processing: "Bank processing",
    "needs-attention": "Bank details required",
    failed: "Bank rejected",
    processed: "Refund successful",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function statusColor(status: string, colors: any): string {
  if (status === "failed" || status === "refund_failed" || status === "abandoned") return "#D93025";
  if (status === "refunded" || status === "paid" || status === "success") return "#188038";
  return colors.textSecondary;
}

function formatMoney(amountMinor: string, currency: string): string {
  const amount = Number(amountMinor) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return currency + amount.toFixed(2);
  }
}

function formatDate(value: string | null): string {
  try { return new Date(value || Date.now()).toLocaleString(); } catch { return ""; }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 58, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  headerTitle: { fontSize: 19, fontWeight: "800" },
  content: { padding: 30, paddingTop: 34, paddingBottom: 50 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, padding: 30, alignItems: "center", justifyContent: "center" },
  errorTitle: { fontSize: 21, fontWeight: "800", marginBottom: 8 },
  errorText: { fontSize: 15, textAlign: "center" },
  productHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 42 },
  productIcon: { width: 62, height: 62, borderRadius: 31, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  productIconText: { fontSize: 31, fontWeight: "900" },
  productName: { fontSize: 23, fontWeight: "700" },
  status: { fontSize: 17, fontWeight: "600", marginTop: 2 },
  date: { fontSize: 15, marginTop: 3 },
  sectionTitle: { fontSize: 24, fontWeight: "900", marginBottom: 22 },
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  detailRow: { minHeight: 76, paddingHorizontal: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  detailLabel: { fontSize: 18, flex: 1 },
  detailValue: { fontSize: 18, textAlign: "right" },
  totalLabel: { fontSize: 19, fontWeight: "800", flex: 1 },
  totalValue: { fontSize: 19, fontWeight: "800", textAlign: "right" },
  infoCard: { borderWidth: 1, borderRadius: 18, marginTop: 26, paddingHorizontal: 28 },
  infoRow: { paddingVertical: 19, borderBottomWidth: 1, borderBottomColor: "transparent" },
  infoLabel: { fontSize: 16, marginBottom: 5 },
  infoValue: { fontSize: 16, fontWeight: "600" },
  help: { minHeight: 74, borderWidth: 1, borderRadius: 18, marginTop: 26, paddingHorizontal: 28, flexDirection: "row", alignItems: "center", gap: 18 },
  helpIcon: { width: 31, height: 31, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  helpQuestion: { fontSize: 20, fontWeight: "800" },
  helpText: { flex: 1, fontSize: 18, fontWeight: "600" },
  chevron: { fontSize: 31, lineHeight: 31 },
});
