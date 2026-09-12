import { useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import MoreIcon from "../assets/navigation/more.svg";
import CloseIcon from "../assets/navigation/close.svg";
import LikeIcon from "../assets/home-feed/like.svg";
import CommentIcon from "../assets/home-feed/comment.svg";
import ShareIcon from "../assets/home-feed/share.svg";
import FollowIcon from "../assets/home-feed/follow.svg";
import ReportIcon from "../assets/home-feed/report.svg";
import UnhideIcon from "../assets/home-feed/unhide.svg";
import VerifiedBadge from "../assets/home-feed/verified-badge.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import { feedService, type HomeFeedPost, type PostReactionSummary, type PostReactionType } from "../feed/service";

const REACTIONS: Array<{ type: PostReactionType; emoji: string; label: string }> = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "haha", emoji: "😂", label: "Laugh" },
  { type: "sad", emoji: "😢", label: "Sorrow" },
  { type: "love", emoji: "❤️", label: "Love" },
];

const REASONS = [
  ["doesnt_match_my_interests", "Doesn't match my interests"],
  ["scam", "Scam"],
  ["sexual", "Sexual"],
  ["disturbing", "Disturbing"],
  ["dont_like_creator", "I don't like the creator"],
  ["other", "Other"],
] as const;

const EMPTY: PostReactionSummary = { total: 0, top: [], counts: { like: 0, haha: 0, sad: 0, love: 0 }, myReaction: null, visibleReactors: [], hiddenReactorCount: 0 };

