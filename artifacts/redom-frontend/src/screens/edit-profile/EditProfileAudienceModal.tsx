import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import GlobeIcon from "../../assets/edit-profile/globe.svg";
import FriendsIcon from "../../assets/edit-profile/audience-friends.svg";
import FriendsOfFriendsIcon from "../../assets/edit-profile/audience-friends-of-friends.svg";

export type Privacy = "public" | "friends_of_friends" | "friends" | "only_me" | "custom";

const options: Array<{ value: Privacy; title: string; description: string; icon: typeof GlobeIcon }> = [
  { value: "public", title: "Public", description: "Anyone on or off ReDom", icon: GlobeIcon },
  { value: "friends_of_friends", title: "Friends of friends", description: "Your friends of friends", icon: FriendsOfFriendsIcon },
  { value: "friends", title: "Friends", description: "Your friends on ReDom", icon: FriendsIcon },
  { value: "only_me", title: "Only Me", description: "Only you", icon: GlobeIcon },
  { value: "custom", title: "Custom", description: "Choose specific people", icon: FriendsIcon },
];

export const privacyLabel = (value: Privacy) => options.find((item) => item.value === value)?.title || "Public";

export function EditProfileAudienceModal({ visible, value, onChange, onDone }: { visible: boolean; value: Privacy; onChange: (value: Privacy) => void; onDone: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Choose audience</Text>
          {options.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.value}
                style={styles.option}
                onPress={() => {
                  if (item.value === "custom") return;
                  onChange(item.value);
                }}
              >
                <View style={styles.iconBox}><Icon width={30} height={30} /></View>
                <View style={styles.copy}>
                  <Text style={styles.optionTitle}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </View>
                <View style={[styles.radio, value === item.value && styles.radioSelected]}>{value === item.value ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
          <Pressable style={styles.done} onPress={onDone}><Text style={styles.doneText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
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
  done: { height: 48, borderRadius: 8, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 10 },
  doneText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
