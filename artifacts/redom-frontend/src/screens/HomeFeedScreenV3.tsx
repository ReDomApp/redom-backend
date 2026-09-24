import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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
import MoreIcon from "../assets/navigation/more.svg";
import MusicIcon from "../assets/home-feed/music.svg";
import { useAuthContext } from "../auth/context";
import { feedService, type HomeFeedFriendStory, type HomeFeedPost, type HomeFeedProfileSuggestion } from "../feed/service";
import { PostCardV3 } from "./PostCardV3";
import { ReDomMenuDrawer } from "../components/ReDomMenuDrawer";

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />;
}

export function HomeFeedScreenV3() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuthContext();
  const { width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.86, width / 412));
  const ui = useMemo(() => makeStyles(scale), [scale]);
  const scrollRef = useRef<ScrollView>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<HomeFeedPost[]>([]);
  const [suggestions, setSuggestions] = useState<HomeFeedProfileSuggestion[]>([]);
  const [stories, setStories] = useState<HomeFeedFriendStory[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await feedService.getHomeFeed();
      setPosts(result.posts);
      setSuggestions(result.suggestedProfiles);
      setStories(result.friendStories);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refreshFeed(); }, [refreshFeed]);

  const firstName = user?.firstName || "";
  const avatar = user?.profilePhoto;
  const openMessages = useCallback(() => {
    navigation.push("Messages");
  }, [navigation]);

  return <SafeAreaView style={ui.root}>
    <View style={ui.topHeader}>
      <View style={ui.brandRow}><Pressable style={ui.menuButton} onPress={() => setMenuOpen(true)} accessibilityLabel="Menu"><MenuIcon width={25} height={25} /></Pressable><View style={ui.brand}><ReDomLogo width={n(120, scale)} height={n(36, scale)} /></View></View>
      <View style={ui.topActions}>
        <Pressable style={ui.topButton} accessibilityLabel="Create"><CreateIcon width={24} height={24} pointerEvents="none" /></Pressable>
        <Pressable style={ui.topButton} accessibilityLabel="Search"><SearchIcon width={24} height={24} pointerEvents="none" /></Pressable>
        <Pressable style={ui.topButton} onPress={openMessages} hitSlop={10} accessibilityRole="button" accessibilityLabel="Messenger" testID="home-feed-messenger-button"><View pointerEvents="none" style={ui.messengerIcon}><MessengerIcon width={24} height={24} /></View></Pressable>
      </View>
    </View>

    <View style={ui.navigationBar}>
      <Pressable style={[ui.navItem, ui.activeNav]} onPress={() => { scrollRef.current?.scrollTo({ y: 0, animated: true }); void refreshFeed(); }} accessibilityLabel="Home"><HomeIcon width={26} height={26} /></Pressable>
      <Pressable style={ui.navItem} accessibilityLabel="Reels"><VideoIcon width={26} height={26} /></Pressable>
      <Pressable style={ui.navItem} accessibilityLabel="Marketplace"><MarketplaceIcon width={26} height={26} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Notifications")} accessibilityLabel="Notifications"><NotificationsIcon width={26} height={26} /></Pressable>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("Profile")} accessibilityLabel="Profile"><Avatar uri={avatar} size={31} /></Pressable>
    </View>

    <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={ui.feed} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} />}>
      <View style={ui.composer}>
        <Avatar uri={avatar} size={40} />
        <Pressable style={ui.composerInput} accessibilityLabel="Create a post"><Text style={ui.composerText}>What's on your mind{firstName ? `, ${firstName}` : ""}?</Text></Pressable>
        <Pressable style={ui.mediaButton} accessibilityLabel="Add photo or video"><AddMediaIcon width={24} height={24} /></Pressable>
      </View>

      <View style={ui.storyHeader}><Text style={ui.sectionTitle}>Stories</Text><Pressable><Text style={ui.seeAll}>See all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.storyRail}>
        <Pressable style={ui.storyCard} accessibilityLabel="Create story">
          <Avatar uri={avatar} size={68} />
          <View style={ui.storyPlus}><CreateIcon width={15} height={15} /></View>
          <View style={ui.storyBottom}><Text style={ui.storyName}>Create story</Text></View>
        </Pressable>
        <Pressable style={ui.musicCard} accessibilityLabel="Share music">
          <MusicIcon width={44} height={44} />
          <Text style={ui.musicTitle}>Share music</Text>
          <Text style={ui.musicSub}>you love</Text>
        </Pressable>
        {stories.slice(0, 12).map((story: HomeFeedFriendStory) => <Pressable key={story.id} style={ui.storyCard} accessibilityLabel={`Story by ${story.firstName}`}>
          <View style={ui.storyPhoto}><Avatar uri={story.profilePhoto} size={68} /></View>
          <View style={ui.storyBottom}><Text style={ui.storyName} numberOfLines={2}>{story.firstName} {story.lastName}</Text></View>
        </Pressable>)}
      </ScrollView>

      {suggestions.length > 0 ? <View style={ui.suggestionsBlock}>
        <View style={ui.sectionRow}><Text style={ui.sectionTitle}>People you may know</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.suggestionRail}>
          {suggestions.map((profile: HomeFeedProfileSuggestion) => <Pressable key={profile.userId} style={ui.suggestionCard} onPress={() => navigation.navigate("Profile", { userId: profile.userId })} accessibilityLabel={`Open ${profile.firstName} ${profile.lastName}`}>
            <Avatar uri={profile.profilePhoto} size={72} />
            <Text style={ui.suggestionName} numberOfLines={1}>{profile.firstName} {profile.lastName}</Text>
            <Text style={ui.suggestionHandle} numberOfLines={1}>@{profile.username.replace(/^@/, "")}</Text>
          </Pressable>)}
        </ScrollView>
      </View> : null}

      {posts.map((post: HomeFeedPost) => <PostCardV3 key={post.id} post={post} onHidden={id => setPosts(current => current.filter(item => item.id !== id))} onUnhidden={() => undefined} />)}
      {!posts.length ? <View style={ui.empty}><Text style={ui.emptyTitle}>Your Home Feed is ready</Text><Text style={ui.emptyText}>Posts from people, pages and recommendations will appear here.</Text></View> : null}
    </ScrollView>

    <ReDomMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />

  </SafeAreaView>;
}

