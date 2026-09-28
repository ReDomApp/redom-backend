import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type ReDomPayTransactionDetails } from "../services/ordersPaymentsService";

import BackIcon from "../assets/navigation/back.svg";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

export function PaymentTransactionDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PaymentTransactionDetails">>();
  const [transaction, setTransaction] = useState<ReDomPayTransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ordersPaymentsService.redomPayTransactionDetails(route.params.transactionId)
      .then((result) => {
        if (!active) return;
        setTransaction(result.transaction);
        setTransactionNumber(result.transaction.redomTransactionId || result.transaction.reference);
      })
      .catch(() => {
        if (active) setTransaction(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [route.params.transactionId]);

  const submitReport = async () => {
    if (!transaction) return;
    if (!description.trim() || !email.trim() || !transactionNumber.trim()) {
      Alert.alert("Report to Support", "Enter the problem description, email address, and transaction number.");
      return;
    }
    setSubmitting(true);
    try {
      await ordersPaymentsService.reportPaymentProblem({
        transactionKey: transaction.transactionKey,
        transactionNumber: transactionNumber.trim(),
        email: email.trim(),
        description: description.trim(),
      });
      setReportOpen(false);
      setDescription("");
      Alert.alert(
        "Email Support",
        "Your report has been submitted successfully. ReDom Support will reach out to you soon.",
        [{ text: "OK" }],
      );
    } catch (error) {
      Alert.alert("Report to Support", error instanceof Error ? error.message : "Unable to submit your report.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loading}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
            <BackIcon width={27} height={27} />
          </Pressable>
          <View style={styles.brandTitle}>
            <ReDomLogo width={34} height={28} />
            <Text style={styles.headerTitle}>ReDom Pay</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Transaction unavailable</Text>
          <Text style={styles.emptyText}>This transaction could not be found in your ReDom account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const transactionId = transaction.redomTransactionId || transaction.reference;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={27} height={27} />
        </Pressable>
        <View style={styles.brandTitle}>
          <ReDomLogo width={34} height={28} />
          <Text style={styles.headerTitle}>{transaction.productName}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.productHeader}>
          <View style={styles.productIcon}>
            <ReDomLogo width={48} height={35} />
          </View>
          <View style={styles.productHeaderText}>
            <Text style={styles.productName}>{transaction.productName}</Text>
            <Text style={styles.statusLine}>{statusWithDate(transaction.status, transaction.effectiveAt)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Transaction details</Text>

        <View style={styles.detailsCard}>
          <DetailRow label={transaction.productName} value={formatMoney(transaction.amountMinor, transaction.currency)} first />
          <DetailRow label="Subtotal" value={formatMoney(transaction.subtotalMinor, transaction.currency)} />
          <DetailRow
            label={`Discount ${transaction.discountPercent}%`}
            value={`-${formatMoney(transaction.discountMinor, transaction.currency)}`}
          />
          <DetailRow label="Total" value={formatMoney(transaction.totalMinor, transaction.currency)} total />
        </View>

        <View style={styles.idCard}>
          <Text style={styles.idLabel}>Transaction ID</Text>
          <Text style={styles.idValue} selectable>{transactionId}</Text>
        </View>

        <Pressable onPress={() => setReportOpen(true)} style={styles.reportCard} accessibilityRole="button">
          <Text style={styles.reportText}>Not correct? Report to Support</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>

        {transaction.failureMessage ? (
          <Text style={styles.failureText}>{transaction.failureMessage}</Text>
        ) : null}
      </ScrollView>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => !submitting && setReportOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report transaction problem</Text>
            <Text style={styles.modalHelper}>Tell ReDom Support what is not correct. Do not enter your password, PIN, CVV, full card number, or security code.</Text>

            <Text style={styles.inputLabel}>Problem description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={4000}
              placeholder="Describe the problem"
              placeholderTextColor="#65676B"
              style={[styles.input, styles.descriptionInput]}
            />

            <Text style={styles.inputLabel}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#65676B"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Transaction number</Text>
            <TextInput
              value={transactionNumber}
              onChangeText={setTransactionNumber}
              autoCapitalize="characters"
              placeholder="Transaction ID"
              placeholderTextColor="#65676B"
              style={styles.input}
            />

            <View style={styles.modalButtons}>
              <Pressable disabled={submitting} onPress={() => setReportOpen(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={submitting} onPress={() => void submitReport()} style={[styles.submitButton, submitting && styles.disabledButton]}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Submit</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, first = false, total = false }: { label: string; value: string; first?: boolean; total?: boolean }) {
  return (
    <View style={[styles.detailRow, !first && styles.detailDivider]}>
      <Text style={[total ? styles.totalLabel : styles.detailLabel, first && styles.firstLabel]}>{label}</Text>
      <Text style={[total ? styles.totalValue : styles.detailValue]}>{value}</Text>
    </View>
  );
}

function statusWithDate(status: string, dateValue: string): string {
  const date = formatLongDate(dateValue);
  const normalized = String(status).toLowerCase();
  if (["paid", "success", "completed"].includes(normalized)) return `Completed on ${date}`;
  if (["failed", "payment_failed"].includes(normalized)) return `Failed on ${date}`;
  if (["processing", "ongoing"].includes(normalized)) return `Ongoing since ${date}`;
  if (normalized === "unverified") return `Unverified Transaction Since ${date}`;
  if (normalized === "initialized" || normalized === "pending" || normalized === "pending_verification") return `Pending Verification Since ${date}`;
  if (normalized === "refunded") return `Refunded on ${date}`;
  if (normalized === "partially_refunded") return `Partially Refunded on ${date}`;
  return `${status.replaceAll("_", " ")} on ${date}`;
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatMoney(minor: string, currency: string): string {
  const amount = Number(minor) / 100;
  const fixed = Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  const symbols: Record<string, string> = {
    USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "$",
    EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  };
  return currency + (symbols[currency] ?? "") + fixed;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    minHeight: 104,
    paddingTop: 27,
    paddingHorizontal: 31,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  backButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  brandTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 7 },
  headerTitle: { color: "#1C1E21", fontSize: 22, fontWeight: "600", flexShrink: 1 },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 31, paddingTop: 21, paddingBottom: 50 },
  productHeader: { flexDirection: "row", alignItems: "center", marginBottom: 52 },
  productIcon: {
    width: 62, height: 62, borderRadius: 31, borderWidth: 1, borderColor: "#DADDE1",
    alignItems: "center", justifyContent: "center", marginRight: 20,
  },
  productHeaderText: { flex: 1 },
  productName: { color: "#1C1E21", fontSize: 25, fontWeight: "500" },
  statusLine: { color: "#65676B", fontSize: 17, lineHeight: 23, marginTop: 3 },
  sectionTitle: { color: "#050505", fontSize: 27, fontWeight: "800", marginBottom: 24 },
  detailsCard: { borderWidth: 1, borderColor: "#DADDE1", borderRadius: 18, overflow: "hidden" },
  detailRow: { minHeight: 76, paddingHorizontal: 29, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18 },
  detailDivider: { borderTopWidth: 1, borderTopColor: "#DADDE1" },
  detailLabel: { color: "#65676B", fontSize: 18, flex: 1 },
  firstLabel: { color: "#1C1E21" },
  detailValue: { color: "#65676B", fontSize: 18, textAlign: "right" },
  totalLabel: { color: "#1C1E21", fontSize: 19, fontWeight: "800", flex: 1 },
  totalValue: { color: "#65676B", fontSize: 19, fontWeight: "600", textAlign: "right" },
  idCard: { borderWidth: 1, borderColor: "#DADDE1", borderRadius: 18, marginTop: 27, paddingHorizontal: 29, paddingVertical: 22 },
  idLabel: { color: "#1C1E21", fontSize: 18, fontWeight: "700" },
  idValue: { color: "#65676B", fontSize: 17, marginTop: 7 },
  reportCard: {
    minHeight: 75, borderWidth: 1, borderColor: "#DADDE1", borderRadius: 18, marginTop: 27,
    paddingHorizontal: 29, flexDirection: "row", alignItems: "center",
  },
  reportText: { color: "#1C1E21", fontSize: 18, fontWeight: "600", flex: 1 },
  failureText: { color: "#D93025", fontSize: 15, marginTop: 15 },
  empty: { flex: 1, padding: 30, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#1C1E21", fontSize: 21, fontWeight: "800" },
  emptyText: { color: "#65676B", fontSize: 16, textAlign: "center", marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 22, maxHeight: "90%" },
  modalTitle: { color: "#1C1E21", fontSize: 22, fontWeight: "800" },
  modalHelper: { color: "#65676B", fontSize: 14, lineHeight: 20, marginTop: 7 },
  inputLabel: { color: "#1C1E21", fontSize: 15, fontWeight: "700", marginTop: 17, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: "#DADDE1", borderRadius: 10, minHeight: 48, paddingHorizontal: 13, color: "#1C1E21", fontSize: 16, backgroundColor: "#FFFFFF" },
  descriptionInput: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelButton: { flex: 1, minHeight: 50, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2F5" },
  cancelText: { color: "#1C1E21", fontSize: 16, fontWeight: "700" },
  submitButton: { flex: 1, minHeight: 50, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#1877F2" },
  submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabledButton: { opacity: 0.6 },
});
