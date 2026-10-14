import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import { authService } from "../auth/service";
import { useAuthContext } from "../auth/context";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDeviceId } from "../utils/device";
import type { RootStackParamList } from "../routing/types";

type Props = NativeStackScreenProps<RootStackParamList, "CustomizingExperience">;
const MINIMUM_MS = 65_000;
const SLIDE_MS = 5_000;
const SHOWCASE = [
  { category: "YOUR SOCIAL WORLD", title: "Your profile. Your story.", body: "Meet people, share moments and let your profile reflect who you are.", tag: "PROFILE EXPERIENCE", kind: "profile" },
  { category: "YOUR NEXT BIG IDEA", title: "Make your episodes now.", body: "Build a movie project with a planned story, episode structure and scenes that work together.", tag: "MOVIE STUDIO", kind: "movie" },
  { category: "A NEW CARTOON MODEL", title: "Meet Cartoon—8.0R.", body: "Your cartoon world, brought to life. Explore expressive characters, animation and visual storytelling with ReDom Cartoon.", tag: "CARTOON—8.0R", kind: "cartoon" },
  { category: "YOUR VIDEO, A MASTERPIECE", title: "Your video in a masterpiece.", body: "ReDom-v2.8—Video is designed for cinematic clips, social videos and documentary-style scenes.", tag: "REDOM-V2.8—VIDEO", kind: "movie" },
  { category: "THE STUDIO JUST LEVELLED UP", title: "Meet Studio—Ultron 8.0R.", body: "Plan your movie before production: story direction, episode structure, scripts, shot lists and a coherent creative vision.", tag: "STUDIO—ULTRON 8.0R", kind: "movie" },
  { category: "PAYMENTS, BUILT FOR TRUST", title: "Your secure payment gateway.", body: "ReDom Pay brings payment methods and transaction activity together behind protected account checks.", tag: "REDOM PAY", kind: "pay" },
  { category: "CONVERSATIONS THAT CONNECT", title: "Keep the conversation moving.", body: "Stay connected with messaging experiences designed to make conversations feel natural.", tag: "MESSAGING", kind: "messages" },
  { category: "A FEED THAT FEELS YOURS", title: "Discover what matters to you.", body: "Posts, profiles and shared moments come together in your personalized Home Feed.", tag: "HOME FEED", kind: "feed" },
  { category: "CREATE AND SHARE", title: "Turn your ideas into moments.", body: "Bring your creativity into your social world and share the things you care about.", tag: "CREATOR EXPERIENCE", kind: "create" },
  { category: "PEOPLE AND COMMUNITIES", title: "Find your people.", body: "Build connections around interests, conversations and communities across ReDom.", tag: "COMMUNITY", kind: "people" },
  { category: "PROTECTION BY DESIGN", title: "Security is part of the experience.", body: "Registration verification, protected sessions and security checks help safeguard account access.", tag: "REDOM SECURITY", kind: "security" },
  { category: "ONE CONNECTED EXPERIENCE", title: "Oh my God. This is ReDom.", body: "Social, creative production, animation, messaging and payment experiences come together in one evolving platform.", tag: "WELCOME TO REDOM", kind: "welcome" },
];
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function ShowcaseArtwork({ kind }: { kind: string }) {
  if (kind === "profile") return <View style={art.profileCard}><View style={art.cover}><View style={art.coverOrb} /></View><View style={art.profileRow}><View style={art.avatar}><Text style={art.avatarText}>E</Text></View><View style={art.profileInfo}><Text style={art.artStrong}>Evelyn Carter</Text><Text style={art.artMuted}>Your ReDom profile</Text></View><View style={art.followPill}><Text style={art.followText}>Follow</Text></View></View><View style={art.postLine} /><View style={art.postLineShort} /><View style={art.comment}><View style={art.tinyAvatar}><Text style={art.tinyAvatarText}>M</Text></View><View style={art.commentCopy}><Text style={art.artStrong}>Marcus</Text><Text style={art.artMuted}>Love this new profile experience.</Text></View></View><View style={art.comment}><View style={art.tinyAvatarAlt}><Text style={art.tinyAvatarText}>J</Text></View><View style={art.commentCopy}><Text style={art.artStrong}>Jordan</Text><Text style={art.artMuted}>This looks amazing!</Text></View></View></View>;
  if (kind === "movie") return <View style={art.movieCard}><View style={art.movieTop}><View style={art.liveDot}/><Text style={art.movieEyebrow}>REDOM MOVIE STUDIO</Text><Text style={art.movieDuration}>01:24</Text></View><View style={art.movieScene}><View style={art.mountainBack}/><View style={art.mountainFront}/><View style={art.sceneSun}/><View style={art.playButton}><Text style={art.playGlyph}>▶</Text></View></View><Text style={art.movieTitle}>A world waiting to be told</Text><View style={art.timeline}><View style={art.timelineA}/><View style={art.timelineB}/><View style={art.timelineC}/></View><Text style={art.artMuted}>Story plan  ·  Scene 01  ·  Storyboard</Text></View>;
  if (kind === "cartoon") return <View style={art.cartoonCard}><View style={art.cartoonSky}><View style={art.cartoonCloud}/><View style={art.cartoonHill}/><View style={art.cartoonHillBack}/><View style={art.cartoonCharacter}><View style={art.characterEar}/><View style={art.characterFace}><View style={art.characterEyeRow}><View style={art.characterEye}/><View style={art.characterEye}/></View><View style={art.characterSmile}/></View><View style={art.characterBody}/></View><View style={art.cartoonSpark}/></View><View style={art.cartoonCaption}><Text style={art.artStrong}>Cartoon worlds in motion</Text><Text style={art.artMuted}>Character • Style • Animation</Text></View></View>;
  if (kind === "pay") return <View style={art.payCard}><View style={art.payHeader}><View style={art.payLogo}><Text style={art.payLogoText}>R</Text></View><View><Text style={art.artStrong}>ReDom Pay</Text><Text style={art.artMuted}>Payments overview</Text></View><View style={art.secureBadge}><Text style={art.secureBadgeText}>SECURE</Text></View></View><View style={art.balance}><Text style={art.balanceLabel}>TRANSACTION ACTIVITY</Text><Text style={art.balanceValue}>Payments, in one place</Text><View style={art.transaction}><View style={art.transactionIcon}><Text style={art.transactionIconText}>✓</Text></View><View style={art.transactionCopy}><Text style={art.artStrong}>Card payment</Text><Text style={art.artMuted}>Protected checkout flow</Text></View><Text style={art.transactionStatus}>Ready</Text></View><View style={art.transaction}><View style={art.transactionIconAlt}><Text style={art.transactionIconText}>↔</Text></View><View style={art.transactionCopy}><Text style={art.artStrong}>Payment methods</Text><Text style={art.artMuted}>Manage your saved options</Text></View><Text style={art.transactionStatus}>Manage</Text></View></View><View style={art.payFooter}><Text style={art.payFooterText}>Protected account checks</Text><Text style={art.payFooterText}>Transaction visibility</Text></View></View>;
  if (kind === "messages") return <View style={art.messageCard}><View style={art.messageHeader}><View style={art.tinyAvatarAlt}><Text style={art.tinyAvatarText}>A</Text></View><View><Text style={art.artStrong}>Alex Morgan</Text><Text style={art.onlineText}>Available to chat</Text></View><View style={art.messageDots}><View/><View/><View/></View></View><View style={art.bubbleLeft}><Text style={art.bubbleText}>Have you seen the new ReDom Studio?</Text></View><View style={art.bubbleRight}><Text style={art.bubbleTextWhite}>I’m exploring it now.</Text></View><View style={art.bubbleLeftSmall}><Text style={art.bubbleText}>Let’s create something.</Text></View><View style={art.messageInput}><Text style={art.artMuted}>Write a message…</Text><View style={art.sendButton}><Text style={art.sendText}>↑</Text></View></View></View>;
  if (kind === "feed") return <View style={art.feedCard}><View style={art.feedHeader}><View style={art.tinyAvatar}><Text style={art.tinyAvatarText}>E</Text></View><View><Text style={art.artStrong}>Evelyn Carter</Text><Text style={art.artMuted}>Shared a moment · just now</Text></View></View><View style={art.feedImage}><View style={art.feedImageSun}/><View style={art.feedImageHill}/><View style={art.feedImageHillBack}/></View><Text style={art.feedCaption}>A little inspiration for your day.</Text><View style={art.feedActions}><Text style={art.artMuted}>♡  Like</Text><Text style={art.artMuted}>○  Comment</Text><Text style={art.artMuted}>↗  Share</Text></View></View>;
  if (kind === "create") return <View style={art.createCard}><View style={art.createOrbA}/><View style={art.createOrbB}/><View style={art.createTile}><View style={art.createTileMark}><Text style={art.createTileMarkText}>R</Text></View><Text style={art.artStrong}>Your next idea starts here.</Text><Text style={art.artMuted}>Create • Shape • Share</Text></View><View style={art.createPill}><Text style={art.createPillText}>YOUR CREATIVE SPACE</Text></View></View>;
  if (kind === "people") return <View style={art.peopleCard}><Text style={art.artStrong}>Your world is getting bigger</Text><Text style={art.artMuted}>People and communities</Text><View style={art.peopleOrbit}><View style={[art.personBubble,art.personOne]}><Text style={art.personText}>E</Text></View><View style={[art.personBubble,art.personTwo]}><Text style={art.personText}>A</Text></View><View style={[art.personBubble,art.personThree]}><Text style={art.personText}>J</Text></View><View style={[art.personBubble,art.personFour]}><Text style={art.personText}>M</Text></View><View style={art.peopleCenter}><Text style={art.peopleCenterText}>R</Text></View><View style={art.orbitLine}/></View><View style={art.peoplePill}><Text style={art.peoplePillText}>Connections start here</Text></View></View>;
  if (kind === "security") return <View style={art.securityCard}><View style={art.shieldOuter}><View style={art.shieldInner}><Text style={art.shieldCheck}>✓</Text></View></View><Text style={art.artStrong}>Your account, protected</Text><Text style={art.artMuted}>Verification  ·  Session  ·  Security</Text><View style={art.securityRow}><View style={art.securityCheck}><Text style={art.securityCheckText}>✓</Text></View><Text style={art.artStrong}>Registration verified</Text></View><View style={art.securityRow}><View style={art.securityCheck}><Text style={art.securityCheckText}>✓</Text></View><Text style={art.artStrong}>Session initialized securely</Text></View><View style={art.securityRow}><View style={art.securityCheck}><Text style={art.securityCheckText}>✓</Text></View><Text style={art.artStrong}>Security-aware access</Text></View></View>;
  return <View style={art.welcomeCard}><View style={art.welcomeGlow}/><ReDomLogo width={154} height={44}/><Text style={art.welcomeTitle}>Your next chapter starts here.</Text><Text style={art.artMuted}>Welcome to your ReDom experience</Text><View style={art.welcomePills}><Text style={art.welcomePill}>SOCIAL</Text><Text style={art.welcomePill}>CREATE</Text><Text style={art.welcomePill}>CONNECT</Text></View></View>;
}

