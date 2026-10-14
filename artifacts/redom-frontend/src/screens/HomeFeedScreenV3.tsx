import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import HomeIcon from "../assets/home-feed/home.svg";
import VideoIcon from "../assets/home-feed/video.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import SearchIcon from "../assets/home-feed/search.svg";
import MessengerIcon from "../assets/home-feed/messenger.svg";
import CreateIcon from "../assets/home-feed/create.svg";
import AddMediaIcon from "../assets/home-feed/add-media.svg";
import UploadStoryIcon from "../assets/home-feed/upload-story.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import { useAuthContext } from "../auth/context";
import { feedService, type HomeFeedFriendStory, type HomeFeedPost, type HomeFeedProfileSuggestion } from "../feed/service";
import { PostCardV3 } from "./PostCardV3";
import { ReDomMenuDrawer } from "../components/ReDomMenuDrawer";

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />;
}

export function HomeFeedScreenV3() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthContext();
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const { colors } = useTheme();
  const ui = useMemo(() => makeStyles(compact, colors), [compact, colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [suggestions, setSuggestions] = useState<HomeFeedProfileSuggestion[]>([]);
  const [stories, setStories] = useState<HomeFeedFriendStory[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await feedService.getHomeFeed();
      setPosts(result.posts);
      setSuggestions(result.suggestedProfiles);
      setStories(result.friendStories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your Home Feed.");
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { void refreshFeed(); }, [refreshFeed]);

  const firstName = user?.firstName || "";
  const avatar = user?.profilePhoto;
  const openMessages = useCallback(() => navigation.push("Messages"), [navigation]);
  const openComposer = useCallback((prefill: string, imageMode = false) => {
    navigation.navigate("ReDomAI", { context: "home_feed_creation", prefill, imageMode });
  }, [navigation]);
  const openSearch = useCallback(() => navigation.push("Search"), [navigation]);

  return <SafeAreaView style={ui.root} edges={["top", "left", "right"]}>
    <StatusBar style="dark" backgroundColor="#FFFFFF" />
    <View style={ui.topHeader}>
      <View style={ui.brandRow}>
        <Pressable style={ui.menuButton} onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open ReDom menu"><MenuIcon width={23} height={23} /></Pressable>
        <Pressable style={ui.brand} onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); }} accessibilityRole="button" accessibilityLabel="ReDom Home"><ReDomLogo width={compact ? 103 : 118} height={35} /></Pressable>
      </View>
      <View style={ui.topActions}>
        <Pressable style={ui.topButton} onPress={() => openComposer("Help me draft a post for my ReDom Home Feed.")} accessibilityRole="button" accessibilityLabel="Create"><CreateIcon width={23} height={23} /></Pressable>
        <Pressable style={ui.topButton} onPress={openSearch} accessibilityRole="button" accessibilityLabel="Search ReDom" testID="home-feed-search-button"><SearchIcon width={22} height={22} /></Pressable>
        <Pressable style={ui.topButton} onPress={openMessages} accessibilityRole="button" accessibilityLabel="Messages" testID="home-feed-messenger-button"><MessengerIcon width={23} height={23} /></Pressable>
      </View>
    </View>

    <View style={ui.navigationBar}>
      <Pressable style={[ui.navItem, ui.activeNav]} onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); void refreshFeed(); }} accessibilityRole="button" accessibilityLabel="Home"><HomeIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => openComposer("Help me plan a short video for ReDom.")} accessibilityRole="button" accessibilityLabel="Videos"><VideoIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Marketplace")} accessibilityRole="button" accessibilityLabel="Marketplace"><MarketplaceIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Notifications")} accessibilityRole="button" accessibilityLabel="Notifications"><NotificationsIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Profile"><Avatar uri={avatar} size={30} /></Pressable>
    </View>

    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={ui.feed} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} tintColor="#1877F2" colors={["#1877F2"]} />}>
      <View style={ui.composerSection}>
        <View style={ui.composerTop}>
          <Avatar uri={avatar} size={40} />
          <Pressable style={ui.composerInput} onPress={() => openComposer("Help me draft a post for my ReDom Home Feed.")} accessibilityRole="button" accessibilityLabel="Create a post">
            <Text style={ui.composerText}>What's happening in your world{firstName ? ", " + firstName : ""}?</Text>
          </Pressable>
          <Pressable style={ui.composerImageButton} onPress={() => openComposer("Help me prepare a photo post for my ReDom Home Feed.", true)} accessibilityRole="button" accessibilityLabel="Add a photo"><AddMediaIcon width={23} height={23}/></Pressable>
        </View>
        <View style={ui.composerActions}>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me prepare a photo post for my ReDom Home Feed.", true)}><AddMediaIcon width={19} height={19}/><Text style={ui.composerActionText}>Photo</Text></Pressable>
          <View style={ui.actionDivider}/>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me plan a video post for my ReDom Home Feed.")}><VideoIcon width={20} height={20}/><Text style={ui.composerActionText}>Video</Text></Pressable>
          <View style={ui.actionDivider}/>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me plan a ReDom Story.", true)}><UploadStoryIcon width={19} height={19}/><Text style={ui.composerActionText}>Story</Text></Pressable>
        </View>
      </View>

      <View style={ui.section}>
        <View style={ui.sectionHeader}>
          <Text style={ui.sectionTitle}>Stories</Text>
          <Pressable onPress={() => navigation.navigate("Friends", {})} accessibilityRole="button"><Text style={ui.seeAll}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.storyRail}>
          <Pressable style={ui.createStoryCard} onPress={() => openComposer("Help me plan a ReDom Story.", true)} accessibilityRole="button" accessibilityLabel="Create a Story">
            <View style={ui.createStoryArt}><Avatar uri={avatar} size={52}/><View style={ui.storyPlus}><CreateIcon width={13} height={13}/></View></View>
            <Text style={ui.createStoryTitle}>Create Story</Text><Text style={ui.storySub}>Share a moment</Text>
          </Pressable>
          {stories.map((story: HomeFeedFriendStory) => <View key={story.id} style={ui.storyCard}>
            <View style={ui.storyArt}><View style={ui.storyRing}><Avatar uri={story.profilePhoto} size={48}/></View></View>
            <Text style={ui.storyName} numberOfLines={1}>{story.firstName} {story.lastName}</Text>
            <Text style={ui.storySub} numberOfLines={2}>{story.storyText || "Shared a moment"}</Text>
          </View>)}
        </ScrollView>
      </View>



      {error ? <View style={ui.errorCard}><Text style={ui.errorTitle}>Your feed couldn't load</Text><Text style={ui.errorText}>{error}</Text><Pressable style={ui.retryButton} onPress={() => void refreshFeed()}><Text style={ui.retryText}>Try again</Text></Pressable></View> : null}
      {initialLoading ? <View style={ui.loadingCard} accessibilityLabel="Loading Home Feed"><View style={ui.loadingHeader}><View style={ui.skeletonAvatar}/><View style={ui.loadingIdentity}><View style={[ui.skeletonLine, ui.skeletonName]}/><View style={[ui.skeletonLine, ui.skeletonMeta]}/></View></View><View style={ui.skeletonLine}/><View style={[ui.skeletonLine, ui.skeletonShort]}/><View style={ui.skeletonMedia}/></View> : null}
      {!initialLoading && !error && posts.map((post: HomeFeedPost) => <PostCardV3 key={post.id} post={post} onHidden={id => setPosts(current => current.filter(item => item.id !== id))} onUnhidden={() => undefined} />)}

      {!initialLoading && !error && !posts.length ? <View style={ui.emptyCard}>
        <Text style={ui.emptyTitle}>Your feed is quiet for now</Text>
        <Text style={ui.emptyText}>Connect with people to see their updates here.</Text>
        <View style={ui.emptyActions}><Pressable style={ui.primaryAction} onPress={() => navigation.navigate("Friends", {})}><Text style={ui.primaryActionText}>Find people</Text></Pressable><Pressable style={ui.secondaryAction} onPress={() => openComposer("Help me draft a post for my ReDom Home Feed.")}><Text style={ui.secondaryActionText}>Create a post</Text></Pressable></View>
      </View> : null}

      {suggestions.length > 0 ? <View style={ui.discoverySection}>
        <View style={ui.sectionHeader}>
          <View><Text style={ui.sectionEyebrow}>GROW YOUR CIRCLE</Text><Text style={ui.sectionTitle}>People you may know</Text></View>
          <Pressable onPress={() => navigation.navigate("Friends", {})} accessibilityRole="button"><Text style={ui.seeAll}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.suggestionRail}>
          {suggestions.map((profile: HomeFeedProfileSuggestion) => <Pressable key={profile.userId} style={ui.suggestionCard} onPress={() => navigation.navigate("Profile", { userId: profile.userId })} accessibilityRole="button" accessibilityLabel={"Open " + profile.firstName + " " + profile.lastName}>
            <Avatar uri={profile.profilePhoto} size={52}/>
            <View style={ui.suggestionCopy}><Text style={ui.suggestionName} numberOfLines={1}>{profile.firstName} {profile.lastName}</Text><Text style={ui.suggestionHandle} numberOfLines={1}>@{profile.username.replace(/^@/, "")}</Text><Text style={ui.suggestionMeta}>{profile.friendCount} connections</Text></View>
            <Text style={ui.profileArrow}>View profile</Text>
          </Pressable>)}
        </ScrollView>
      </View> : null}
    </ScrollView>
    <ReDomMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
  </SafeAreaView>;
}

