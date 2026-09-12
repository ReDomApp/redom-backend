import { useEffect, useRef, useState, type ComponentType } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import MoreIcon from "../assets/navigation/more.svg";
import CloseIcon from "../assets/navigation/close.svg";
import CommentIcon from "../assets/home-feed/comment.svg";
import ShareIcon from "../assets/home-feed/share.svg";
import FollowIcon from "../assets/home-feed/follow.svg";
import ReportIcon from "../assets/home-feed/report.svg";
import UnhideIcon from "../assets/home-feed/unhide.svg";
import VerifiedBadge from "../assets/home-feed/verified-badge.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import ReactionLike from "../assets/home-feed/reaction-like.svg";
import ReactionHaha from "../assets/home-feed/reaction-haha.svg";
import ReactionSad from "../assets/home-feed/reaction-sad.svg";
import ReactionLove from "../assets/home-feed/reaction-love.svg";
import { feedService, type HomeFeedPost, type PostReactionSummary, type PostReactionType } from "../feed/service";
import { CommentSheet } from "./CommentSheet";

type Graphic = ComponentType<{ width?: number; height?: number }>;
const GRAPHICS: Record<PostReactionType, Graphic> = { like: ReactionLike, haha: ReactionHaha, sad: ReactionSad, love: ReactionLove };
const EMPTY: PostReactionSummary = { total: 0, top: [], counts: { like: 0, haha: 0, sad: 0, love: 0 }, myReaction: null, visibleReactors: [], hiddenReactorCount: 0 };
const REASONS = [["doesnt_match_my_interests", "Doesn't match my interests"], ["scam", "Scam"], ["sexual", "Sexual"], ["disturbing", "Disturbing"], ["dont_like_creator", "I don't like the creator"], ["other", "Other"]] as const;

function Avatar({ uri, size = 46 }: { uri?: string | null; size?: number }) { return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />; }

function AnimatedReaction({ type, size = 30, pulse = false }: { type: PostReactionType; size?: number; pulse?: boolean }) {
  const scale = useRef(new Animated.Value(0.72)).current;
  useEffect(() => { Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start(); }, [scale, type]);
  useEffect(() => { if (!pulse) return; const loop = Animated.loop(Animated.sequence([Animated.delay(850), Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, friction: 5 }), Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 })])); loop.start(); return () => loop.stop(); }, [pulse, scale]);
  const Graphic = GRAPHICS[type];
  return <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}><Graphic width={size} height={size} /></Animated.View>;
}

