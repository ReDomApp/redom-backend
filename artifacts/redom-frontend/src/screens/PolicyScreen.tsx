import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type PolicySlug } from "../product/productService";

type PolicySection = { heading: string; body: string };
type PolicyState = { title: string; summary: string; version: string; sections: PolicySection[] };
type PolicyResponse = {
  success?: boolean;
  version?: string;
  document?: { title?: string; summary?: string; version?: string; sections?: unknown };
  title?: string;
  summary?: string;
  sections?: unknown;
};

function normalizeSections(value: unknown): PolicySection[] {
  if (!Array.isArray(value)) return [];
  return value.filter((section): section is PolicySection => {
    if (!section || typeof section !== "object") return false;
    const item = section as Record<string, unknown>;
    return typeof item.heading === "string" && typeof item.body === "string";
  });
}

function normalizePolicy(response: PolicyResponse): PolicyState {
  const document = response?.document && typeof response.document === "object" ? response.document : undefined;
  return {
    title: document?.title ?? response?.title ?? "ReDom Policy",
    summary: document?.summary ?? response?.summary ?? "",
    version: response?.version ?? document?.version ?? "",
    sections: normalizeSections(document?.sections ?? response?.sections),
  };
}

export function PolicyScreen({ route }: NativeStackScreenProps<RootStackParamList, "Policy">) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const [state, setState] = useState<PolicyState | null>(null);
  const [error, setError] = useState(false);
  const slug = route?.params?.slug as PolicySlug | undefined;

  const loadPolicy = useCallback(async () => {
    setError(false);
    setState(null);
    sectionOffsets.current = {};
    if (!slug) {
      setError(true);
      return;
    }

    try {
      const response = await productService.getPolicy(slug);
      const normalized = normalizePolicy(response as PolicyResponse);
      setState(normalized);
    } catch {
      setError(true);
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    if (!slug) {
      setError(true);
      setState(null);
      return () => {
        active = false;
      };
    }

    setError(false);
    setState(null);
    sectionOffsets.current = {};

    void productService.getPolicy(slug)
      .then((response) => {
        if (active) setState(normalizePolicy(response as PolicyResponse));
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("HomeFeed");
  };

  const jumpTo = (heading: string) => {
    const y = sectionOffsets.current[heading];
    if (typeof y === "number") {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };

  const retry = () => {
    void loadPolicy();
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>ReDom Policies</Text>
        <View style={styles.headerSpacer} />
      </View>

      {state ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>
            {slug === "messaging" ? "MESSAGING & PRIVACY" : "POLICY"}
          </Text>
          <Text style={styles.title}>{state.title}</Text>
          {!!state.summary && <Text style={styles.summary}>{state.summary}</Text>}
          {!!state.version && <Text style={styles.version}>Version {state.version}</Text>}

          {state.sections.length > 0 && (
            <View style={styles.contentsCard}>
              <Text style={styles.contentsTitle}>On this page</Text>
              {state.sections.slice(0, 8).map((section, index) => (
                <Pressable
                  key={`${section.heading}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${section.heading}`}
                  onPress={() => jumpTo(section.heading)}
                  style={styles.contentsRow}
                >
                  <Text style={styles.contentsIndex}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={styles.contentsText}>{section.heading}</Text>
                  <Text style={styles.contentsArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          )}

          {state.sections.map((section, index) => (
            <View
              key={`${section.heading}-${index}`}
              onLayout={(event) => {
                sectionOffsets.current[section.heading] = event.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}

          <Text style={styles.footer}>
            ReDom {slug === "messaging" ? "Messaging" : "Policy"} · {state.version}
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.error}>This policy is temporarily unavailable.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try loading the policy again"
                onPress={retry}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="large" color="#1877F2" />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { height: 58, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E5E7EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 38, color: "#1877F2", lineHeight: 38, marginTop: -3 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  headerSpacer: { width: 38 },
  content: { paddingBottom: 52 },
  eyebrow: { marginTop: 34, paddingHorizontal: 22, fontSize: 12, fontWeight: "800", letterSpacing: 1.3, color: "#1877F2" },
  title: { marginTop: 8, paddingHorizontal: 22, fontSize: 34, lineHeight: 40, fontWeight: "800", color: "#111111" },
  summary: { marginTop: 12, paddingHorizontal: 22, fontSize: 18, lineHeight: 27, color: "#5F6368" },
  version: { marginTop: 14, paddingHorizontal: 22, fontSize: 12, color: "#8A8D91" },
  contentsCard: { marginTop: 28, marginHorizontal: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#E5E7EB", paddingVertical: 8 },
  contentsTitle: { paddingHorizontal: 8, paddingVertical: 12, fontSize: 18, fontWeight: "800", color: "#111111" },
  contentsRow: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  contentsIndex: { width: 32, fontSize: 12, fontWeight: "700", color: "#8A8D91" },
  contentsText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#1877F2" },
  contentsArrow: { fontSize: 25, color: "#8A8D91" },
  section: { marginTop: 30, paddingHorizontal: 22, paddingBottom: 30, borderBottomWidth: 1, borderBottomColor: "#ECEFF1" },
  heading: { fontSize: 23, lineHeight: 29, fontWeight: "800", color: "#111111", marginBottom: 10 },
  body: { fontSize: 16, lineHeight: 25, color: "#34373B" },
  footer: { marginTop: 28, paddingHorizontal: 22, fontSize: 12, color: "#8A8D91" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  error: { textAlign: "center", color: "#65676B", fontSize: 16 },
  retry: { marginTop: 14, backgroundColor: "#1877F2", borderRadius: 22, paddingHorizontal: 24, paddingVertical: 11 },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
});
