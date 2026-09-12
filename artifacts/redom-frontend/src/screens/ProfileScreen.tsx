import { useEffect, useMemo, useState } from "react";
import { Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import HomeIcon from "../assets/home-feed/home.svg";
import VideoIcon from "../assets/home-feed/video.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import CameraIcon from "../assets/home-feed/profile-camera.svg";
import CoverCameraIcon from "../assets/home-feed/profile-cover-camera.svg";
import CoverEditIcon from "../assets/home-feed/profile-cover-edit.svg";
import CoverSearchIcon from "../assets/home-feed/profile-cover-search.svg";
import CoverMoreIcon from "../assets/home-feed/profile-cover-more.svg";
import LocationIcon from "../assets/home-feed/profile-location.svg";
import DropdownIcon from "../assets/home-feed/profile-dropdown.svg";
import AddStoryIcon from "../assets/home-feed/profile-add-story.svg";
import EditIcon from "../assets/home-feed/profile-edit.svg";
import CalendarIcon from "../assets/home-feed/profile-calendar.svg";
import EyeIcon from "../assets/home-feed/profile-eye.svg";
import ReDomRecordIcon from "../assets/home-feed/profile-redom.svg";
import { useAuthContext } from "../auth/context";
import { profileService, type ProfileData, type ProfileSuggestion } from "../profile/service";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;
function Avatar({ uri, size = 48 }: { uri?: string | null; size?: number }) { return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />; }
function compact(value: number) { if (value < 1000) return String(value); if (value < 1000000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0).replace(/\.0$/, "")}K`; return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`; }