export function PostCardV3({ post, onHidden, onUnhidden }: { post: HomeFeedPost; onHidden: (id: string) => void; onUnhidden: (id: string) => void }) {
  const [summary, setSummary] = useState(post.reactionSummary ?? EMPTY);
  const [trayOpen, setTrayOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [notInterested, setNotInterested] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const author = `${post.firstName} ${post.lastName}`.trim() || "ReDom";
  const media = post.media?.find((item) => typeof item.objectKey === "string" && String(item.objectKey).startsWith("http"));

  useEffect(() => { void feedService.getPostReactionSummary(post.id).then(setSummary).catch(() => undefined); }, [post.id]);

  const react = async (type: PostReactionType) => { if (busy) return; setBusy(true); try { setSummary(await feedService.reactToPost(post.id, type)); } finally { setBusy(false); setTrayOpen(false); } };
  const openNotInterested = async () => { setNotInterested(true); try { setFollowing((await feedService.isFollowing(post.authorId)).following); } catch { setFollowing(false); } };
  const hide = async (reason: string) => { if (busy) return; setBusy(true); try { await feedService.hidePost(post.id, reason); onHidden(post.id); } finally { setBusy(false); } };
  const unfollow = async () => { if (busy) return; setBusy(true); try { setFollowing((await feedService.unfollowCreator(post.authorId)).following); } finally { setBusy(false); } };
  const unhide = async () => { if (busy) return; setBusy(true); try { await feedService.unhidePost(post.id); setNotInterested(false); onUnhidden(post.id); } finally { setBusy(false); } };

  return <View style={styles.card}>
    {!notInterested ? <>
      <View style={styles.header}><Avatar uri={post.profilePhoto} /><View style={styles.identity}><View style={styles.nameRow}><Text style={styles.name}>{author}</Text>{post.verified ? <VerifiedBadge width={18} height={18} /> : null}</View><Text style={styles.meta}>{relativeTime(post.publishedAt)} · Public</Text></View><View style={styles.headerActions}><Pressable style={styles.iconButton}><MoreIcon width={24} height={24} /></Pressable><Pressable style={styles.iconButton} onPress={() => void openNotInterested()}><CloseIcon width={24} height={24} /></Pressable></View></View>
      {post.content ? <Pressable style={styles.body} onPress={() => void feedService.recordPostView(post.id)}><Text style={styles.bodyText}>{post.content}</Text></Pressable> : null}
      {media && typeof media.objectKey === "string" ? <Pressable onPress={() => void feedService.recordPostView(post.id)}><Image source={{ uri: media.objectKey }} style={styles.media} resizeMode="cover" /></Pressable> : null}
      {post.recommendation ? <Text style={styles.recommended}>{post.recommendation.label}</Text> : null}
      <View style={styles.summaryRow}><Pressable onPress={() => setReactionsOpen(true)} style={styles.reactionSummary}>{summary.top.map((item) => <AnimatedReaction key={item.type} type={item.type} size={20} />)}{summary.total > 0 ? <Text style={styles.summaryCount}>{summary.total}</Text> : null}</Pressable><Text style={styles.countText}>Comments</Text><Text style={styles.countText}>Shares</Text></View>
      <View style={styles.actionRow}>
        <View style={styles.actionWrap}><ReactionTray visible={trayOpen} onSelect={(type) => void react(type)} /><Pressable style={styles.action} onPress={() => void react(summary.myReaction ?? "like")} onLongPress={() => setTrayOpen(true)} delayLongPress={280}><AnimatedReaction type={summary.myReaction ?? "like"} size={22} pulse /><Text style={[styles.actionText, summary.myReaction ? styles.active : null]}>Like</Text></Pressable></View>
        <Pressable style={styles.action} onPress={() => setCommentsOpen(true)}><CommentIcon width={22} height={22} /><Text style={styles.actionText}>Comment</Text></Pressable>
        <Pressable style={styles.action} disabled={post.sharingEnabled === false}><ShareIcon width={22} height={22} /><Text style={styles.actionText}>Share</Text></Pressable>
      </View>
    </> : <View style={styles.notInterested}><View style={styles.titleRow}><Text style={styles.title}>Why aren't you interested?</Text><Pressable onPress={() => setNotInterested(false)}><CloseIcon width={22} height={22} /></Pressable></View><View style={styles.reasonGrid}>{REASONS.map(([key, label]) => <Pressable key={key} style={styles.reason} onPress={() => void hide(key)}><Text style={styles.reasonText}>{label}</Text></Pressable>)}</View><Text style={styles.otherTitle}>Other steps you can take</Text>{following ? <Pressable style={styles.otherRow} onPress={() => void unfollow()}><FollowIcon width={28} height={28} /><Text>Unfollow {author}</Text></Pressable> : null}<Pressable style={styles.otherRow}><ReportIcon width={28} height={28} /><Text>Report post</Text></Pressable><Pressable style={styles.otherRow} onPress={() => void unhide()}><UnhideIcon width={28} height={28} /><Text>Unhide post</Text></Pressable></View>}

    <Modal visible={reactionsOpen} transparent animationType="slide" onRequestClose={() => setReactionsOpen(false)}><View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setReactionsOpen(false)} /><View style={styles.reactionSheet}><View style={styles.titleRow}><Text style={styles.title}>Likes</Text><Pressable onPress={() => setReactionsOpen(false)}><CloseIcon width={24} height={24} /></Pressable></View><Text style={styles.total}>{summary.total} {summary.total === 1 ? "person" : "people"}</Text><View style={styles.topRow}>{summary.top.map((item) => <View key={item.type} style={styles.topItem}><AnimatedReaction type={item.type} size={30} pulse /><Text>{item.count}</Text></View>)}</View><Text style={styles.privacy}>Only friends or profiles you follow who liked this post are shown here. Other reactors remain hidden.</Text>{summary.visibleReactors.slice(0, 20).map((reactor) => <View key={`${reactor.userId}-${reactor.reactionType}`} style={styles.reactor}><Avatar uri={reactor.profilePhoto} size={38} /><Text style={styles.reactorName}>{reactor.firstName} {reactor.lastName}</Text><AnimatedReaction type={(reactor.reactionType as PostReactionType) || "like"} size={24} /></View>)}</View></View></Modal>
    <CommentSheet visible={commentsOpen} postId={post.id} onClose={() => setCommentsOpen(false)} />
  </View>;
}

function ReactionTray({ visible, onSelect }: { visible: boolean; onSelect: (type: PostReactionType) => void }) { if (!visible) return null; return <View style={styles.tray}>{(Object.keys(GRAPHICS) as PostReactionType[]).map((type) => <Pressable key={type} onPress={() => onSelect(type)} style={styles.trayItem}><AnimatedReaction type={type} size={38} pulse /></Pressable>)}</View>; }
function relativeTime(value: string) { const s = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000)); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`; }

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFF", marginTop: 8, paddingTop: 12, paddingBottom: 3 }, header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }, identity: { flex: 1, marginLeft: 10 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 5 }, name: { fontSize: 16, fontWeight: "700", color: "#050505" }, meta: { fontSize: 12, color: "#65676B", marginTop: 2 }, headerActions: { flexDirection: "row" }, iconButton: { padding: 7 }, body: { paddingHorizontal: 12, paddingTop: 10 }, bodyText: { fontSize: 16, lineHeight: 22, color: "#050505" }, media: { width: "100%", height: 280, marginTop: 10 }, recommended: { fontSize: 12, color: "#65676B", paddingHorizontal: 12, paddingTop: 8 }, summaryRow: { minHeight: 38, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" }, reactionSummary: { flex: 1, flexDirection: "row", alignItems: "center" }, summaryCount: { color: "#65676B", fontSize: 13, marginLeft: 5 }, countText: { color: "#65676B", fontSize: 12 }, actionRow: { height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }, actionWrap: { flex: 1, position: "relative" }, action: { minHeight: 42, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, actionText: { color: "#65676B", fontWeight: "600", fontSize: 14 }, active: { color: "#1877F2" }, tray: { position: "absolute", bottom: 44, left: 0, flexDirection: "row", backgroundColor: "#FFF", borderRadius: 28, padding: 7, elevation: 8, shadowOpacity: 0.2, shadowRadius: 8, zIndex: 20 }, trayItem: { paddingHorizontal: 4 }, notInterested: { paddingHorizontal: 18, paddingBottom: 18 }, titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, title: { flex: 1, fontSize: 20, fontWeight: "700" }, reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, reason: { backgroundColor: "#F0F2F5", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 }, reasonText: { fontSize: 13, color: "#111" }, otherTitle: { fontSize: 14, fontWeight: "700", marginTop: 18, marginBottom: 4 }, otherRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.38)", justifyContent: "flex-end" }, reactionSheet: { backgroundColor: "#FFF", minHeight: "55%", maxHeight: "80%", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 }, total: { color: "#65676B", marginBottom: 12 }, topRow: { flexDirection: "row", gap: 18, marginBottom: 14 }, topItem: { flexDirection: "row", alignItems: "center", gap: 4 }, privacy: { fontSize: 12, color: "#65676B", marginBottom: 10 }, reactor: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 }, reactorName: { flex: 1, fontSize: 16, fontWeight: "600" },
});
