import { useEffect, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute } from "@react-navigation/native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { groupService } from "../messages/groupService";
import { useAuthContext } from "../auth/context";

type Props = { dark?: boolean };

type GroupIntro = {
  conversationId: string;
  groupName: string;
  participantCount: number;
  groupPhoto?: string | null;
  createdByMe: boolean;
  inviteLink: string | null;
};

const marks = [[24,42,0],[126,24,18],[238,48,-12],[330,28,24],[70,138,-18],[190,128,10],[294,156,-20],[18,252,12],[126,238,-8],[244,270,18],[338,244,-14],[60,356,22],[188,366,-16],[302,382,8],[22,474,-10],[128,490,16],[248,462,-20],[342,520,12],[72,594,-14],[202,588,8],[312,612,-18]] as const;

function Mark({x,y,rotation,stroke}:{x:number;y:number;rotation:number;stroke:string}) {
  return <G transform={`translate(${x} ${y}) rotate(${rotation})`} opacity={0.14}><Path d="M-14 -8h28v20h-28z" stroke={stroke} strokeWidth="1.6" fill="none"/><Path d="M-8 -2h8M-8 4h13" stroke={stroke} strokeWidth="1.3" strokeLinecap="round"/><Circle cx="9" cy="-2" r="1.4" fill="none" stroke={stroke} strokeWidth="1.3"/></G>;
}

function GroupIntroCard({ intro, onConsumed }: { intro: GroupIntro; onConsumed: () => void }) {
  const navigation = useNavigation<any>();
  const [sharing, setSharing] = useState(false);

  const addMembers = () => {
    onConsumed();
    navigation.navigate("GroupInfo", { conversationId: intro.conversationId });
  };

  const invite = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = intro.inviteLink ? { link: intro.inviteLink } : await groupService.getInvite(intro.conversationId);
      if (!result.link) throw new Error("Invite link unavailable.");
      onConsumed();
      await Share.share({ message: result.link });
    } catch (error) {
      if (!(error instanceof Error && /cancel/i.test(error.message))) Alert.alert("Invite unavailable", error instanceof Error ? error.message : "The group invite could not be opened.");
    } finally {
      setSharing(false);
    }
  };

  return <View pointerEvents="box-none" style={styles.introLayer}>
    <View style={styles.card}>
      <View style={styles.logo}><Text style={styles.logoR}>R</Text><Text style={styles.logoWord}>ReDom</Text></View>
      <Text style={styles.heading}>{intro.createdByMe ? "You created this group" : "You joined this group"}</Text>
      <Text style={styles.meta}>Group · {intro.participantCount} {intro.participantCount === 1 ? "member" : "members"}</Text>
      <Text style={styles.description}>{intro.createdByMe ? "Members can add people or invite them using a link." : "You can invite people using a group link."}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add members" onPress={addMembers} style={styles.actionButton}>
        <Text style={styles.actionIcon}>♧+</Text><Text style={styles.actionText}>Add members</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Invite via link or QR code" onPress={() => void invite()} style={styles.actionButton}>
        <Text style={styles.actionIcon}>↗</Text><Text style={styles.actionText}>{sharing ? "Opening invite…" : "Invite via link or QR code"}</Text>
      </Pressable>
    </View>
  </View>;
}

export function ChatWallpaper({dark=false}:Props) {
  const systemDark=useColorScheme()==="dark";
  const isDark=dark||systemDark;
  const base=isDark?"#191715":"#F7F2E8";
  const stroke=isDark?"#8B8172":"#B6A58B";
  const route = useRoute<any>();
  const { user } = useAuthContext();
  const [intro, setIntro] = useState<GroupIntro | null>(null);

  useEffect(() => {
    let active = true;
    const conversationId = route.params?.conversationId as string | undefined;
    const profileId = user?.profileId as string | undefined;
    if (!conversationId || !profileId) return () => { active = false; };

    const loadIntro = async () => {
      try {
        const consumedKey = `redom.group.intro.consumed.${conversationId}.${profileId}`;
        if (await AsyncStorage.getItem(consumedKey)) return;
        const details = await groupService.getDetails(conversationId);
        if (!details.success || !details.group) return;
        const member = details.members?.find((item) => item.profileId === profileId);
        if (!member?.joinedAt) return;
        const joinedAt = new Date(member.joinedAt).getTime();
        if (!Number.isFinite(joinedAt) || Date.now() - joinedAt > 48 * 60 * 60 * 1000) return;
        const earliest = [...(details.members ?? [])].sort((a,b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())[0];
        if (!active) return;
        setIntro({
          conversationId,
          groupName: details.group.groupName,
          participantCount: details.group.participantCount,
          groupPhoto: details.group.groupPhoto,
          createdByMe: earliest?.profileId === profileId,
          inviteLink: details.group.inviteLink ?? null,
        });
        await AsyncStorage.setItem(consumedKey, "1");
      } catch {
        // The wallpaper must never block a chat if group onboarding cannot be loaded.
      }
    };
    void loadIntro();
    return () => { active = false; };
  }, [route.params?.conversationId, user?.profileId]);

  return <>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 360 640" preserveAspectRatio="none">
        <Rect width="360" height="640" fill={base}/>
        {marks.map(([x,y,rotation],index)=><Mark key={index} x={x} y={y} rotation={rotation} stroke={stroke}/>)}
        <G opacity={0.10} stroke={stroke} strokeWidth="1.4" fill="none"><Path d="M46 90c8-8 20-8 28 0s8 20 0 28"/><Path d="M272 94c8-8 20-8 28 0s8 20 0 28"/><Path d="M92 430c8-8 20-8 28 0s8 20 0 28"/><Path d="M274 548c8-8 20-8 28 0s8 20 0 28"/></G>
      </Svg>
    </View>
    {intro ? <GroupIntroCard intro={intro} onConsumed={() => setIntro(null)} /> : null}
  </>;
}

const styles = StyleSheet.create({
  introLayer: { position: "absolute", left: 0, right: 0, top: 72, alignItems: "center", zIndex: 20 },
  card: { width: "88%", borderRadius: 26, backgroundColor: "rgba(255,255,255,0.97)", paddingHorizontal: 22, paddingVertical: 28, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  logo: { alignItems: "center", justifyContent: "center", marginBottom: 12 },
  logoR: { fontSize: 58, lineHeight: 58, fontWeight: "800", color: "#1877F2" },
  logoWord: { marginTop: -8, fontSize: 15, fontWeight: "700", color: "#1877F2" },
  heading: { marginTop: 4, fontSize: 25, lineHeight: 31, fontWeight: "700", color: "#111827", textAlign: "center" },
  meta: { marginTop: 7, fontSize: 18, lineHeight: 24, color: "#667085", textAlign: "center" },
  description: { marginTop: 18, maxWidth: 300, fontSize: 16, lineHeight: 23, color: "#667085", textAlign: "center" },
  actionButton: { width: "100%", minHeight: 60, marginTop: 13, borderWidth: 1.4, borderColor: "#D0D5DD", borderRadius: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  actionIcon: { marginRight: 10, fontSize: 22, color: "#187A55" },
  actionText: { fontSize: 17, fontWeight: "600", color: "#187A55" },
});
