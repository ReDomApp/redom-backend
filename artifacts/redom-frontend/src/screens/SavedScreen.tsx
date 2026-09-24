import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { productService, type SavedCollection, type SavedFriend, type SavedItem } from "../product/productService";
import BackIcon from "../assets/navigation/back.svg";
import SearchIcon from "../assets/home-feed/search.svg";
import SavedIcon from "../assets/home-feed/saved.svg";
import EmptySavedIcon from "../assets/home-feed/saved-empty.svg";

const BLUE = "#1877F2";
type Tab = "all" | "reels" | "posts" | "marketplace" | "collections" | "local";
const tabs: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "All" }, { key: "reels", label: "Reels" }, { key: "posts", label: "Posts" },
  { key: "marketplace", label: "Marketplace" }, { key: "collections", label: "Collections" }, { key: "local", label: "Local" },
];

export function SavedScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<SavedItem[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [friends, setFriends] = useState<SavedFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [collaborative, setCollaborative] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await productService.getSaved(tab);
      setItems(result.saved ?? []);
      setCollections(result.collections ?? []);
    } catch (error) {
      Alert.alert("Saved", error instanceof Error ? error.message : "Saved content could not be loaded.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = async () => {
    setName(""); setIsPublic(false); setCollaborative(false); setSelectedFriends([]);
    setCreateOpen(true);
    try { const result = await productService.getSavedFriends(); setFriends(result.friends ?? []); } catch { setFriends([]); }
  };

  const createCollection = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert("Create a collection", "Enter a collection name."); return; }
    setCreating(true);
    try {
      await productService.createSavedCollection({ name: trimmed, isPublic, collaborative, contributorUserIds: collaborative ? selectedFriends : [] });
      setCreateOpen(false);
      setTab("collections");
      await load();
    } catch (error) {
      Alert.alert("Create a collection", error instanceof Error ? error.message : "The collection could not be created.");
    } finally { setCreating(false); }
  };

  const filteredItems = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (item.content?.content ?? "").toLowerCase().includes(q) || item.contentType.toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back"><BackIcon width={28} height={28} /></Pressable>
        {searchOpen ? <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Search saved" style={styles.searchInput} /> : <Text style={styles.title}>Saved</Text>}
        <Pressable onPress={() => { setSearchOpen((v) => !v); if (searchOpen) setSearch(""); }} accessibilityRole="button" accessibilityLabel="Search saved"><SearchIcon width={28} height={28} /></Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((item) => <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabActive]}><Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text></Pressable>)}
      </ScrollView>

      {tab === "collections" ? (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={styles.collectionsContent}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your collections</Text><Pressable onPress={openCreate}><Text style={styles.link}>New collection</Text></Pressable></View>
          {collections.map((collection) => <Pressable key={collection.id} style={styles.collectionRow}><View style={styles.collectionIcon}><SavedIcon width={28} height={28} /></View><View style={styles.collectionCopy}><Text style={styles.collectionName}>{collection.name}</Text><Text style={styles.collectionMeta}>{collection.isPublic ? "Public" : collection.collaborative ? "Collaborative" : "Private"}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}
          {!collections.length ? <><View style={styles.collectionEmpty}><Text style={styles.collectionEmptyText}>Create collections to organize your saved things.</Text></View><Pressable style={styles.primaryButton} onPress={openCreate}><Text style={styles.primaryButtonText}>Create collection</Text></Pressable></> : null}
        </ScrollView>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={styles.content}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Collections</Text><Pressable onPress={openCreate}><Text style={styles.link}>New collection</Text></Pressable></View>
          <Pressable style={styles.newCollectionRow} onPress={openCreate}><View style={styles.collectionIcon}><SavedIcon width={28} height={28} /></View><Text style={styles.newCollectionText}>Create a new collection</Text><Text style={styles.chevron}>›</Text></Pressable>
          <Text style={styles.recentTitle}>Recently saved</Text>
          {loading ? <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 60 }} /> : filteredItems.length ? filteredItems.map((item) => <View key={item.id} style={styles.savedCard}><View style={styles.savedBadge}><SavedIcon width={20} height={20} /></View><View style={styles.savedCopy}><Text style={styles.savedType}>{item.content?.type ?? item.contentType}</Text><Text style={styles.savedText} numberOfLines={3}>{item.content?.content || "Saved ReDom content"}</Text><Text style={styles.savedDate}>{new Date(item.createdAt).toLocaleDateString()}</Text></View></View>) : <View style={styles.empty}><EmptySavedIcon width={220} height={180} /><Text style={styles.emptyTitle}>A place for your saved things</Text><Text style={styles.emptyBody}>Rediscover your saved content here or organize it into collections.</Text></View>}
        </ScrollView>
      )}

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}><Pressable onPress={() => setCreateOpen(false)}><BackIcon width={28} height={28} /></Pressable><Text style={styles.sheetTitle}>Create a collection</Text><Pressable onPress={createCollection} disabled={creating}><Text style={[styles.done, creating && styles.disabled]}>Done</Text></Pressable></View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <TextInput value={name} onChangeText={setName} placeholder="Collection name" style={styles.nameInput} maxLength={100} />
              <Text style={styles.required}>Required</Text>
              <View style={styles.optionRow}><View style={styles.optionCopy}><Text style={[styles.optionTitle, collaborative && styles.disabledText]}>Set the collection to public</Text><Text style={[styles.optionSubtitle, collaborative && styles.disabledText]}>Visible to anyone on or off ReDom</Text></View><Switch value={isPublic} onValueChange={(value) => { if (!collaborative) setIsPublic(value); }} disabled={collaborative} trackColor={{ false: "#D1D5DB", true: BLUE }} /></View>
              <View style={styles.optionRow}><View style={styles.optionCopy}><Text style={[styles.optionTitle, isPublic && styles.disabledText]}>Add contributors</Text><Text style={[styles.optionSubtitle, isPublic && styles.disabledText]}>Build a collection with friends</Text></View><Switch value={collaborative} onValueChange={(value) => { if (!isPublic) setCollaborative(value); }} disabled={isPublic} trackColor={{ false: "#D1D5DB", true: BLUE }} /></View>
              {collaborative ? <View style={styles.friends}><Text style={styles.friendHeading}>Choose friends</Text>{friends.slice(0, 8).map((friend) => <Pressable key={friend.id} onPress={() => setSelectedFriends((current) => current.includes(friend.id) ? current.filter((id) => id !== friend.id) : [...current, friend.id])} style={styles.friendRow}><View style={styles.avatar}>{friend.profilePhoto ? <Image source={{ uri: friend.profilePhoto }} style={styles.avatarImage} /> : <Text style={styles.avatarLetter}>{friend.name.charAt(0)}</Text>}</View><Text style={styles.friendName}>{friend.name}</Text><View style={[styles.check, selectedFriends.includes(friend.id) && styles.checkActive]}>{selectedFriends.includes(friend.id) ? <Text style={styles.checkMark}>✓</Text> : null}</View></Pressable>)}</View> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({
  root:{flex:1,backgroundColor: colors.surface}, header:{height:58,borderBottomWidth:1,borderBottomColor: colors.border,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16}, title:{fontSize:20,fontWeight:"800",color: colors.text},searchInput:{flex:1,marginHorizontal:14,fontSize:17},tabs:{paddingHorizontal:12,paddingVertical:10,gap:8},tab:{paddingHorizontal:20,paddingVertical:10,borderRadius:22},tabActive:{backgroundColor: colors.surfaceSecondary},tabText:{fontSize:16,color: colors.text},tabTextActive:{color:BLUE,fontWeight:"700"},content:{paddingHorizontal:22,paddingBottom:50},collectionsContent:{paddingHorizontal:22,paddingBottom:50},sectionHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:34,marginBottom:20},sectionTitle:{fontSize:24,fontWeight:"800",color: colors.text},link:{fontSize:17,color:"#1877F2"},newCollectionRow:{height:70,flexDirection:"row",alignItems:"center",gap:14},collectionIcon:{width:54,height:54,borderRadius:27,backgroundColor: colors.surfaceSecondary,alignItems:"center",justifyContent:"center"},newCollectionText:{flex:1,fontSize:18,fontWeight:"700",color: colors.text},chevron:{fontSize:40,color: colors.textSecondary,lineHeight:42},recentTitle:{fontSize:22,fontWeight:"800",marginTop:28,marginBottom:10,color: colors.text},empty:{alignItems:"center",paddingTop:90,paddingHorizontal:40},emptyTitle:{fontSize:27,fontWeight:"800",color: colors.textSecondary,textAlign:"center",marginTop:8},emptyBody:{fontSize:18,lineHeight:25,color: colors.textSecondary,textAlign:"center",marginTop:12},savedCard:{flexDirection:"row",borderTopWidth:1,borderTopColor: colors.border,paddingVertical:14},savedBadge:{width:42,height:42,borderRadius:21,backgroundColor: colors.surfaceSecondary,alignItems:"center",justifyContent:"center"},savedCopy:{flex:1,marginLeft:12},savedType:{fontSize:13,fontWeight:"700",color:BLUE,textTransform:"capitalize"},savedText:{fontSize:16,color: colors.text,marginTop:3},savedDate:{fontSize:12,color: colors.textSecondary,marginTop:5},collectionRow:{flexDirection:"row",alignItems:"center",paddingVertical:14,borderBottomWidth:1,borderBottomColor: colors.border},collectionCopy:{flex:1,marginLeft:14},collectionName:{fontSize:17,fontWeight:"700",color: colors.text},collectionMeta:{fontSize:13,color: colors.textSecondary,marginTop:3},collectionEmpty:{paddingTop:120,alignItems:"center"},collectionEmptyText:{fontSize:17,color: colors.textSecondary,textAlign:"center",maxWidth:300},primaryButton:{alignSelf:"flex-start",marginTop:30,backgroundColor:BLUE,borderRadius:12,paddingHorizontal:22,paddingVertical:14},primaryButtonText:{color:"#FFF",fontSize:16,fontWeight:"800"},modalRoot:{flex:1,justifyContent:"flex-end"},modalBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.4)"},sheet:{backgroundColor: colors.surfaceSecondary,borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"86%"},handle:{alignSelf:"center",width:76,height:6,borderRadius:3,backgroundColor:"#8A8D91",marginTop:10,marginBottom:6},sheetHeader:{height:58,flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20},sheetTitle:{fontSize:20,fontWeight:"800",color: colors.text},done:{fontSize:18,color:BLUE,fontWeight:"500"},disabled:{opacity:.45},sheetContent:{backgroundColor: colors.surface,margin:12,borderRadius:14,padding:16,paddingBottom:30},nameInput:{borderWidth:1,borderColor: colors.border,borderRadius:20,height:116,paddingHorizontal:18,fontSize:19,color: colors.text},required:{fontSize:15,color: colors.textSecondary,marginTop:8,marginBottom:28},optionRow:{minHeight:82,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderTopWidth:1,borderTopColor: colors.border},optionCopy:{flex:1,paddingRight:15},optionTitle:{fontSize:17,fontWeight:"700",color: colors.text},optionSubtitle:{fontSize:14,color: colors.textSecondary,marginTop:4},disabledText:{color: colors.textSecondary},friends:{paddingTop:14},friendHeading:{fontSize:17,fontWeight:"800",marginBottom:8},friendRow:{height:58,flexDirection:"row",alignItems:"center"},avatar:{width:42,height:42,borderRadius:21,backgroundColor:"#E4E6EB",overflow:"hidden",alignItems:"center",justifyContent:"center"},avatarImage:{width:42,height:42},avatarLetter:{fontSize:18,fontWeight:"800",color: colors.textSecondary},friendName:{flex:1,marginLeft:12,fontSize:16},check:{width:24,height:24,borderRadius:12,borderWidth:2,borderColor:"#BEC2C7",alignItems:"center",justifyContent:"center"},checkActive:{backgroundColor:BLUE,borderColor:BLUE},checkMark:{color:"#FFF",fontWeight:"800"}
}); }

