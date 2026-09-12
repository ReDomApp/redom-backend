import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import BackIcon from "../assets/edit-profile/back.svg";
import RestyleIcon from "../assets/profile-media/restyle.svg";
import TemporaryIcon from "../assets/home-feed/recent-ad-activity.svg";
import CropIcon from "../assets/profile-media/crop.svg";
import InfoIcon from "../assets/profile-media/info.svg";
import { api } from "../api/client";

type Props = NativeStackScreenProps<RootStackParamList, "ProfilePicturePreview">;
type Temp = "permanent" | "1h" | "24h" | "7d";

export function ProfilePicturePreviewScreen({ navigation, route }: Props) {
  const [caption, setCaption] = useState("");
  const [temporaryOpen, setTemporaryOpen] = useState(false);
  const [temporary, setTemporary] = useState<Temp>("permanent");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const styles = useMemo(() => makeStyles(), []);
  const wordCount = caption.trim() ? caption.trim().split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    if (!saving) return;
    const timer = setInterval(() => setProgress(p => Math.min(94, p + 1)), 80);
    return () => clearInterval(timer);
  }, [saving]);

  const save = async () => {
    if (wordCount > 20) { Alert.alert("Caption too long", "Use no more than 20 words."); return; }
    if (!route.params.base64) { Alert.alert("Profile picture", "The selected image could not be prepared."); return; }
    setSaving(true); setProgress(1);
    try {
      await api.post("/profile/media/upload", { kind: "profile", image: `data:image/jpeg;base64,${route.params.base64}`, caption: caption.trim(), temporary, shareToFeed: true });
      setProgress(100);
      await new Promise(resolve => setTimeout(resolve, 250));
      Alert.alert("Profile Picture Uploaded!!", "Your profile picture has been updated and the profile update was added to your Feed.", [{ text: "OK", onPress: () => navigation.popToTop() }]);
    } catch (error) {
      Alert.alert("Upload failed", error instanceof Error ? error.message : "Unable to upload your profile picture.");
    } finally { setSaving(false); }
  };

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()}><BackIcon width={26} height={26} /></Pressable><Text style={styles.headerTitle}>Preview profile picture</Text><Pressable style={styles.save} onPress={() => void save()} disabled={saving}><Text style={styles.saveText}>SAVE</Text></Pressable></View>
    <View style={styles.audience}><Text style={styles.audienceText}>To: 🌐 Public</Text></View>
    <View style={styles.imageStage}><Image source={{ uri: route.params.uri }} style={styles.image} resizeMode="contain" /></View>
    <View style={styles.actions}><Pressable style={styles.actionButton} onPress={() => Alert.alert("Restyle", "Service Unavailable right now", [{ text: "OK" }])}><RestyleIcon width={22} height={22} /><Text style={styles.actionText}>Restyle</Text></Pressable><Pressable style={styles.actionButton} onPress={() => setTemporaryOpen(true)}><TemporaryIcon width={22} height={22} /><Text style={styles.actionText}>Make temporary</Text></Pressable><Pressable style={styles.actionButton} onPress={() => navigation.replace("ProfilePictureAdjust", route.params)}><CropIcon width={22} height={22} /><Text style={styles.actionText}>Adjust</Text></Pressable></View>
    <TextInput value={caption} onChangeText={setCaption} placeholder="Say something about your profile picture....." placeholderTextColor="#65676B" multiline maxLength={200} style={styles.caption} />
    <View style={styles.feedRow}><Text style={styles.feedText}>Share your update to Feed</Text><View style={styles.checked}><Text style={styles.check}>✓</Text></View></View>
    <Modal visible={temporaryOpen} transparent animationType="slide" onRequestClose={() => setTemporaryOpen(false)}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setTemporaryOpen(false)} /><View style={styles.sheet}><View style={styles.grabber} /><Text style={styles.sheetTitle}>Make profile picture temporary</Text><TempRow title="1 hr" selected={temporary === "1h"} onPress={() => { setTemporary("1h"); setTemporaryOpen(false); }} /><TempRow title="24 hr" selected={temporary === "24h"} onPress={() => { setTemporary("24h"); setTemporaryOpen(false); }} /><TempRow title="7 d" selected={temporary === "7d"} onPress={() => { setTemporary("7d"); setTemporaryOpen(false); }} /><Pressable style={styles.cancel} onPress={() => setTemporaryOpen(false)}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>
    {saving ? <View style={styles.progressOverlay}><ActivityIndicator size="large" color="#1877F2" /><Text style={styles.progressText}>{progress}% loading...</Text><Text style={styles.progressSub}>Uploading and waiting for ReDom/Neon to establish the profile update.</Text></View> : null}
  </SafeAreaView>;
}
function TempRow({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) { return <Pressable style={rowStyles.row} onPress={onPress}><TemporaryIcon width={22} height={22} /><Text style={rowStyles.text}>{title}</Text><Text style={rowStyles.radio}>{selected ? "✓" : ""}</Text></Pressable>; }
const rowStyles = StyleSheet.create({ row: { height: 58, flexDirection: "row", alignItems: "center", gap: 14 }, text: { flex: 1, fontSize: 16, color: "#050505" }, radio: { width: 24, textAlign: "center", color: "#1877F2", fontSize: 20, fontWeight: "700" } });
function makeStyles() { return StyleSheet.create({ root: { flex: 1, backgroundColor: "#fff" }, header: { height: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" }, headerTitle: { fontSize: 19, color: "#050505", fontWeight: "400" }, save: { backgroundColor: "#1877F2", borderRadius: 10, paddingHorizontal: 17, paddingVertical: 11 }, saveText: { color: "#fff", fontSize: 15, fontWeight: "700" }, audience: { height: 40, paddingHorizontal: 20, justifyContent: "center" }, audienceText: { color: "#65676B", fontSize: 15 }, imageStage: { height: 390, backgroundColor: "#222", alignItems: "center", justifyContent: "center" }, image: { width: "100%", height: "100%" }, actions: { padding: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 }, actionButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#E4E6EB", flexDirection: "row", alignItems: "center", gap: 8 }, actionText: { fontSize: 15, fontWeight: "600", color: "#050505" }, caption: { marginHorizontal: 20, minHeight: 90, borderWidth: 1, borderColor: "#CCD0D5", borderRadius: 14, padding: 14, fontSize: 16, color: "#050505", textAlignVertical: "top" }, feedRow: { margin: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, feedText: { fontSize: 17, fontWeight: "600", color: "#050505" }, checked: { width: 30, height: 30, borderRadius: 4, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }, check: { color: "#fff", fontSize: 22, fontWeight: "700" }, backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "flex-end" }, sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30 }, grabber: { width: 74, height: 5, borderRadius: 3, backgroundColor: "#8A8D91", alignSelf: "center", marginBottom: 18 }, sheetTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8, color: "#050505" }, cancel: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 6 }, cancelText: { color: "#1877F2", fontSize: 16, fontWeight: "600" }, progressOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,.96)", alignItems: "center", justifyContent: "center", padding: 30 }, progressText: { marginTop: 18, fontSize: 22, fontWeight: "700", color: "#050505" }, progressSub: { marginTop: 8, textAlign: "center", color: "#65676B", fontSize: 14, lineHeight: 20 } }); }
