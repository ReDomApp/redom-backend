import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type RefundCaseDetails, type RefundCaseMessage } from "../services/ordersPaymentsService";
import { useTheme } from "../theme/ThemeProvider";
import BackIcon from "../assets/navigation/back.svg";

type Props = NativeStackScreenProps<RootStackParamList, "RefundCase">;
const BLUE = "#1877F2";

export function RefundCaseScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const [refundCase, setRefundCase] = useState<RefundCaseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [useGemini, setUseGemini] = useState(true);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    try {
      const result = await ordersPaymentsService.refundCase(route.params.caseNumber);
      setRefundCase(result.refundCase);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this refund case.");
    } finally {
      setLoading(false);
    }
  }, [route.params.caseNumber]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const requestDeadline = useMemo(() => {
    if (!refundCase?.paidAt) return null;
    return new Date(new Date(refundCase.paidAt).getTime() + 10 * 60 * 1000);
  }, [refundCase?.paidAt]);

  const deadlineText = requestDeadline
    ? requestDeadline.getTime() > Date.now()
      ? formatCountdown(requestDeadline.getTime() - Date.now())
      : "Refund request window has ended"
    : "Unavailable";

  const verificationRequired = Boolean(
    refundCase &&
    ["verification_code_sent", "awaiting_verification"].includes(refundCase.refundRequestStatus) &&
    !refundCase.verifiedAt &&
    !refundCase.closedAt
  );

  const recordHistory = (next: string) => {
    const nextHistory = [...history.slice(0, historyIndex + 1), next].slice(-30);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const updateMessage = (next: string) => {
    setMessage(next);
    recordHistory(next);
  };

  const wrapSelection = (left: string, right = left) => {
    const start = selection.start;
    const end = selection.end;
    const selected = message.slice(start, end);
    updateMessage(message.slice(0, start) + left + selected + right + message.slice(end));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const addLinePrefix = (prefix: string) => {
    const lineStart = message.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
    updateMessage(message.slice(0, lineStart) + prefix + message.slice(lineStart));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const index = historyIndex - 1;
    setHistoryIndex(index);
    setMessage(history[index] ?? "");
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const index = historyIndex + 1;
    setHistoryIndex(index);
    setMessage(history[index] ?? "");
  };

  const send = async (text = message, gemini = useGemini) => {
    const body = text.trim();
    if (!body || sending || refundCase?.closedAt) return;
    setSending(true);
    try {
      const result = await ordersPaymentsService.sendRefundCaseMessage(route.params.caseNumber, body, gemini);
      setRefundCase(result.refundCase);
      setMessage("");
      setHistory([]);
      setHistoryIndex(-1);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the case message.");
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!refundCase || !code.trim() || verifying) return;
    setVerifying(true);
    setError("");
    try {
      await ordersPaymentsService.completeStarsRefund(refundCase.transactionNumber, code.trim());
      setCode("");
      await load();
    } catch (err) {
      setCode("");
      setError(err instanceof Error ? err.message : "The verification code was not accepted. A new code may have been issued.");
      await load();
    } finally {
      setVerifying(false);
    }
  };

  const askGemini = (prompt: string) => {
    if (useGemini && !sending) void send(prompt, true);
  };

  if (loading && !refundCase) {
    return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}><View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View></SafeAreaView>;
  }

  if (!refundCase) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <Header title="ReDom Refunds" navigation={navigation} colors={colors} />
        <View style={styles.center}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Refund case unavailable</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error || "The refund case could not be loaded."}</Text>
          <Pressable onPress={() => { setLoading(true); void load(); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={styles.primaryButtonText}>Try again</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <Header title="ReDom Refunds" navigation={navigation} colors={colors} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>Refund Case</Text><Text style={[styles.caseNumber, { color: colors.textSecondary }]}>{refundCase.caseNumber}</Text></View>
            <StatusPill status={refundCase.refundRequestStatus} colors={colors} />
          </View>

          <View style={[styles.securityBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.securityTitle, { color: colors.text }]}>Security warning</Text>
            <Text style={[styles.securityText, { color: colors.textSecondary }]}>{refundCase.securityWarning}</Text>
          </View>

          <Timeline refundCase={refundCase} colors={colors} />

          <SectionTitle title="Transaction" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <InfoRow label="ReDom Transaction ID" value={refundCase.transactionNumber} colors={colors} />
            {refundCase.providerReference ? <InfoRow label="Provider Reference" value={refundCase.providerReference} colors={colors} /> : null}
            <InfoRow label="Amount" value={formatMoney(refundCase.amountMinor, refundCase.currency)} colors={colors} />
            <InfoRow label="Payment" value={refundCase.paymentStatus} colors={colors} />
            {refundCase.refundTarget ? <InfoRow label="Refund destination" value={refundCase.refundTarget} colors={colors} /> : null}
          </View>

          <SectionTitle title="Refund deadline" colors={colors} />
          <View style={[styles.deadlineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.deadlineValue, { color: colors.text }]}>{deadlineText}</Text>
            <Text style={[styles.deadlineHint, { color: colors.textSecondary }]}>The refund request must be created within the 10-minute product window. If this case was created before the window ended, later verification and review can continue.</Text>
            {refundCase.reviewAvailableAt ? <Text style={[styles.deadlineHint, { color: colors.textSecondary }]}>Automated review available: {formatDate(refundCase.reviewAvailableAt)}</Text> : null}
          </View>

          {verificationRequired ? (
            <>
              <SectionTitle title="Security verification" colors={colors} />
              <View style={[styles.verifyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.verifyTitle, { color: colors.text }]}>{refundCase.verificationChannel === "sms" ? "Enter the 8-digit code sent to your verified phone" : "Enter the 6-digit code sent to your ReDom email"}</Text>
                {refundCase.verificationTarget ? <Text style={[styles.verifyTarget, { color: colors.textSecondary }]}>{refundCase.verificationTarget}</Text> : null}
                <TextInput value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, refundCase.verificationChannel === "sms" ? 8 : 6))} keyboardType="number-pad" secureTextEntry maxLength={refundCase.verificationChannel === "sms" ? 8 : 6} placeholder={refundCase.verificationChannel === "sms" ? "8-digit code" : "6-digit code"} placeholderTextColor={colors.textSecondary} style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
                <Pressable disabled={verifying || code.length < (refundCase.verificationChannel === "sms" ? 8 : 6)} onPress={() => void verify()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: verifying ? 0.6 : 1 }]}><Text style={styles.primaryButtonText}>{verifying ? "Verifying…" : "Verify refund"}</Text></Pressable>
                <Text style={[styles.securityText, { color: colors.textSecondary }]}>Incorrect codes are invalidated and replaced with a new code. After 3 failed attempts, this refund case is permanently closed.</Text>
              </View>
            </>
          ) : null}

          <SectionTitle title="Gemini" colors={colors} />
          <View style={[styles.geminiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.geminiHeader}>
              <View style={{ flex: 1 }}><Text style={[styles.geminiTitle, { color: colors.text }]}>ReDom refund assistant</Text><Text style={[styles.geminiSub, { color: colors.textSecondary }]}>Use Gemini to explain the current backend-confirmed case state.</Text></View>
              <Pressable onPress={() => setUseGemini((value) => !value)} style={[styles.switch, { backgroundColor: useGemini ? colors.primary : colors.border }]}><View style={[styles.switchThumb, { alignSelf: useGemini ? "flex-end" : "flex-start" }]} /></Pressable>
            </View>
            <View style={styles.quickGrid}>
              {[
                ["Explain status", "Explain the current refund case status using only the confirmed case information."],
                ["Find transaction", "Explain the confirmed transaction details and provider reference for this refund case."],
                ["Explain deadline", "Explain the refund request deadline and whether this submitted case remains valid."],
                ["Explain verification", "Explain the current security verification step and what the user should do next."],
                ["Help respond", "Help me write a clear message to ReDom Support about this refund case."],
                ["Summarize", "Summarize this refund case, its current status, next step, and security warning."],
              ].map(([label, prompt]) => <Pressable key={label} disabled={!useGemini || sending} onPress={() => askGemini(prompt)} style={[styles.quickButton, { borderColor: colors.border, opacity: useGemini ? 1 : 0.45 }]}><Text style={[styles.quickText, { color: colors.text }]}>{label}</Text></Pressable>)}
            </View>
          </View>

          <SectionTitle title="Case messages" colors={colors} />
          <View style={[styles.messagesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {refundCase.messages.length === 0 ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your refund case is open. You can continue providing details here; submitting the transaction ID does not end the case.</Text> : refundCase.messages.map((item) => <MessageBubble key={item.id} message={item} colors={colors} />)}
          </View>

          {error ? <View style={[styles.errorBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.errorText, { color: colors.text }]}>{error}</Text></View> : null}

          <Text style={[styles.composerHint, { color: colors.textSecondary }]}>Continue the case here. You can provide additional context after the Transaction ID has been submitted.</Text>
          <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
              <ToolbarButton label="B" bold onPress={() => wrapSelection("**")} colors={colors} />
              <ToolbarButton label="I" italic onPress={() => wrapSelection("*")} colors={colors} />
              <ToolbarButton label="U" underline onPress={() => wrapSelection("__")} colors={colors} />
              <ToolbarButton label="•" onPress={() => addLinePrefix("- ")} colors={colors} />
              <ToolbarButton label="1." onPress={() => addLinePrefix("1. ")} colors={colors} />
              <ToolbarButton label="❝" onPress={() => addLinePrefix("> ")} colors={colors} />
              <ToolbarButton label="Code" onPress={() => wrapSelection("[" , "]")} colors={colors} />
              <ToolbarButton label="Link" onPress={() => wrapSelection("[", "](https://)")} colors={colors} />
              <ToolbarButton label="↶" onPress={undo} colors={colors} disabled={historyIndex <= 0} />
              <ToolbarButton label="↷" onPress={redo} colors={colors} disabled={historyIndex >= history.length - 1} />
            </View>
            <TextInput ref={inputRef} value={message} onChangeText={updateMessage} onSelectionChange={(event) => setSelection(event.nativeEvent.selection)} multiline textAlignVertical="top" placeholder="Write a message about your refund case…" placeholderTextColor={colors.textSecondary} style={[styles.editor, { color: colors.text }]} editable={!refundCase.closedAt && !sending} />
            <View style={styles.composerFooter}>
              <Pressable onPress={() => Alert.alert("Attachments", "Attachments are not accepted by the current refund-case backend yet.")} style={[styles.attachButton, { borderColor: colors.border }]}><Text style={[styles.attachText, { color: colors.text }]}>Attach</Text></Pressable>
              <Text style={[styles.formatHint, { color: colors.textSecondary }]}>Safe formatting is preserved in the case message.</Text>
              <Pressable disabled={!message.trim() || sending || Boolean(refundCase.closedAt)} onPress={() => void send()} style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !message.trim() || sending ? 0.55 : 1 }]}><Text style={styles.primaryButtonText}>{sending ? "Sending…" : "Send"}</Text></Pressable>
            </View>
          </View>

          <Text style={[styles.bottomSecurity, { color: colors.textSecondary }]}>{refundCase.securityWarning}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ title, navigation, colors }: any) {
  return <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}><Pressable onPress={() => navigation.goBack()}><BackIcon width={25} height={25} /></Pressable><Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.headerMenu, { color: colors.textSecondary }]}>⋮</Text></View>;
}
function SectionTitle({ title, colors }: any) { return <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>; }
function InfoRow({ label, value, colors }: any) { return <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.text }]} selectable>{value}</Text></View>; }
function StatusPill({ status, colors }: any) { return <View style={[styles.statusPill, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.statusPillText, { color: colors.text }]}>{statusLabel(status)}</Text></View>; }

