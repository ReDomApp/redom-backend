import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, ImageBackground, Modal, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import * as Clipboard from "expo-clipboard";
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
import MenuIcon from "../assets/home-feed/menu.svg";
import LinkIcon from "../assets/home-feed/profile-link.svg";
import GalleryIcon from "../assets/home-feed/profile-gallery.svg";
import ReelIcon from "../assets/home-feed/profile-reel.svg";
import LiveIcon from "../assets/home-feed/profile-live.svg";
import SettingsIcon from "../assets/home-feed/settings.svg";
import FollowIcon from "../assets/home-feed/follow.svg";
import PrivacyIcon from "../assets/home-feed/privacy-center.svg";
import ReportIcon from "../assets/home-feed/report.svg";
import ShareIcon from "../assets/home-feed/share.svg";
import SessionIcon from "../assets/home-feed/session.svg";
import { useAuthContext } from "../auth/context";
import { profileService, type ProfileData, type ProfileSuggestion } from "../profile/service";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;
type SheetKind = "owner" | "visitor" | "cover" | "avatar" | null;
type Tab = "All" | "Reels" | "Photos" | "Events";

function Avatar({ uri, size = 48 }: { uri?: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />;
}

function compact(value: number) {
  if (value < 1000) return String(value);
  if (value < 1000000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

const PROFILE_PROMPTS = ["Share a song...", "What's on your mind?", "Share your favorite emoji?", "Oh, share a wish"];

export function ProfileScreen({ navigation, route }: Props) {
  const { user } = useAuthContext();
  const { width } = useWindowDimensions();
  const ui = useMemo(() => makeStyles(width), [width]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("All");
  const [adding, setAdding] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [visitorPreview, setVisitorPreview] = useState(false);
  const requestedUserId = route.params?.userId;

  const refreshProfile = useCallback(async () => {
    setRefreshing(true); setLoading(true);
    try {
      const result = await profileService.getProfile(requestedUserId);
      setProfile(result.profile); setPromptIndex((current) => (current + 1) % PROFILE_PROMPTS.length);
    } catch { Alert.alert("Profile", "Unable to load this profile right now."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [requestedUserId]);

  useEffect(() => { setVisitorPreview(false); void refreshProfile(); }, [refreshProfile]);

  const p = profile;
  const owner = !!p && (p.isOwner || p.profileId === user?.profileId);
  const isVisitorView = !owner || visitorPreview;
  const canEdit = owner && !visitorPreview;
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : user ? `${user.firstName} ${user.lastName}`.trim() : "Profile";
  const firstName = p?.firstName || user?.firstName || "";

  const add = async (suggestion: ProfileSuggestion) => {
    if (adding) return;
    setAdding(suggestion.userId);
    try {
      const result = await profileService.addSuggestion(suggestion.userId);
      Alert.alert(result.success ? "Friend request sent" : "Couldn't add this person", result.success ? "Your friend request was sent." : (result.reason || "We couldn't send the request right now."));
    } finally { setAdding(null); }
  };

  const openSuggestedProfile = (suggestion: ProfileSuggestion) => {
    navigation.navigate("Profile", { userId: suggestion.userId });
  };

  const copyProfileLink = async () => {
    if (!p?.shareUrl) return;
    await Clipboard.setStringAsync(p.shareUrl);
    Alert.alert("Copied", `${firstName || name}'s ReDom profile link was copied.`);
  };

  const enterVisitorPreview = () => { setSheet(null); setVisitorPreview(true); };
  const leaveVisitorPreview = () => { setVisitorPreview(false); };

  return (
    <SafeAreaView style={ui.root}>
      <View style={ui.nav}>
        <Pressable style={ui.navItem} onPress={() => navigation.navigate("HomeFeed")}><HomeIcon width={ui.icon} height={ui.icon} /></Pressable>
        <Pressable style={ui.navItem}><VideoIcon width={ui.icon} height={ui.icon} /></Pressable>
        <Pressable style={ui.navItem}><MarketplaceIcon width={ui.icon} height={ui.icon} /></Pressable>
        <Pressable style={ui.navItem}><NotificationsIcon width={ui.icon} height={ui.icon} /></Pressable>
        <Pressable style={[ui.navItem, ui.activeNav]} onPress={() => (canEdit ? void refreshProfile() : navigation.navigate("Profile"))} accessibilityLabel={canEdit ? "Refresh current profile" : "Open my profile"}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.navAvatar} /></Pressable>
      </View>
      {visitorPreview ? <View style={ui.previewBanner}><EyeIcon width={ui.previewBannerIcon} height={ui.previewBannerIcon} /><Text style={ui.previewBannerText}>Viewing your profile as a visitor</Text><Pressable onPress={leaveVisitorPreview} style={ui.previewDone}><Text style={ui.previewDoneText}>Exit</Text></Pressable></View> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ui.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshProfile} />}>
        <View style={ui.coverWrap}>
          {p?.coverPhoto ? <ImageBackground source={{ uri: p.coverPhoto }} style={ui.cover} resizeMode="cover"><View style={ui.coverShade} /></ImageBackground> : <View style={ui.cover}><View style={ui.coverShade} /></View>}
          {canEdit ? <Pressable style={ui.menuButton} accessibilityLabel="Open profile navigation"><MenuIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable> : null}
          <View style={ui.coverTools}>
            {canEdit ? <Pressable accessibilityLabel="Edit cover photo"><CoverEditIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable> : null}
            <Pressable accessibilityLabel="Search profile" onPress={() => setSearchOpen(true)}><CoverSearchIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable>
            <Pressable accessibilityLabel="More profile options" onPress={() => setSheet(owner ? "owner" : "visitor")}><CoverMoreIcon width={ui.coverToolIcon} height={ui.coverToolIcon} /></Pressable>
          </View>
          <Pressable style={ui.songBubble} accessibilityLabel="Profile prompt"><Text style={ui.songText}>{PROFILE_PROMPTS[promptIndex]}</Text></Pressable>
          {canEdit ? <Pressable style={ui.coverCamera} onPress={() => setSheet("cover")} accessibilityLabel="Change cover photo"><CoverCameraIcon width={ui.cameraIcon} height={ui.cameraIcon} /></Pressable> : null}
          <View style={ui.avatarPosition}><View style={ui.avatarRing}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.profileAvatar} /></View>{canEdit ? <Pressable style={ui.profileCamera} onPress={() => setSheet("avatar")} accessibilityLabel="Change profile picture"><CameraIcon width={ui.cameraIcon} height={ui.cameraIcon} /></Pressable> : null}</View>
        </View>
        <View style={ui.identityBlock}>
          <View style={ui.identityTop}><View style={ui.identityText}><View style={ui.nameRow}><Text style={ui.name} numberOfLines={2}>{name}</Text>{p?.verified ? <Text style={ui.verifiedBadge}>✓</Text> : null}</View><Text style={ui.username}>{p?.username ? `@${p.username}` : ""}</Text><Text style={ui.countLine}>{p?.friendCount ?? 0} Friends <Text style={ui.dot}>•</Text> {p?.postCount ?? 0} posts</Text></View><Pressable style={ui.dropdown} accessibilityLabel="Additional profile information"><DropdownIcon width={ui.dropdownSize} height={ui.dropdownSize} /></Pressable></View>
          {p?.location ? <View style={ui.locationLine}><LocationIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.locationText}>{p.location}</Text></View> : null}
          <View style={ui.mainButtons}>{canEdit ? <><Pressable style={ui.primaryButton} accessibilityLabel="Add to story"><AddStoryIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.primaryText}>Add to story</Text></Pressable><Pressable style={ui.secondaryButton} accessibilityLabel="Edit profile"><EditIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.secondaryText}>Edit profile</Text></Pressable></> : owner ? <><View style={[ui.primaryButton, ui.disabledButton]}><Text style={ui.disabledButtonText}>Add Friend</Text></View><View style={[ui.secondaryButton, ui.disabledButton]}><Text style={ui.disabledButtonText}>Message</Text></View></> : <><Pressable style={ui.primaryButton} accessibilityLabel={`Add ${name} as a friend`}><Text style={ui.primaryText}>Add Friend</Text></Pressable><Pressable style={ui.secondaryButton} accessibilityLabel={`Message ${name}`}><Text style={ui.secondaryText}>Message</Text></Pressable></>}</View>
        </View>
        {canEdit && p && p.suggestions.length > 0 ? <View style={ui.suggestionSection}>
          <View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>People you may know</Text><Pressable accessibilityLabel="Dismiss suggestions"><Text style={ui.closeSuggestion}>×</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.suggestionRail}>
            {p.suggestions.map((suggestion) => <View key={suggestion.userId} style={ui.suggestionCard}>
              <Pressable style={ui.suggestionProfileTap} onPress={() => openSuggestedProfile(suggestion)} accessibilityRole="button" accessibilityLabel={`Open ${suggestion.firstName} ${suggestion.lastName}'s profile`}>
                <View style={ui.suggestionAvatarWrap}><Avatar uri={suggestion.profilePhoto} size={ui.suggestionAvatar} /></View>
                <Text style={ui.suggestionName} numberOfLines={1}>{suggestion.firstName} {suggestion.lastName}</Text>
              </Pressable>
              <Pressable style={ui.addButton} onPress={() => void add(suggestion)} disabled={adding === suggestion.userId}><Text style={ui.addText}>{adding === suggestion.userId ? "Adding..." : "Add"}</Text></Pressable>
            </View>)}
          </ScrollView>
          <Pressable style={ui.addAll} onPress={() => p.suggestions.forEach((suggestion) => void add(suggestion))}><Text style={ui.addAllText}>Add All</Text></Pressable>
        </View> : null}
        <View style={ui.tabs}>{(["All", "Reels", "Photos", "Events"] as const).map((item) => <Pressable key={item} style={[ui.tab, tab === item && ui.tabActive]} onPress={() => setTab(item)}><Text style={[ui.tabText, tab === item && ui.tabTextActive]}>{item}</Text></Pressable>)}</View>
        {tab === "Reels" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Reels</Text>{p?.reels.length ? <View style={ui.reelGrid}>{p.reels.map((reel) => <View key={reel.id} style={ui.reelCard}>{reel.thumbnail ? <Image source={{ uri: reel.thumbnail }} style={ui.mediaImage} /> : <View style={ui.mediaImage} />}<View style={ui.viewOverlay}><EyeIcon width={ui.viewIcon} height={ui.viewIcon} /><Text style={ui.viewText}>{compact(reel.viewCount)}</Text></View></View>)}</View> : <Text style={ui.emptyText}>{canEdit ? "Please Upload a reel ....." : "No reels to show."}</Text>}</View> : null}
        {tab === "Photos" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Photos</Text>{p?.photos.length ? <View style={ui.photoGrid}>{p.photos.map((photo) => <Image key={photo.id} source={{ uri: photo.thumbnail || photo.url || "" }} style={ui.photoCard} />)}</View> : <Text style={ui.emptyText}>{canEdit ? "You haven't uploaded anything on ReDom yet" : "No photos to show."}</Text>}</View> : null}
        {tab === "Events" ? <View style={ui.mediaSection}><Text style={ui.sectionTitle}>Events</Text><Text style={ui.emptyText}>No events to show.</Text></View> : null}
        {tab === "All" ? <>
          <View style={ui.detailsSection}><View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>Personal details</Text>{canEdit ? <Pressable accessibilityLabel="Edit personal details"><EditIcon width={ui.editIcon} height={ui.editIcon} /></Pressable> : null}</View>{p?.location ? <View style={ui.detailRow}><LocationIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.detailText}>{p.location}</Text></View> : null}{p?.birthday ? <View style={ui.detailRow}><CalendarIcon width={ui.detailIcon} height={ui.detailIcon} /><Text style={ui.detailText}>{p.birthday}</Text></View> : null}</View>
          <View style={ui.detailsSection}><Text style={ui.sectionTitle}>ReDom</Text><View style={ui.detailRow}><ReDomRecordIcon width={ui.detailIcon} height={ui.detailIcon} /><View style={ui.redomValue}><Text style={ui.detailText}>Joined ReDom</Text>{p?.joinedAt ? <Text style={ui.subDetail}>{p.joinedAt}</Text> : null}{p?.joinedCountry ? <Text style={ui.subDetail}>{p.joinedCountry}</Text> : null}</View></View></View>
          <View style={ui.friendsSection}><View style={ui.sectionTitleRow}><Text style={ui.sectionTitle}>Friends</Text><Pressable accessibilityLabel="See all friends"><Text style={ui.seeAll}>See all</Text></Pressable></View>{p?.friends.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.friendRail}>{p.friends.slice(0, 12).map((friend) => <View key={friend.userId} style={ui.friendCard}><Avatar uri={friend.profilePhoto} size={ui.friendAvatar} /><Text style={ui.friendName} numberOfLines={1}>{friend.firstName}</Text></View>)}</ScrollView> : null}</View>
          {canEdit ? <><View style={ui.postsHeader}><Text style={ui.sectionTitle}>All posts</Text><Pressable onPress={() => setFilterOpen(true)}><Text style={ui.seeAll}>Filters</Text></Pressable></View><View style={ui.composer}><Avatar uri={p?.profilePhoto || user?.profilePhoto} size={ui.composerAvatar} /><Pressable style={ui.composerBox} accessibilityLabel="Create a post"><Text style={ui.composerText}>What's on your mind?</Text></Pressable><Pressable accessibilityLabel="Choose photos"><GalleryIcon width={ui.buttonIcon} height={ui.buttonIcon} /></Pressable></View><View style={ui.creationRow}><Pressable style={ui.creationButton} accessibilityLabel="Create reel"><ReelIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.creationText}>Reel</Text></Pressable><Pressable style={ui.creationButton} accessibilityLabel="Go live"><LiveIcon width={ui.buttonIcon} height={ui.buttonIcon} /><Text style={ui.creationText}>Live</Text></Pressable></View></> : null}
          {p?.posts.length ? p.posts.map((post) => <View key={post.id} style={ui.post}><View style={ui.postHead}><Avatar uri={p.profilePhoto} size={ui.postAvatar} /><View><Text style={ui.postName}>{name}</Text><Text style={ui.postTime}>{new Date(post.publishedAt).toLocaleDateString()}</Text></View></View>{post.content ? <Text style={ui.postContent}>{post.content}</Text> : null}{post.thumbnail ? <Image source={{ uri: post.thumbnail }} style={ui.postMedia} /> : null}</View>) : null}
        </> : null}
        {loading ? <View style={ui.loading}><Text style={ui.emptyText}>Loading profile...</Text></View> : null}
      </ScrollView>
      <ProfileSheet kind={sheet} name={name} firstName={firstName} visitorPreview={visitorPreview} onClose={() => setSheet(null)} onCopy={copyProfileLink} onViewAsVisitor={owner ? enterVisitorPreview : undefined} ui={ui} />
      <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={() => setSearchOpen(false)}><View style={ui.modalBackdrop}><View style={ui.searchPanel}><View style={ui.modalHeader}><Text style={ui.modalTitle}>Search {firstName || "profile"}</Text><Pressable onPress={() => setSearchOpen(false)}><Text style={ui.modalClose}>×</Text></Pressable></View><TextInput value={searchText} onChangeText={setSearchText} placeholder="Search this profile" placeholderTextColor="#65676B" style={ui.searchInput} autoFocus /><Text style={ui.searchHint}>Search posts, media or tagged items within this profile.</Text><View style={ui.dateRow}>{["Most recent", "Last Yr", "Last Month", "Today", "Select Date"].map((label) => <Pressable key={label} style={ui.dateChip}><Text style={ui.dateChipText}>{label}</Text></Pressable>)}</View>{searchText.trim() ? <Text style={ui.emptyText}>Search results will appear here.</Text> : null}</View></View></Modal>
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}><View style={ui.modalBackdrop}><View style={ui.filterPanel}><View style={ui.modalHeader}><Text style={ui.modalTitle}>Filter posts</Text><Pressable onPress={() => setFilterOpen(false)}><Text style={ui.modalClose}>×</Text></Pressable></View>{["Year", "Posted By", "Privacy status"].map((label) => <View key={label} style={ui.disabledRow}><Text style={ui.disabledText}>{label}</Text></View>)}</View></View></Modal>
    </SafeAreaView>
  );
}