function Avatar({ uri, size = 46 }: { uri?: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />;
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function ReactionTray({ visible, onSelect }: { visible: boolean; onSelect: (type: PostReactionType) => void }) {
  const scale = useRef(new Animated.Value(0.65)).current;
  useEffect(() => {
    if (visible) Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [visible, scale]);
  if (!visible) return null;
  return <Animated.View style={[styles.tray, { transform: [{ scale }] }]}>
    {REACTIONS.map((reaction) => <Pressable key={reaction.type} onPress={() => onSelect(reaction.type)} style={styles.trayItem}>
      <Animated.Text style={styles.trayEmoji}>{reaction.emoji}</Animated.Text>
    </Pressable>)}
  </Animated.View>;
}

export function PostCardV2({ post, onHidden, onUnhidden }: { post: HomeFeedPost; onHidden: (id: string) => void; onUnhidden: (id: string) => void }) {
  const [summary, setSummary] = useState(post.reactionSummary ?? EMPTY);
  const [trayOpen, setTrayOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const author = `${post.firstName} ${post.lastName}`.trim() || "ReDom";
  const media = post.media?.find((item) => typeof item.objectKey === "string" && String(item.objectKey).startsWith("http"));

  const react = async (type: PostReactionType) => {
    if (busy) return;
    setBusy(true);
    try { setSummary(await feedService.reactToPost(post.id, type)); } finally { setBusy(false); setTrayOpen(false); }
  };

  const openNotInterested = async () => {
    setNotInterestedOpen(true);
    try { setFollowing((await feedService.isFollowing(post.authorId)).following); } catch { setFollowing(false); }
  };

  const hideForReason = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try { await feedService.hidePost(post.id, reason); onHidden(post.id); } finally { setBusy(false); }
  };

  const unfollow = async () => {
    if (busy) return;
    setBusy(true);
    try { const result = await feedService.unfollowCreator(post.authorId); setFollowing(result.following); } finally { setBusy(false); }
  };

  const unhide = async () => {
    if (busy) return;
    setBusy(true);
    try { await feedService.unhidePost(post.id); setNotInterestedOpen(false); onUnhidden(post.id); } finally { setBusy(false); }
  };

  return <View style={styles.card}>
    {!notInterestedOpen ? <>
      <View style={styles.header}>
        <Avatar uri={post.profilePhoto} />
        <View style={styles.identity}>
          <View style={styles.nameRow}><Text style={styles.name}>{author}</Text>{post.verified ? <VerifiedBadge width={18} height={18} /> : null}</View>
          <Text style={styles.meta}>{relativeTime(post.publishedAt)} · 🌐</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} accessibilityLabel="More post options"><MoreIcon width={24} height={24} /></Pressable>
          <Pressable style={styles.iconButton} onPress={() => void openNotInterested()} accessibilityLabel="Hide post"><CloseIcon width={24} height={24} /></Pressable>
        </View>
      </View>

      {post.content ? <Pressable onPress={() => void feedService.recordPostView(post.id)} style={styles.body}><Text style={styles.bodyText}>{post.content}</Text></Pressable> : null}
      {media && typeof media.objectKey === "string" ? <Pressable onPress={() => void feedService.recordPostView(post.id)}><Image source={{ uri: media.objectKey }} style={styles.media} resizeMode="cover" /></Pressable> : null}
      {post.recommendation ? <Text style={styles.recommended}>{post.recommendation.label}</Text> : null}

      <View style={styles.summaryRow}>
        <Pressable onPress={() => setReactionsOpen(true)} style={styles.reactionSummary}>
          {summary.top.map((reaction) => <Text key={reaction.type} style={styles.summaryEmoji}>{reaction.emoji}</Text>)}
          {summary.total > 0 ? <Text style={styles.summaryCount}>{summary.total}</Text> : null}
        </Pressable>
        <Text style={styles.countText}>Comments 0</Text>
        <Text style={styles.countText}>Shares 0</Text>
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionWrap}><ReactionTray visible={trayOpen} onSelect={(type) => void react(type)} />
          <Pressable style={styles.action} onPress={() => void react(summary.myReaction ?? "like")} onLongPress={() => setTrayOpen(true)} delayLongPress={280}>
            {summary.myReaction ? <Text style={styles.actionEmoji}>{REACTIONS.find((r) => r.type === summary.myReaction)?.emoji}</Text> : <LikeIcon width={22} height={22} />}
            <Text style={[styles.actionLabel, summary.myReaction ? styles.activeAction : null]}>{REACTIONS.find((r) => r.type === summary.myReaction)?.label ?? "Like"}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.action} accessibilityLabel="Comment on post"><CommentIcon width={22} height={22} /><Text style={styles.actionLabel}>Comment</Text></Pressable>
        <Pressable style={styles.action} disabled={post.sharingEnabled === false} accessibilityLabel="Share post"><ShareIcon width={22} height={22} /><Text style={styles.actionLabel}>Share</Text></Pressable>
      </View>
    </> : <View style={styles.notInterestedInline}>
      <View style={styles.inlineTop}><Text style={styles.inlineTitle}>Why aren't you interested?</Text><Pressable onPress={() => setNotInterestedOpen(false)}><CloseIcon width={22} height={22} /></Pressable></View>
      <View style={styles.reasonGrid}>{REASONS.map(([reason, label]) => <Pressable key={reason} style={styles.reasonChip} onPress={() => void hideForReason(reason)}><Text style={styles.reasonText}>{label}</Text></Pressable>)}</View>
      <Text style={styles.otherStepsTitle}>Other steps you can take</Text>
      {following ? <Pressable style={styles.otherStep} onPress={() => void unfollow()}><FollowIcon width={30} height={30} /><Text style={styles.otherStepText}>Unfollow {author}</Text></Pressable> : null}
      <Pressable style={styles.otherStep} onPress={() => setNotInterestedOpen(false)}><ReportIcon width={30} height={30} /><Text style={styles.otherStepText}>Report post</Text></Pressable>
      <Pressable style={styles.otherStep} onPress={() => void unhide()}><UnhideIcon width={30} height={30} /><Text style={styles.otherStepText}>Unhide post</Text></Pressable>
    </View>}

    <Modal visible={reactionsOpen} transparent animationType="slide" onRequestClose={() => setReactionsOpen(false)}>
      <View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setReactionsOpen(false)} /><View style={styles.reactionSheet}>
        <View style={styles.inlineTop}><Text style={styles.inlineTitle}>Reactions</Text><Pressable onPress={() => setReactionsOpen(false)}><CloseIcon width={24} height={24} /></Pressable></View>
        <Text style={styles.totalLine}>{summary.total} {summary.total === 1 ? "person" : "people"} reacted</Text>
        {REACTIONS.map((reaction) => <View key={reaction.type} style={styles.countLine}><Text style={styles.countEmoji}>{reaction.emoji}</Text><Text style={styles.countName}>{reaction.label}</Text><Text style={styles.countValue}>{summary.counts[reaction.type]}</Text></View>)}
        <Text style={styles.privacyNote}>You can see the total number of people who reacted, but only your friends or followers who reacted are shown.</Text>
        {summary.visibleReactors.slice(0, 20).map((reactor) => <View key={`${reactor.userId}-${reactor.reactionType}`} style={styles.reactorRow}><Avatar uri={reactor.profilePhoto} size={38} /><View><Text style={styles.reactorName}>{reactor.firstName} {reactor.lastName}</Text><Text style={styles.reactorMeta}>{reactor.emoji}</Text></View></View>)}
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", marginTop: 8, paddingTop: 12, paddingBottom: 3 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12 },
  identity: { flex: 1, marginLeft: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { fontSize: 16, fontWeight: "700", color: "#050505" },
  meta: { fontSize: 12, color: "#65676B", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  iconButton: { padding: 7 },
  body: { paddingHorizontal: 12, paddingTop: 10 },
  bodyText: { fontSize: 16, lineHeight: 22, color: "#050505" },
  media: { width: "100%", height: 280, marginTop: 10 },
  recommended: { fontSize: 12, color: "#65676B", paddingHorizontal: 12, paddingTop: 8 },
  summaryRow: { minHeight: 38, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB", gap: 12 },
  reactionSummary: { flex: 1, flexDirection: "row", alignItems: "center" },
  summaryEmoji: { fontSize: 18, marginRight: -2 },
  summaryCount: { fontSize: 13, color: "#65676B", marginLeft: 6 },
  countText: { fontSize: 12, color: "#65676B" },
  actionRow: { height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  actionWrap: { flex: 1, position: "relative" },
  action: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  actionLabel: { fontSize: 14, fontWeight: "600", color: "#65676B" },
  activeAction: { color: "#1877F2" },
  actionEmoji: { fontSize: 21 },
  tray: { position: "absolute", bottom: 44, left: 0, flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 28, padding: 7, elevation: 8, shadowOpacity: 0.2, shadowRadius: 8, zIndex: 20 },
  trayItem: { paddingHorizontal: 5 },
  trayEmoji: { fontSize: 32 },
  notInterestedInline: { paddingHorizontal: 18, paddingBottom: 18 },
  inlineTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  inlineTitle: { fontSize: 20, fontWeight: "700", color: "#050505", flex: 1 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  reasonChip: { backgroundColor: "#E4E6EB", borderRadius: 26, paddingHorizontal: 17, paddingVertical: 12 },
  reasonText: { fontSize: 15, color: "#050505" },
  otherStepsTitle: { fontSize: 19, fontWeight: "700", marginTop: 24, marginBottom: 4 },
  otherStep: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11 },
  otherStepText: { fontSize: 16, color: "#050505" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  reactionSheet: { backgroundColor: "#FFFFFF", maxHeight: "80%", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  totalLine: { fontSize: 16, color: "#65676B", marginBottom: 8 },
  countLine: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  countEmoji: { fontSize: 25, width: 40 },
  countName: { flex: 1, fontSize: 16 },
  countValue: { fontSize: 16, fontWeight: "700" },
  privacyNote: { color: "#65676B", fontSize: 13, lineHeight: 19, marginVertical: 10 },
  reactorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  reactorName: { fontSize: 15, fontWeight: "600" },
  reactorMeta: { fontSize: 15, marginTop: 2 },
});