export function CustomizingExperienceScreen({ route }: Props) {
  const { adoptSession } = useAuthContext();
  const { language } = useLanguage();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;
  const transition = useRef(new Animated.Value(1)).current;
  const startedAt = useRef(Date.now());
  const current = SHOWCASE[Math.min(step, SHOWCASE.length - 1)];
  const stepProgress = Math.min(96, Math.round(((step + 1) / SHOWCASE.length) * 96));
  const sceneOpacity = useRef(new Animated.Value(1)).current;
  const sceneY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 15000, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [spin]);

  useEffect(() => {
    const ticker = setInterval(() => setElapsed(Math.min(MINIMUM_MS, Date.now() - startedAt.current)), 250);
    const timer = setInterval(() => setStep(value => {
      const next = Math.min(value + 1, SHOWCASE.length - 1);
      if (next !== value) {
        sceneOpacity.setValue(0);
        sceneY.setValue(12);
        Animated.parallel([
          Animated.timing(sceneOpacity, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(sceneY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      }
      return next;
    }), SLIDE_MS);
    return () => { clearInterval(timer); clearInterval(ticker); };
  }, [attempt, sceneOpacity, sceneY]);

  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();
    setElapsed(0);
    setStep(0);
    setReady(false);
    setError(null);
    async function initialize() {
      try {
        const deviceId = await getDeviceId();
        const response = await authService.initializeRegistration({
          verificationChallengeId: route.params.verificationChallengeId,
          flowId: route.params.flowId,
          reservationId: route.params.reservationId,
          deviceId,
          language,
          deviceType: "mobile",
          platform: "expo",
        });
        setReady(Boolean(response.success && response.user && response.session));
        const remaining = Math.max(0, MINIMUM_MS - (Date.now() - startedAt.current));
        await wait(remaining);
        if (cancelled) return;
        if (!response.success || !response.user || !response.session) throw new Error("Unable to finish account setup.");
        await adoptSession(response.user, response.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to finish account setup.");
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [adoptSession, attempt, language, route.params.flowId, route.params.reservationId, route.params.verificationChallengeId]);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const timeRemaining = Math.max(0, Math.ceil((MINIMUM_MS - elapsed) / 1000));
  return <View style={styles.root}>
    <View style={styles.backgroundGlow} />
    <Animated.View style={[styles.backgroundOrbit, { transform: [{ rotate: rotation }] }]} />
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <ReDomLogo width={150} height={44} />
        <View style={styles.introRow}><View style={styles.liveDot}/><Text style={styles.introEyebrow}>YOUR RE-DOM EXPERIENCE, UNFOLDING</Text></View>
        <Text style={styles.title}>A whole world is getting ready for you.</Text>
        <Text style={styles.subtitle}>Take a minute to explore what you can discover, create and experience across ReDom.</Text>
        <Animated.View style={[styles.showcaseCard, { opacity: sceneOpacity, transform: [{ translateY: sceneY }] }]}>
          <View style={styles.showcaseMeta}><Text style={styles.category}>{current.category}</Text><Text style={styles.slideCount}>{String(step + 1).padStart(2, "0")} / {String(SHOWCASE.length).padStart(2, "0")}</Text></View>
          <ShowcaseArtwork kind={current.kind} />
          <View style={styles.copyBlock}><Text style={styles.tag}>{current.tag}</Text><Text style={styles.slideTitle}>{current.title}</Text><Text style={styles.slideBody}>{current.body}</Text></View>
          <View style={styles.progressTrack}><Animated.View style={[styles.progress, { width: `${stepProgress}%` }]} /></View>
          <View style={styles.progressMeta}><Text style={styles.progressLabel}>{ready ? "Your secure session is prepared" : "Preparing your ReDom experience"}</Text><Text style={styles.progressPercent}>{stepProgress}%</Text></View>
          <View style={styles.dots}>{SHOWCASE.map((item, index) => <View key={item.kind} style={[styles.dot, index === step && styles.dotActive, index < step && styles.dotDone]} />)}</View>
        </Animated.View>
        <View style={styles.bottomStatus}><ActivityIndicator size="small" color="#1877F2" /><Text style={styles.bottomStatusText}>{error ? "Setup needs your attention" : timeRemaining > 0 ? `Exploring ReDom · ${timeRemaining}s` : "Opening your ReDom experience…"}</Text></View>
        {error ? <View style={styles.errorBox}><Text style={styles.errorTitle}>We couldn't finish preparing ReDom</Text><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setAttempt(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
        <Text style={styles.flow}>Flow ID: {route.params.flowId}</Text>
      </View>
    </ScrollView>
    <View style={styles.footer}><Text style={styles.footerText}>ReDom Platforms, Inc.</Text><Text style={styles.footerDot}>•</Text><Text style={styles.footerText}>Your experience starts here</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F8FE", alignItems: "center" },
  backgroundGlow: { position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "#E5F0FF", opacity: 0.85, top: "8%", right: "-25%" },
  backgroundOrbit: { position: "absolute", width: 290, height: 290, borderRadius: 145, borderWidth: 1, borderColor: "#D4E5FF", top: "14%", left: "-30%", opacity: 0.65 },
  scrollContent: { width: "100%", flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 30, paddingBottom: 90 },
  content: { width: "100%", maxWidth: 480, alignItems: "center" },
  introRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#20B77A" },
  introEyebrow: { color: "#1877F2", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#101828", fontSize: 27, lineHeight: 33, fontWeight: "900", textAlign: "center", marginTop: 13, letterSpacing: -0.6 },
  subtitle: { color: "#667085", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 370 },
  showcaseCard: { width: "100%", marginTop: 22, backgroundColor: "#FFFFFF", borderRadius: 25, padding: 18, borderWidth: 1, borderColor: "#E1EAF6", shadowColor: "#164A8A", shadowOpacity: 0.09, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  showcaseMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  category: { color: "#1877F2", fontSize: 9, fontWeight: "900", letterSpacing: 1.15 },
  slideCount: { color: "#98A2B3", fontSize: 10, fontWeight: "800" },
  copyBlock: { paddingTop: 15 },
  tag: { color: "#1877F2", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  slideTitle: { color: "#101828", fontSize: 21, lineHeight: 26, fontWeight: "900", marginTop: 5 },
  slideBody: { color: "#667085", fontSize: 12, lineHeight: 18, marginTop: 6 },
  progressTrack: { height: 5, backgroundColor: "#E8EEF7", borderRadius: 5, overflow: "hidden", marginTop: 18 },
  progress: { height: "100%", borderRadius: 5, backgroundColor: "#1877F2" },
  progressMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  progressLabel: { color: "#667085", fontSize: 10, fontWeight: "700" },
  progressPercent: { color: "#1877F2", fontSize: 10, fontWeight: "900" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 13 },
  dot: { height: 4, width: 15, borderRadius: 4, backgroundColor: "#E4EAF3" },
  dotActive: { width: 24, backgroundColor: "#1877F2" },
  dotDone: { backgroundColor: "#8CB8F8" },
  bottomStatus: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16 },
  bottomStatusText: { color: "#667085", fontSize: 11, fontWeight: "700" },
  errorBox: { width: "100%", marginTop: 15, padding: 15, borderRadius: 16, backgroundColor: "#FFF1F3", borderWidth: 1, borderColor: "#FFD0D8" },
  errorTitle: { color: "#C81E3F", fontWeight: "900", textAlign: "center" },
  errorText: { color: "#5C1B27", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5 },
  retry: { alignSelf: "center", marginTop: 10, paddingHorizontal: 20, height: 40, borderRadius: 20, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  retryText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  flow: { color: "#1877F2", fontSize: 10, fontWeight: "800", marginTop: 14 },
  footer: { position: "absolute", bottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(245,248,254,.92)", paddingVertical: 5, paddingHorizontal: 12, borderRadius: 30 },
  footerText: { color: "#8A94A6", fontSize: 9 },
  footerDot: { color: "#C2CBD8", fontSize: 9 },
});
const art = StyleSheet.create({
  profileCard: { backgroundColor: "#F8FAFE", borderRadius: 17, overflow: "hidden", borderWidth: 1, borderColor: "#E8EEF7", paddingBottom: 12 },
  cover: { height: 74, backgroundColor: "#C7DEFF", overflow: "hidden" }, coverOrb: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "#8CB8F8", right: 18, top: -35 },
  profileRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginTop: -23 }, avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: "#FFF", backgroundColor: "#E2D4FF", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#6D3CB4", fontSize: 18, fontWeight: "900" }, profileInfo: { flex: 1, marginLeft: 9 }, artStrong: { color: "#25324A", fontSize: 10, fontWeight: "900" }, artMuted: { color: "#8995A8", fontSize: 8, marginTop: 3 }, followPill: { backgroundColor: "#1877F2", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 }, followText: { color: "#FFF", fontSize: 8, fontWeight: "900" }, postLine: { height: 5, width: "83%", backgroundColor: "#E7EDF6", borderRadius: 5, marginTop: 13, marginHorizontal: 12 }, postLineShort: { height: 5, width: "58%", backgroundColor: "#E7EDF6", borderRadius: 5, marginTop: 6, marginHorizontal: 12 }, comment: { flexDirection: "row", alignItems: "center", marginTop: 11, marginHorizontal: 12, gap: 8 }, tinyAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#C8E9DA", alignItems: "center", justifyContent: "center" }, tinyAvatarAlt: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#F8D8C6", alignItems: "center", justifyContent: "center" }, tinyAvatarText: { color: "#344054", fontSize: 9, fontWeight: "900" }, commentCopy: { flex: 1 },
  movieCard: { borderRadius: 17, backgroundColor: "#101828", padding: 12, overflow: "hidden" }, movieTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#43D9A3" }, movieEyebrow: { flex: 1, color: "#A9C9FF", fontSize: 8, fontWeight: "900", letterSpacing: 1 }, movieDuration: { color: "#D8E5F9", fontSize: 8 }, movieScene: { height: 125, borderRadius: 11, overflow: "hidden", backgroundColor: "#1D3D6A" }, mountainBack: { position: "absolute", bottom: 35, left: -10, width: 200, height: 100, backgroundColor: "#4775A8", transform: [{ rotate: "30deg" }] }, mountainFront: { position: "absolute", bottom: -60, right: -20, width: 240, height: 130, backgroundColor: "#18304E", transform: [{ rotate: "-18deg" }] }, sceneSun: { position: "absolute", width: 45, height: 45, borderRadius: 23, backgroundColor: "#FFD89B", right: 30, top: 17 }, playButton: { position: "absolute", width: 35, height: 35, borderRadius: 18, backgroundColor: "rgba(255,255,255,.9)", alignItems: "center", justifyContent: "center", left: "44%", top: "36%" }, playGlyph: { color: "#1877F2", fontSize: 13, marginLeft: 2 }, movieTitle: { color: "#FFF", fontSize: 11, fontWeight: "900", marginTop: 10 }, timeline: { flexDirection: "row", gap: 4, height: 5, marginTop: 11 }, timelineA: { width: "42%", backgroundColor: "#1877F2", borderRadius: 3 }, timelineB: { width: "27%", backgroundColor: "#7EB0FA", borderRadius: 3 }, timelineC: { flex: 1, backgroundColor: "#38475D", borderRadius: 3 }, 
  cartoonCard: { borderRadius: 17, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E8EEF7", overflow: "hidden" }, cartoonSky: { height: 160, backgroundColor: "#DDF3FF", overflow: "hidden" }, cartoonCloud: { position: "absolute", width: 70, height: 20, borderRadius: 15, backgroundColor: "#FFF", top: 22, left: 18 }, cartoonHill: { position: "absolute", width: 250, height: 100, borderRadius: 100, backgroundColor: "#5DC7A4", bottom: -45, left: -25 }, cartoonHillBack: { position: "absolute", width: 220, height: 90, borderRadius: 100, backgroundColor: "#8BDDBE", bottom: -40, right: -35 }, cartoonCharacter: { position: "absolute", alignItems: "center", left: "41%", top: 25 }, characterEar: { width: 55, height: 24, borderRadius: 14, backgroundColor: "#F4A261", marginBottom: -7 }, characterFace: { width: 53, height: 51, borderRadius: 25, backgroundColor: "#FFD6A5", borderWidth: 2, borderColor: "#E58A54", alignItems: "center", paddingTop: 15 }, characterEyeRow: { flexDirection: "row", gap: 14 }, characterEye: { width: 5, height: 7, borderRadius: 4, backgroundColor: "#344054" }, characterSmile: { width: 13, height: 6, borderBottomWidth: 2, borderColor: "#B45F45", borderRadius: 10, marginTop: 5 }, characterBody: { width: 44, height: 35, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: "#8A72E8", marginTop: -1 }, cartoonSpark: { position: "absolute", width: 12, height: 12, backgroundColor: "#FFD166", borderRadius: 6, right: 35, top: 32 }, cartoonCaption: { padding: 12 },
  payCard: { borderRadius: 17, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5EBF4", padding: 13 }, payHeader: { flexDirection: "row", alignItems: "center", gap: 9 }, payLogo: { width: 31, height: 31, borderRadius: 10, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }, payLogoText: { color: "#FFF", fontSize: 17, fontWeight: "900" }, secureBadge: { marginLeft: "auto", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 6, backgroundColor: "#E5F8EF" }, secureBadgeText: { color: "#16865B", fontSize: 7, fontWeight: "900" }, balance: { backgroundColor: "#F6F9FD", borderRadius: 12, padding: 11, marginTop: 12 }, balanceLabel: { color: "#8995A8", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, balanceValue: { color: "#25324A", fontSize: 12, fontWeight: "900", marginTop: 5, marginBottom: 8 }, transaction: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#E6ECF5", gap: 8 }, transactionIcon: { width: 23, height: 23, borderRadius: 8, backgroundColor: "#DDF7E9", alignItems: "center", justifyContent: "center" }, transactionIconAlt: { width: 23, height: 23, borderRadius: 8, backgroundColor: "#E2EDFF", alignItems: "center", justifyContent: "center" }, transactionIconText: { color: "#1877F2", fontSize: 10, fontWeight: "900" }, transactionCopy: { flex: 1 }, transactionStatus: { color: "#1877F2", fontSize: 8, fontWeight: "800" }, payFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, payFooterText: { color: "#8995A8", fontSize: 7, fontWeight: "700" },
  messageCard: { backgroundColor: "#FFF", borderRadius: 17, borderWidth: 1, borderColor: "#E5EBF4", padding: 13 }, messageHeader: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" }, onlineText: { color: "#18A66A", fontSize: 8, marginTop: 3 }, messageDots: { marginLeft: "auto", flexDirection: "row", gap: 3 }, messageDots: { marginLeft: "auto", flexDirection: "row", gap: 3 }, messageInput: { height: 35, backgroundColor: "#F5F8FC", borderRadius: 9, paddingLeft: 10, paddingRight: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }, messageDots: { marginLeft: "auto", flexDirection: "row", gap: 3 }, bubbleLeft: { alignSelf: "flex-start", maxWidth: "80%", backgroundColor: "#F0F4FA", padding: 9, borderRadius: 11, marginTop: 13 }, bubbleLeftSmall: { alignSelf: "flex-start", backgroundColor: "#F0F4FA", padding: 9, borderRadius: 11, marginTop: 7 }, bubbleRight: { alignSelf: "flex-end", maxWidth: "80%", backgroundColor: "#1877F2", padding: 9, borderRadius: 11, marginTop: 8 }, bubbleText: { color: "#344054", fontSize: 8 }, bubbleTextWhite: { color: "#FFF", fontSize: 8 }, sendButton: { width: 24, height: 24, borderRadius: 7, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }, sendText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  feedCard: { borderRadius: 17, borderWidth: 1, borderColor: "#E5EBF4", backgroundColor: "#FFF", padding: 12 }, feedHeader: { flexDirection: "row", alignItems: "center", gap: 8 }, feedImage: { height: 130, backgroundColor: "#DCEAFF", borderRadius: 10, overflow: "hidden", marginTop: 11 }, feedImageSun: { position: "absolute", width: 33, height: 33, borderRadius: 17, backgroundColor: "#FFD99A", right: 35, top: 19 }, feedImageHill: { position: "absolute", width: 220, height: 90, borderRadius: 100, backgroundColor: "#7CCBA8", bottom: -45, left: -15 }, feedImageHillBack: { position: "absolute", width: 190, height: 75, borderRadius: 100, backgroundColor: "#9ADBC0", bottom: -42, right: -25 }, feedCaption: { color: "#344054", fontSize: 9, fontWeight: "750", marginTop: 9 }, feedActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  createCard: { height: 190, borderRadius: 17, overflow: "hidden", backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" }, createOrbA: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "#B8D4FF", top: -70, right: -20 }, createOrbB: { position: "absolute", width: 130, height: 130, borderRadius: 65, backgroundColor: "#D9CCFF", bottom: -55, left: -10 }, createTile: { backgroundColor: "rgba(255,255,255,.91)", borderRadius: 14, padding: 15, alignItems: "center", width: "82%", borderWidth: 1, borderColor: "#FFF" }, createTileMark: { width: 35, height: 35, borderRadius: 11, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginBottom: 8 }, createTileMarkText: { color: "#FFF", fontSize: 19, fontWeight: "900" }, createPill: { marginTop: 11, borderRadius: 20, backgroundColor: "#FFF", paddingHorizontal: 10, paddingVertical: 5 }, createPillText: { color: "#1877F2", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  peopleCard: { borderRadius: 17, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5EBF4", padding: 15, alignItems: "center" }, peopleOrbit: { height: 135, width: 210, alignItems: "center", justifyContent: "center", marginTop: 8 }, orbitLine: { position: "absolute", width: 118, height: 118, borderRadius: 59, borderWidth: 1, borderColor: "#D7E6FC" }, personBubble: { position: "absolute", width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }, personOne: { top: 0, left: 85, backgroundColor: "#C8E9DA" }, personTwo: { top: 45, left: 14, backgroundColor: "#F8D8C6" }, personThree: { top: 45, right: 14, backgroundColor: "#D9CCFF" }, personFour: { bottom: 0, left: 85, backgroundColor: "#C7DEFF" }, personText: { color: "#344054", fontSize: 11, fontWeight: "900" }, peopleCenter: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", zIndex: 1 }, peopleCenterText: { color: "#FFF", fontSize: 22, fontWeight: "900" }, peoplePill: { backgroundColor: "#EEF4FF", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 15 }, peoplePillText: { color: "#1877F2", fontSize: 8, fontWeight: "800" },
  securityCard: { borderRadius: 17, borderWidth: 1, borderColor: "#E5EBF4", backgroundColor: "#FFF", padding: 15, alignItems: "center" }, shieldOuter: { width: 67, height: 67, borderRadius: 23, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" }, shieldInner: { width: 49, height: 49, borderRadius: 18, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }, shieldCheck: { color: "#FFF", fontSize: 27, fontWeight: "900" }, securityRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 9, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: "#EEF2F7" }, securityCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#DDF7E9", alignItems: "center", justifyContent: "center" }, securityCheckText: { color: "#16865B", fontSize: 11, fontWeight: "900" },
  welcomeCard: { height: 190, borderRadius: 17, backgroundColor: "#102A4D", alignItems: "center", justifyContent: "center", overflow: "hidden" }, welcomeGlow: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "#245EAA", opacity: .7, top: -120, right: -50 }, welcomeTitle: { color: "#FFF", fontSize: 15, fontWeight: "900", marginTop: 13 }, welcomePills: { flexDirection: "row", gap: 7, marginTop: 13 }, welcomePill: { color: "#DCEAFF", fontSize: 7, fontWeight: "900", letterSpacing: 1, backgroundColor: "#234B7C", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20 },
});