function ProfileSheet({kind,name,firstName,visitorPreview,onClose,onCopy,onViewAsVisitor,ui}:{kind:SheetKind;name:string;firstName:string;visitorPreview:boolean;onClose:()=>void;onCopy:()=>Promise<void>;onViewAsVisitor?:()=>void;ui:ReturnType<typeof makeStyles>}) {
  if (!kind) return null;
  const owner = kind === "owner" && !visitorPreview;
  const visitor = kind === "visitor" || (kind === "owner" && visitorPreview);
  const cover = kind === "cover";
  const avatar = kind === "avatar";
  const rows = owner ? [[EyeIcon, "Switch to visitor view", onViewAsVisitor],[SettingsIcon, "Profile Status"],[SettingsIcon, "Lock Profile"],[SessionIcon, "Activity Log"],[SettingsIcon, "Profile Settings"],[FollowIcon, "Follow settings"],[SettingsIcon, "Reactivate your verified badge"],[SettingsIcon, "Archive"],[SettingsIcon, "Manage posts"],[SettingsIcon, "Review posts and tags"],[PrivacyIcon, "Privacy Center"],[SettingsIcon, "Turn on Business Mode"],[SettingsIcon, "Turn On Creator Mode"]] as const : visitor ? [[SettingsIcon, "Block User"],[ReportIcon, "Report Profile"],[ShareIcon, "Share Profile"],[FollowIcon, "Unfollow"]] as const : cover ? [[CoverCameraIcon, "View Cover Photo"],[CoverCameraIcon, "Upload New Cover Photo"]] as const : [[CameraIcon, "See Profile Picture"],[CameraIcon, "Choose Profile Picture"],[CameraIcon, "Create Avatar Profile Picture"]] as const;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={ui.sheetBackdrop}><View style={ui.sheet}><View style={ui.sheetHandle} /><View style={ui.sheetHeader}><Text style={ui.sheetTitle}>{owner ? "Profile management" : visitor ? "Manage profile" : cover ? "Cover photo" : "Profile picture"}</Text><Pressable onPress={onClose}><Text style={ui.modalClose}>×</Text></Pressable></View>{rows.map(([Icon,label,action],index)=><Pressable key={`${label}-${index}`} style={ui.sheetRow} onPress={action ? action : undefined} disabled={!action} accessibilityRole={action ? "button" : undefined} accessibilityLabel={label}><Icon width={ui.sheetIcon} height={ui.sheetIcon} /><Text style={ui.sheetRowText}>{label}</Text></Pressable>)}{!cover&&!avatar?<><View style={ui.sheetDivider}/><View style={ui.linkIntro}><LinkIcon width={ui.sheetIcon} height={ui.sheetIcon}/><View style={ui.linkCopy}><Text style={ui.sheetRowText}>{owner ? `Copy ReDom Profile Link for ${firstName || name}?` : `Copy ${firstName || name}'s personalized link on ReDom?`}</Text><Text style={ui.linkDescription}>https://redom.app/profile/username/{"<7-character code>"}</Text></View></View><Pressable style={ui.copyButton} onPress={() => void onCopy()}><LinkIcon width={ui.buttonIcon} height={ui.buttonIcon}/><Text style={ui.copyButtonText}>Copy Profile Link</Text></Pressable></>:null}</View></View></Modal>;
}

function makeStyles(width:number){const scale=Math.min(1,Math.max(.82,width/390));const n=(value:number)=>Math.round(value*scale);const horizontal=n(18);const avatar=n(92);return StyleSheet.create({
root:{flex:1,backgroundColor:"#fff"},nav:{height:n(56),backgroundColor:"#fff",flexDirection:"row",justifyContent:"space-around",alignItems:"center",borderBottomWidth:1,borderBottomColor:"#E4E6EB"},navItem:{width:n(58),height:n(56),alignItems:"center",justifyContent:"center"},activeNav:{borderBottomWidth:n(3),borderBottomColor:"#1877F2"},icon:n(25),navAvatar:n(34),content:{paddingBottom:n(36)},previewBanner:{minHeight:n(42),paddingHorizontal:horizontal,backgroundColor:"#F0F2F5",flexDirection:"row",alignItems:"center",gap:n(8),borderBottomWidth:1,borderBottomColor:"#E4E6EB"},previewBannerIcon:n(19),previewBannerText:{flex:1,color:"#050505",fontSize:n(13),fontWeight:"700"},previewDone:{paddingHorizontal:n(10),paddingVertical:n(6)},previewDoneText:{color:"#1877F2",fontSize:n(13),fontWeight:"800"},coverWrap:{height:n(218),position:"relative"},cover:{height:n(185),backgroundColor:"#D8D8D8",overflow:"hidden"},coverShade:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,.10)"},menuButton:{position:"absolute",left:n(10),top:n(14),width:n(42),height:n(42),alignItems:"center",justifyContent:"center"},coverTools:{position:"absolute",right:n(10),top:n(14),flexDirection:"row",alignItems:"center",gap:n(10)},coverToolIcon:n(30),songBubble:{position:"absolute",left:n(96),top:n(116),backgroundColor:"#fff",borderRadius:n(22),paddingHorizontal:n(14),paddingVertical:n(9),elevation:2,maxWidth:width-n(150)},songText:{fontSize:n(14),color:"#65676B"},cameraIcon:n(28),coverCamera:{position:"absolute",right:n(9),top:n(128),width:n(44),height:n(44),alignItems:"center",justifyContent:"center"},avatarPosition:{position:"absolute",left:horizontal,top:n(126)},avatarRing:{borderWidth:n(4),borderColor:"#fff",borderRadius:avatar/2+n(6),backgroundColor:"#D9F0FF",padding:n(2)},profileAvatar:avatar,profileCamera:{position:"absolute",right:-n(3),bottom:0,width:n(40),height:n(40),borderRadius:n(20),backgroundColor:"#E4E6EB",alignItems:"center",justifyContent:"center"},identityBlock:{paddingHorizontal:horizontal,paddingBottom:n(12)},identityTop:{flexDirection:"row",alignItems:"flex-start"},identityText:{marginLeft:avatar+n(12),flex:1,minWidth:0},nameRow:{flexDirection:"row",alignItems:"center",gap:n(5)},name:{fontSize:n(23),fontWeight:"800",color:"#050505",lineHeight:n(27),flexShrink:1},verifiedBadge:{backgroundColor:"#1877F2",color:"#fff",width:n(19),height:n(19),borderRadius:n(10),textAlign:"center",lineHeight:n(19),fontWeight:"800",fontSize:n(12)},username:{fontSize:n(13),color:"#65676B",marginTop:n(1)},countLine:{fontSize:n(14),color:"#65676B",marginTop:n(2)},dot:{color:"#65676B"},dropdown:{width:n(44),height:n(44),alignItems:"center",justifyContent:"center",marginTop:n(4)},dropdownSize:n(40),locationLine:{flexDirection:"row",alignItems:"center",gap:n(8),marginTop:n(12)},detailIcon:n(25),locationText:{fontSize:n(17),fontWeight:"700",color:"#050505"},mainButtons:{flexDirection:"row",gap:n(10),marginTop:n(14)},primaryButton:{flex:1,minHeight:n(48),borderRadius:n(9),backgroundColor:"#1877F2",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:n(8)},secondaryButton:{flex:1,minHeight:n(48),borderRadius:n(9),backgroundColor:"#E4E6EB",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:n(8)},buttonIcon:n(24),primaryText:{color:"#fff",fontSize:n(16),fontWeight:"700"},secondaryText:{color:"#050505",fontSize:n(16),fontWeight:"700"},disabledButton:{opacity:.6},disabledButtonText:{color:"#65676B",fontSize:n(16),fontWeight:"700"},suggestionSection:{paddingHorizontal:horizontal,paddingTop:n(12),paddingBottom:n(8)},sectionTitleRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},sectionTitle:{fontSize:n(20),fontWeight:"800",color:"#050505"},closeSuggestion:{fontSize:n(28),color:"#65676B"},suggestionRail:{gap:n(10),paddingVertical:n(12)},suggestionCard:{width:n(132),padding:n(10),borderRadius:n(10),borderWidth:1,borderColor:"#E4E6EB",backgroundColor:"#fff"},suggestionProfileTap:{alignItems:"center"},suggestionAvatarWrap:{alignItems:"center"},suggestionAvatar:n(68),suggestionName:{fontSize:n(14),fontWeight:"700",marginTop:n(7),textAlign:"center"},addButton:{marginTop:n(8),borderRadius:n(7),backgroundColor:"#E7F3FF",paddingVertical:n(7),alignItems:"center"},addText:{color:"#1877F2",fontWeight:"700"},addAll:{alignItems:"center",paddingVertical:n(6)},addAllText:{color:"#1877F2",fontWeight:"700",fontSize:n(15)},tabs:{flexDirection:"row",paddingHorizontal:horizontal,marginTop:n(6),borderBottomWidth:1,borderBottomColor:"#E4E6EB"},tab:{flex:1,alignItems:"center",paddingVertical:n(13),borderRadius:n(22)},tabActive:{backgroundColor:"#E7F3FF"},tabText:{color:"#65676B",fontSize:n(16),fontWeight:"700"},tabTextActive:{color:"#1877F2"},mediaSection:{padding:horizontal,gap:n(12)},reelGrid:{flexDirection:"row",flexWrap:"wrap",gap:n(4)},reelCard:{width:(width-horizontal*2-n(8))/3,aspectRatio:.72,backgroundColor:"#E4E6EB",overflow:"hidden"},mediaImage:{width:"100%",height:"100%",backgroundColor:"#E4E6EB"},viewOverlay:{position:"absolute",left:n(6),bottom:n(6),flexDirection:"row",alignItems:"center",gap:n(3)},viewIcon:n(16),viewText:{color:"#fff",fontWeight:"700",fontSize:n(12)},photoGrid:{flexDirection:"row",flexWrap:"wrap",gap:n(4)},photoCard:{width:(width-horizontal*2-n(8))/3,height:(width-horizontal*2-n(8))/3,backgroundColor:"#E4E6EB"},emptyText:{color:"#65676B",fontSize:n(15),paddingVertical:n(10)},detailsSection:{paddingHorizontal:horizontal,paddingTop:n(20),gap:n(14)},editIcon:n(25),detailRow:{flexDirection:"row",alignItems:"center",gap:n(13)},detailText:{fontSize:n(17),fontWeight:"600",color:"#050505"},subDetail:{fontSize:n(14),color:"#65676B",marginTop:n(2)},redomValue:{flex:1},friendsSection:{paddingHorizontal:horizontal,paddingTop:n(24)},seeAll:{color:"#1877F2",fontSize:n(16),fontWeight:"600"},friendRail:{gap:n(12),paddingVertical:n(12)},friendCard:{width:n(72),alignItems:"center"},friendAvatar:n(62),friendName:{marginTop:n(5),fontSize:n(13),fontWeight:"600",maxWidth:n(70),textAlign:"center"},postsHeader:{paddingHorizontal:horizontal,paddingTop:n(20),paddingBottom:n(10),flexDirection:"row",justifyContent:"space-between",alignItems:"center"},composer:{marginHorizontal:horizontal,flexDirection:"row",alignItems:"center",gap:n(10)},composerAvatar:n(44),composerBox:{flex:1,borderWidth:1,borderColor:"#E4E6EB",borderRadius:n(22),paddingHorizontal:n(16),paddingVertical:n(11)},composerText:{color:"#65676B",fontSize:n(15)},creationRow:{flexDirection:"row",gap:n(10),marginHorizontal:horizontal,marginTop:n(10)},creationButton:{flex:1,minHeight:n(42),borderRadius:n(21),borderWidth:1,borderColor:"#E4E6EB",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:n(7)},creationText:{fontSize:n(14),fontWeight:"700",color:"#050505"},post:{marginHorizontal:horizontal,marginTop:n(14),padding:n(14),borderTopWidth:1,borderBottomWidth:1,borderColor:"#E4E6EB"},postHead:{flexDirection:"row",alignItems:"center",gap:n(10)},postAvatar:n(42),postName:{fontWeight:"800",fontSize:n(15)},postTime:{color:"#65676B",fontSize:n(12),marginTop:n(2)},postContent:{fontSize:n(16),color:"#050505",marginTop:n(12),lineHeight:n(22)},postMedia:{width:"100%",height:n(230),marginTop:n(10),borderRadius:n(8)},loading:{padding:n(20),alignItems:"center"},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.45)",justifyContent:"center",padding:horizontal},searchPanel:{backgroundColor:"#fff",borderRadius:n(16),padding:n(18),maxHeight:"85%"},modalHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:n(12)},modalTitle:{fontSize:n(19),fontWeight:"800"},modalClose:{fontSize:n(30),color:"#65676B",lineHeight:n(30)},searchInput:{borderWidth:1,borderColor:"#CCD0D5",borderRadius:n(22),paddingHorizontal:n(16),paddingVertical:n(11),fontSize:n(15),color:"#050505"},searchHint:{color:"#65676B",marginTop:n(10),fontSize:n(13)},dateRow:{flexDirection:"row",flexWrap:"wrap",gap:n(8),marginTop:n(14)},dateChip:{paddingHorizontal:n(11),paddingVertical:n(8),borderRadius:n(18),backgroundColor:"#F0F2F5"},dateChipText:{fontSize:n(12),fontWeight:"700",color:"#050505"},filterPanel:{backgroundColor:"#fff",borderTopLeftRadius:n(18),borderTopRightRadius:n(18),padding:n(18),position:"absolute",bottom:0,left:0,right:0},disabledRow:{paddingVertical:n(15),borderBottomWidth:1,borderBottomColor:"#E4E6EB"},disabledText:{color:"#65676B",fontSize:n(15)},sheetBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.42)",justifyContent:"flex-end"},sheet:{backgroundColor:"#fff",borderTopLeftRadius:n(20),borderTopRightRadius:n(20),paddingHorizontal:horizontal,paddingTop:n(8),paddingBottom:n(22),maxHeight:"88%"},sheetHandle:{alignSelf:"center",width:n(42),height:n(4),borderRadius:n(2),backgroundColor:"#CCD0D5",marginBottom:n(10)},sheetHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingBottom:n(10)},sheetTitle:{fontSize:n(19),fontWeight:"800"},sheetRow:{minHeight:n(48),flexDirection:"row",alignItems:"center",gap:n(13)},sheetIcon:n(23),sheetRowText:{fontSize:n(15),color:"#050505",fontWeight:"600",flex:1},sheetDivider:{height:1,backgroundColor:"#E4E6EB",marginVertical:n(8)},linkIntro:{flexDirection:"row",alignItems:"flex-start",gap:n(12),paddingVertical:n(8)},linkCopy:{flex:1},linkDescription:{color:"#65676B",fontSize:n(13),marginTop:n(4)},copyButton:{minHeight:n(48),marginTop:n(8),borderRadius:n(9),backgroundColor:"#E4E6EB",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:n(8)},copyButtonText:{color:"#050505",fontSize:n(15),fontWeight:"800"}
});}