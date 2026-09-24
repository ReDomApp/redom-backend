import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../routing/types";
import { linkHistoryService, type LinkHistoryEntry } from "../linkHistory/linkHistoryService";
import { openExternalLink } from "../utils/openExternalLink";

export function LinkHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [items, setItems] = useState<LinkHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setError(null); const result = await linkHistoryService.list(); setItems(result.links); }
    catch (e) { setError(e instanceof Error ? e.message : "Link history could not be loaded."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const clear = () => Alert.alert("Clear link history?", "This removes your saved link history from ReDom.", [
    { text: "Cancel", style: "cancel" },
    { text: "Clear", style: "destructive", onPress: async () => { try { await linkHistoryService.clear(); setItems([]); } catch (e) { setError(e instanceof Error ? e.message : "Link history could not be cleared."); } } },
  ]);

  const remove = (id: string) => Alert.alert("Remove link?", "Remove this link from your ReDom link history.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => { try { await linkHistoryService.remove(id); setItems(current => current.filter(item => item.id !== id)); } catch (e) { setError(e instanceof Error ? e.message : "Link could not be removed."); } } },
  ]);

  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back"><Text style={[styles.back, { color: colors.primary }]}>‹</Text></Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Link history</Text>
      <Pressable onPress={clear} disabled={!items.length}><Text style={[styles.clear, { color: items.length ? colors.primary : colors.muted }]}>Clear</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}>
      <Text style={[styles.intro, { color: colors.muted }]}>Links you open from ReDom can appear here. Your history is private to your account.</Text>
      {error ? <View style={[styles.error, { backgroundColor: colors.surface }]}><Text style={{ color: colors.text }}>{error}</Text></View> : null}
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : items.length ? items.map(item =>
        <Pressable key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => void openExternalLink(item.url, item.title ?? item.domain, "link-history")} onLongPress={() => remove(item.id)}>
          <View style={styles.icon}><Text style={{ color: colors.primary, fontSize: 20 }}>↗</Text></View>
          <View style={styles.body}><Text numberOfLines={1} style={[styles.domain, { color: colors.text }]}>{item.domain}</Text><Text numberOfLines={2} style={[styles.url, { color: colors.muted }]}>{item.title || item.url}</Text><Text style={[styles.time, { color: colors.muted }]}>{new Date(item.openedAt).toLocaleString()}</Text></View>
          <Text style={[styles.more, { color: colors.muted }]}>⋯</Text>
        </Pressable>
      ) : <View style={[styles.empty, { backgroundColor: colors.surface }]}><Text style={[styles.emptyTitle, { color: colors.text }]}>No links yet</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Links you open from ReDom will be saved here.</Text></View>}
      <Pressable onPress={() => navigation.navigate("Policy", { slug: "link_history" })} style={[styles.policy, { backgroundColor: colors.surface }]}><Text style={[styles.policyText, { color: colors.text }]}>Link History Policy</Text><Text style={[styles.chevron, { color: colors.muted }]}>›</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root:{flex:1}, header:{height:58,borderBottomWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:12}, back:{fontSize:38}, title:{fontSize:19,fontWeight:"800"}, clear:{fontSize:14,fontWeight:"700"}, content:{padding:12,paddingBottom:40}, intro:{fontSize:14,lineHeight:21,marginBottom:12}, card:{minHeight:78,borderWidth:1,borderRadius:12,padding:12,marginBottom:8,flexDirection:"row",alignItems:"center"}, icon:{width:40,height:40,borderRadius:20,alignItems:"center",justifyContent:"center"}, body:{flex:1,marginLeft:8},domain:{fontSize:15,fontWeight:"800"},url:{fontSize:13,marginTop:3},time:{fontSize:11,marginTop:5},more:{fontSize:22,paddingHorizontal:4},error:{padding:12,borderRadius:10,marginBottom:10},empty:{padding:22,borderRadius:12,alignItems:"center"},emptyTitle:{fontSize:17,fontWeight:"800"},emptyText:{fontSize:14,textAlign:"center",marginTop:6},policy:{marginTop:14,minHeight:54,borderRadius:12,paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},policyText:{fontSize:15,fontWeight:"700"},chevron:{fontSize:28}});
