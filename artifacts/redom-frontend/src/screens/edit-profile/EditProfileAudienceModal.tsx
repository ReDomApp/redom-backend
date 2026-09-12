import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import GlobeIcon from "../../assets/edit-profile/globe.svg";
import FriendsIcon from "../../assets/edit-profile/audience-friends.svg";
import FriendsOfFriendsIcon from "../../assets/edit-profile/audience-friends-of-friends.svg";

export type Privacy = "public" | "friends_of_friends" | "friends" | "only_me" | "custom";
const baseOptions = [
  { value: "public" as Privacy, title: "Public", description: "Anyone on or off ReDom", icon: GlobeIcon },
  { value: "friends_of_friends" as Privacy, title: "Friends of friends", description: "Your friends of friends", icon: FriendsOfFriendsIcon },
  { value: "friends" as Privacy, title: "Friends", description: "Your friends on ReDom", icon: FriendsIcon },
];
const extraOptions = [
  { value: "only_me" as Privacy, title: "Only Me", description: "Only you", icon: GlobeIcon },
  { value: "custom" as Privacy, title: "Custom", description: "Create your list", icon: FriendsIcon },
];
export const privacyLabel = (value: Privacy) => [...baseOptions, ...extraOptions].find((item) => item.value === value)?.title || "Public";

export function EditProfileAudienceModal({ visible, value, onChange, onDone }: { visible: boolean; value: Privacy; onChange: (value: Privacy) => void; onDone: () => void }) {
  const [expanded, setExpanded] = useState(value === "only_me" || value === "custom");
  const choose = (next: Privacy) => {
    if (next === "custom") {
      Alert.alert("Feature unavailable", "This feature is unavailable in your location for now.");
      return;
    }
    onChange(next);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Choose audience</Text>
          {baseOptions.map((item) => <AudienceOption key={item.value} item={item} selected={value === item.value} onPress={() => choose(item.value)} />)}
          <Pressable style={styles.moreRow} onPress={() => setExpanded((current) => !current)}><Text style={styles.moreText}>See all</Text><Text style={styles.moreChevron}>{expanded ? "⌃" : "⌄"}</Text></Pressable>
          {expanded ? extraOptions.map((item) => <AudienceOption key={item.value} item={item} selected={value === item.value} onPress={() => choose(item.value)} />) : null}
          <Pressable style={styles.done} onPress={onDone}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AudienceOption({ item, selected, onPress }: { item: { value: Privacy; title: string; description: string; icon: typeof GlobeIcon }; selected: boolean; onPress: () => void }) {
  const Icon = item.icon;
  return <Pressable style={styles.option} onPress={onPress}><View style={styles.iconBox}><Icon width={30} height={30} /></View><View style={styles.copy}><Text style={styles.optionTitle}>{item.title}</Text><Text style={styles.description}>{item.description}</Text></View><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 28 },
  grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 3, backgroundColor: "#CCD0D5", marginBottom: 18 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: "800", color: "#050505", marginBottom: 8 },
  option: { minHeight: 72, flexDirection: "row", alignItems: "center" },
  iconBox: { width: 48, alignItems: "flex-start" },
  copy: { flex: 1, paddingRight: 10 },
  optionTitle: { fontSize: 17, fontWeight: "800", color: "#050505" },
  description: { fontSize: 14, color: "#65676B", marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#8A8D91", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#1877F2" },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#1877F2" },
  moreRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moreText: { fontSize: 16, fontWeight: "700", color: "#050505" },
  moreChevron: { fontSize: 25, fontWeight: "800" },
  done: { height: 48, borderRadius: 8, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 10 },
  doneText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
