import { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { api } from "../api/client";
import BackIcon from "../assets/edit-profile/back.svg";
import BirthdayIcon from "../assets/edit-profile/birthday.svg";
import GlobeIcon from "../assets/edit-profile/globe.svg";
import { EditProfileAudienceModal, type Privacy, privacyLabel } from "./edit-profile/EditProfileAudienceModal";
import { SavingOverlay } from "./edit-profile/SavingOverlay";

type Props = NativeStackScreenProps<RootStackParamList, "EditBirthday">;

export function EditBirthdayScreen({ navigation }: Props) {
  const [birthday, setBirthday] = useState<string | null>(null);
  const [monthDay, setMonthDay] = useState<Privacy>("friends_of_friends");
  const [year, setYear] = useState<Privacy>("friends_of_friends");
  const [initialMonthDay, setInitialMonthDay] = useState<Privacy>("friends_of_friends");
  const [initialYear, setInitialYear] = useState<Privacy>("friends_of_friends");
  const [target, setTarget] = useState<"month" | "year" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<any>("/profile/edit").then((response) => {
      const md = response.profile.birthdayMonthDayPrivacy || "friends_of_friends";
      const yr = response.profile.birthdayYearPrivacy || "friends_of_friends";
      setBirthday(response.profile.birthday); setMonthDay(md); setYear(yr); setInitialMonthDay(md); setInitialYear(yr);
    }).catch(() => Alert.alert("Birthday", "Unable to load birthday settings right now."));
  }, []);

  const save = async () => {
    if (saving || (monthDay === initialMonthDay && year === initialYear)) return;
    setSaving(true);
    try {
      await api.patch("/profile/edit/details", { birthday_month_day_privacy: monthDay, birthday_year_privacy: year });
      navigation.navigate("Profile");
    } catch {
      Alert.alert("Birthday", "Your changes could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const date = birthday ? new Date(birthday) : null;
  const dayMonthValue = date ? date.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "";
  const yearValue = date ? String(date.getFullYear()) : "";
  const changed = monthDay !== initialMonthDay || year !== initialYear;

  return <SafeAreaView style={styles.root}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()} hitSlop={12}><BackIcon width={34} height={34} /></Pressable><Text style={styles.title}>Birthday</Text><View style={styles.spacer} /></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.lockedHeader}><BirthdayIcon width={32} height={32} /><Text style={styles.lockedHeaderText}>Birthday</Text></View>
      <Text style={styles.sectionLabel}>Month and day</Text>
      <Pressable style={styles.audience} onPress={() => setTarget("month")}><GlobeIcon width={25} height={25} /><Text style={styles.audienceText}>{privacyLabel(monthDay)}</Text><Text style={styles.down}>▾</Text></Pressable>
      <View style={styles.locked}><Text style={styles.lockedTitle}>Month and day</Text><Text style={styles.lockedValue}>{dayMonthValue}</Text></View>
      <Text style={styles.sectionLabel}>Year</Text>
      <Pressable style={styles.audience} onPress={() => setTarget("year")}><GlobeIcon width={25} height={25} /><Text style={styles.audienceText}>{privacyLabel(year)}</Text><Text style={styles.down}>▾</Text></Pressable>
      <View style={styles.locked}><Text style={styles.lockedTitle}>Year</Text><Text style={styles.lockedValue}>{yearValue}</Text></View>
      <Pressable style={styles.editBirthday} onPress={() => Alert.alert("Edit your birthday", "You can edit your birthday in Accounts Center.")}><View><Text style={styles.editTitle}>Edit your birthday?</Text><Text style={styles.editDescription}>You can edit your birthday in Accounts Center.</Text></View><Text style={styles.arrow}>›</Text></Pressable>
      <Pressable disabled={!changed || saving} onPress={() => void save()} style={[styles.save, (!changed || saving) && styles.disabled]}><Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text></Pressable>
    </ScrollView>
    <EditProfileAudienceModal visible={!!target} value={target === "year" ? year : monthDay} onChange={(value) => target === "year" ? setYear(value) : setMonthDay(value)} onDone={() => setTarget(null)} />
    <SavingOverlay visible={saving} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "#F0F2F5" },
  title: { fontSize: 25, fontWeight: "800", color: "#050505" }, spacer: { width: 34 },
  content: { padding: 24, paddingBottom: 40 },
  lockedHeader: { flexDirection: "row", alignItems: "center", marginBottom: 28 }, lockedHeaderText: { fontSize: 22, fontWeight: "800", marginLeft: 12, color: "#050505" },
  sectionLabel: { fontSize: 17, fontWeight: "800", color: "#050505", marginTop: 6, marginBottom: 2 },
  audience: { height: 50, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#E4E6EB" }, audienceText: { flex: 1, fontSize: 16, fontWeight: "700", color: "#65676B", marginLeft: 12 }, down: { fontSize: 19, color: "#65676B" },
  locked: { minHeight: 70, borderWidth: 1, borderColor: "#E4E6EB", backgroundColor: "#F0F2F5", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 }, lockedTitle: { fontSize: 13, color: "#65676B" }, lockedValue: { fontSize: 18, fontWeight: "700", color: "#65676B", marginTop: 4 },
  editBirthday: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", marginTop: 24 }, editTitle: { fontSize: 17, fontWeight: "800", color: "#050505" }, editDescription: { fontSize: 14, color: "#65676B", marginTop: 4, maxWidth: 290 }, arrow: { fontSize: 31, color: "#65676B" },
  save: { height: 50, borderRadius: 8, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", marginTop: 28 }, disabled: { opacity: 0.45 }, saveText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