function Timeline({ refundCase, colors }: { refundCase: RefundCaseDetails; colors: any }) {
  const status = refundCase.refundStatus || refundCase.refundRequestStatus;
  const closed = Boolean(refundCase.closedAt);
  const completed = status === "refunded" || refundCase.refundStatus === "processed";
  const processing = ["refund_processing", "processing", "pending", "needs-attention"].includes(status);
  const verified = Boolean(refundCase.verifiedAt) || ["account_under_review","refund_review_pending","refund_reviewing","approved","refund_processing","refunded"].includes(status);
  const steps = [["Case created", true], ["Security verification", verified || Boolean(refundCase.verificationSentAt)], ["Refund review", verified && Boolean(refundCase.reviewAvailableAt) && !["verification_code_sent","awaiting_verification"].includes(status)], ["Refund processing", processing || completed], ["Completed / closed", completed || closed]];
  return <View style={[styles.timeline, { backgroundColor: colors.surface, borderColor: colors.border }]}>{steps.map(([label, active], index) => <View key={String(label)} style={styles.timelineRow}><View style={[styles.timelineDot, { backgroundColor: active ? colors.primary : colors.border }]} /><Text style={[styles.timelineLabel, { color: active ? colors.text : colors.textSecondary }]}>{label}</Text>{index < steps.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}</View>)}</View>;
}

