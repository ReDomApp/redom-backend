import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { VideoView, useVideoPlayer } from "expo-video";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import HomeIcon from "../assets/home-feed/home.svg";
import VideoIcon from "../assets/home-feed/video.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "CinematicShowcase">;

const REDOM_BLUE = "#1877F2";
const WALKING_VIDEO =
  "https://videos.pexels.com/video-files/36107350/15312311_1920_1080_24fps.mp4";
const PROFILE_PHOTO =
  "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=420";
const FEED_PHOTO =
  "https://images.pexels.com/photos/3184436/pexels-photo-3184436.jpeg?auto=compress&cs=tinysrgb&w=700";

const SCREENS = [
  { key: "login", label: "SIGN IN" },
  { key: "feed", label: "HOME FEED" },
  { key: "profile", label: "PROFILE" },
] as const;

type ScreenKey = (typeof SCREENS)[number]["key"];

type CardMotion = {
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  rotation: Animated.Value;
};

function makeMotion(): CardMotion {
  return {
    x: new Animated.Value(0),
    y: new Animated.Value(16),
    scale: new Animated.Value(0.82),
    opacity: new Animated.Value(0.72),
    rotation: new Animated.Value(0),
  };
}

function MiniLoginScreen() {
  return (
    <View style={styles.screenCanvas}>
      <View style={styles.miniHeader}>
        <ReDomLogo width={112} height={34} />
        <Text style={styles.miniHeaderLink}>Help</Text>
      </View>
      <View style={styles.loginIntro}>
        <Text style={styles.miniTitle}>Connect with your world.</Text>
        <Text style={styles.miniMuted}>See what friends are sharing and discover your community on ReDom.</Text>
      </View>
      <View style={styles.inputMock}>
        <Text style={styles.inputLabel}>Email address or phone number</Text>
        <Text style={styles.inputValue}>you@example.com</Text>
      </View>
      <View style={styles.inputMock}>
        <Text style={styles.inputLabel}>Password</Text>
        <Text style={styles.inputValue}>••••••••••</Text>
      </View>
      <View style={styles.loginButton}>
        <Text style={styles.loginButtonText}>Log in</Text>
      </View>
      <Text style={styles.forgotText}>Forgot password?</Text>
      <View style={styles.miniDivider} />
      <View style={styles.createButton}>
        <Text style={styles.createButtonText}>Create new account</Text>
      </View>
      <Text style={styles.miniFooter}>Meet people. Share moments. Be ReDom.</Text>
    </View>
  );
}

function MiniFeedScreen() {
  return (
    <View style={styles.screenCanvas}>
      <View style={styles.feedTopBar}>
        <ReDomLogo width={88} height={27} />
        <View style={styles.feedTopActions}>
          <View style={styles.smallCircle}><Text style={styles.circleGlyph}>⌕</Text></View>
          <View style={styles.smallCircle}><Text style={styles.circleGlyph}>＋</Text></View>
          <View style={styles.smallCircle}><Text style={styles.circleGlyph}>☏</Text></View>
        </View>
      </View>
      <View style={styles.feedTabs}>
        <Text style={styles.feedTabActive}>Home</Text>
        <Text style={styles.feedTab}>Friends</Text>
        <Text style={styles.feedTab}>Video</Text>
        <Text style={styles.feedTab}>Groups</Text>
      </View>
      <View style={styles.storyRow}>
        {["Your story", "Amara", "Jordan", "Maya"].map((name, index) => (
          <View style={styles.storyItem} key={name}>
            <View style={[styles.storyRing, index === 0 && styles.storyRingOwn]}>
              {index === 0 ? (
                <View style={styles.storyAdd}><Text style={styles.storyAddText}>＋</Text></View>
              ) : (
                <Image source={{ uri: PROFILE_PHOTO }} style={styles.storyAvatar} />
              )}
            </View>
            <Text style={styles.storyName}>{name}</Text>
          </View>
        ))}
      </View>
      <View style={styles.feedComposer}>
        <Image source={{ uri: PROFILE_PHOTO }} style={styles.postAvatar} />
        <View style={styles.composerPrompt}>
          <Text style={styles.composerPromptText}>What's on your mind?</Text>
        </View>
        <Text style={styles.composerPhoto}>▧</Text>
      </View>
      <View style={styles.postHeader}>
        <Image source={{ uri: PROFILE_PHOTO }} style={styles.postAvatar} />
        <View style={styles.postIdentity}>
          <Text style={styles.postName}>Jordan Williams</Text>
          <Text style={styles.postMeta}>Suggested for you · 12 min · Public</Text>
        </View>
        <Text style={styles.moreGlyph}>•••</Text>
      </View>
      <Image source={{ uri: FEED_PHOTO }} style={[styles.feedPhoto, { height: 108 }]} resizeMode="cover" />
      <Text style={styles.postCaption}>Little moments, lasting memories.</Text>
      <View style={styles.postEngagement}>
        <Text style={styles.engagementText}>👍  2.4K</Text>
        <Text style={styles.engagementText}>Comment 184</Text>
        <Text style={styles.engagementText}>Share</Text>
      </View>
      <View style={styles.miniBottomNav}>
        {[HomeIcon, VideoIcon, MarketplaceIcon, NotificationsIcon, ProfilePlaceholder].map((Icon, index) => (
          <View style={styles.bottomNavIcon} key={index}>
            <Icon width={19} height={19} />
          </View>
        ))}
      </View>
    </View>
  );
}

