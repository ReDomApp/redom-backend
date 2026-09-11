import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import HomeIcon from "../assets/home-feed/home.svg";
import SearchIcon from "../assets/home-feed/search.svg";
import MessengerIcon from "../assets/home-feed/messenger.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import CreateIcon from "../assets/home-feed/create.svg";
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
import { feedService, type HomeFeedFriendStory, type HomeFeedPost, type HomeFeedProfileSuggestion } from "../feed/service";

const menuSupport = [["Scam Protection Center", ScamIcon], ["Support", SupportIcon], ["Report a problem", ReportIcon], ["Terms and Policies", TermsIcon]] as const;
const menuSettings = [["Settings", SettingsIcon], ["Privacy Center", PrivacyIcon], ["Time management", TimeIcon], ["Device requests", DeviceRequestsIcon], ["Recent ad activity", AdsIcon], ["Orders and payments", OrdersIcon], ["Link history", LinkHistoryIcon], ["Dark mode", DarkModeIcon], ["Language", LanguageIcon]] as const;

const fallbackPosts: HomeFeedPost[] = [
  { id: "redom-welcome-1", shareId: "REDOM00001", content: "Welcome to ReDom. Discover people, communities, pages, videos and conversations as your ReDom experience grows.", type: "text", publishedAt: new Date().toISOString(), authorId: "redom-system", firstName: "ReDom", lastName: "", username: "redom", publicId: "234000000000001", profileId: "234000000000001", profilePhoto: null },
  { id: "redom-welcome-2", shareId: "REDOM00002", content: "Your ReDom Home Feed is ready. New public ReDom posts will appear here automatically as they are created.", type: "text", publishedAt: new Date().toISOString(), authorId: "redom-system-2", firstName: "ReDom", lastName: "", username: "redom", publicId: "234000000000001", profileId: "234000000000001", profilePhoto: null },
];