function MessageBubble({ message, colors }: { message: RefundCaseMessage; colors: any }) {
  const mine = message.senderType === "user";
  return <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowOther]}><View style={[styles.bubble, { backgroundColor: mine ? BLUE : colors.background, borderColor: colors.border }]}><Text style={[styles.messageSender, { color: mine ? "#FFF" : colors.textSecondary }]}>{mine ? "You" : message.senderType === "system" ? "ReDom" : "ReDom Support"}</Text><MarkdownText value={message.body} color={mine ? "#FFF" : colors.text} /><Text style={[styles.messageTime, { color: mine ? "rgba(255,255,255,0.78)" : colors.textSecondary }]}>{formatDate(message.createdAt)}</Text></View></View>;
}
function MarkdownText({ value, color }: { value: string; color: string }) {
  return <View>{value.split("\n").map((line, index) => <Text key={String(index)} style={{ color, fontSize: 15, lineHeight: 21, marginTop: index ? 4 : 0 }}>{renderInline(line, color)}</Text>)}</View>;
}
function renderInline(value: string, color: string): any {
  const parts = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <Text key={String(index)} style={{ fontWeight: "800", color }}>{part.slice(2,-2)}</Text>;
    if (part.startsWith("*") && part.endsWith("*")) return <Text key={String(index)} style={{ fontStyle: "italic", color }}>{part.slice(1,-1)}</Text>;
    if (part.startsWith("__") && part.endsWith("__")) return <Text key={String(index)} style={{ textDecorationLine: "underline", color }}>{part.slice(2,-2)}</Text>;
    return <Text key={String(index)} style={{ color }}>{part}</Text>;
  });
}
function ToolbarButton({ label, onPress, colors, disabled, bold, italic, underline }: any) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.toolbarButton, { borderColor: colors.border, opacity: disabled ? 0.35 : 1 }]}><Text style={[styles.toolbarText, { color: colors.text }, bold && { fontWeight: "900" }, italic && { fontStyle: "italic" }, underline && { textDecorationLine: "underline" }]}>{label}</Text></Pressable>;
}
function formatMoney(amountMinor: string, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(amountMinor) / 100); } catch { return currency + (Number(amountMinor) / 100).toFixed(2); } }
function formatDate(value: string | null) { try { return new Date(value || Date.now()).toLocaleString(); } catch { return ""; } }
function formatCountdown(ms: number) { const total = Math.max(0, Math.floor(ms / 1000)); return Math.floor(total / 60) + "m " + String(total % 60).padStart(2, "0") + "s remaining"; }
function statusLabel(status: string) {
  const labels: Record<string,string> = { transaction_required:"Transaction required", account_profile_required:"Security verification", verification_code_sent:"Verification code sent", awaiting_verification:"Awaiting verification", account_under_review:"Under review", refund_review_pending:"Review pending", refund_reviewing:"Refund review", approved:"Approved", denied:"Denied", non_refundable:"Request window expired", refund_processing:"Refund processing", refunded:"Refund completed", refund_failed:"Refund failed", refund_rejected:"Refund rejected", refund_needs_attention:"Action required", closed:"Closed", refund_verification_failed:"Security verification failed" };
  return labels[status] || status.replaceAll("_"," ");
}

