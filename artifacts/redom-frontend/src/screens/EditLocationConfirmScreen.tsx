import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { api } from "../api/client";
import BackIcon from "../assets/edit-profile/back.svg";
import GlobeIcon from "../assets/edit-profile/globe.svg";
import { EditProfileAudienceModal, type Privacy, privacyLabel } from "./edit-profile/EditProfileAudienceModal";
import { SavingOverlay } from "./edit-profile/SavingOverlay";

type Props = NativeStackScreenProps<RootStackParamList, "EditLocationConfirm">;

export function EditLocationConfirmScreen({ navigation, route }: Props) {
  const [location, setLocation] = useState(route.params.result);
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [audience, setAudience] = useState(false);
  const [saving, setSaving] = useState(false);
  const isHometown = route.params.kind === "hometown";

  useEffect(() => {
    void api.get<any>("/profile/edit").then((response) => {
      setPrivacy(isHometown ? (response.profile.hometownPrivacy || "public") : (response.profile.currentCityPrivacy || "public"));
    }).catch(() => undefined);
  }, [isHometown]);

  const save = async () => {
    if (!location.trim() || saving) return;
    setSaving(true);
    try {
      await api.patch("/profile/edit/details", isHometown
        ? { hometown: location.trim(), hometown_privacy: privacy }
        : { current_city: location.trim(), current_city_privacy: privacy });
      navigation.navigate("Profile");
    } catch {
      Alert.alert(isHometown ? "Hometown" : "Location", "Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()} hitSlop={12}><BackIcon width={34} height={34} /></Pressable><Text style={styles.title}>{isHometown ? "Hometown" : "Location"}</Text><View style={styles.spacer} /></View>
    <View style={styles.content}>
      <Text style={styles.label}>{isHometown ? "Hometown" : "Location"}</Text>
      <TextInput value={location} onChangeText={setLocation} style={styles.input} autoFocus selectTextOnFocus placeholder={isHometown ? "Hometown" : "Location"} placeholderTextColor="#8A8D91" />
      <Pressable style={styles.audience} onPress={() => setAudience(true)}><GlobeIcon width={27} height={27} /><View style={styles.audienceCopy}><Text style={styles.audienceTitle}>Who can see this?</Text><Text style={styles.audienceValue}>{privacyLabel(privacy)}</Text></View><Text style={styles.arrow}>›</Text></Pressable>
      <Pressable disabled={!location.trim() || saving} onPress={() => void save()} style={[styles.save, (!location.trim() || saving) && styles.disabled]}><Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text></Pressable>
    </View>
    <EditProfileAudienceModal visible={audience} value={privacy} onChange={setPrivacy} onDone={() => setAudience(false)} />
    <SavingOverlay visible={saving} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" },
  title: { fontSize: 25, fontWeight: "800", color: "#050505" }, spacer: { width: 34 },
  content: { padding: 24 }, label: { fontSize: 17, fontWeight: "800", color: "#050505", marginBottom: 10 },
  input: { height: 54, borderWidth: 1, borderColor: "#CCD0D5", borderRadius: 9, paddingHorizontal: 14, fontSize: 19, color: "#050505" },
  audience: { minHeight: 72, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", marginTop: 20 },
  audienceCopy: { flex: 1, marginLeft: 13 }, audienceTitle: { fontSize: 16, fontWeight: "800", color: "#050505" }, audienceValue: { fontSize: 14, color: "#65676B", marginTop: 3 }, arrow: { fontSize: 31, color: "#65676B" },
  save: { height: 50, borderRadius: 8, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 28 }, disabled: { opacity: 0.45 }, saveText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
