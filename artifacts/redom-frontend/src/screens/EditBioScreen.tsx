import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { api } from "../api/client";
import BackIcon from "../assets/edit-profile/back.svg";
import GlobeIcon from "../assets/edit-profile/globe.svg";
import { EditProfileAudienceModal, type Privacy, privacyLabel } from "./edit-profile/EditProfileAudienceModal";
import { SavingOverlay } from "./edit-profile/SavingOverlay";

type Props = NativeStackScreenProps<RootStackParamList, "EditBio">;

export function EditBioScreen({ navigation }: Props) {
  const [text, setText] = useState("");
  const [initial, setInitial] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [audience, setAudience] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<any>("/profile/edit").then((response) => {
      const bio = response.profile.bio || "";
      setText(bio); setInitial(bio); setPrivacy(response.profile.bioPrivacy || "public");
    }).catch(() => Alert.alert("About you", "Unable to load your bio right now."));
  }, []);

  const save = async () => {
    if (text === initial || saving) return;
    setSaving(true);
    try {
      await api.patch("/profile/edit/details", { bio: text, bio_privacy: privacy });
      navigation.navigate("Profile");
    } catch {
      Alert.alert("About you", "Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={styles.root}>
    <Header onBack={() => navigation.goBack()} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>About you</Text>
      <Text style={styles.label}>Introduce yourself</Text>
      <View style={styles.inputFrame}>
        <TextInput multiline maxLength={101} value={text} onChangeText={setText} placeholder="Introduce yourself" placeholderTextColor="#8A8D91" style={styles.input} textAlignVertical="top" />
        <Text style={styles.counter}>{text.length}/101</Text>
      </View>
      <Pressable style={styles.audience} onPress={() => setAudience(true)}>
        <GlobeIcon width={27} height={27} /><View style={styles.audienceCopy}><Text style={styles.audienceTitle}>Who can see this?</Text><Text style={styles.audienceValue}>{privacyLabel(privacy)}</Text></View><Text style={styles.arrow}>›</Text>
      </Pressable>
      <Pressable disabled={text === initial || saving} onPress={() => void save()} style={[styles.save, (text === initial || saving) && styles.saveDisabled]}><Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text></Pressable>
    </ScrollView>
    <EditProfileAudienceModal visible={audience} value={privacy} onChange={setPrivacy} onDone={() => setAudience(false)} />
    <SavingOverlay visible={saving} />
  </SafeAreaView>;
}

function Header({ onBack }: { onBack: () => void }) { return <View style={styles.header}><Pressable onPress={onBack} hitSlop={12}><BackIcon width={34} height={34} /></Pressable><Text style={styles.title}>Edit profile</Text><View style={styles.spacer} /></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" },
  title: { fontSize: 25, fontWeight: "800", color: "#050505" }, spacer: { width: 34 },
  content: { padding: 24, paddingBottom: 40 },
  heading: { fontSize: 27, fontWeight: "800", color: "#050505", marginBottom: 28 },
  label: { fontSize: 17, fontWeight: "800", color: "#050505", marginBottom: 10 },
  inputFrame: { borderWidth: 1, borderColor: "#CCD0D5", borderRadius: 10, minHeight: 170, padding: 14 },
  input: { minHeight: 125, fontSize: 19, lineHeight: 25, color: "#050505", padding: 0 },
  counter: { textAlign: "right", color: "#65676B", fontSize: 13, marginTop: 7 },
  audience: { minHeight: 72, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  audienceCopy: { flex: 1, marginLeft: 13 }, audienceTitle: { fontSize: 16, fontWeight: "800", color: "#050505" }, audienceValue: { fontSize: 14, color: "#65676B", marginTop: 3 }, arrow: { fontSize: 31, color: "#65676B" },
  save: { height: 50, borderRadius: 8, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 28 }, saveDisabled: { opacity: 0.45 }, saveText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