function n(value: number, scale: number) { return Math.round(value * scale); }

function makeStyles(scale: number) {
  const s = (v: number) => n(v, scale);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#F0F2F5" },
    topHeader: { height: s(60), paddingHorizontal: s(12), backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: s(8) },
    menuButton: { width: s(40), height: s(40), borderRadius: s(20), alignItems: "center", justifyContent: "center" },
    brand: { justifyContent: "center" },
    topActions: { flexDirection: "row", alignItems: "center", gap: s(7) },
    topButton: { width: s(40), height: s(40), borderRadius: s(20), backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", zIndex: 10, elevation: 10 },
    messengerIcon: { transform: [{ translateY: s(3) }] },
    navigationBar: { height: s(54), backgroundColor: "#FFFFFF", flexDirection: "row", justifyContent: "space-around", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
    navItem: { width: s(58), height: s(54), alignItems: "center", justifyContent: "center" },
    activeNav: { borderBottomWidth: 3, borderBottomColor: "#1877F2" },
    feed: { paddingBottom: s(24) },
    composer: { backgroundColor: "#FFFFFF", minHeight: s(66), paddingHorizontal: s(12), paddingVertical: s(11), flexDirection: "row", alignItems: "center", gap: s(9) },
    composerInput: { flex: 1, minHeight: s(42), borderRadius: s(21), backgroundColor: "#F0F2F5", paddingHorizontal: s(16), justifyContent: "center" },
    composerText: { fontSize: s(15), color: "#65676B", fontWeight: "400" },
    mediaButton: { width: s(32), alignItems: "center", justifyContent: "center" },
    storyHeader: { backgroundColor: "#FFFFFF", paddingHorizontal: s(12), paddingTop: s(12), paddingBottom: s(8), flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionRow: { paddingHorizontal: s(12), paddingVertical: s(12), flexDirection: "row", alignItems: "center" },
    sectionTitle: { fontSize: s(18), lineHeight: s(23), color: "#050505", fontWeight: "700" },
    seeAll: { color: "#1877F2", fontSize: s(14), fontWeight: "600" },
    storyRail: { backgroundColor: "#FFFFFF", paddingHorizontal: s(10), paddingBottom: s(12), gap: s(8) },
    storyCard: { width: s(112), height: s(200), borderRadius: s(10), backgroundColor: "#E4E6EB", overflow: "hidden", alignItems: "center", paddingTop: s(18), position: "relative" },
    storyPhoto: { marginTop: s(2) },
    storyPlus: { position: "absolute", top: s(68), width: s(30), height: s(30), borderRadius: s(15), backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
    storyBottom: { position: "absolute", left: s(8), right: s(8), bottom: s(9) },
    storyName: { color: "#FFFFFF", fontSize: s(13), lineHeight: s(16), fontWeight: "700", textShadowColor: "rgba(0,0,0,0.65)", textShadowRadius: 3, textAlign: "left" },
    musicCard: { width: s(112), height: s(200), borderRadius: s(10), overflow: "hidden", backgroundColor: "#6B4CE6", alignItems: "center", justifyContent: "center", paddingHorizontal: s(10) },
    musicTitle: { color: "#FFFFFF", fontSize: s(15), fontWeight: "700", marginTop: s(12) },
    musicSub: { color: "#FFFFFF", fontSize: s(13), fontWeight: "400" },
    suggestionsBlock: { marginTop: s(8), backgroundColor: "#FFFFFF" },
    suggestionRail: { paddingHorizontal: s(10), paddingBottom: s(12), gap: s(8) },
    suggestionCard: { width: s(132), borderWidth: 1, borderColor: "#E4E6EB", borderRadius: s(10), backgroundColor: "#FFFFFF", padding: s(9), alignItems: "center" },
    suggestionName: { marginTop: s(7), color: "#050505", fontSize: s(14), fontWeight: "700", width: "100%", textAlign: "center" },
    suggestionHandle: { marginTop: s(2), color: "#65676B", fontSize: s(12), width: "100%", textAlign: "center" },
    empty: { marginTop: s(8), backgroundColor: "#FFFFFF", padding: s(28), alignItems: "center" },
    emptyTitle: { color: "#050505", fontSize: s(18), fontWeight: "700" },
    emptyText: { color: "#65676B", fontSize: s(14), textAlign: "center", marginTop: s(7) },

    hiddenMenuTrigger: { position: "absolute", width: 1, height: 1, left: -10, bottom: -10 },
  });
}
