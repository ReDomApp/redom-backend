import { useEffect, useRef, useState, type ComponentType } from "react";
import { Alert, Animated, Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import CloseIcon from "../assets/navigation/close.svg";
import CommentIcon from "../assets/home-feed/comment.svg";
import ShareIcon from "../assets/home-feed/share.svg";
import ReportIcon from "../assets/home-feed/report.svg";
import UnhideIcon from "../assets/home-feed/unhide.svg";
import FollowIcon from "../assets/home-feed/follow.svg";
import CopyIcon from "../assets/home-feed/copy-comment.svg";
import CreatorCommentIcon from "../assets/home-feed/creator-comment.svg";
import ReactionLike from "../assets/home-feed/reaction-like.svg";
import ReactionHaha from "../assets/home-feed/reaction-haha.svg";
import ReactionSad from "../assets/home-feed/reaction-sad.svg";
import ReactionLove from "../assets/home-feed/reaction-love.svg";
import VerifiedBadge from "../assets/home-feed/verified-badge.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import { feedService, type CommentReactionType, type HomeFeedComment } from "../feed/service";

type Graphic = ComponentType<{ width?: number; height?: number }>;
const GRAPHICS: Record<CommentReactionType, Graphic> = { like: ReactionLike, haha: ReactionHaha, sad: ReactionSad, love: ReactionLove };

function AnimatedReaction({ type, size = 30, pulse = false }: { type: CommentReactionType; size?: number; pulse?: boolean }) {
  const scale = useRef(new Animated.Value(0.75)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    if (!pulse) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(800),
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, friction: 5 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, scale]);
  const Graphic = GRAPHICS[type];
  return <Animated.View style={{ width: size, height: size, transform: [{ scale }] }}><Graphic width={size} height={size} /></Animated.View>;
}

function Avatar({ uri, size = 44 }: { uri: string | null; size?: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <ProfilePlaceholder width={size} height={size} />;
}

function commentTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} hrs`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return days === 1 ? "1d" : `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1wk";
  return `${weeks} WK ago`;
}

