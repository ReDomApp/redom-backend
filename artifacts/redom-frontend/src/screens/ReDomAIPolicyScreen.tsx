import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService } from "../product/productService";
import { AiBackIcon, AiCloseIcon, AiSearchIcon } from "../assets/ai/AiIcon";

type Props = NativeStackScreenProps<RootStackParamList, "ReDomAIPolicy">;
type PolicyState = { title: string; summary: string; version: string; sections: Array<{ heading: string; body: string }> };

export function ReDomAIPolicyScreen({ navigation }: Props) {
  const [state, setState] = useState<PolicyState | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void productService.getPolicy("ai").then((result) => {
      if (active) setState({ ...result.document, version: result.version });
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!state || !term) return state?.sections ?? [];
    return state.sections.filter((section) => `${section.heading} ${section.body}`.toLowerCase().includes(term));
  }, [query, state]);

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.headerButton}><AiBackIcon size={27} /></Pressable>
      <Text style={styles.headerTitle}>AI Policy</Text>
      <View style={styles.headerSpacer} />
    </View>
    {state ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>REDOM AI</Text>
        <Text style={styles.title}>{state.title}</Text>
        <Text style={styles.summary}>{state.summary}</Text>
        <Text style={styles.version}>Version {state.version}</Text>
      </View>
      <View style={styles.searchBox}>
        <AiSearchIcon size={21} color="#667085" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search AI policies" placeholderTextColor="#667085" style={styles.input} autoCorrect={false} returnKeyType="search" />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear policy search" onPress={() => setQuery("")}><AiCloseIcon size={19} color="#667085" /></Pressable> : null}
      </View>
      {query.trim() ? <Text style={styles.resultLabel}>{filtered.length} result{filtered.length === 1 ? "" : "s"}</Text> : null}
      {filtered.length ? filtered.map((section) => <View key={section.heading} style={styles.section}>
        <Text style={styles.heading}>{section.heading}</Text>
        <Text style={styles.body}>{section.body}</Text>
      </View>) : <View style={styles.empty}><Text style={styles.emptyTitle}>No matching AI policy section</Text><Text style={styles.emptyText}>Try a term such as privacy, messages, verification, safety, regional or language.</Text></View>}
    </ScrollView> : <View style={styles.center}>{error ? <><Text style={styles.error}>The AI policy is temporarily unavailable.</Text><Pressable onPress={() => { setError(false); setState(null); }} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></> : <ActivityIndicator size="large" color="#1877F2" />}</View>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { height: 58, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  headerButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 19, fontWeight: "800", color: "#111111" },
  headerSpacer: { width: 42 },
  content: { paddingBottom: 48 },
  hero: { paddingHorizontal: 22, paddingTop: 28 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4, color: "#1877F2" },
  title: { marginTop: 7, fontSize: 30, lineHeight: 36, fontWeight: "800", color: "#111111" },
  summary: { marginTop: 10, fontSize: 16, lineHeight: 24, color: "#5F6368" },
  version: { marginTop: 10, fontSize: 12, color: "#8A8D91" },
  searchBox: { marginTop: 22, marginHorizontal: 18, height: 50, borderRadius: 25, backgroundColor: "#F0F2F5", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 9 },
  input: { flex: 1, color: "#111111", fontSize: 16, paddingVertical: 0 },
  resultLabel: { marginTop: 14, marginHorizontal: 22, color: "#667085", fontSize: 13, fontWeight: "700" },
  section: { marginTop: 25, paddingHorizontal: 22, paddingBottom: 25, borderBottomWidth: 1, borderBottomColor: "#ECEFF1" },
  heading: { fontSize: 21, lineHeight: 27, fontWeight: "800", color: "#111111", marginBottom: 9 },
  body: { fontSize: 16, lineHeight: 25, color: "#34373B" },
  empty: { padding: 28, alignItems: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#111111", textAlign: "center" },
  emptyText: { marginTop: 7, fontSize: 14, lineHeight: 20, color: "#667085", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  error: { color: "#65676B", textAlign: "center", fontSize: 16 },
  retry: { marginTop: 14, backgroundColor: "#1877F2", paddingHorizontal: 24, paddingVertical: 11, borderRadius: 22 },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
});
