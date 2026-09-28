import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type ReDomPayTransaction } from "../services/ordersPaymentsService";

import BackIcon from "../assets/navigation/back.svg";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Filter = "all" | "money_transfer" | "orders" | "donations" | "cards";

const filters: Array<[Filter, string]> = [
  ["all", "All"],
  ["money_transfer", "Money transfer"],
  ["orders", "Orders"],
  ["donations", "Donations"],
  ["cards", "Cards"],
];

export function ReDomPayTransactionsScreen() {
  const navigation = useNavigation<Navigation>();
  const [selected, setSelected] = useState<Filter>("all");
  const [transactions, setTransactions] = useState<ReDomPayTransaction[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    ordersPaymentsService.redomPayTransactions()
      .then((result) => { if (active) setTransactions(result.transactions); })
      .catch(() => { if (active) setTransactions([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const filtered = selected === "all"
      ? transactions
      : transactions.filter((item) => item.category === selected);
    return expanded ? filtered : filtered.slice(0, 2);
  }, [expanded, selected, transactions]);

  const totalForFilter = selected === "all"
    ? transactions.length
    : transactions.filter((item) => item.category === selected).length;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={28} height={28} />
        </Pressable>
        <View style={styles.brandTitle}>
          <ReDomLogo width={34} height={28} />
          <Text style={styles.headerTitle}>ReDom Pay</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.topTab, styles.topTabSelected]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
          <Text style={styles.topTabTextSelected}>Transactions</Text>
        </Pressable>
        <Pressable
          style={styles.topTab}
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          onPress={() => navigation.replace("ReDomPayManage")}
        >
          <Text style={styles.topTabText}>Manage</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {filters.map(([key, label]) => {
          const active = selected === key;
          return (
            <Pressable
              key={key}
              onPress={() => { setSelected(key); setExpanded(true); }}
              style={[styles.filter, active && styles.filterActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {totalForFilter === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptyText}>Transactions made in this ReDom account will appear here.</Text>
            </View>
          ) : (
            <View style={styles.transactionCard}>
              {visible.map((transaction, index) => (
                <TransactionRow
                  key={transaction.transactionKey}
                  transaction={transaction}
                  last={index === visible.length - 1}
                  onPress={() => navigation.navigate("PaymentTransactionDetails", { transactionId: transaction.transactionKey })}
                />
              ))}
              {totalForFilter > 2 ? (
                <Pressable
                  onPress={() => setExpanded((value) => !value)}
                  style={styles.seeButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.seeText}>{expanded ? "See less" : "See all"}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TransactionRow({
  transaction,
  last,
  onPress,
}: {
  transaction: ReDomPayTransaction;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.transactionRow, !last && styles.transactionDivider]} accessibilityRole="button">
      <View style={styles.transactionIcon}>
        <ReDomLogo width={39} height={29} />
      </View>

      <View style={styles.transactionInfo}>
        <Text numberOfLines={1} style={styles.productName}>{transaction.productName}</Text>
        <Text numberOfLines={1} style={styles.status}>
          {statusText(transaction)}
        </Text>
        <Text style={styles.date}>{formatListDate(transaction.effectiveAt)}</Text>
        {transaction.transferMethod ? <Text numberOfLines={1} style={styles.method}>{transaction.transferMethod}</Text> : null}
      </View>

      <View style={styles.amountWrap}>
        <Text numberOfLines={1} style={styles.amount}>{formatMoney(transaction.amountMinor, transaction.currency)}</Text>
        <ChevronIcon width={22} height={22} />
      </View>
    </Pressable>
  );
}

function statusText(transaction: ReDomPayTransaction): string {
  const refund = String(transaction.refundStatus ?? "").toLowerCase();
  if (refund === "processed") return "Refunded";
  if (refund === "failed") return "Partially Refunded";
  const status = String(transaction.status).toLowerCase();
  const labels: Record<string, string> = {
    paid: "Completed",
    success: "Completed",
    completed: "Completed",
    failed: "Failed",
    processing: "Ongoing",
    ongoing: "Ongoing",
    pending: "Pending",
    initialized: "Pending Verification",
    unverified: "Unverified Transaction",
  };
  return labels[status] || status.replaceAll("_", " ");
}

function formatListDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatMoney(minor: string, currency: string): string {
  const amount = Number(minor) / 100;
  if (!Number.isFinite(amount)) return currency + "0.00";
  const fixed = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbols: Record<string, string> = {
    USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "$",
    EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  };
  return currency + (symbols[currency] ?? "") + fixed;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    minHeight: 122,
    paddingTop: 30,
    paddingHorizontal: 31,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  backButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  brandTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 7 },
  headerTitle: { color: "#1C1E21", fontSize: 27, fontWeight: "500" },
  headerSpacer: { width: 42 },
  tabs: {
    marginHorizontal: 31,
    height: 65,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#DADDE1",
  },
  topTab: { flex: 1, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  topTabSelected: { borderBottomColor: "#1C1E21" },
  topTabTextSelected: { color: "#1C1E21", fontSize: 22, fontWeight: "600" },
  topTabText: { color: "#65676B", fontSize: 22, fontWeight: "500" },
  filters: { paddingHorizontal: 30, paddingVertical: 28, gap: 17 },
  filter: {
    minHeight: 61,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DADDE1",
    alignItems: "center",
    justifyContent: "center",
  },
  filterActive: { backgroundColor: "#1C1E21", borderColor: "#1C1E21" },
  filterText: { color: "#1C1E21", fontSize: 18, fontWeight: "700" },
  filterTextActive: { color: "#FFFFFF" },
  content: { paddingHorizontal: 30, paddingBottom: 40 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  transactionCard: {
    borderWidth: 1,
    borderColor: "#DADDE1",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  transactionRow: {
    minHeight: 158,
    paddingHorizontal: 28,
    paddingVertical: 22,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  transactionDivider: { borderBottomWidth: 1, borderBottomColor: "#DADDE1" },
  transactionIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#E1E3E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 18,
    marginTop: 2,
  },
  transactionInfo: { flex: 1, paddingRight: 10 },
  productName: { color: "#1C1E21", fontSize: 19, fontWeight: "600" },
  status: { color: "#65676B", fontSize: 17, marginTop: 4 },
  date: { color: "#65676B", fontSize: 17, marginTop: 1 },
  method: { color: "#65676B", fontSize: 14, marginTop: 3 },
  amountWrap: { minWidth: 92, alignItems: "flex-end", paddingTop: 15, gap: 8 },
  amount: { color: "#65676B", fontSize: 17, fontWeight: "500" },
  seeButton: { paddingHorizontal: 28, paddingVertical: 22 },
  seeText: { color: "#1877F2", fontSize: 18, fontWeight: "700" },
  empty: { paddingVertical: 60, alignItems: "center" },
  emptyTitle: { color: "#1C1E21", fontSize: 20, fontWeight: "700" },
  emptyText: { color: "#65676B", fontSize: 16, textAlign: "center", marginTop: 7, maxWidth: 320 },
});