function MiniProfileScreen() {
  return (
    <View style={styles.screenCanvas}>
      <View style={styles.profileTopBar}>
        <Text style={styles.backGlyph}>‹</Text>
        <Text style={styles.profileTopTitle}>ReDom profile</Text>
        <Text style={styles.moreGlyph}>•••</Text>
      </View>
      <View style={styles.profileCover}>
        <Image source={{ uri: FEED_PHOTO }} style={styles.coverImage} resizeMode="cover" />
        <View style={styles.coverTint} />
      </View>
      <View style={styles.profileIdentity}>
        <Image source={{ uri: PROFILE_PHOTO }} style={styles.profileAvatar} />
        <View style={styles.profileNameBlock}>
          <Text style={styles.profileName}>Mr. Herpes</Text>
          <Text style={styles.profileHandle}>@mr.herpes · 1.8K friends</Text>
          <Text style={styles.profileBio}>Making memories. Sharing my world.</Text>
        </View>
      </View>
      <View style={styles.profileStats}>
        <View style={styles.profileStat}><Text style={styles.statNumber}>248</Text><Text style={styles.statLabel}>Posts</Text></View>
        <View style={styles.profileStat}><Text style={styles.statNumber}>1.8K</Text><Text style={styles.statLabel}>Friends</Text></View>
        <View style={styles.profileStat}><Text style={styles.statNumber}>612</Text><Text style={styles.statLabel}>Following</Text></View>
      </View>
      <View style={styles.profileActions}>
        <View style={styles.followButton}><Text style={styles.followButtonText}>＋ Add friend</Text></View>
        <View style={styles.messageButton}><Text style={styles.messageButtonText}>Message</Text></View>
      </View>
      <View style={styles.profileSectionTabs}>
        <Text style={styles.profileSectionActive}>Posts</Text>
        <Text style={styles.profileSection}>About</Text>
        <Text style={styles.profileSection}>Photos</Text>
        <Text style={styles.profileSection}>Friends</Text>
      </View>
      <View style={styles.postHeader}>
        <Image source={{ uri: PROFILE_PHOTO }} style={styles.postAvatar} />
        <View style={styles.postIdentity}>
          <Text style={styles.postName}>Mr. Herpes</Text>
          <Text style={styles.postMeta}>Just now · Friends</Text>
        </View>
        <Text style={styles.moreGlyph}>•••</Text>
      </View>
      <Text style={styles.postCaption}>Welcome to my ReDom world ✨</Text>
      <View style={styles.profileGrid}>
        <Image source={{ uri: FEED_PHOTO }} style={styles.gridPhoto} />
        <Image source={{ uri: PROFILE_PHOTO }} style={styles.gridPhoto} />
        <Image source={{ uri: FEED_PHOTO }} style={styles.gridPhoto} />
      </View>
    </View>
  );
}

function MiniScreen({ screen }: { screen: ScreenKey }) {
  if (screen === "login") return <MiniLoginScreen />;
  if (screen === "feed") return <MiniFeedScreen />;
  return <MiniProfileScreen />;
}

