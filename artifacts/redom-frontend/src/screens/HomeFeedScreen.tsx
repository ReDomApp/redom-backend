import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import HomeIcon from "../assets/home-feed/home.svg";
import SearchIcon from "../assets/home-feed/search.svg";
import MessengerIcon from "../assets/home-feed/messenger.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import CreateIcon from "../assets/home-feed/create.svg";
import VideoIcon from "../assets/home-feed/video.svg";
import UploadStoryIcon from "../assets/home-feed/upload-story.svg";
import AddMediaIcon from "../assets/home-feed/add-media.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import MoreIcon from "../assets/navigation/more.svg";
import CloseIcon from "../assets/navigation/close.svg";
import HelpSupportIcon from "../assets/home-feed/help-support.svg";
import ScamIcon from "../assets/home-feed/scam-protection-center.svg";
import SupportIcon from "../assets/home-feed/support.svg";
import ReportIcon from "../assets/home-feed/report-problem.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import SettingsIcon from "../assets/home-feed/settings.svg";
import PrivacyIcon from "../assets/home-feed/privacy-center.svg";
import TimeIcon from "../assets/home-feed/time-management.svg";
import DeviceRequestsIcon from "../assets/home-feed/device-requests.svg";
import AdsIcon from "../assets/home-feed/recent-ad-activity.svg";
import OrdersIcon from "../assets/home-feed/orders-payments.svg";
import LinkHistoryIcon from "../assets/home-feed/link-history.svg";
import DarkModeIcon from "../assets/home-feed/dark-mode.svg";
import LanguageIcon from "../assets/home-feed/language.svg";
import { useAuthContext } from "../auth/context";
import {
  feedService,
  type HomeFeedFriendStory,
  type HomeFeedPost,
  type HomeFeedProfileSuggestion,
} from "../feed/service";

const menuSupport = [
  ["Scam Protection Center", ScamIcon],
  ["Support", SupportIcon],
  ["Report a problem", ReportIcon],
  ["Terms and Policies", TermsIcon],
] as const;

const menuSettings = [
  ["Settings", SettingsIcon],
  ["Privacy Center", PrivacyIcon],
  ["Time management", TimeIcon],
  ["Device requests", DeviceRequestsIcon],
  ["Recent ad activity", AdsIcon],
  ["Orders and payments", OrdersIcon],
  ["Link history", LinkHistoryIcon],
  ["Dark mode", DarkModeIcon],
  ["Language", LanguageIcon],
] as const;

const fallbackPosts: HomeFeedPost[] = [
  {
    id: "redom-official-welcome",
    shareId: "REDOM00001",
    content:
      "Welcome to ReDom. This is where public ReDom posts, people, communities, pages, videos and conversations will appear as the network grows.",
    type: "text",
    publishedAt: new Date().toISOString(),
    authorId: "redom-system",
    firstName: "ReDom",
    lastName: "",
    username: "redom",
    publicId: "234000000000001",
    profileId: "234000000000001",
    profilePhoto: null,
  },
];