function Avatar({ uri, size = 48 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return <ProfilePlaceholder width={size} height={size} />;
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

  const displayName = useMemo(() => (user ? `${user.firstName} ${user.lastName}`.trim() : "You"), [user]);

  const refreshFeed = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await feedService.getHomeFeed();
      setPosts(result.posts.length ? result.posts : fallbackPosts);
      setSuggestions(result.suggestedProfiles);
      setFriendStories(result.friendStories);
    } catch {
      setPosts(fallbackPosts);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refreshFeed(); }, [refreshFeed]);

  const handleHomePress = useCallback(async () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    await refreshFeed();
  }, [refreshFeed]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <ReDomLogo width={122} height={35} />
        <View style={styles.headerActions}>
          <Pressable style={styles.circle}><SearchIcon width={21} height={21} /></Pressable>
          <Pressable style={styles.circle}><MessengerIcon width={22} height={22} /></Pressable>
          <Pressable style={styles.circle}><NotificationsIcon width={22} height={22} /></Pressable>
          <Pressable style={styles.headerProfile} accessibilityLabel="Profile"><Avatar size={38} /></Pressable>
          <Pressable style={styles.circle} onPress={() => setMenuOpen(true)}><MenuIcon width={23} height={23} /></Pressable>
        </View>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.feed} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} />}>
        {welcomeVisible && (
          <View style={styles.greeting}>
            <Pressable style={styles.avatarButton} accessibilityLabel="Profile"><Avatar size={52} /></Pressable>
            <View style={styles.greetingText}>
              <Text style={styles.name}>Welcome, {displayName}</Text>
              <Text style={styles.handle}>{user?.username ? `@${user.username.replace(/^@/, "")}` : ""}</Text>
            </View>
            <Pressable style={styles.greetingClose} onPress={() => setWelcomeVisible(false)} accessibilityLabel="Close"><CloseIcon width={22} height={22} /></Pressable>
          </View>
        )}

        <View style={styles.composer}>
          <Pressable style={styles.smallAvatar} accessibilityLabel="Profile"><Avatar size={40} /></Pressable>
          <Pressable style={styles.composerInput}><Text style={styles.composerHint}>What's on your mind, {user?.firstName ?? ""}?</Text></Pressable>
          <Pressable><Text style={styles.postButton}>Post</Text></Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quick}><CreateIcon width={24} height={24} /><Text style={styles.quickText}>Create post</Text></Pressable>
          <Pressable style={styles.quick}><AddMediaIcon width={24} height={24} /><Text style={styles.quickText}>Photo/video</Text></Pressable>
          <Pressable style={styles.quick}><View style={styles.storyQuickIcon}><Text style={styles.storyQuickDot}>●</Text></View><Text style={styles.quickText}>Story</Text></Pressable>
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Stories</Text><Text style={styles.seeAll}>See all</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRail}>
          <Pressable style={styles.storyPerson}>
            <View style={styles.storyRing}><Avatar size={66} /><View style={styles.addBadge}><CreateIcon width={17} height={17} /></View></View>
            <Text style={styles.storyName}>Add story</Text>
          </Pressable>
          {friendStories.slice(0, 8).map((story) => (
            <Pressable style={styles.storyPerson} key={story.id} accessibilityLabel={`Story by ${story.firstName} ${story.lastName}`}>
              <View style={styles.storyRing}><Avatar uri={story.profilePhoto} size={66} /></View>
              <Text style={styles.storyName} numberOfLines={1}>{story.firstName}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {suggestions.length > 0 && (
          <View style={styles.suggestionSection}>
            <View style={styles.sectionHeaderInner}><Text style={styles.sectionTitle}>People you may know</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRail}>
              {suggestions.map((profile) => (
                <Pressable style={styles.suggestionCard} key={profile.userId} accessibilityLabel={`Profile ${profile.firstName} ${profile.lastName}`}>
                  <Avatar uri={profile.profilePhoto} size={66} />
                  <Text style={styles.suggestionName} numberOfLines={1}>{profile.firstName} {profile.lastName}</Text>
                  <Text style={styles.suggestionHandle} numberOfLines={1}>@{profile.username.replace(/^@/, "")}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {posts.map((post) => {
          const author = `${post.firstName} ${post.lastName}`.trim();
          return (
            <View style={styles.post} key={post.id}>
              <View style={styles.postHeader}><Avatar uri={post.profilePhoto} size={46} /><View style={styles.postIdentity}><Text style={styles.postName}>{author || "ReDom"}</Text><Text style={styles.postMeta}>Just now · Public</Text></View><Pressable style={styles.more}><MoreIcon width={21} height={21} /></Pressable></View>
              <Text style={styles.postBody}>{post.content}</Text>
              <View style={styles.mediaPlaceholder}><ReDomLogo width={125} height={36} /></View>
              <View style={styles.engagement}><Text style={styles.engagementText}>Like</Text><Text style={styles.engagementText}>Comment</Text><Text style={styles.engagementText}>Share</Text></View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomItem} onPress={() => void handleHomePress()} accessibilityLabel="Home"><HomeIcon width={29} height={29} /></Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Marketplace"><MarketplaceIcon width={29} height={29} /></Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Create"><CreateIcon width={31} height={31} /></Pressable>
        <Pressable style={styles.bottomItem} accessibilityLabel="Alerts"><NotificationsIcon width={29} height={29} /></Pressable>
        <Pressable style={styles.bottomItem} onPress={() => setMenuOpen(true)} accessibilityLabel="Menu"><MenuIcon width={29} height={29} /></Pressable>
      </View>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuSheet}>
            <View style={styles.menuGrabber} />
            <View style={styles.menuTop}><ReDomLogo width={105} height={30} /><Pressable onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu"><CloseIcon width={27} height={27} /></Pressable></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable style={styles.menuSectionHeader} onPress={() => setSupportOpen(v => !v)}><HelpSupportIcon width={38} height={38} /><Text style={styles.menuSectionTitle}>Help and support</Text><Text style={styles.chevron}>{supportOpen ? "⌃" : "⌄"}</Text></Pressable>
              {supportOpen && menuSupport.map(([label, Icon]) => <Pressable key={label} style={styles.menuRow}><Icon width={39} height={39} /><Text style={styles.menuText}>{label}</Text></Pressable>)}
              <View style={styles.divider} />
              <Pressable style={styles.menuSectionHeader} onPress={() => setSettingsOpen(v => !v)}><SettingsIcon width={43} height={43} /><Text style={styles.menuSectionTitle}>Settings and privacy</Text><Text style={styles.chevron}>{settingsOpen ? "⌃" : "⌄"}</Text></Pressable>
              {settingsOpen && menuSettings.map(([label, Icon]) => <Pressable key={label} style={styles.menuRow}><Icon width={39} height={39} /><Text style={styles.menuText}>{label}</Text></Pressable>)}
              <Pressable style={styles.logoutRow} onPress={() => { setMenuOpen(false); void logout(); }}><Text style={styles.logoutText}>Log out</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#F0F2F5"},
  header:{height:64,backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#D9DDE3",paddingHorizontal:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  headerActions:{flexDirection:"row",alignItems:"center",gap:6},
  circle:{width:39,height:39,borderRadius:20,backgroundColor:"#F0F2F5",alignItems:"center",justifyContent:"center"},
  headerProfile:{width:39,height:39,borderRadius:20,overflow:"hidden",alignItems:"center",justifyContent:"center"},
  feed:{paddingBottom:82},
  greeting:{backgroundColor:"#FFF",paddingHorizontal:15,paddingVertical:13,flexDirection:"row",alignItems:"center",gap:12,borderBottomWidth:1,borderBottomColor:"#E4E6EB"},
  avatarButton:{width:52,height:52,borderRadius:26,overflow:"hidden"},
  greetingText:{flex:1},
  name:{fontSize:19,fontWeight:"900",color:"#1C1E21"},
  handle:{fontSize:13,color:"#65676B",marginTop:2},
  greetingClose:{width:38,height:38,alignItems:"center",justifyContent:"center"},
  composer:{backgroundColor:"#FFF",paddingHorizontal:13,paddingVertical:11,flexDirection:"row",alignItems:"center",gap:10},
  smallAvatar:{width:40,height:40,borderRadius:20,overflow:"hidden"},
  composerInput:{flex:1,height:42,borderRadius:22,borderWidth:1,borderColor:"#D9DDE3",justifyContent:"center",paddingHorizontal:15},
  composerHint:{color:"#65676B",fontSize:14},
  postButton:{color:"#1877F2",fontWeight:"900",fontSize:15},
  quickActions:{backgroundColor:"#FFF",flexDirection:"row",borderTopWidth:1,borderTopColor:"#E4E6EB",borderBottomWidth:1,borderBottomColor:"#E4E6EB",paddingVertical:9},
  quick:{flex:1,alignItems:"center",justifyContent:"center",gap:3},
  quickText:{fontSize:11,fontWeight:"700",color:"#65676B"},
  storyQuickIcon:{width:24,height:24,alignItems:"center",justifyContent:"center"},
  storyQuickDot:{color:"#1877F2",fontSize:18},
  sectionHeader:{backgroundColor:"#FFF",paddingHorizontal:15,paddingTop:17,paddingBottom:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  sectionTitle:{fontSize:19,fontWeight:"900",color:"#1C1E21"},
  seeAll:{fontSize:14,color:"#1877F2",fontWeight:"800"},
  storyRail:{backgroundColor:"#FFF",paddingHorizontal:13,paddingBottom:15,gap:18},
  storyPerson:{width:78,alignItems:"center"},
  storyRing:{width:74,height:74,borderRadius:37,borderWidth:3,borderColor:"#1877F2",alignItems:"center",justifyContent:"center",position:"relative"},
  addBadge:{position:"absolute",right:-2,bottom:-2,width:25,height:25,borderRadius:13,backgroundColor:"#FFF",borderWidth:1,borderColor:"#D9DDE3",alignItems:"center",justifyContent:"center"},
  storyName:{marginTop:6,fontSize:11,fontWeight:"800",color:"#1C1E21"},
  suggestionSection:{backgroundColor:"#FFF",marginTop:8,paddingBottom:13},
  sectionHeaderInner:{paddingHorizontal:15,paddingTop:15,paddingBottom:8},
  suggestionRail:{paddingHorizontal:13,gap:10},
  suggestionCard:{width:118,alignItems:"center",borderWidth:1,borderColor:"#E0E2E5",borderRadius:12,paddingVertical:11,paddingHorizontal:7,backgroundColor:"#FFF"},
  suggestionName:{marginTop:7,fontSize:12,fontWeight:"900",color:"#1C1E21",maxWidth:105},
  suggestionHandle:{marginTop:2,fontSize:10,color:"#65676B",maxWidth:105},
  post:{backgroundColor:"#FFF",marginTop:8,paddingTop:13},
  postHeader:{paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:10},
  postIdentity:{flex:1},
  postName:{fontSize:15,fontWeight:"900",color:"#1C1E21"},
  postMeta:{fontSize:11,color:"#65676B",marginTop:2},
  more:{padding:7},
  postBody:{fontSize:15,lineHeight:22,color:"#1C1E21",paddingHorizontal:14,paddingTop:12,paddingBottom:4},
  mediaPlaceholder:{height:205,marginTop:8,backgroundColor:"#EAF2FF",alignItems:"center",justifyContent:"center"},
  engagement:{height:45,borderTopWidth:1,borderTopColor:"#E4E6EB",flexDirection:"row",alignItems:"center",justifyContent:"space-around"},
  engagementText:{fontSize:13,fontWeight:"800",color:"#65676B"},
  bottomNav:{position:"absolute",left:0,right:0,bottom:0,height:64,backgroundColor:"#FFF",borderTopWidth:1,borderTopColor:"#D9DDE3",flexDirection:"row",justifyContent:"space-around",alignItems:"center"},
  bottomItem:{width:60,height:54,alignItems:"center",justifyContent:"center"},
  modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.35)",justifyContent:"flex-end"},
  menuSheet:{backgroundColor:"#FFF",maxHeight:"94%",borderTopLeftRadius:18,borderTopRightRadius:18,paddingTop:9},
  menuGrabber:{width:42,height:4,borderRadius:3,backgroundColor:"#C7CAD0",alignSelf:"center",marginBottom:4},
  menuTop:{height:54,paddingHorizontal:20,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  menuSectionHeader:{minHeight:72,paddingHorizontal:20,flexDirection:"row",alignItems:"center",gap:11},
  menuSectionTitle:{flex:1,fontSize:21,fontWeight:"900",color:"#050505"},
  chevron:{fontSize:25,color:"#65676B",fontWeight:"700"},
  menuRow:{height:74,paddingHorizontal:38,flexDirection:"row",alignItems:"center",gap:22},
  menuText:{fontSize:18,fontWeight:"600",color:"#0B0B0B"},
  divider:{height:1,backgroundColor:"#D9DDE3",marginTop:8},
  logoutRow:{height:62,marginHorizontal:20,marginVertical:14,borderRadius:12,backgroundColor:"#F0F2F5",alignItems:"center",justifyContent:"center"},
  logoutText:{color:"#E41E3F",fontSize:16,fontWeight:"900"},
});