export function CinematicShowcaseScreen({ navigation }: Props) {
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(1);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const motions = useRef(SCREENS.map(() => makeMotion())).current;
  const cardWidth = Math.min(width * 0.74, 322);
  const cardHeight = Math.min(height * 0.49, 448);

  const player = useVideoPlayer(WALKING_VIDEO, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  const moveTo = (next: number) => {
    setActiveIndex((current) => (next + SCREENS.length) % SCREENS.length);
  };

  useEffect(() => {
    if (!motionEnabled) return;
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % SCREENS.length);
    }, 5200);
    return () => clearInterval(timer);
  }, [motionEnabled]);

  useEffect(() => {
    motions.forEach((motion, index) => {
      const slot = (index - activeIndex + SCREENS.length) % SCREENS.length;
      const isCenter = slot === 0;
      const isRight = slot === 1;
      const xTarget = isCenter ? 0 : isRight ? cardWidth * 0.59 : -cardWidth * 0.59;
      const yTarget = isCenter ? 0 : 20;
      const scaleTarget = isCenter ? 1 : 0.82;
      const opacityTarget = isCenter ? 1 : 0.7;
      const rotationTarget = isCenter ? 0 : isRight ? 7 : -7;
      Animated.parallel([
        Animated.spring(motion.x, { toValue: xTarget, damping: 22, stiffness: 115, mass: 0.9, useNativeDriver: true }),
        Animated.spring(motion.y, { toValue: yTarget, damping: 22, stiffness: 115, mass: 0.9, useNativeDriver: true }),
        Animated.spring(motion.scale, { toValue: scaleTarget, damping: 22, stiffness: 115, mass: 0.9, useNativeDriver: true }),
        Animated.timing(motion.opacity, { toValue: opacityTarget, duration: 420, useNativeDriver: true }),
        Animated.spring(motion.rotation, { toValue: rotationTarget, damping: 22, stiffness: 115, mass: 0.9, useNativeDriver: true }),
      ]).start();
    });
  }, [activeIndex, cardWidth, motions]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -42) moveTo(activeIndex + 1);
          else if (gesture.dx > 42) moveTo(activeIndex - 1);
        },
      }),
    [activeIndex],
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View style={styles.videoShade} />
      <View style={styles.blueGlow} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <ReDomLogo width={124} height={38} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={motionEnabled ? "Pause cinematic motion" : "Resume cinematic motion"}
            onPress={() => setMotionEnabled((value) => !value)}
            style={styles.motionToggle}
          >
            <View style={[styles.motionDot, !motionEnabled && styles.motionDotPaused]} />
            <Text style={styles.motionToggleText}>{motionEnabled ? "MOTION ON" : "PAUSED"}</Text>
          </Pressable>
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>YOUR WORLD, IN MOTION</Text>
          <Text style={styles.heroTitle}>Meet ReDom.</Text>
          <Text style={styles.heroSubtitle}>Where your people, stories and everyday moments come together.</Text>
        </View>

        <View
          style={[styles.deck, { height: cardHeight + 32 }]}
          {...panResponder.panHandlers}
          accessibilityLabel="Swipe to explore ReDom screen previews"
        >
          {SCREENS.map((screen, index) => {
            const slot = (index - activeIndex + SCREENS.length) % SCREENS.length;
            const motion = motions[index];
            const rotate = motion.rotation.interpolate({
              inputRange: [-7, 0, 7],
              outputRange: ["-7deg", "0deg", "7deg"],
            });
            return (
              <Animated.View
                key={screen.key}
                pointerEvents={slot === 0 ? "auto" : "none"}
                style={[
                  styles.card,
                  {
                    width: cardWidth,
                    height: cardHeight,
                    zIndex: slot === 0 ? 10 : 2,
                    opacity: motion.opacity,
                    transform: [
                      { translateX: motion.x },
                      { translateY: motion.y },
                      { scale: motion.scale },
                      { rotate: rotate },
                    ],
                  },
                ]}
              >
                <View style={styles.cardLabel}>
                  <View style={styles.cardLabelDot} />
                  <Text style={styles.cardLabelText}>{screen.label}</Text>
                </View>
                <View style={styles.miniScreenFrame}>
                  <MiniScreen screen={screen.key} />
                </View>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.deckControls}>
          {SCREENS.map((screen, index) => (
            <Pressable
              key={screen.key}
              accessibilityRole="button"
              accessibilityLabel={`Show ${screen.label.toLowerCase()} preview`}
              onPress={() => moveTo(index)}
              hitSlop={10}
              style={[styles.dot, activeIndex === index && styles.dotActive]}
            />
          ))}
          <Text style={styles.swipeHint}>Swipe to explore</Text>
        </View>

        <View style={styles.bottomContent}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Login")}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>Continue to ReDom</Text>
            <Text style={styles.primaryArrow}>→</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("RegistrationWelcome")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Create an account</Text>
          </Pressable>
          <Text style={styles.footnote}>A more connected world starts here.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#07111F", overflow: "hidden" },
  safeArea: { flex: 1, justifyContent: "space-between" },
  videoShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 12, 25, 0.58)" },
  blueGlow: {
    position: "absolute",
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: "rgba(24,119,242,0.20)",
    top: "23%",
    alignSelf: "center",
    transform: [{ scaleX: 1.2 }],
  },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  motionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: "rgba(6,18,34,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  motionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#62E6A7" },
  motionDotPaused: { backgroundColor: "#A5B0C0" },
  motionToggleText: { color: "#F7FAFF", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  heroCopy: { paddingHorizontal: 24, alignItems: "center", marginTop: 8 },
  eyebrow: { color: "#A8D0FF", fontSize: 10, fontWeight: "800", letterSpacing: 2.4, marginBottom: 8 },
  heroTitle: { color: "#FFFFFF", fontSize: 38, fontWeight: "800", letterSpacing: -1.3, textAlign: "center" },
  heroSubtitle: { color: "rgba(245,249,255,0.86)", fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 320, marginTop: 7 },
  deck: { alignItems: "center", justifyContent: "center", overflow: "visible", marginTop: -3 },
  card: {
    position: "absolute",
    top: 0,
    borderRadius: 25,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.34,
    shadowRadius: 28,
    elevation: 16,
  },
  cardLabel: { height: 25, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 6 },
  cardLabelDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: REDOM_BLUE },
  cardLabelText: { color: "#5B6675", fontSize: 8, fontWeight: "900", letterSpacing: 1.5 },
  miniScreenFrame: { flex: 1, borderRadius: 17, overflow: "hidden", backgroundColor: "#FFFFFF" },
  screenCanvas: { flex: 1, backgroundColor: "#FFFFFF", overflow: "hidden" },
  miniHeader: { height: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EBF0" },
  miniHeaderLink: { color: "#687386", fontSize: 10, fontWeight: "600" },
  loginIntro: { paddingHorizontal: 15, paddingTop: 21, paddingBottom: 18 },
  miniTitle: { color: "#151D2B", fontSize: 19, fontWeight: "800", letterSpacing: -0.5 },
  miniMuted: { color: "#778194", fontSize: 10, marginTop: 5 },
  inputMock: { marginHorizontal: 13, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 9 },
  inputLabel: { color: "#7B8798", fontSize: 8, marginBottom: 4 },
  inputValue: { color: "#2B3443", fontSize: 10, fontWeight: "500" },
  loginButton: { marginHorizontal: 13, marginTop: 3, height: 38, borderRadius: 9, backgroundColor: REDOM_BLUE, alignItems: "center", justifyContent: "center" },
  loginButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  forgotText: { color: REDOM_BLUE, fontSize: 9, textAlign: "center", marginTop: 11, fontWeight: "600" },
  miniDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E7EBF0", marginHorizontal: 13, marginTop: 18, marginBottom: 12 },
  createButton: { alignSelf: "center", backgroundColor: "#E8F3FF", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9 },
  createButtonText: { color: "#1765C4", fontSize: 9, fontWeight: "800" },
  miniFooter: { color: "#9AA4B2", fontSize: 8, textAlign: "center", marginTop: 14 },
  feedTopBar: { height: 41, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EBF0" },
  feedTopActions: { flexDirection: "row", gap: 7 },
  smallCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#F0F4F9", alignItems: "center", justifyContent: "center" },
  circleGlyph: { color: "#26374C", fontSize: 19, lineHeight: 21 },
  feedTabs: { flexDirection: "row", gap: 16, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 7 },
  feedComposer: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EBF0" },
  composerPrompt: { flex: 1, borderWidth: 1, borderColor: "#E0E5EC", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  composerPromptText: { color: "#687386", fontSize: 8 },
  composerPhoto: { color: "#269B59", fontSize: 17, fontWeight: "800", paddingHorizontal: 3 },
  feedTabActive: { color: REDOM_BLUE, fontSize: 9, fontWeight: "800", borderBottomWidth: 2, borderBottomColor: REDOM_BLUE, paddingBottom: 5 },
  feedTab: { color: "#7C8796", fontSize: 9, fontWeight: "600", paddingBottom: 5 },
  storyRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF1F5" },
  storyItem: { alignItems: "center", width: 45 },
  storyRing: { width: 37, height: 37, borderRadius: 19, borderWidth: 2, borderColor: REDOM_BLUE, padding: 2, alignItems: "center", justifyContent: "center" },
  storyRingOwn: { borderColor: "#D7DFEA" },
  storyAvatar: { width: 29, height: 29, borderRadius: 15 },
  storyAdd: { width: 29, height: 29, borderRadius: 15, backgroundColor: "#E8F3FF", alignItems: "center", justifyContent: "center" },
  storyAddText: { color: REDOM_BLUE, fontSize: 18, lineHeight: 20 },
  storyName: { color: "#687386", fontSize: 7, marginTop: 4 },
  postHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 9 },
  postAvatar: { width: 27, height: 27, borderRadius: 14 },
  postIdentity: { flex: 1, marginLeft: 7 },
  postName: { color: "#1D2735", fontSize: 9, fontWeight: "800" },
  postMeta: { color: "#8B95A4", fontSize: 7, marginTop: 2 },
  moreGlyph: { color: "#687386", fontSize: 13, letterSpacing: 1 },
  feedPhoto: { width: "100%", height: 132, backgroundColor: "#E8EDF4" },
  postCaption: { color: "#3A4555", fontSize: 8, paddingHorizontal: 10, paddingTop: 7 },
  postEngagement: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingTop: 8 },
  engagementText: { color: "#596678", fontSize: 7, fontWeight: "600" },
  miniBottomNav: { marginTop: "auto", height: 32, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5EAF0", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  bottomNavIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  profileTopBar: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E7EBF0" },
  backGlyph: { color: "#26374C", fontSize: 27, lineHeight: 30 },
  profileTopTitle: { color: "#1B2635", fontSize: 11, fontWeight: "800" },
  profileCover: { height: 100, backgroundColor: "#DCE8F5", overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  coverTint: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(12,41,75,0.18)" },
  profileIdentity: { paddingHorizontal: 11, paddingTop: 0, flexDirection: "row", alignItems: "center", marginTop: -24 },
  profileAvatar: { width: 65, height: 65, borderRadius: 33, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#E7EDF5" },
  profileNameBlock: { flex: 1, paddingTop: 24, paddingLeft: 8 },
  profileName: { color: "#182333", fontSize: 12, fontWeight: "900" },
  profileHandle: { color: "#8A94A3", fontSize: 8, marginTop: 2 },
  profileBio: { color: "#687386", fontSize: 8, marginTop: 5 },
  profileStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 16, paddingVertical: 11, marginHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#E7EBF0" },
  profileStat: { alignItems: "center" },
  statNumber: { color: "#182333", fontSize: 11, fontWeight: "900" },
  statLabel: { color: "#8A94A3", fontSize: 7, marginTop: 3 },
  profileActions: { flexDirection: "row", gap: 8, paddingHorizontal: 11, marginTop: 11 },
  followButton: { flex: 1, height: 31, borderRadius: 8, backgroundColor: REDOM_BLUE, alignItems: "center", justifyContent: "center" },
  followButtonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  messageButton: { flex: 1, height: 31, borderRadius: 8, backgroundColor: "#E9EFF7", alignItems: "center", justifyContent: "center" },
  messageButtonText: { color: "#24344A", fontSize: 9, fontWeight: "800" },
  profileSectionTabs: { flexDirection: "row", justifyContent: "space-around", paddingTop: 14, paddingBottom: 9 },
  profileSectionActive: { color: REDOM_BLUE, fontSize: 8, fontWeight: "900" },
  profileSection: { color: "#8A94A3", fontSize: 8, fontWeight: "600" },
  profileGrid: { flexDirection: "row", gap: 3, paddingHorizontal: 3 },
  gridPhoto: { flex: 1, height: 80, backgroundColor: "#E8EDF4" },
  deckControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: -3 },
  dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 19, backgroundColor: "#FFFFFF" },
  swipeHint: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginLeft: 8 },
  bottomContent: { paddingHorizontal: 24, paddingBottom: 13, alignItems: "center" },
  primaryButton: { width: "100%", maxWidth: 350, height: 51, borderRadius: 15, backgroundColor: REDOM_BLUE, alignItems: "center", justifyContent: "center", flexDirection: "row", shadowColor: REDOM_BLUE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 7 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.1 },
  primaryArrow: { position: "absolute", right: 19, color: "#FFFFFF", fontSize: 22, fontWeight: "400", top: 10 },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  secondaryButton: { paddingVertical: 12, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  footnote: { color: "rgba(255,255,255,0.65)", fontSize: 9, marginTop: 3, letterSpacing: 0.2 },
});
