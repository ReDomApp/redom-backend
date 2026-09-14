import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import CopyIcon from "../assets/message-actions/copy.svg";
import ShareIcon from "../assets/message-actions/share.svg";
import ReplyIcon from "../assets/message-actions/reply.svg";
import ForwardIcon from "../assets/message-actions/forward.svg";
import ReactionIcon from "../assets/message-actions/reaction.svg";
import ProfileIcon from "../assets/message-actions/profile.svg";
import EditIcon from "../assets/message-actions/edit.svg";
import DeleteIcon from "../assets/message-actions/delete.svg";
import ReportIcon from "../assets/message-actions/report.svg";
import StarIcon from "../components/ChatInfoIcon";
import type { ReDomMessage } from "../messages/messageService";
import { chatInfoService } from "../messages/chatInfoService";
import { ForwardMessageSheet } from "./ForwardMessageSheet";
import { SecureMediaViewerModal } from "./SecureMediaViewerModal";
import { ChatInfoIcon } from "../components/ChatInfoIcon";

interface MessageActionSheetProps {
  visible: boolean;
  message: ReDomMessage | null;
  sourceConversationId?: string;
  senderName: string;
  canViewProfile: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCopy: boolean;
  canShare: boolean;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
  onReply: () => void;
  onReact: () => void;
  onViewProfile: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}
type Action = { label: string; icon: ReactNode; onPress: () => void; destructive?: boolean; disabled?: boolean };

export function MessageActionSheet({ visible, message, sourceConversationId, senderName, canViewProfile, canEdit, canDelete, canCopy, canShare, onClose, onCopy, onShare, onReply, onReact, onViewProfile, onEdit, onDelete, onReport }: MessageActionSheetProps) {
  const [forwardVisible, setForwardVisible] = useState(false); const [viewerVisible, setViewerVisible] = useState(false);
  if (!message) return null;
  const openForward = () => { onClose(); setForwardVisible(true); };
  const openViewer = () => { onClose(); setViewerVisible(true); };
  const star = async () => { try { await chatInfoService.starMessage(message.id); Alert.alert("Starred", "This message was added to Starred messages."); } catch (e) { Alert.alert("Could not star", e instanceof Error ? e.message : "This message could not be starred."); } };
  const actions: Action[] = [
    ...(message.attachment && !message.lifecycle?.viewOnce && !message.deletedForEveryone ? [{ label: "View media", icon: <ChatInfoIcon name="media" size={23} />, onPress: openViewer }] : []),
    { label: "Copy", icon: <CopyIcon width={23} height={23} />, onPress: onCopy, disabled: !canCopy },
    { label: "Share", icon: <ShareIcon width={23} height={23} />, onPress: onShare, disabled: !canShare },
    { label: "Star", icon: <ChatInfoIcon name="star" size={23} />, onPress: star, disabled: Boolean(message.lifecycle?.viewOnce || message.deletedForEveryone || message.deletedPlaceholder) },
    { label: "Forward", icon: <ForwardIcon width={23} height={23} />, onPress: openForward, disabled: Boolean(message.lifecycle?.viewOnce || message.deletedForEveryone || message.deletedPlaceholder || (!message.message && !message.caption && !message.attachment)) },
    { label: "Reply", icon: <ReplyIcon width={23} height={23} />, onPress: onReply },
    { label: "React", icon: <ReactionIcon width={23} height={23} />, onPress: onReact },
    ...(canViewProfile ? [{ label: `View ${senderName} profile`, icon: <ProfileIcon width={23} height={23} />, onPress: onViewProfile }] : []),
    ...(canEdit ? [{ label: "Edit", icon: <EditIcon width={23} height={23} />, onPress: onEdit }] : []),
    ...(canDelete ? [{ label: "Delete", icon: <DeleteIcon width={23} height={23} />, onPress: onDelete, destructive: true }] : []),
    { label: "Report", icon: <ReportIcon width={23} height={23} />, onPress: onReport },
  ];
  return <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><Pressable style={styles.dismissArea} onPress={onClose} /><View style={styles.sheet}><View style={styles.handle} /><Text numberOfLines={2} style={styles.preview}>{message.message || message.caption || message.attachment?.fileName || "Message"}</Text><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.actions}>{actions.map((action) => <Pressable key={action.label} disabled={action.disabled} onPress={() => { if (!action.disabled) action.onPress(); }} style={[styles.action, action.disabled && styles.disabled]}><View style={styles.iconBox}>{action.icon}</View><Text style={[styles.label, action.destructive && styles.destructive]}>{action.label}</Text></Pressable>)}</ScrollView><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>
    <ForwardMessageSheet visible={forwardVisible} message={message} sourceConversationId={sourceConversationId || message.conversationId} onClose={() => setForwardVisible(false)} />
    <SecureMediaViewerModal visible={viewerVisible} message={message} onClose={() => setViewerVisible(false)} />
  </>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.32)", justifyContent: "flex-end" }, dismissArea: { flex: 1 }, sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, maxHeight: "82%" }, handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#CCD0D5", marginBottom: 12 }, preview: { backgroundColor: "#F0F2F5", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#050505", fontSize: 14, lineHeight: 20, marginBottom: 8 }, actions: { paddingBottom: 4 }, action: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }, iconBox: { width: 40, height: 40, alignItems: "center", justifyContent: "center" }, label: { marginLeft: 10, fontSize: 16, color: "#050505", fontWeight: "600" }, destructive: { color: "#B42318" }, disabled: { opacity: 0.35 }, cancel: { marginTop: 6, minHeight: 48, borderRadius: 12, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" }, cancelText: { color: "#1877F2", fontSize: 16, fontWeight: "800" }
});
