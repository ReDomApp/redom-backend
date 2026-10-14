import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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

  return <SafeAreaView style={ui.root}>
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
      <Pressable style={ui.navItem} onPress={() => openComposer("Help me plan a short video for ReDom.", true)} accessibilityRole="button" accessibilityLabel="Videos"><VideoIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Marketplace")} accessibilityRole="button" accessibilityLabel="Marketplace"><MarketplaceIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Notifications")} accessibilityRole="button" accessibilityLabel="Notifications"><NotificationsIcon width={25} height={25} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Profile"><Avatar uri={avatar} size={30} /></Pressable>
    </View>

    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={ui.feed} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} tintColor="#1877F2" colors={["#1877F2"]} />}>
      <View style={ui.composerSection}>
        <View style={ui.composerTop}>
          <Avatar uri={avatar} size={42} />
          <Pressable style={ui.composerInput} onPress={() => openComposer("Help me draft a post for my ReDom Home Feed.")} accessibilityRole="button" accessibilityLabel="Create a post">
            <Text style={ui.composerEyebrow}>YOUR REDOM WORLD</Text>
            <Text style={ui.composerText}>Share something with your world{firstName ? ", " + firstName : ""}.</Text>
          </Pressable>
        </View>
        <View style={ui.composerActions}>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me prepare a photo post for my ReDom Home Feed.", true)}><AddMediaIcon width={20} height={20}/><Text style={ui.composerActionText}>Photo</Text></Pressable>
          <View style={ui.actionDivider}/>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me plan a video post for my ReDom Home Feed.", true)}><VideoIcon width={20} height={20}/><Text style={ui.composerActionText}>Video</Text></Pressable>
          <View style={ui.actionDivider}/>
          <Pressable style={ui.composerAction} onPress={() => openComposer("Help me plan a ReDom Story.", true)}><UploadStoryIcon width={20} height={20}/><Text style={ui.composerActionText}>Story</Text></Pressable>
        </View>
      </View>

      <View style={ui.section}>
        <View style={ui.sectionHeader}>
          <View><Text style={ui.sectionEyebrow}>SHARE MOMENTS</Text><Text style={ui.sectionTitle}>Stories</Text></View>
          <Text style={ui.sectionCount}>{stories.length ? stories.length + " available" : "Your circle"}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.storyRail}>
          <Pressable style={ui.createStoryCard} onPress={() => openComposer("Help me plan a ReDom Story.", true)} accessibilityRole="button" accessibilityLabel="Create a Story">
            <View style={ui.createStoryArt}><Avatar uri={avatar} size={57}/><View style={ui.storyPlus}><CreateIcon width={14} height={14}/></View></View>
            <Text style={ui.createStoryTitle}>Create a Story</Text><Text style={ui.storySub}>Share a moment</Text>
          </Pressable>
          {stories.map((story: HomeFeedFriendStory) => <View key={story.id} style={ui.storyCard}>
            <View style={ui.storyArt}><View style={ui.storyRing}><Avatar uri={story.profilePhoto} size={54}/></View><View style={ui.storyAccent}/></View>
            <Text style={ui.storyName} numberOfLines={1}>{story.firstName} {story.lastName}</Text>
            <Text style={ui.storySub}>ReDom Story</Text>
          </View>)}
          {!stories.length ? <View style={ui.storyEmpty}><Text style={ui.storyEmptyTitle}>Your people, their moments</Text><Text style={ui.storyEmptyText}>Stories from your connections will appear here.</Text></View> : null}
        </ScrollView>
      </View>

      {suggestions.length > 0 ? <View style={ui.discoverySection}>
        <View style={ui.sectionHeader}>
          <View><Text style={ui.sectionEyebrow}>GROW YOUR CIRCLE</Text><Text style={ui.sectionTitle}>People you may know</Text></View>
          <Pressable onPress={() => navigation.navigate("Friends")} accessibilityRole="button"><Text style={ui.seeAll}>See all</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.suggestionRail}>
          {suggestions.map((profile: HomeFeedProfileSuggestion) => <Pressable key={profile.userId} style={ui.suggestionCard} onPress={() => navigation.navigate("Profile", { userId: profile.userId })} accessibilityRole="button" accessibilityLabel={"Open " + profile.firstName + " " + profile.lastName}>
            <Avatar uri={profile.profilePhoto} size={52}/>
            <View style={ui.suggestionCopy}><Text style={ui.suggestionName} numberOfLines={1}>{profile.firstName} {profile.lastName}</Text><Text style={ui.suggestionHandle} numberOfLines={1}>@{profile.username.replace(/^@/, "")}</Text><Text style={ui.suggestionMeta}>{profile.friendCount} connections</Text></View>
            <Text style={ui.profileArrow}>View profile</Text>
          </Pressable>)}
        </ScrollView>
      </View> : null}

      <View style={ui.feedHeading}>
        <View><Text style={ui.sectionEyebrow}>FOR YOUR WORLD</Text><Text style={ui.sectionTitle}>Home Feed</Text></View>
        <Pressable style={ui.refreshButton} onPress={() => void refreshFeed()} accessibilityRole="button" accessibilityLabel="Refresh Home Feed"><Text style={ui.refreshText}>Refresh</Text></Pressable>
      </View>

      {error ? <View style={ui.errorCard}><Text style={ui.errorTitle}>Your feed couldn't load</Text><Text style={ui.errorText}>{error}</Text><Pressable style={ui.retryButton} onPress={() => void refreshFeed()}><Text style={ui.retryText}>Try again</Text></Pressable></View> : null}
      {initialLoading ? <View style={ui.loadingCard}><ActivityIndicator color="#1877F2" size="small"/><Text style={ui.loadingTitle}>Bringing your world together</Text><Text style={ui.loadingText}>Loading posts and recommendations for you.</Text><View style={ui.skeletonLine}/><View style={[ui.skeletonLine, ui.skeletonShort]}/><View style={ui.skeletonMedia}/></View> : null}
      {!initialLoading && !error && posts.map((post: HomeFeedPost) => <PostCardV3 key={post.id} post={post} onHidden={id => setPosts(current => current.filter(item => item.id !== id))} onUnhidden={() => undefined} />)}
      {!initialLoading && !error && !posts.length ? <View style={ui.emptyCard}>
        <View style={ui.emptyMark}><ReDomLogo width={84} height={25}/></View>
        <Text style={ui.emptyEyebrow}>A NEW CHAPTER STARTS HERE</Text>
        <Text style={ui.emptyTitle}>Your ReDom world starts here.</Text>
        <Text style={ui.emptyText}>As you connect with people and discover creators, your Home Feed will bring their posts and shared moments together.</Text>
        <View style={ui.emptyActions}><Pressable style={ui.primaryAction} onPress={() => navigation.navigate("Friends")}><Text style={ui.primaryActionText}>Discover people</Text></Pressable><Pressable style={ui.secondaryAction} onPress={() => openComposer("Help me explore video creation on ReDom.", true)}><Text style={ui.secondaryActionText}>Explore creation</Text></Pressable></View>
      </View> : null}
      <View style={ui.feedFooter}><Text style={ui.footerTitle}>Made for your world.</Text><Text style={ui.footerText}>Discover, connect and create with ReDom.</Text></View>
    </ScrollView>
    <ReDomMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
  </SafeAreaView>;
}