function makeStyles(compact: boolean, colors: ReturnType<typeof useTheme>["colors"]) {
  const blue = "#1877F2";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#F0F2F5" },
    topHeader: { height: 58, paddingHorizontal: compact ? 9 : 13, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D9DDE3" },
    brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
    menuButton: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
    brand: { justifyContent: "center" },
    topActions: { flexDirection: "row", alignItems: "center", gap: compact ? 4 : 6 },
    topButton: { width: compact ? 36 : 39, height: 39, borderRadius: 20, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
    navigationBar: { height: 52, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-around", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D9DDE3" },
    navItem: { flex: 1, height: 52, alignItems: "center", justifyContent: "center" },
    activeNav: { borderBottomWidth: 3, borderBottomColor: blue },
    feed: { paddingBottom: 12 },
    composerSection: { marginBottom: 8, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D9DDE3" },
    composerTop: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 12 },
    composerInput: { flex: 1, minHeight: 43, justifyContent: "center", backgroundColor: "#F0F2F5", borderWidth: 0, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 7 },
    composerEyebrow: { color: blue, fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
    composerText: { color: "#555B65", fontSize: compact ? 12 : 13, fontWeight: "400" },
    composerImageButton: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
    composerActions: { height: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginHorizontal: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E1E4E8" },
    composerAction: { flex: 1, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    composerActionText: { color: "#626A75", fontSize: 12, fontWeight: "600" },
    actionDivider: { width: 1, height: 20, backgroundColor: "#E5EAF2" },
    section: { backgroundColor: colors.surface, marginBottom: 8, paddingTop: 12, paddingBottom: 12 },
    sectionHeader: { paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    sectionEyebrow: { color: blue, fontSize: 8, letterSpacing: 1.15, fontWeight: "900" },
    sectionTitle: { color: colors.text, fontSize: compact ? 18 : 19, lineHeight: 24, fontWeight: "700" },
    sectionCount: { color: "#7C8AA0", fontSize: 10, fontWeight: "700" },
    seeAll: { color: blue, fontSize: 12, fontWeight: "800" },
    storyRail: { paddingHorizontal: 12, gap: 8 },
    createStoryCard: { width: 116, height: 166, borderRadius: 11, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: "#D9DDE3", padding: 9, justifyContent: "flex-end" },
    createStoryArt: { position: "absolute", left: 0, right: 0, top: 0, height: 112, backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center" },
    storyPlus: { position: "absolute", bottom: -1, width: 27, height: 27, borderRadius: 14, backgroundColor: blue, borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
    createStoryTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
    storyCard: { width: 116, height: 166, borderRadius: 11, overflow: "hidden", backgroundColor: "#E4E6EB", borderWidth: StyleSheet.hairlineWidth, borderColor: "#D9DDE3", padding: 9, justifyContent: "flex-end" },
    storyArt: { position: "absolute", top: 0, left: 0, right: 0, height: 112, alignItems: "center", justifyContent: "center", backgroundColor: "#DCE4F0" },
    storyRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: blue, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
    storyAccent: { position: "absolute", width: 25, height: 25, borderRadius: 13, backgroundColor: "#BBD6FF", right: 16, top: 16 },
    storyName: { color: colors.text, fontSize: 11, fontWeight: "700" },
    storySub: { color: "#656D78", fontSize: 9, lineHeight: 12, marginTop: 3 },
    storyEmpty: { width: 155, justifyContent: "center", paddingHorizontal: 8 },
    storyEmptyTitle: { color: colors.text, fontSize: 10, fontWeight: "800" },
    storyEmptyText: { color: "#7B879A", fontSize: 9, lineHeight: 13, marginTop: 4 },
    discoverySection: { backgroundColor: colors.surface, marginBottom: 8, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D9DDE3" },
    suggestionRail: { paddingHorizontal: 13, gap: 9 },
    suggestionCard: { width: 230, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#D9DDE3" },
    suggestionCopy: { flex: 1, minWidth: 0 },
    suggestionName: { color: colors.text, fontSize: 12, fontWeight: "700" },
    suggestionHandle: { color: "#7B879A", fontSize: 10, marginTop: 3 },
    suggestionMeta: { color: blue, fontSize: 10, fontWeight: "600", marginTop: 4 },
    profileArrow: { color: blue, fontSize: 9, fontWeight: "800" },
    feedHeading: { paddingHorizontal: 15, paddingVertical: 15, backgroundColor: "#F0F2F5", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    refreshButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#DCE7F6", backgroundColor: "#FFFFFF" },
    refreshText: { color: blue, fontSize: 11, fontWeight: "800" },
    loadingCard: { marginBottom: 8, paddingHorizontal: 13, paddingTop: 14, paddingBottom: 12, backgroundColor: "#FFFFFF", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D9DDE3", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D9DDE3" },
    loadingHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
    skeletonAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#E4E6EB" },
    loadingIdentity: { flex: 1, gap: 7 },
    skeletonName: { width: "42%", height: 10, marginTop: 0 },
    skeletonMeta: { width: "27%", height: 7, marginTop: 0 },
    skeletonLine: { alignSelf: "stretch", height: 8, borderRadius: 4, backgroundColor: "#E4E6EB", marginTop: 8 },
    skeletonShort: { width: "64%", alignSelf: "flex-start", marginTop: 8 },
    skeletonMedia: { alignSelf: "stretch", aspectRatio: 1.7, borderRadius: 2, backgroundColor: "#E4E6EB", marginTop: 13 },
    errorCard: { marginHorizontal: 10, marginBottom: 10, padding: 17, borderRadius: 15, borderWidth: 1, borderColor: "#FFD0D8", backgroundColor: "#FFF5F6" },
    errorTitle: { color: "#A61B35", fontSize: 14, fontWeight: "800" },
    errorText: { color: "#6D2938", fontSize: 12, lineHeight: 17, marginTop: 6 },
    retryButton: { alignSelf: "flex-start", marginTop: 11, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 9, backgroundColor: blue },
    retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    emptyCard: { marginHorizontal: 0, marginTop: 0, marginBottom: 8, borderRadius: 0, backgroundColor: "#FFFFFF", paddingHorizontal: 16, paddingVertical: 15, alignItems: "flex-start", borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#D9DDE3" },
    emptyMark: { width: 78, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF5FF", borderRadius: 9, marginBottom: 10 },
    emptyEyebrow: { color: blue, fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
    emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700", textAlign: "left" },
    emptyText: { color: "#656D78", fontSize: 12, lineHeight: 17, textAlign: "left", marginTop: 4, maxWidth: 340 },
    emptyActions: { flexDirection: "row", alignSelf: "flex-start", gap: 8, marginTop: 11 },
    primaryAction: { minHeight: 35, borderRadius: 7, backgroundColor: blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    primaryActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
    secondaryAction: { minHeight: 35, borderRadius: 7, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    secondaryActionText: { color: blue, fontSize: 11, fontWeight: "800" },
  });
}
