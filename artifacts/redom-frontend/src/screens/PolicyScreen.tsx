import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type PolicySlug } from "../product/productService";

export function PolicyScreen({ route }: NativeStackScreenProps<RootStackParamList, "Policy">) {
  const navigation = useNavigation();
  const [state, setState] = useState<{ title: string; summary: string; version: string; sections: Array<{ heading: string; body: string }> } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void productService.getPolicy(route.params.slug as PolicySlug).then((r) => {
      if (active) setState({ ...r.document, version: r.version });
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, [route.params.slug]);
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.headerTitle}>ReDom Policies</Text><View style={{ width: 32 }} /></View>
    {state ? <ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>{state.title}</Text><Text style={styles.summary}>{state.summary}</Text><Text style={styles.version}>Version {state.version}</Text>{state.sections.map((section) => <View key={section.heading} style={styles.section}><Text style={styles.heading}>{section.heading}</Text><Text style={styles.body}>{section.body}</Text></View>)}</ScrollView> : <View style={styles.center}>{error ? <><Text style={styles.error}>This policy is temporarily unavailable.</Text><Pressable style={styles.retry} onPress={() => { setError(false); setState(null); }}><Text style={styles.retryText}>Retry</Text></Pressable></> : <ActivityIndicator size="large" color="#1877F2" />}</View>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F0F2F5" }, header: { height: 58, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, back: { fontSize: 38, color: "#1877F2", lineHeight: 38 }, headerTitle: { fontSize: 18, fontWeight: "700", color: "#050505" }, content: { padding: 18, paddingBottom: 40 }, title: { fontSize: 27, fontWeight: "800", color: "#050505" }, summary: { marginTop: 8, fontSize: 16, lineHeight: 23, color: "#65676B" }, version: { marginTop: 10, fontSize: 12, color: "#8A8D91" }, section: { marginTop: 24, backgroundColor: "#FFF", borderRadius: 14, padding: 16 }, heading: { fontSize: 17, fontWeight: "700", color: "#050505", marginBottom: 7 }, body: { fontSize: 15, lineHeight: 23, color: "#333" }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }, error: { textAlign: "center", color: "#65676B", fontSize: 16 }, retry: { marginTop: 14, backgroundColor: "#1877F2", borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10 }, retryText: { color: "#FFF", fontWeight: "700" } });