function makeStyles(compact: boolean, colors: ReturnType<typeof useTheme>["colors"]) {
  const blue = "#1877F2";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#F3F6FB" },
    topHeader: { minHeight: 58, paddingHorizontal: compact ? 9 : 14, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E7ECF4" },
    brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
    menuButton: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
    brand: { justifyContent: "center" },
    topActions: { flexDirection: "row", alignItems: "center", gap: compact ? 4 : 7 },
    topButton: { width: compact ? 36 : 39, height: 39, borderRadius: 20, backgroundColor: "#F1F5FB", alignItems: "center", justifyContent: "center" },
    navigationBar: { height: 51, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-around", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E3E9F2" },
    navItem: { flex: 1, height: 51, alignItems: "center", justifyContent: "center" },
    activeNav: { borderBottomWidth: 3, borderBottomColor: blue },
    feed: { paddingBottom: 28 },
    composerSection: { marginBottom: 9, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: "#E7ECF4" },
    composerTop: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 14 },
    composerInput: { flex: 1, minHeight: 49, justifyContent: "center", backgroundColor: "#F5F8FD", borderWidth: 1, borderColor: "#E7EDF6", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 8 },
    composerEyebrow: { color: blue, fontSize: 8, fontWeight: "900", letterSpacing: 1.05 },
    composerText: { color: colors.text, fontSize: compact ? 12 : 13, fontWeight: "600", marginTop: 3 },
    composerActions: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginHorizontal: 13, borderTopWidth: 1, borderTopColor: "#EDF1F7" },
    composerAction: { flex: 1, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    composerActionText: { color: "#344054", fontSize: 12, fontWeight: "700" },
    actionDivider: { width: 1, height: 20, backgroundColor: "#E5EAF2" },
    section: { backgroundColor: colors.surface, marginBottom: 9, paddingTop: 14, paddingBottom: 13 },
    sectionHeader: { paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    sectionEyebrow: { color: blue, fontSize: 8, letterSpacing: 1.15, fontWeight: "900" },
    sectionTitle: { color: colors.text, fontSize: compact ? 17 : 19, lineHeight: 24, fontWeight: "800", marginTop: 2 },
    sectionCount: { color: "#7C8AA0", fontSize: 10, fontWeight: "700" },
    seeAll: { color: blue, fontSize: 12, fontWeight: "800" },
    storyRail: { paddingHorizontal: 13, gap: 9 },
    createStoryCard: { width: 122, minHeight: 151, borderRadius: 15, overflow: "hidden", backgroundColor: "#EAF2FF", borderWidth: 1, borderColor: "#D8E7FD", padding: 11, justifyContent: "flex-end" },
    createStoryArt: { position: "absolute", left: 0, right: 0, top: 0, height: 94, backgroundColor: "#D5E7FF", alignItems: "center", justifyContent: "center" },
    storyPlus: { position: "absolute", right: 27, bottom: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: blue, borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
    createStoryTitle: { color: "#172B4D", fontSize: 12, fontWeight: "900" },
    storyCard: { width: 122, minHeight: 151, borderRadius: 15, overflow: "hidden", backgroundColor: "#F6F8FC", borderWidth: 1, borderColor: "#E3EAF4", padding: 11, justifyContent: "flex-end" },
    storyArt: { position: "absolute", top: 0, left: 0, right: 0, height: 94, alignItems: "center", justifyContent: "center", backgroundColor: "#DCE9FC" },
    storyRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: blue, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
    storyAccent: { position: "absolute", width: 25, height: 25, borderRadius: 13, backgroundColor: "#BBD6FF", right: 16, top: 16 },
    storyName: { color: colors.text, fontSize: 12, fontWeight: "800" },
    storySub: { color: "#7B879A", fontSize: 9, marginTop: 4 },
    storyEmpty: { width: 190, justifyContent: "center", paddingHorizontal: 10 },
    storyEmptyTitle: { color: colors.text, fontSize: 11, fontWeight: "800" },
    storyEmptyText: { color: "#7B879A", fontSize: 10, lineHeight: 14, marginTop: 5 },
    discoverySection: { backgroundColor: colors.surface, marginBottom: 9, paddingVertical: 14 },
    suggestionRail: { paddingHorizontal: 13, gap: 9 },
    suggestionCard: { width: 230, flexDirection: "row", alignItems: "center", gap: 10, padding: 11, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E4EAF3" },
    suggestionCopy: { flex: 1, minWidth: 0 },
    suggestionName: { color: colors.text, fontSize: 12, fontWeight: "800" },
    suggestionHandle: { color: "#7B879A", fontSize: 10, marginTop: 3 },
    suggestionMeta: { color: blue, fontSize: 9, fontWeight: "700", marginTop: 4 },
    profileArrow: { color: blue, fontSize: 9, fontWeight: "800" },
    feedHeading: { paddingHorizontal: 15, paddingVertical: 15, backgroundColor: "#F3F6FB", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    refreshButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#DCE7F6", backgroundColor: "#FFFFFF" },
    refreshText: { color: blue, fontSize: 11, fontWeight: "800" },
    loadingCard: { marginHorizontal: 10, marginBottom: 10, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 18, borderWidth: 1, borderColor: "#E5EBF4", alignItems: "center" },
    loadingTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 10 },
    loadingText: { color: "#7B879A", fontSize: 11, textAlign: "center", marginTop: 5 },
    skeletonLine: { alignSelf: "stretch", height: 8, borderRadius: 5, backgroundColor: "#EDF2F9", marginTop: 18 },
    skeletonShort: { width: "58%", alignSelf: "flex-start", marginTop: 8 },
    skeletonMedia: { alignSelf: "stretch", height: 135, borderRadius: 12, backgroundColor: "#E7EFFB", marginTop: 14 },
    errorCard: { marginHorizontal: 10, marginBottom: 10, padding: 17, borderRadius: 15, borderWidth: 1, borderColor: "#FFD0D8", backgroundColor: "#FFF5F6" },
    errorTitle: { color: "#A61B35", fontSize: 14, fontWeight: "800" },
    errorText: { color: "#6D2938", fontSize: 12, lineHeight: 17, marginTop: 6 },
    retryButton: { alignSelf: "flex-start", marginTop: 11, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 9, backgroundColor: blue },
    retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    emptyCard: { marginHorizontal: 10, marginTop: 2, borderRadius: 18, backgroundColor: "#FFFFFF", paddingHorizontal: 21, paddingVertical: 25, alignItems: "center", borderWidth: 1, borderColor: "#E3EAF4" },
    emptyMark: { width: 100, height: 45, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF5FF", borderRadius: 13, marginBottom: 15 },
    emptyEyebrow: { color: blue, fontSize: 8, fontWeight: "900", letterSpacing: 1.3 },
    emptyTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "900", textAlign: "center", marginTop: 7 },
    emptyText: { color: "#697991", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 8, maxWidth: 340 },
    emptyActions: { flexDirection: compact ? "column" : "row", alignSelf: "stretch", gap: 9, marginTop: 17 },
    primaryAction: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    primaryActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    secondaryAction: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: "#EEF4FE", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
    secondaryActionText: { color: blue, fontSize: 12, fontWeight: "800" },
    feedFooter: { alignItems: "center", paddingVertical: 25 },
    footerTitle: { color: "#52627A", fontSize: 12, fontWeight: "800" },
    footerText: { color: "#8995A8", fontSize: 10, marginTop: 4 },
  });
}
