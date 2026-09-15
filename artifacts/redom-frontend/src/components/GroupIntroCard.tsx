import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import { GroupActionIcon } from "./GroupActionIcon";

interface Props {
  groupName: string;
  participantCount: number;
  createdByMe: boolean;
  groupPhoto?: string | null;
  canAddMembers: boolean;
  canInvite: boolean;
  onAddMembers: () => void;
  onInvite: () => void;
}

export function GroupIntroCard({ groupName, participantCount, createdByMe, groupPhoto, canAddMembers, canInvite, onAddMembers, onInvite }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          {groupPhoto ? <Image source={{ uri: groupPhoto }} style={styles.logoImage} /> : <ReDomLogo width={78} height={78} />}
        </View>
        <Text style={styles.title}>{createdByMe ? "You created this group" : "You joined this group"}</Text>
        <Text style={styles.meta}>Group · {participantCount} {participantCount === 1 ? "member" : "members"}</Text>
        <Text style={styles.description}>
          {createdByMe ? "Members can add people or invite them using a link." : `You're now a member of ${groupName}. You can participate in the conversation and use the group options available to you.`}
        </Text>
        {canAddMembers ? (
          <Pressable accessibilityRole="button" style={styles.action} onPress={onAddMembers}>
            <GroupActionIcon kind="add" color="#25855A" />
            <Text style={styles.actionText}>Add members</Text>
          </Pressable>
        ) : null}
        {canInvite ? (
          <Pressable accessibilityRole="button" style={styles.action} onPress={onInvite}>
            <GroupActionIcon kind="link" color="#25855A" />
            <Text style={styles.actionText}>Invite via link or QR code</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", paddingHorizontal: 8, paddingTop: 8, paddingBottom: 14 },
  card: { width: "100%", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.96)", paddingHorizontal: 22, paddingTop: 26, paddingBottom: 22, alignItems: "center", borderWidth: 1, borderColor: "rgba(228,230,235,0.75)" },
  logoWrap: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 14 },
  logoImage: { width: 84, height: 84, borderRadius: 42 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: "800", color: "#050505", textAlign: "center" },
  meta: { marginTop: 5, fontSize: 16, color: "#65676B", textAlign: "center" },
  description: { marginTop: 16, maxWidth: 320, fontSize: 15, lineHeight: 22, color: "#65676B", textAlign: "center" },
  action: { width: "100%", minHeight: 62, marginTop: 12, borderRadius: 34, borderWidth: 1.5, borderColor: "#D7DAD9", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  actionText: { marginLeft: 10, fontSize: 16, fontWeight: "800", color: "#25855A" },
});