function Avatar({ uri, size = 48 }: { uri?: string | null; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return <ProfilePlaceholder width={size} height={size} />;
}

function formatLocation(location: { country: string | null; city: string | null }) {
  return [location.city, location.country].filter(Boolean).join(", ");
}

export function HomeFeedScreen() {
  const { user, logout } = useAuthContext();
  const scrollRef = useRef<ScrollView>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<HomeFeedPost[]>(fallbackPosts);
  const [suggestions, setSuggestions] = useState<HomeFeedProfileSuggestion[]>([]);
  const [friendStories, setFriendStories] = useState<HomeFeedFriendStory[]>([]);
  const [indexedLocation, setIndexedLocation] = useState({ country: null as string | null, city: null as string | null });

  const displayName = useMemo(
    () => (user ? `${user.firstName} ${user.lastName}`.trim() : "You"),
    [user],
  );

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await feedService.getHomeFeed();
      setPosts(result.posts.length ? result.posts : fallbackPosts);
      setSuggestions(result.suggestedProfiles);
      setFriendStories(result.friendStories);
      setIndexedLocation({
        country: result.indexing.location.country,
        city: result.indexing.location.city,
      });
    } catch {
      setPosts(fallbackPosts);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshFeed();
  }, [refreshFeed]);

  const handleHomePress = useCallback(async () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    await refreshFeed();
  }, [refreshFeed]);

  const indexedPlace = formatLocation(indexedLocation);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topHeader}>
        <View style={styles.logoWrap}>
          <ReDomLogo width={116} height={34} />
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.topIconButton} accessibilityLabel="Search">
            <SearchIcon width={23} height={23} />
          </Pressable>
          <Pressable style={styles.topIconButton} accessibilityLabel="Messenger">
            <MessengerIcon width={24} height={24} />
          </Pressable>
          <Pressable
            style={styles.topIconButton}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Menu"
          >
            <MenuIcon width={24} height={24} />
          </Pressable>
        </View>
      </View>

      <View style={styles.navigationBar}>
        <Pressable style={[styles.navigationItem, styles.navigationItemActive]} onPress={() => void handleHomePress()} accessibilityLabel="Home">
          <HomeIcon width={27} height={27} />
        </Pressable>
        <Pressable style={styles.navigationItem} accessibilityLabel="Reels">
          <VideoIcon width={27} height={27} />
        </Pressable>
        <Pressable style={styles.navigationItem} accessibilityLabel="Marketplace">
          <MarketplaceIcon width={27} height={27} />
        </Pressable>
        <Pressable style={styles.navigationItem} accessibilityLabel="Notifications">
          <NotificationsIcon width={27} height={27} />
        </Pressable>
        <Pressable style={styles.navigationItem} accessibilityLabel="Profile">
          <Avatar size={31} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feed}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} />}
      >
        {welcomeVisible && (
          <View style={styles.welcomeStrip}>
            <Avatar size={40} />
            <View style={styles.welcomeCopy}>
              <Text style={styles.welcomeTitle}>Welcome, {displayName}</Text>
              {user?.username ? <Text style={styles.welcomeHandle}>@{user.username.replace(/^@/, "")}</Text> : null}
            </View>
            <Pressable style={styles.closeButton} onPress={() => setWelcomeVisible(false)} accessibilityLabel="Dismiss welcome">
              <CloseIcon width={22} height={22} />
            </Pressable>
          </View>
        )}

        <View style={styles.composer}>
          <Avatar size={42} />
          <Pressable style={styles.composerInput} accessibilityLabel="Create a post">
            <Text style={styles.composerHint}>What's on your mind{user?.firstName ? `, ${user.firstName}` : ""}?</Text>
          </Pressable>
          <Pressable style={styles.mediaButton} accessibilityLabel="Add photo or video">
            <AddMediaIcon width={27} height={27} />
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} accessibilityLabel="Create post">
            <CreateIcon width={25} height={25} />
            <Text style={styles.quickText}>Create post</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable style={styles.quickAction} accessibilityLabel="Photo or video">
            <VideoIcon width={25} height={25} />
            <Text style={styles.quickText}>Photo/video</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable style={styles.quickAction} accessibilityLabel="Story">
            <UploadStoryIcon width={25} height={25} />
            <Text style={styles.quickText}>Story</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Stories</Text>
          <Pressable accessibilityLabel="See all stories"><Text style={styles.seeAll}>See all</Text></Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRail}>
          <Pressable style={styles.storyCard} accessibilityLabel="Create story">
            <View style={styles.storyAvatarWrap}>
              <Avatar size={70} />
              <View style={styles.storyAddBadge}><CreateIcon width={15} height={15} /></View>
            </View>
            <Text style={styles.storyName}>Create story</Text>
          </Pressable>
          {friendStories.slice(0, 12).map((story: HomeFeedFriendStory) => (
            <Pressable style={styles.storyCard} key={story.id} accessibilityLabel={`Story by ${story.firstName} ${story.lastName}`}>
              <View style={styles.storyAvatarWrap}>
                <View style={styles.storyRing}>
                  <Avatar uri={story.profilePhoto} size={64} />
                </View>
              </View>
              <Text style={styles.storyName} numberOfLines={1}>{story.firstName}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>People you may know</Text>
                <Text style={styles.indexingText}>{indexedPlace ? `Based on your approximate location · ${indexedPlace}` : "Personalized for your experience"}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRail}>
              {suggestions.map((profile: HomeFeedProfileSuggestion) => (
                <Pressable style={styles.suggestionCard} key={profile.userId} accessibilityLabel={`Profile ${profile.firstName} ${profile.lastName}`}>
                  <View style={styles.suggestionAvatarRing}><Avatar uri={profile.profilePhoto} size={68} /></View>
                  <Text style={styles.suggestionName} numberOfLines={1}>{profile.firstName} {profile.lastName}</Text>
                  <Text style={styles.suggestionHandle} numberOfLines={1}>@{profile.username.replace(/^@/, "")}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {posts.map((post: HomeFeedPost) => {
          const author = `${post.firstName} ${post.lastName}`.trim() || "ReDom";
          return (
            <View style={styles.post} key={post.id}>
              <View style={styles.postHeader}>
                <Avatar uri={post.profilePhoto} size={46} />
                <View style={styles.postIdentity}>
                  <Text style={styles.postName}>{author}</Text>
                  <Text style={styles.postMeta}>Public · ReDom</Text>
                </View>
                <Pressable style={styles.moreButton} accessibilityLabel="More options"><MoreIcon width={22} height={22} /></Pressable>
              </View>
              <Text style={styles.postBody}>{post.content}</Text>
              <View style={styles.postBrandArea}><ReDomLogo width={145} height={42} /></View>
              <View style={styles.engagement}>
                <Pressable><Text style={styles.engagementText}>Like</Text></Pressable>
                <Pressable><Text style={styles.engagementText}>Comment</Text></Pressable>
                <Pressable><Text style={styles.engagementText}>Share</Text></Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuSheet}>
            <View style={styles.menuGrabber} />
            <View style={styles.menuTop}>
              <ReDomLogo width={108} height={31} />
              <Pressable onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu"><CloseIcon width={28} height={28} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable style={styles.menuSectionHeader} onPress={() => setSupportOpen(value => !value)}>
                <HelpSupportIcon width={38} height={38} />
                <Text style={styles.menuSectionTitle}>Help and support</Text>
                <Text style={styles.chevron}>{supportOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {supportOpen && menuSupport.map(([label, Icon]) => (
                <Pressable key={label} style={styles.menuRow}><Icon width={37} height={37} /><Text style={styles.menuText}>{label}</Text></Pressable>
              ))}
              <View style={styles.divider} />
              <Pressable style={styles.menuSectionHeader} onPress={() => setSettingsOpen(value => !value)}>
                <SettingsIcon width={40} height={40} />
                <Text style={styles.menuSectionTitle}>Settings and privacy</Text>
                <Text style={styles.chevron}>{settingsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {settingsOpen && menuSettings.map(([label, Icon]) => (
                <Pressable key={label} style={styles.menuRow}><Icon width={37} height={37} /><Text style={styles.menuText}>{label}</Text></Pressable>
              ))}
              <Pressable style={styles.logoutRow} onPress={() => { setMenuOpen(false); void logout(); }}>
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F2F5" },
  topHeader: {
    height: 58,
    paddingHorizontal: 10,
    paddingTop: 3,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoWrap: { marginTop: 3, flex: 1 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  topIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  navigationBar: {
    height: 52,
    paddingHorizontal: 5,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDE3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  navigationItem: {
    height: 52,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  navigationItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#1877F2",
  },
  feed: { paddingBottom: 18 },
  welcomeStrip: {
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  welcomeCopy: { flex: 1 },
  welcomeTitle: { fontSize: 16, fontWeight: "800", color: "#1C1E21" },
  welcomeHandle: { fontSize: 12, color: "#65676B", marginTop: 1 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  composer: {
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  composerInput: {
    flex: 1,
    height: 43,
    borderWidth: 1,
    borderColor: "#D9DDE3",
    borderRadius: 23,
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  composerHint: { fontSize: 14, color: "#65676B" },
  mediaButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  quickActions: {
    height: 55,
    paddingHorizontal: 7,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E4E6EB",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
  },
  quickAction: { flex: 1, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  quickText: { fontSize: 11, fontWeight: "700", color: "#65676B" },
  quickDivider: { width: 1, height: 27, backgroundColor: "#E4E6EB" },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#1C1E21" },
  seeAll: { fontSize: 14, color: "#1877F2", fontWeight: "800" },
  storyRail: { paddingHorizontal: 13, paddingBottom: 12, gap: 13, backgroundColor: "#FFFFFF" },
  storyCard: { width: 74, alignItems: "center" },
  storyAvatarWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  storyRing: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  storyAddBadge: { position: "absolute", right: -1, bottom: -1, width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E4E6EB" },
  storyName: { marginTop: 5, fontSize: 11, fontWeight: "700", color: "#1C1E21", maxWidth: 74, textAlign: "center" },
  suggestionsSection: { marginTop: 7, backgroundColor: "#FFFFFF" },
  indexingText: { marginTop: 2, fontSize: 10, color: "#65676B" },
  suggestionRail: { paddingHorizontal: 13, paddingBottom: 14, gap: 13 },
  suggestionCard: { width: 116, alignItems: "center" },
  suggestionAvatarRing: { width: 74, height: 74, borderRadius: 37, borderWidth: 2, borderColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  suggestionName: { marginTop: 5, fontSize: 12, fontWeight: "800", color: "#1C1E21", maxWidth: 114, textAlign: "center" },
  suggestionHandle: { marginTop: 1, fontSize: 10, color: "#65676B", maxWidth: 114, textAlign: "center" },
  post: { marginTop: 7, backgroundColor: "#FFFFFF" },
  postHeader: { minHeight: 64, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  postIdentity: { flex: 1 },
  postName: { fontSize: 16, fontWeight: "900", color: "#1C1E21" },
  postMeta: { marginTop: 1, fontSize: 11, color: "#65676B" },
  moreButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  postBody: { paddingHorizontal: 13, paddingBottom: 12, fontSize: 15, lineHeight: 23, color: "#1C1E21" },
  postBrandArea: { height: 175, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" },
  engagement: { height: 45, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E4E6EB" },
  engagementText: { fontSize: 13, fontWeight: "800", color: "#65676B" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.34)", justifyContent: "flex-end" },
  menuSheet: { maxHeight: "84%", minHeight: "52%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 20 },
  menuGrabber: { alignSelf: "center", width: 80, height: 5, borderRadius: 3, backgroundColor: "#C7CBD1", marginBottom: 14 },
  menuTop: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  menuSectionHeader: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  menuSectionTitle: { flex: 1, fontSize: 19, fontWeight: "900", color: "#1C1E21" },
  chevron: { fontSize: 25, color: "#65676B", paddingRight: 4 },
  menuRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 14 },
  menuText: { fontSize: 15, fontWeight: "700", color: "#1C1E21" },
  divider: { height: 8, backgroundColor: "#F0F2F5", marginHorizontal: -20 },
  logoutRow: { height: 72, marginTop: 14, marginBottom: 20, borderRadius: 18, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  logoutText: { fontSize: 18, fontWeight: "900", color: "#D92D55" },
});