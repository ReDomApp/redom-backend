import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { api } from "../api/client";
import BackIcon from "../assets/edit-profile/back.svg";
import SearchIcon from "../assets/edit-profile/search.svg";
import ClearIcon from "../assets/edit-profile/clear.svg";
import LocationIcon from "../assets/edit-profile/location.svg";
import HometownIcon from "../assets/edit-profile/hometown.svg";

type Props = NativeStackScreenProps<RootStackParamList, "EditLocationSearch">;
type Result = { id: string; name: string; placeName: string; latitude: number | null; longitude: number | null };

export function EditLocationSearchScreen({ navigation, route }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const title = route.params.kind === "hometown" ? "Add hometown" : "Add location";

  useEffect(() => {
    const timer = setTimeout(async () => {
      const value = query.trim();
      if (value.length < 3) { setResults([]); return; }
      setBusy(true);
      try {
        const response = await api.get<{ success: boolean; results: Result[] }>(`/profile/edit/locations?q=${encodeURIComponent(value)}`);
        setResults(response.results);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()} hitSlop={12}><BackIcon width={34} height={34} /></Pressable><Text style={styles.title}>{title}</Text><View style={styles.spacer} /></View>
    <View style={styles.searchBox}><SearchIcon width={25} height={25} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor="#65676B" style={styles.input} returnKeyType="search"/><Pressable onPress={() => setQuery("")} disabled={!query}><ClearIcon width={22} height={22} /></Pressable></View>
    {query.trim().length > 0 && query.trim().length < 3 ? <Text style={styles.hint}>Enter at least 3 characters to search.</Text> : null}
    {busy ? <ActivityIndicator size="small" color="#1877F2" style={styles.spinner} /> : null}
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {results.map((item) => <Pressable key={item.id} style={styles.result} onPress={() => navigation.navigate("EditLocationConfirm", { kind: route.params.kind, result: item.placeName })}>
        <View style={styles.resultIcon}>{route.params.kind === "hometown" ? <HometownIcon width={34} height={34} /> : <LocationIcon width={34} height={34} />}</View>
        <View style={styles.resultCopy}><Text style={styles.name}>{item.name}</Text><Text style={styles.place}>{item.placeName}</Text></View>
      </Pressable>)}
      {!busy && query.trim().length >= 3 && !results.length ? <Text style={styles.empty}>No matching locations.</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" },
  title: { fontSize: 23, fontWeight: "800", color: "#050505" }, spacer: { width: 34 },
  searchBox: { height: 52, margin: 18, paddingHorizontal: 15, borderRadius: 10, backgroundColor: "#F0F2F5", flexDirection: "row", alignItems: "center" },
  input: { flex: 1, fontSize: 18, color: "#050505", paddingHorizontal: 10 },
  hint: { paddingHorizontal: 20, color: "#65676B", fontSize: 14, marginBottom: 6 },
  spinner: { marginVertical: 12 },
  result: { minHeight: 74, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  resultIcon: { width: 54 }, resultCopy: { flex: 1 },
  name: { fontSize: 17, fontWeight: "800", color: "#050505" }, place: { marginTop: 3, fontSize: 14, color: "#65676B" },
  empty: { padding: 24, fontSize: 16, color: "#65676B" },
});
