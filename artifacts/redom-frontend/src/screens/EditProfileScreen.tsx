import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { api } from "../api/client";
import BackIcon from "../assets/edit-profile/back.svg";
import AboutIcon from "../assets/edit-profile/about.svg";
import PinIcon from "../assets/edit-profile/pin.svg";
import LocationIcon from "../assets/edit-profile/location.svg";
import HometownIcon from "../assets/edit-profile/hometown.svg";
import BirthdayIcon from "../assets/edit-profile/birthday.svg";
import RelationshipIcon from "../assets/edit-profile/relationship.svg";
import FamilyIcon from "../assets/edit-profile/family.svg";
import GenderIcon from "../assets/edit-profile/gender.svg";
import LanguagesIcon from "../assets/edit-profile/languages.svg";
import WorkIcon from "../assets/edit-profile/work.svg";
import EducationIcon from "../assets/edit-profile/education.svg";
import PencilIcon from "../assets/edit-profile/pencil.svg";
import { privacyLabel, type Privacy } from "./edit-profile/EditProfileAudienceModal";

type Props = NativeStackScreenProps<RootStackParamList, "EditProfile">;
type EditData = { firstName: string; lastName: string; bio: string; currentCity: string; hometown: string; birthday: string | null; gender: string | null; bioPrivacy: string; currentCityPrivacy: string; hometownPrivacy: string; birthdayMonthDayPrivacy: string; birthdayYearPrivacy: string };
type SectionName = "intro" | "personal" | "work" | "education";

const unavailable = () => Alert.alert("Feature unavailable", "This feature is unavailable in your location for now.");

export function EditProfileScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.86, width / 412));
  const styles = useMemo(() => makeStyles(scale), [scale]);
  const [data, setData] = useState<EditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<SectionName, boolean>>({ intro: true, personal: true, work: true, education: true });

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ success: boolean; profile: EditData }>("/profile/edit");
      setData(response.profile);
    } catch {
      Alert.alert("Edit profile", "Unable to load your profile right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading || !data) {
    return <SafeAreaView style={styles.root}><Header onBack={() => navigation.goBack()} /><Text style={styles.loading}>Loading...</Text></SafeAreaView>;
  }

  const birthday = data.birthday
    ? new Date(data.birthday).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  const toggle = (section: SectionName) => setOpen((current) => ({ ...current, [section]: !current[section] }));
  const row = (icon: JSX.Element, title: string, value: string | undefined, action?: () => void, disabled = false, privacy?: string) => (
    <Pressable style={styles.row} onPress={disabled ? unavailable : action} disabled={!action && !disabled} accessibilityRole={action || disabled ? "button" : undefined}>
      <View style={styles.iconBox}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, (!value || disabled) && styles.muted]} numberOfLines={1}>{title}</Text>
        {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
        {value && privacy ? <Text style={styles.privacy} numberOfLines={1}>{privacyLabel(privacy as Privacy)}</Text> : null}
      </View>
      {action && !disabled ? <PencilIcon width={28} height={28} /> : null}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.root}>
      <Header onBack={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Section title="Intro" open={open.intro} onPress={() => toggle("intro")} />
        {open.intro ? <>
          {row(<AboutIcon width={38} height={38} />, "About you", data.bio || undefined, () => navigation.navigate("EditBio"))}
          {row(<PinIcon width={38} height={38} />, "Pinned details", data.currentCity || data.hometown || undefined, unavailable, false, data.currentCity ? data.currentCityPrivacy : data.hometownPrivacy)}
        </> : null}

        <Section title="Personal details" open={open.personal} onPress={() => toggle("personal")} />
        {open.personal ? <>
          {row(<LocationIcon width={38} height={38} />, "Current city", data.currentCity || undefined, () => navigation.navigate("EditLocationSearch", { kind: "location" }), false, data.currentCityPrivacy)}
          {row(<HometownIcon width={38} height={38} />, "Hometown", data.hometown || undefined, () => navigation.navigate("EditLocationSearch", { kind: "hometown" }), false, data.hometownPrivacy)}
          {row(<BirthdayIcon width={38} height={38} />, birthday || "Birthday", undefined, () => navigation.navigate("EditBirthday"), false, `${privacyLabel(data.birthdayMonthDayPrivacy as Privacy)} / ${privacyLabel(data.birthdayYearPrivacy as Privacy)}`)}
          {row(<RelationshipIcon width={38} height={38} />, "Relationship status", undefined, unavailable)}
          {row(<FamilyIcon width={38} height={38} />, "Family", undefined, unavailable)}
          {row(<GenderIcon width={38} height={38} />, data.gender ? String(data.gender) : "Gender", undefined, undefined, true)}
          {row(<LanguagesIcon width={38} height={38} />, "Languages", undefined, unavailable)}
        </> : null}

        <Section title="Work" open={open.work} onPress={() => toggle("work")} />
        {open.work ? row(<WorkIcon width={38} height={38} />, "Work experience", undefined, unavailable) : null}

        <Section title="Education" open={open.education} onPress={() => toggle("education")} />
        {open.education ? row(<EducationIcon width={38} height={38} />, "High school or college", undefined, unavailable) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return <View style={styles.header}><Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back"><BackIcon width={34} height={34} /></Pressable><Text style={styles.headerTitle}>Edit profile</Text><View style={styles.headerSpacer} /></View>;
}

function Section({ title, open, onPress }: { title: string; open: boolean; onPress: () => void }) {
  return <Pressable style={styles.section} onPress={onPress} accessibilityRole="button"><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.chevron}>{open ? "⌃" : "⌄"}</Text></Pressable>;
}

function makeStyles(scale: number) {
  const n = (value: number) => Math.round(value * scale);
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { height: n(56), flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: n(16) },
  headerTitle: { fontSize: n(23), lineHeight: n(28), fontWeight: "800", color: "#050505" },
  headerSpacer: { width: n(28) },
  content: { paddingBottom: 32 },
  section: { minHeight: n(58), paddingHorizontal: n(16), paddingTop: n(10), paddingBottom: n(6), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: n(22), lineHeight: n(27), fontWeight: "800", color: "#050505" },
  chevron: { fontSize: n(27), lineHeight: n(28), fontWeight: "800", color: "#050505", marginRight: 2 },
  row: { minHeight: n(68), paddingHorizontal: n(16), flexDirection: "row", alignItems: "center" },
  iconBox: { width: n(46), alignItems: "flex-start", justifyContent: "center" },
  rowText: { flex: 1, paddingRight: n(8) },
  rowTitle: { fontSize: n(18), lineHeight: n(23), fontWeight: "800", color: "#050505" },
  value: { marginTop: 3, fontSize: n(15), lineHeight: n(19), color: "#050505" },
  muted: { color: "#65676B" },
  privacy: { marginTop: 2, color: "#65676B", fontSize: n(13), lineHeight: n(17) },
  loading: { padding: n(20), color: "#65676B", fontSize: n(16) },
  });
}