function formatLikes(total: number) {
  if (total < 1000) return String(total);
  if (total < 1000000) return `${(total / 1000).toFixed(total < 10000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(total / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function CommentSheet({ visible, postId, onClose }: { visible: boolean; postId: string; onClose: () => void }) {
  const [comments, setComments] = useState<HomeFeedComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [composer, setComposer] = useState("");
  const [replyTarget, setReplyTarget] = useState<HomeFeedComment | null>(null);
  const [selected, setSelected] = useState<HomeFeedComment | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try { setComments((await feedService.getComments(postId, 100)).comments); } finally { setLoading(false); }
  };

  useEffect(() => { if (visible) void load(); }, [visible, postId]);

  const submit = async () => {
    const text = composer.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await feedService.createComment(postId, composer, replyTarget?.id);
      setComments((current) => result.comment ? [result.comment, ...current.filter((item) => item.id !== result.comment.id)] : current);
      setComposer("");
      setReplyTarget(null);
    } finally { setBusy(false); }
  };

  const react = async (comment: HomeFeedComment, type: CommentReactionType) => {
    const result = await feedService.reactToComment(comment.id, type);
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, reactionSummary: result } : item));
    setSelected(null);
    setActionOpen(false);
  };

  const shareComment = async (comment: HomeFeedComment) => {
    const result = await feedService.shareComment(comment.id, "external", "native_share");
    const shareText = `ReDom/comments/${comment.publicId}\n${comment.content}`;
    await Share.share({ message: `${shareText}\n${result.url}` });
  };

  const copyLink = async (comment: HomeFeedComment) => {
    const result = await feedService.shareComment(comment.id, "copy_link", "copy_link");
    const link = `redom/comments/${comment.publicId}${result.url ? `\n${result.url}` : ""}`;
    await Clipboard.setStringAsync(link);
    setActionOpen(false);
    Alert.alert("Copied", "Comment link copied to your clipboard.");
  };

  const reply = (comment: HomeFeedComment) => {
    setReplyTarget(comment);
    setComposer(`@${comment.author.username.replace(/^@/, "")} `);
    setActionOpen(false);
  };

  const pin = async (comment: HomeFeedComment) => {
    const result = await feedService.pinComment(comment.id, !comment.pinned);
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, pinned: result.pinned } : { ...item, pinned: result.pinned ? false : item.pinned }));
    setActionOpen(false);
  };

  const hide = (comment: HomeFeedComment) => {
    setHiddenIds((current) => new Set(current).add(comment.id));
    setActionOpen(false);
  };

  const visibleComments = comments.filter((comment) => !hiddenIds.has(comment.id));
  const selectedSummary = selected?.reactionSummary;

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <Pressable onPress={onClose}><CloseIcon width={26} height={26} /></Pressable>
        </View>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {loading ? <Text style={styles.status}>Loading comments...</Text> : null}
          {!loading && !visibleComments.length ? <Text style={styles.status}>Be the first to comment.</Text> : null}
          {visibleComments.map((comment) => {
            const author = `${comment.author.firstName} ${comment.author.lastName}`.trim();
            return <Pressable key={comment.id} onLongPress={() => { setSelected(comment); setActionOpen(true); }} delayLongPress={420} style={styles.commentRow}>
              <Avatar uri={comment.author.profilePhoto} />
              <View style={styles.commentBody}>
                <View style={styles.nameLine}>
                  <Text style={styles.name}>{author}</Text>
                  {comment.author.verified ? <VerifiedBadge width={16} height={16} /> : null}
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.time}>{commentTime(comment.createdAt)}</Text>
                  {comment.isCreatorComment ? <View style={styles.creatorBadge}><CreatorCommentIcon width={19} height={19} /><Text style={styles.creatorText}>Creator</Text></View> : null}
                </View>
                <Text style={styles.commentText}>{comment.content}</Text>
                <View style={styles.commentMeta}>
                  <Pressable onPress={() => void react(comment, comment.reactionSummary.myReaction ?? "like")} onLongPress={() => { setSelected(comment); setActionOpen(true); }} delayLongPress={300} style={styles.likeButton}>
                    <AnimatedReaction type={comment.reactionSummary.myReaction ?? "like"} size={20} />
                    <Text style={styles.likeText}>Like</Text>
                  </Pressable>
                  {comment.reactionSummary.total > 0 ? <Pressable onPress={() => { setSelected(comment); setReactionsOpen(true); }} style={styles.likeCount}><AnimatedReaction type={comment.reactionSummary.top[0]?.type ?? "like"} size={18} /><Text style={styles.likeNumber}>{formatLikes(comment.reactionSummary.total)}</Text></Pressable> : null}
                  <Pressable onPress={() => reply(comment)} style={styles.metaAction}><Text style={styles.metaActionText}>Reply</Text></Pressable>
                  {comment.replyCount > 0 ? <Text style={styles.replyCount}>{comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}</Text> : null}
                </View>
              </View>
            </Pressable>;
          })}
        </ScrollView>

        <View style={styles.composerArea}>
          {replyTarget ? <View style={styles.replying}><Text style={styles.replyingText}>Replying to @{replyTarget.author.username.replace(/^@/, "")}</Text><Pressable onPress={() => { setReplyTarget(null); setComposer(""); }}><CloseIcon width={18} height={18} /></Pressable></View> : null}
          <View style={styles.composerRow}>
            <Avatar uri={null} size={38} />
            <TextInput value={composer} onChangeText={setComposer} placeholder="Write a comment..." placeholderTextColor="#65676B" multiline style={styles.input} />
            <Pressable onPress={() => void submit()} disabled={!composer.trim() || busy} style={styles.send}><Text style={styles.sendText}>Send</Text></Pressable>
          </View>
        </View>
      </View>
    </View>

    <Modal visible={actionOpen && !!selected} transparent animationType="slide" onRequestClose={() => setActionOpen(false)}>
      <View style={styles.actionBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionOpen(false)} />
        <View style={styles.actionSheet}>
          <View style={styles.reactionTray}>
            {(Object.keys(GRAPHICS) as CommentReactionType[]).map((type) => <Pressable key={type} onPress={() => selected && void react(selected, type)} style={styles.reactionItem}><AnimatedReaction type={type} size={44} pulse /></Pressable>)}
          </View>
          <Text style={styles.reactHint}>React to this comment</Text>
          <Pressable style={styles.actionItem} onPress={() => selected && void shareComment(selected)}><ShareIcon width={30} height={30} /><Text style={styles.actionText}>Share comment</Text></Pressable>
          <Pressable style={styles.actionItem} onPress={() => Alert.alert("Report comment", "The ReDom report screen will be connected here.")}><ReportIcon width={30} height={30} /><Text style={styles.actionText}>Report comment</Text></Pressable>
          <Pressable style={styles.actionItem} onPress={() => selected && reply(selected)}><CommentIcon width={30} height={30} /><Text style={styles.actionText}>Reply</Text></Pressable>
          <Pressable style={styles.actionItem} onPress={() => selected && void copyLink(selected)}><CopyIcon width={30} height={30} /><Text style={styles.actionText}>Copy Link</Text></Pressable>
          {selected?.pinned !== undefined ? <Pressable style={styles.actionItem} onPress={() => selected && void pin(selected)}><UnhideIcon width={30} height={30} /><Text style={styles.actionText}>{selected.pinned ? "Unpin comment" : "Pin comment"}</Text></Pressable> : null}
          <Pressable style={styles.actionItem} onPress={() => selected && hide(selected)}><CloseIcon width={30} height={30} /><Text style={styles.actionText}>Hide comment</Text></Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={reactionsOpen && !!selectedSummary} transparent animationType="slide" onRequestClose={() => setReactionsOpen(false)}>
      <View style={styles.actionBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setReactionsOpen(false)} />
        <View style={styles.reactionsSheet}>
          <View style={styles.header}><Text style={styles.title}>Comment Likes</Text><Pressable onPress={() => setReactionsOpen(false)}><CloseIcon width={24} height={24} /></Pressable></View>
          <Text style={styles.total}>{selectedSummary?.total ?? 0} {selectedSummary?.total === 1 ? "person" : "people"}</Text>
          <View style={styles.topReactions}>{selectedSummary?.top.map((item) => <View key={item.type} style={styles.topReaction}><AnimatedReaction type={item.type} size={32} pulse /><Text style={styles.count}>{item.count}</Text></View>)}</View>
          <Text style={styles.privacy}>Only friends or followed profiles who liked the comment are shown below. Other reactors remain hidden.</Text>
          <ScrollView>{selectedSummary?.visibleReactors.map((reactor) => <View key={`${reactor.userId}-${reactor.reactionType}`} style={styles.reactor}><Avatar uri={reactor.profilePhoto} size={42} /><Text style={styles.reactorName}>{reactor.firstName} {reactor.lastName}</Text><AnimatedReaction type={(reactor.reactionType as CommentReactionType) || "like"} size={24} /></View>)}</ScrollView>
        </View>
      </View>
    </Modal>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", height: "88%", borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
  handle: { width: 72, height: 5, borderRadius: 4, backgroundColor: "#8A8D91", alignSelf: "center", marginTop: 9 },
  header: { height: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  title: { fontSize: 21, fontWeight: "700", color: "#050505" },
  list: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 24 },
  status: { color: "#65676B", textAlign: "center", padding: 28 },
  commentRow: { flexDirection: "row", paddingVertical: 10 },
  commentBody: { flex: 1, marginLeft: 10 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  name: { fontSize: 15, fontWeight: "700", color: "#050505" },
  dot: { color: "#65676B" },
  time: { fontSize: 12, color: "#65676B" },
  creatorBadge: { flexDirection: "row", alignItems: "center", marginLeft: 3, gap: 2 },
  creatorText: { color: "#1877F2", fontSize: 12, fontWeight: "600" },
  commentText: { fontSize: 16, lineHeight: 21, color: "#050505", marginTop: 3 },
  commentMeta: { flexDirection: "row", alignItems: "center", marginTop: 7, gap: 13 },
  likeButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeText: { fontSize: 12, fontWeight: "700", color: "#65676B" },
  likeCount: { flexDirection: "row", alignItems: "center", gap: 3 },
  likeNumber: { fontSize: 12, color: "#65676B", fontWeight: "600" },
  metaAction: { paddingVertical: 2 },
  metaActionText: { fontSize: 12, fontWeight: "700", color: "#65676B" },
  replyCount: { fontSize: 12, color: "#65676B" },
  composerArea: { borderTopWidth: 1, borderTopColor: "#E4E6EB", backgroundColor: "#FFF", padding: 10 },
  replying: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingBottom: 6 },
  replyingText: { color: "#1877F2", fontSize: 12, fontWeight: "600" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, maxHeight: 110, minHeight: 42, borderRadius: 20, backgroundColor: "#F0F2F5", paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: "#050505" },
  send: { minHeight: 42, justifyContent: "center", paddingHorizontal: 8 },
  sendText: { color: "#1877F2", fontWeight: "700" },
  actionBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingBottom: 16 },
  reactionTray: { flexDirection: "row", justifyContent: "center", gap: 7, paddingTop: 18 },
  reactionItem: { padding: 2 },
  reactHint: { textAlign: "center", color: "#65676B", fontSize: 14, marginBottom: 12 },
  actionItem: { flexDirection: "row", alignItems: "center", paddingVertical: 15, gap: 14 },
  actionText: { fontSize: 18, color: "#111" },
  reactionsSheet: { backgroundColor: "#FFF", height: "75%", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 12 },
  total: { paddingHorizontal: 18, paddingTop: 14, fontSize: 16, color: "#65676B" },
  topReactions: { flexDirection: "row", gap: 18, padding: 18 },
  topReaction: { flexDirection: "row", alignItems: "center", gap: 5 },
  count: { fontSize: 15, color: "#333" },
  privacy: { color: "#65676B", paddingHorizontal: 18, paddingBottom: 12, fontSize: 12 },
  reactor: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 8, gap: 10 },
  reactorName: { flex: 1, fontSize: 16, fontWeight: "600", color: "#111" },
});
