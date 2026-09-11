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
  {
    id: "redom-official-discover",
    shareId: "REDOM00002",
    content:
      "Discover what is happening on ReDom. As more people join, your feed will automatically index public content and profiles relevant to your experience.",
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
      <View style={styles.header}>
        <ReDomLogo width={122} height={35} />
        <View style={styles.headerActions}>
          <Pressable style={styles.headerCircle} accessibilityLabel="Search">
            <SearchIcon width={23} height={23} />
          </Pressable>
          <Pressable style={styles.headerCircle} accessibilityLabel="Messenger">
            <MessengerIcon width={25} height={25} />
          </Pressable>
          <Pressable style={styles.headerCircle} accessibilityLabel="Notifications">
            <NotificationsIcon width={25} height={25} />
          </Pressable>
          <Pressable style={styles.headerProfile} accessibilityLabel="Profile">
            <Avatar size={39} />
          </Pressable>
          <Pressable
            style={styles.headerCircle}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Menu"
          >
            <MenuIcon width={25} height={25} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feed}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshFeed} />
        }
      >
        {welcomeVisible && (
          <View style={styles.greeting}>
            <Pressable style={styles.greetingAvatar} accessibilityLabel="Profile">
              <Avatar size={54} />
            </Pressable>
            <View style={styles.greetingText}>
              <Text style={styles.greetingName}>Welcome, {displayName}</Text>
              {user?.username ? (
                <Text style={styles.greetingHandle}>
                  @{user.username.replace(/^@/, "")}
                </Text>
              ) : null}
            </View>
            <Pressable
              style={styles.greetingClose}
              onPress={() => setWelcomeVisible(false)}
              accessibilityLabel="Remove welcome"
            >
              <CloseIcon width={25} height={25} />
            </Pressable>
          </View>
        )}

        <View style={styles.composer}>
          <Pressable style={styles.composerAvatar} accessibilityLabel="Profile">
            <Avatar size={42} />
          </Pressable>
          <Pressable style={styles.composerInput}>
            <Text style={styles.composerHint}>
              What's on your mind{user?.firstName ? `, ${user.firstName}` : ""}?
            </Text>
          </Pressable>
          <Pressable accessibilityLabel="Post">
            <Text style={styles.postButton}>Post</Text>
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} accessibilityLabel="Create post">
            <CreateIcon width={28} height={28} />
            <Text style={styles.quickText}>Create post</Text>
          </Pressable>
          <Pressable style={styles.quickAction} accessibilityLabel="Photo or video">
            <VideoIcon width={28} height={28} />
            <Text style={styles.quickText}>Photo/video</Text>
          </Pressable>
          <Pressable style={styles.quickAction} accessibilityLabel="Story">
            <UploadStoryIcon width={28} height={28} />
            <Text style={styles.quickText}>Story</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Stories</Text>
          <Text style={styles.seeAll}>See all</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.circularRail}
        >
          <Pressable style={styles.circularStory} accessibilityLabel="Add story">
            <View style={styles.storyAvatarWrap}>
              <Avatar size={70} />
              <View style={styles.storyAddBadge}>
                <CreateIcon width={17} height={17} />
              </View>
            </View>
            <Text style={styles.circularName}>Add story</Text>
          </Pressable>

          {friendStories.slice(0, 12).map((story: HomeFeedFriendStory) => (
            <Pressable
              style={styles.circularStory}
              key={story.id}
              accessibilityLabel={`Story by ${story.firstName} ${story.lastName}`}
            >
              <View style={styles.storyAvatarWrap}>
                <View style={styles.storyBlueRing}>
                  <Avatar uri={story.profilePhoto} size={64} />
                </View>
              </View>
              <Text style={styles.circularName} numberOfLines={1}>
                {story.firstName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {suggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>People you may know</Text>
                {indexedPlace ? (
                  <Text style={styles.indexingText}>Based on your approximate location · {indexedPlace}</Text>
                ) : (
                  <Text style={styles.indexingText}>Indexed for your experience</Text>
                )}
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.circularRail}
            >
              {suggestions.map((profile: HomeFeedProfileSuggestion) => (
                <Pressable
                  style={styles.profileSuggestion}
                  key={profile.userId}
                  accessibilityLabel={`Profile ${profile.firstName} ${profile.lastName}`}
                >
                  <View style={styles.suggestionAvatarRing}>
                    <Avatar uri={profile.profilePhoto} size={70} />
                  </View>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {profile.firstName} {profile.lastName}
                  </Text>
                  <Text style={styles.suggestionHandle} numberOfLines={1}>
                    @{profile.username.replace(/^@/, "")}
                  </Text>
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
                <Avatar uri={post.profilePhoto} size={48} />
                <View style={styles.postIdentity}>
                  <Text style={styles.postName}>{author}</Text>
                  <Text style={styles.postMeta}>Public</Text>
                </View>
                <Pressable style={styles.more} accessibilityLabel="More">
                  <MoreIcon width={22} height={22} />
                </Pressable>
              </View>
              <Text style={styles.postBody}>{post.content}</Text>
              <View style={styles.postBrandArea}>
                <ReDomLogo width={135} height={39} />
              </View>
              <View style={styles.engagement}>
                <Text style={styles.engagementText}>Like</Text>
                <Text style={styles.engagementText}>Comment</Text>
                <Text style={styles.engagementText}>Share</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable
          style={styles.bottomItem}
          onPress={() => void handleHomePress()}
          accessibilityLabel="Home"
        >
          <HomeIcon width={32} height={32} />
        </Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Marketplace">
          <MarketplaceIcon width={32} height={32} />
        </Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Create">
          <CreateIcon width={34} height={34} />
        </Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Alerts">
          <NotificationsIcon width={32} height={32} />
        </Pressable>
        <Pressable
          style={styles.bottomItem}
          onPress={() => setMenuOpen(true)}
          accessibilityLabel="Menu"
        >
          <MenuIcon width={32} height={32} />
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuOpen(false)}
          />
          <View style={styles.menuSheet}>
            <View style={styles.menuGrabber} />
            <View style={styles.menuTop}>
              <ReDomLogo width={108} height={31} />
              <Pressable
                onPress={() => setMenuOpen(false)}
                accessibilityLabel="Close menu"
              >
                <CloseIcon width={28} height={28} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable
                style={styles.menuSectionHeader}
                onPress={() => setSupportOpen((value) => !value)}
              >
                <HelpSupportIcon width={39} height={39} />
                <Text style={styles.menuSectionTitle}>Help and support</Text>
                <Text style={styles.chevron}>{supportOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {supportOpen &&
                menuSupport.map(([label, Icon]) => (
                  <Pressable key={label} style={styles.menuRow}>
                    <Icon width={39} height={39} />
                    <Text style={styles.menuText}>{label}</Text>
                  </Pressable>
                ))}

              <View style={styles.divider} />

              <Pressable
                style={styles.menuSectionHeader}
                onPress={() => setSettingsOpen((value) => !value)}
              >
                <SettingsIcon width={42} height={42} />
                <Text style={styles.menuSectionTitle}>Settings and privacy</Text>
                <Text style={styles.chevron}>{settingsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {settingsOpen &&
                menuSettings.map(([label, Icon]) => (
                  <Pressable key={label} style={styles.menuRow}>
                    <Icon width={39} height={39} />
                    <Text style={styles.menuText}>{label}</Text>
                  </Pressable>
                ))}

              <Pressable
                style={styles.logoutRow}
                onPress={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
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
  header: {
    height: 64,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#D9DDE3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerProfile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  feed: { paddingBottom: 86 },
  greeting: {
    minHeight: 86,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  greetingAvatar: { width: 54, height: 54, borderRadius: 27, overflow: "hidden" },
  greetingText: { flex: 1 },
  greetingName: { fontSize: 20, fontWeight: "900", color: "#1C1E21" },
  greetingHandle: { fontSize: 13, color: "#65676B", marginTop: 2 },
  greetingClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  composer: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  composerAvatar: { width: 42, height: 42, borderRadius: 21, overflow: "hidden" },
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
  postButton: { color: "#1877F2", fontSize: 15, fontWeight: "900" },
  quickActions: {
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E4E6EB",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
  },
  quickAction: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  quickText: { fontSize: 11, fontWeight: "700", color: "#65676B" },
  sectionHeader: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 19, fontWeight: "900", color: "#1C1E21" },
  seeAll: { fontSize: 14, color: "#1877F2", fontWeight: "800" },
  circularRail: { paddingHorizontal: 15, paddingBottom: 14, gap: 16, backgroundColor: "#FFFFFF" },
  circularStory: { width: 76, alignItems: "center" },
  storyAvatarWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  storyBlueRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: "#1877F2",
    alignItems: "center",
    justifyContent: "center",
  },
  storyAddBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  circularName: { marginTop: 5, fontSize: 11, fontWeight: "700", color: "#1C1E21", maxWidth: 76 },
  suggestionsSection: { marginTop: 8, backgroundColor: "#FFFFFF" },
  indexingText: { fontSize: 11, color: "#65676B", marginTop: 2 },
  profileSuggestion: { width: 118, alignItems: "center" },
  suggestionAvatarRing: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: "#1877F2",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionName: { marginTop: 6, fontSize: 12, fontWeight: "800", color: "#1C1E21", maxWidth: 116 },
  suggestionHandle: { marginTop: 2, fontSize: 10, color: "#65676B", maxWidth: 116 },
  post: { marginTop: 8, backgroundColor: "#FFFFFF" },
  postHeader: { padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  postIdentity: { flex: 1 },
  postName: { fontSize: 16, fontWeight: "900", color: "#1C1E21" },
  postMeta: { marginTop: 2, fontSize: 12, color: "#65676B" },
  more: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  postBody: { paddingHorizontal: 13, paddingBottom: 12, fontSize: 16, lineHeight: 25, color: "#1C1E21" },
  postBrandArea: {
    height: 170,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  engagement: {
    height: 45,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E4E6EB",
  },
  engagementText: { fontSize: 13, fontWeight: "800", color: "#65676B" },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 68,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#D9DDE3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  bottomItem: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.34)", justifyContent: "flex-end" },
  menuSheet: {
    maxHeight: "84%",
    minHeight: "52%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  menuGrabber: { alignSelf: "center", width: 80, height: 5, borderRadius: 3, backgroundColor: "#C7CBD1", marginBottom: 14 },
  menuTop: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  menuSectionHeader: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  menuSectionTitle: { flex: 1, fontSize: 20, fontWeight: "900", color: "#1C1E21" },
  chevron: { fontSize: 25, color: "#65676B", paddingRight: 4 },
  menuRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 14 },
  menuText: { fontSize: 15, fontWeight: "700", color: "#1C1E21" },
  divider: { height: 8, backgroundColor: "#F0F2F5", marginHorizontal: -20 },
  logoutRow: { height: 76, marginTop: 14, marginBottom: 20, borderRadius: 18, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  logoutText: { fontSize: 18, fontWeight: "900", color: "#D92D55" },
});