export function ProfileScreen({ navigation, route }: Props) {
  const { user } = useAuthContext();
  const { width } = useWindowDimensions();
  const ui = useMemo(() => makeStyles(width), [width]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"All" | "Reels" | "Photos" | "Events">("All");
  const [adding, setAdding] = useState<string | null>(null);
  const requestedUserId = route.params?.userId;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    profileService.getProfile(requestedUserId).then((result) => { if (mounted) setProfile(result.profile); }).catch(() => { if (mounted) Alert.alert("Profile", "Unable to load this profile right now."); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [requestedUserId]);

  const p = profile;
  const isOwner = !!p && (p.userId === user?.userId || (!requestedUserId && p.isOwner));
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : user ? `${user.firstName} ${user.lastName}`.trim() : "Profile";

  const add = async (suggestion: ProfileSuggestion) => {
    if (adding) return;
    setAdding(suggestion.userId);
    try {
      const result = await profileService.addSuggestion(suggestion.userId);
      Alert.alert(result.success ? "Friend request sent" : "Couldn't add this person", result.success ? "Your friend request was sent." : (result.reason || "We couldn't send the request right now."));
    } finally { setAdding(null); }
  };

  return <SafeAreaView style={ui.root}>
    <View style={ui.nav}>
      <Pressable style={ui.navItem} onPress={() => navigation.navigate("HomeFeed")}><HomeIcon width={ui.icon} height={ui.icon} /></Pressable>
      <Pressable style={ui.navItem}><VideoIcon width={ui.icon} height={ui.icon} /></Pressable>
      <Pressable style={ui.navItem}><MarketplaceIcon width={ui.icon} height={ui.icon} /></Pressable>
      <Pressable style={ui.navItem}><NotificationsIcon width={ui.icon} height={ui.icon} /></Pressable>
      <Pressable style={[ui.navItem, ui.activeNav]}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.navAvatar} /></Pressable>
    </View>

    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ui.content}>
      <View style={ui.coverWrap}>
        {p?.coverPhoto ? <ImageBackground source={{ uri: p.coverPhoto }} style={ui.cover} resizeMode="cover"><View style={ui.coverShade} /></ImageBackground> : <View style={ui.cover}><View style={ui.coverShade} /></View>}
        <View style={ui.coverTools}>
          {isOwner ? <Pressable accessibilityLabel="Edit cover photo"><CoverEditIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable> : null}
          <Pressable accessibilityLabel="Search profile"><CoverSearchIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable>
          <Pressable accessibilityLabel="More profile options"><CoverMoreIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable>
        </View>
        <Pressable style={ui.songBubble} accessibilityLabel="Share a song"><Text style={ui.songText}>Share a song...</Text></Pressable>
        {isOwner ? <Pressable style={ui.coverCamera} accessibilityLabel="Change cover photo"><CoverCameraIcon width={ui.cameraIcon} height={ui.cameraIcon} /></Pressable> : null}
        <View style={ui.avatarPosition}><View style={ui.avatarRing}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.profileAvatar} /></View>{isOwner ? <Pressable style={ui.profileCamera} accessibilityLabel="Change profile picture"><CameraIcon width={ui.cameraIcon} height={ui.cameraIcon} /></Pressable> : null}</View>
      </View>

      <View style={ui.identityBlock}>
        <View style={ui.identityTop}><View style={ui.identityText}><Text style={ui.name} numberOfLines={2}>{name}</Text><Text style={ui.countLine}>{p?.friendCount ?? 0} Friends <Text style={ui.dot}>•</Text> {p?.postCount ?? 0} posts</Text></View><Pressable style={ui.dropdown} accessibilityLabel="Profile options"><DropdownIcon width={ui.dropdownSize} height={ui.dropdownSize} /></Pressable></View>
        {p?.location ? <View style={ui.locationLine}><LocationIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.locationText}>{p.location}</Text></View> : null}
        <View style={ui.mainButtons}>{isOwner ? <><Pressable style={ui.primaryButton}><AddStoryIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.primaryText}>Add to story</Text></Pressable><Pressable style={ui.secondaryButton}><EditIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.secondaryText}>Edit profile</Text></Pressable></> : <Pressable style={ui.primaryButton}><Text style={ui.primaryText}>Add Friend</Text></Pressable>}</View>
      </View>

      {isOwner && p && p.suggestions.length > 0 ? <View style={ui.suggestionSection}><View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>People you may know</Text><Pressable accessibilityLabel="Dismiss suggestions"><Text style={ui.closeSuggestion}>×</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.suggestionRail}>{p.suggestions.map((suggestion) => <View key={suggestion.userId} style={ui.suggestionCard}><View style={ui.suggestionAvatarWrap}><Avatar uri={suggestion.profilePhoto} size={ui.suggestionAvatar} /></View><Text style={ui.suggestionName} numberOfLines={1}>{suggestion.firstName} {suggestion.lastName}</Text><Pressable style={ui.addButton} onPress={() => void add(suggestion)} disabled={adding === suggestion.userId}><Text style={ui.addText}>{adding === suggestion.userId ? "Adding..." : "Add"}</Text></Pressable></View>)}</ScrollView><Pressable style={ui.addAll} onPress={() => p.suggestions.forEach((suggestion) => void add(suggestion))}><Text style={ui.addAllText}>Add All</Text></Pressable></View> : null}

      <View style={ui.tabs}>{(["All", "Reels", "Photos", "Events"] as const).map((item) => <Pressable key={item} style={[ui.tab, tab === item && ui.tabActive]} onPress={() => setTab(item)}><Text style={[ui.tabText, tab === item && ui.tabTextActive]}>{item}</Text></Pressable>)}</View>

      {tab === "Reels" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Reels</Text>{p?.reels.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.mediaRail}>{p.reels.map((reel) => <View key={reel.id} style={ui.reelCard}>{reel.thumbnail ? <Image source={{ uri: reel.thumbnail }} style={ui.mediaImage} /> : <View style={ui.mediaImage} />}<View style={ui.viewOverlay}><EyeIcon width={ui.viewIcon} height={ui.viewIcon} /><Text style={ui.viewText}>{compact(reel.viewCount)}</Text></View></View>)}</ScrollView> : <><Text style={ui.emptyText}>Please Upload a reel ..... </Text>{isOwner ? <Pressable style={ui.uploadButton}><Text style={ui.uploadText}>Upload</Text></Pressable> : null}</>}</View> : null}
      {tab === "Photos" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Photos</Text>{p?.photos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.mediaRail}>{p.photos.map((photo) => <Image key={photo.id} source={{ uri: photo.thumbnail || photo.url || "" }} style={ui.photoCard} />)}</ScrollView> : <Text style={ui.emptyText}>You haven't uploaded anything on ReDom yet</Text>}</View> : null}
      {tab === "Events" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Events</Text><Text style={ui.emptyText}>No events to show.</Text></View> : null}

      {tab === "All" ? <><View style={ui.detailsSection}><View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>Personal details</Text>{isOwner ? <Pressable><EditIcon width={ui.editIcon} height={ui.editIcon} /></Pressable> : null}</View>{p?.location ? <View style={ui.detailRow}><LocationIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.detailText}>{p.location}</Text></View> : null}{p?.birthday ? <View style={ui.detailRow}><CalendarIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.detailText}>{p.birthday}</Text></View> : null}</View><View style={ui.detailsSection}><Text style={ui.sectionTitle}>ReDom</Text><View style={ui.detailRow}><ReDomRecordIcon width={ui.detailIcon} height={ui.detailIcon} /><View style={ui.redomValue}><Text style={ui.detailText}>Joined ReDom</Text>{p?.joinedAt ? <Text style={ui.subDetail}>{p.joinedAt}</Text> : null}<Text style={ui.subDetail}>{p?.joinedCountry || "Unavailable"}</Text></View></View></View><View style={ui.friendsSection}><View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>Friends</Text><Pressable><Text style={ui.seeAll}>See all</Text></Pressable></View>{p?.friends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.friendRail}>{p.friends.slice(0, 12).map((friend) => <View key={friend.userId} style={ui.friendCard}><Avatar uri={friend.profilePhoto} size={ui.friendAvatar} /><Text style={ui.friendName} numberOfLines={1}>{friend.firstName}</Text></View>)}</ScrollView> : null}</View>{isOwner ? <><View style={ui.postsHeader}><Text style={ui.sectionTitle}>All posts</Text><Text style={ui.seeAll}>Filters</Text></View><View style={ui.composer}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.composerAvatar} /><View style={ui.composerBox}><Text style={ui.composerText}>What's on your mind?</Text></View></View></> : null}{p?.posts.length ? p.posts.map((post) => <View key={post.id} style={ui.post}><View style={ui.postHead}><Avatar uri={p.profilePhoto} size={ui.postAvatar} /><View><Text style={ui.postName}>{name}</Text><Text style={ui.postTime}>{new Date(post.publishedAt).toLocaleDateString()}</Text></View></View>{post.content ? <Text style={ui.postContent}>{post.content}</Text> : null}{post.thumbnail ? <Image source={{ uri: post.thumbnail }} style={ui.postMedia} /> : null}</View>) : null}</> : null}
      {loading ? <View style={ui.loading}><Text style={ui.emptyText}>Loading profile...</Text></View> : null}
    </ScrollView>
  </SafeAreaView>;
}