const styles = StyleSheet.create({
  root:{flex:1},flex:{flex:1},header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:14},headerTitle:{fontSize:19,fontWeight:"800"},headerMenu:{fontSize:28,lineHeight:28},
  content:{padding:18,paddingBottom:44},center:{flex:1,alignItems:"center",justifyContent:"center",padding:28},titleRow:{flexDirection:"row",alignItems:"center",marginBottom:16},title:{fontSize:28,fontWeight:"900"},caseNumber:{fontSize:14,marginTop:3,fontWeight:"700"},statusPill:{borderWidth:1,borderRadius:999,paddingHorizontal:11,paddingVertical:7},statusPillText:{fontSize:12,fontWeight:"800"},
  securityBanner:{borderWidth:1,borderRadius:16,padding:15,marginBottom:20},securityTitle:{fontSize:15,fontWeight:"900",marginBottom:5},securityText:{fontSize:13,lineHeight:19},timeline:{borderWidth:1,borderRadius:16,padding:15,marginBottom:24},timelineRow:{minHeight:38,flexDirection:"row",alignItems:"center",position:"relative"},timelineDot:{width:10,height:10,borderRadius:5,marginRight:12},timelineLine:{position:"absolute",left:4,top:27,width:2,height:22},timelineLabel:{fontSize:14,fontWeight:"700"},
  sectionTitle:{fontSize:21,fontWeight:"900",marginTop:8,marginBottom:12},card:{borderWidth:1,borderRadius:16,paddingHorizontal:15},infoRow:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:"transparent"},infoLabel:{fontSize:12,marginBottom:4},infoValue:{fontSize:15,fontWeight:"700"},deadlineCard:{borderWidth:1,borderRadius:16,padding:17},deadlineValue:{fontSize:22,fontWeight:"900"},deadlineHint:{fontSize:13,lineHeight:19,marginTop:8},
  verifyCard:{borderWidth:1,borderRadius:16,padding:17},verifyTitle:{fontSize:16,fontWeight:"800"},verifyTarget:{fontSize:13,marginTop:5},codeInput:{height:52,borderWidth:1,borderRadius:12,paddingHorizontal:15,fontSize:20,letterSpacing:4,marginTop:13,marginBottom:12},primaryButton:{minHeight:50,borderRadius:13,alignItems:"center",justifyContent:"center",paddingHorizontal:18},primaryButtonText:{color:"#FFF",fontSize:16,fontWeight:"900"},
  geminiCard:{borderWidth:1,borderRadius:16,padding:15},geminiHeader:{flexDirection:"row",alignItems:"center"},geminiTitle:{fontSize:16,fontWeight:"900"},geminiSub:{fontSize:12,lineHeight:17,marginTop:3},switch:{width:46,height:27,borderRadius:14,padding:3,justifyContent:"center"},switchThumb:{width:21,height:21,borderRadius:11,backgroundColor:"#FFF"},quickGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:13},quickButton:{borderWidth:1,borderRadius:10,paddingHorizontal:11,paddingVertical:9},quickText:{fontSize:12,fontWeight:"700"},
  messagesCard:{borderWidth:1,borderRadius:16,padding:12},emptyText:{fontSize:14,lineHeight:21,padding:8},messageRow:{marginVertical:5,flexDirection:"row"},messageRowMine:{justifyContent:"flex-end"},messageRowOther:{justifyContent:"flex-start"},bubble:{maxWidth:"88%",borderWidth:1,borderRadius:15,padding:11},messageSender:{fontSize:11,fontWeight:"900",marginBottom:4},messageTime:{fontSize:10,marginTop:7},
  errorBox:{borderWidth:1,borderRadius:12,padding:12,marginTop:14},errorTitle:{fontSize:20,fontWeight:"900",marginBottom:7},errorText:{fontSize:14,lineHeight:20,textAlign:"center"},composerHint:{fontSize:12,lineHeight:18,marginTop:18,marginBottom:8},composer:{borderWidth:1,borderRadius:16,overflow:"hidden"},toolbar:{flexDirection:"row",flexWrap:"wrap",gap:6,padding:8,borderBottomWidth:1},toolbarButton:{minWidth:30,height:30,borderWidth:1,borderRadius:7,alignItems:"center",justifyContent:"center",paddingHorizontal:7},toolbarText:{fontSize:13,fontWeight:"700"},editor:{minHeight:120,maxHeight:240,padding:13,fontSize:15,lineHeight:21},composerFooter:{minHeight:54,flexDirection:"row",alignItems:"center",padding:8,gap:8},attachButton:{height:38,borderWidth:1,borderRadius:10,paddingHorizontal:12,alignItems:"center",justifyContent:"center"},attachText:{fontSize:13,fontWeight:"800"},formatHint:{flex:1,fontSize:10,lineHeight:14},sendButton:{height:40,borderRadius:10,paddingHorizontal:16,alignItems:"center",justifyContent:"center"},bottomSecurity:{fontSize:11,lineHeight:16,marginTop:16}
});
