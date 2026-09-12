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
type IconComponent = React.ComponentType<{ width?: number; height?: number }>;

const unavailable = () => Alert.alert("Feature unavailable", "This feature is unavailable in your location for now.");

export function EditProfileScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.84, width / 430));
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

  if (loading || !data) return <SafeAreaView style={styles.root}><Header styles={styles} onBack={() => navigation.goBack()} /><Text style={styles.loading}>Loading...</Text></SafeAreaView>;

  const birthday = data.birthday ? new Date(data.birthday).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  const toggle = (section: SectionName) => setOpen(current => ({ ...current, [section]: !current[section] }));
  const row = (Icon: IconComponent, title: string, value: string | undefined, action?: () => void, disabled = false, privacy?: string) => (
    <Pressable style={styles.row} onPress={disabled ? unavailable : action} disabled={!action && !disabled} accessibilityRole={action || disabled ? "button" : undefined}>
      <View style={styles.leading}><Icon width={22} height={22} /></View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, (!value || disabled) && styles.muted]} numberOfLines={1}>{title}</Text>
        {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
        {value && privacy ? <Text style={styles.privacy} numberOfLines={1}>{privacyLabel(privacy as Privacy)}</Text> : null}
      </View>
      {action && !disabled ? <PencilIcon width={18} height={18} /> : null}
    </Pressable>
  );

  return <SafeAreaView style={styles.root}>
    <Header styles={styles} onBack={() => navigation.goBack()} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <Section title="Intro" open={open.intro} onPress={() => toggle("intro")} styles={styles} />
      {open.intro ? <>
        {row(AboutIcon, "About you", data.bio || undefined, () => navigation.navigate("EditBio"), false, data.bioPrivacy)}
        {row(PinIcon, "Pinned details", data.currentCity || data.hometown || undefined, unavailable, false, data.currentCity ? data.currentCityPrivacy : data.hometownPrivacy)}
      </> : null}
      <Section title="Personal details" open={open.personal} onPress={() => toggle("personal")} styles={styles} />
      {open.personal ? <>
        {row(LocationIcon, "Current city", data.currentCity || undefined, () => navigation.navigate("EditLocationSearch", { kind: "location" }), false, data.currentCityPrivacy)}
        {row(HometownIcon, "Hometown", data.hometown || undefined, () => navigation.navigate("EditLocationSearch", { kind: "hometown" }), false, data.hometownPrivacy)}
        {row(BirthdayIcon, birthday || "Birthday", birthday || undefined, () => navigation.navigate("EditBirthday"), false, `${privacyLabel(data.birthdayMonthDayPrivacy as Privacy)} / ${privacyLabel(data.birthdayYearPrivacy as Privacy)}`)}
        {row(RelationshipIcon, "Relationship status", undefined, unavailable)}
        {row(FamilyIcon, "Family", undefined, unavailable)}
        {row(GenderIcon, data.gender ? String(data.gender) : "Gender", undefined, undefined, true)}
        {row(LanguagesIcon, "Languages", undefined, unavailable)}
      </> : null}
      <Section title="Work" open={open.work} onPress={() => toggle("work")} styles={styles} />
      {open.work ? row(WorkIcon, "Work experience", undefined, unavailable) : null}
      <Section title="Education" open={open.education} onPress={() => toggle("education")} styles={styles} />
      {open.education ? row(EducationIcon, "High school or college", undefined, unavailable) : null}
    </ScrollView>
  </SafeAreaView>;
}

function Header({ onBack, styles }: { onBack: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.header}><Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back"><BackIcon width={26} height={26} /></Pressable><Text style={styles.headerTitle}>Edit profile</Text><View style={styles.headerSpacer} /></View>;
}

function Section({ title, open, onPress, styles }: { title: string; open: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable style={styles.section} onPress={onPress} accessibilityRole="button"><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.chevron}>{open ? "⌃" : "⌄"}</Text></Pressable>;
}

function makeStyles(scale: number) {
  const n = (v: number) => Math.round(v * scale);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: "#FFFFFF" },
    header: { height: n(58), paddingHorizontal: n(18), flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF" },
    headerTitle: { fontSize: n(22), lineHeight: n(27), fontWeight: "700", color: "#050505" },
    headerSpacer: { width: n(26) },
    content: { paddingBottom: n(30) },
    section: { minHeight: n(55), paddingHorizontal: n(22), paddingTop: n(13), paddingBottom: n(5), flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { fontSize: n(18), lineHeight: n(23), fontWeight: "700", color: "#050505" },
    chevron: { width: n(20), textAlign: "center", fontSize: n(25), lineHeight: n(22), fontWeight: "700", color: "#050505" },
    row: { minHeight: n(74), paddingHorizontal: n(22), paddingVertical: n(10), flexDirection: "row", alignItems: "center" },
    leading: { width: n(40), marginRight: n(12), alignItems: "flex-start", justifyContent: "center" },
    rowCopy: { flex: 1, minWidth: 0, paddingRight: n(8) },
    rowTitle: { fontSize: n(16), lineHeight: n(21), fontWeight: "600", color: "#050505" },
    value: { marginTop: n(2), fontSize: n(14), lineHeight: n(19), fontWeight: "400", color: "#050505" },
    privacy: { marginTop: n(1), fontSize: n(14), lineHeight: n(18), color: "#65676B", fontWeight: "400" },
    muted: { color: "#65676B" },
    loading: { padding: n(22), color: "#65676B", fontSize: n(15) },
  });
}