function makeStyles(width: number) {
  const scale = Math.min(1, Math.max(0.82, width / 390));
  const n = (value: number) => Math.round(value * scale);
  const horizontal = n(18);
  const avatar = n(92);
  return {
    ...StyleSheet.create({
      root: { flex: 1, backgroundColor: "#fff" },
      nav: { height: n(56), backgroundColor: "#fff", flexDirection: "row", justifyContent: "space-around", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
      navItem: { width: n(58), height: n(56), alignItems: "center", justifyContent: "center" },
      activeNav: { borderBottomWidth: n(3), borderBottomColor: "#1877F2" },
      content: { paddingBottom: n(32) },
      coverWrap: { height: n(218), position: "relative" },
      cover: { height: n(185), backgroundColor: "#D8D8D8", overflow: "hidden" },
      coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.12)" },
      coverTools: { position: "absolute", right: n(10), top: n(14), flexDirection: "row", alignItems: "center", gap: n(9) },
      songBubble: { position: "absolute", left: n(96), top: n(116), backgroundColor: "#fff", borderRadius: n(22), paddingHorizontal: n(14), paddingVertical: n(9), elevation: 2, maxWidth: width - n(150) },
      songText: { fontSize: n(14), color: "#65676B" },
      coverCamera: { position: "absolute", right: n(9), top: n(128), width: n(44), height: n(44), alignItems: "center", justifyContent: "center" },
      avatarPosition: { position: "absolute", left: horizontal, top: n(126) },
      avatarRing: { borderWidth: n(4), borderColor: "#fff", borderRadius: avatar / 2 + n(6), backgroundColor: "#D9F0FF", padding: n(2) },
      profileCamera: { position: "absolute", right: -n(3), bottom: 0, width: n(40), height: n(40), borderRadius: n(20), backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center" },
      identityBlock: { paddingHorizontal: horizontal, paddingBottom: n(12) },
      identityTop: { flexDirection: "row", alignItems: "flex-start", marginTop: -n(1) },
      identityText: { marginLeft: avatar + n(12), flex: 1, minWidth: 0 },
      name: { fontSize: n(23), fontWeight: "800", color: "#050505", lineHeight: n(27) },
      countLine: { fontSize: n(14), fontWeight: "700", marginTop: n(4), color: "#424242" },
      dot: { color: "#65676B" },
      dropdown: { marginLeft: n(5), flexShrink: 0 },
      locationLine: { flexDirection: "row", alignItems: "center", gap: n(6), marginTop: n(16) },
      locationText: { fontSize: n(16), fontWeight: "700", flexShrink: 1 },
      mainButtons: { flexDirection: "row", gap: n(10), marginTop: n(15) },
      primaryButton: { height: n(48), flex: 1, borderRadius: n(10), backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: n(7), minWidth: 0 },
      primaryText: { fontSize: n(16), fontWeight: "700", color: "#fff" },
      secondaryButton: { height: n(48), flex: 1, borderRadius: n(10), backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: n(7), minWidth: 0 },
      secondaryText: { fontSize: n(16), fontWeight: "700", color: "#111" },
      suggestionSection: { borderTopWidth: n(5), borderBottomWidth: n(5), borderColor: "#E4E6EB", paddingVertical: n(13) },
      sectionTitleRow: { paddingHorizontal: horizontal, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      sectionTitle: { fontSize: n(21), fontWeight: "800", color: "#101010" },
      closeSuggestion: { fontSize: n(32), color: "#65676B", lineHeight: n(32) },
      suggestionRail: { paddingHorizontal: n(12), gap: n(10), paddingTop: n(10) },
      suggestionCard: { width: n(145), borderWidth: 1, borderColor: "#D8D8D8", borderRadius: n(12), overflow: "hidden", backgroundColor: "#fff" },
      suggestionAvatarWrap: { alignItems: "center", paddingTop: n(4) },
      suggestionName: { fontSize: n(16), fontWeight: "800", paddingHorizontal: n(8), paddingTop: n(8) },
      addButton: { margin: n(8), height: n(39), borderRadius: n(9), backgroundColor: "#DCEBFA", alignItems: "center", justifyContent: "center" },
      addText: { fontSize: n(16), fontWeight: "700", color: "#1877F2" },
      addAll: { margin: n(12), height: n(44), borderRadius: n(9), backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center" },
      addAllText: { fontSize: n(16), fontWeight: "800" },
      tabs: { height: n(64), flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
      tab: { height: n(55), flex: 1, alignItems: "center", justifyContent: "center" },
      tabActive: { borderBottomWidth: n(3), borderBottomColor: "#1877F2", backgroundColor: "#E8F3FF", borderRadius: n(28) },
      tabText: { fontSize: n(16), color: "#65676B", fontWeight: "700" },
      tabTextActive: { color: "#1877F2" },
      mediaSection: { paddingVertical: n(16), borderBottomWidth: n(5), borderBottomColor: "#E4E6EB" },
      mediaRail: { paddingHorizontal: n(12), gap: n(9), paddingTop: n(10) },
      reelCard: { width: n(135), height: n(185), position: "relative", borderRadius: n(9), overflow: "hidden", backgroundColor: "#D8D8D8" },
      mediaImage: { width: "100%", height: "100%" },
      photoCard: { width: n(135), height: n(135), borderRadius: n(8), backgroundColor: "#E4E6EB" },
      viewOverlay: { position: "absolute", left: n(7), bottom: n(7), flexDirection: "row", alignItems: "center", gap: n(3) },
      viewText: { color: "#fff", fontSize: n(14), fontWeight: "800", textShadowColor: "#000", textShadowRadius: 3 },
      emptyText: { padding: n(16), fontSize: n(15), color: "#65676B" },
      uploadButton: { marginHorizontal: horizontal, height: n(46), borderRadius: n(9), backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
      uploadText: { color: "#fff", fontSize: n(16), fontWeight: "700" },
      detailsSection: { paddingHorizontal: horizontal, paddingVertical: n(19), borderBottomWidth: n(5), borderBottomColor: "#E4E6EB" },
      detailRow: { flexDirection: "row", alignItems: "center", gap: n(11), marginTop: n(17) },
      detailText: { fontSize: n(16), fontWeight: "700", color: "#111", flexShrink: 1 },
      subDetail: { marginTop: n(2), color: "#65676B", fontSize: n(14) },
      redomValue: { flexShrink: 1 },
      friendsSection: { paddingVertical: n(18), borderBottomWidth: n(5), borderBottomColor: "#E4E6EB" },
      seeAll: { color: "#1877F2", fontSize: n(15), fontWeight: "600" },
      friendRail: { paddingHorizontal: horizontal, gap: n(10), paddingTop: n(12) },
      friendCard: { width: n(76), alignItems: "center" },
      friendName: { marginTop: n(4), fontSize: n(13), fontWeight: "700" },
      postsHeader: { paddingHorizontal: horizontal, paddingTop: n(18), paddingBottom: n(10), flexDirection: "row", justifyContent: "space-between" },
      composer: { paddingHorizontal: horizontal, paddingBottom: n(13), flexDirection: "row", alignItems: "center", gap: n(9) },
      composerBox: { flex: 1, backgroundColor: "#F0F2F5", borderRadius: n(22), paddingHorizontal: n(14), paddingVertical: n(11) },
      composerText: { color: "#65676B", fontSize: n(14) },
      post: { padding: horizontal, borderTopWidth: n(5), borderTopColor: "#E4E6EB" },
      postHead: { flexDirection: "row", alignItems: "center", gap: n(9) },
      postName: { fontSize: n(15), fontWeight: "800" },
      postTime: { color: "#65676B", fontSize: n(11), marginTop: n(2) },
      postContent: { fontSize: n(15), marginTop: n(10), lineHeight: n(21) },
      postMedia: { width: "100%", height: Math.min(n(280), width * 0.72), marginTop: n(10), borderRadius: n(8) },
      loading: { padding: n(18), alignItems: "center" },
    }),
    icon: n(26), navAvatar: n(30), coverToolIcon: n(29), cameraIcon: n(34), profileAvatar: avatar, dropdownSize: n(43), detailIcon: n(30), buttonIcon: n(24), editIcon: n(28), suggestionAvatar: n(138), viewIcon: n(20), friendAvatar: n(70), composerAvatar: n(44), postAvatar: n(40),
  };
}
