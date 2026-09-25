import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Circle, Path, Rect, Line } from "react-native-svg";
import type { RootStackParamList } from "../routing/types";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

type IconName =
  | "account"
  | "privacy"
  | "family"
  | "audience"
  | "sliders"
  | "reaction"
  | "bell"
  | "accessibility"
  | "pin"
  | "globe"
  | "media"
  | "clock"
  | "browser"
  | "moon"
  | "camera"
  | "flask"
  | "lock"
  | "profile"
  | "pro"
  | "contact"
  | "posts"
  | "stories"
  | "reels"
  | "followers"
  | "tag"
  | "blocking"
  | "active"
  | "payment"
  | "activity"
  | "device"
  | "apps"
  | "business"
  | "learn"
  | "terms"
  | "cookies";

export function SettingsScreen() {
  const navigation = useNavigation<Navigation>();

  const underDevelopment = (title: string) => {
    Alert.alert(title, "This section is under development.");
  };

  const navigate = (route: keyof RootStackParamList) => {
    navigation.navigate(route as never);
  };

  const policy = (slug: RootStackParamList["Policy"]["slug"]) => {
    navigation.navigate("Policy", { slug });
  };

  const rows = {
    tools: [
      { label: "Privacy Checkup", icon: "privacy" as IconName, onPress: () => underDevelopment("Privacy Checkup") },
      { label: "Family Center", icon: "family" as IconName, onPress: () => underDevelopment("Family Center") },
      { label: "Default audience settings", icon: "audience" as IconName, onPress: () => navigate("PrivacySettings") },
    ],
    preferences: [
      { label: "Content preferences", icon: "sliders" as IconName, onPress: () => underDevelopment("Content preferences") },
      { label: "Reaction preferences", icon: "reaction" as IconName, onPress: () => underDevelopment("Reaction preferences") },
      { label: "Notifications", icon: "bell" as IconName, onPress: () => navigate("NotificationSettings") },
      { label: "Accessibility", icon: "accessibility" as IconName, onPress: () => underDevelopment("Accessibility") },
      { label: "Tab bar", icon: "pin" as IconName, onPress: () => underDevelopment("Tab bar") },
      { label: "Language and region", icon: "globe" as IconName, onPress: () => navigate("Language") },
      { label: "Media", icon: "media" as IconName, onPress: () => underDevelopment("Media") },
      { label: "Time management", icon: "clock" as IconName, onPress: () => underDevelopment("Time management") },
      { label: "Browser", icon: "browser" as IconName, onPress: () => underDevelopment("Browser") },
      { label: "Dark mode", icon: "moon" as IconName, onPress: () => navigate("DarkMode") },
      { label: "Camera roll sharing suggestions", icon: "camera" as IconName, onPress: () => underDevelopment("Camera roll sharing suggestions") },
      { label: "Early access to features", icon: "flask" as IconName, onPress: () => underDevelopment("Early access to features") },
    ],
    audience: [
      { label: "Profile locking", icon: "lock" as IconName, onPress: () => underDevelopment("Profile locking") },
      { label: "Profile details", icon: "profile" as IconName, onPress: () => navigate("EditProfile") },
      { label: "Turn on pro mode", icon: "pro" as IconName, onPress: () => underDevelopment("Turn on pro mode") },
      { label: "How people find and contact you", icon: "contact" as IconName, onPress: () => underDevelopment("How people find and contact you") },
      { label: "Posts", icon: "posts" as IconName, onPress: () => underDevelopment("Posts") },
      { label: "Stories", icon: "stories" as IconName, onPress: () => underDevelopment("Stories") },
      { label: "Reels", icon: "reels" as IconName, onPress: () => underDevelopment("Reels") },
      { label: "Followers and public content", icon: "followers" as IconName, onPress: () => underDevelopment("Followers and public content") },
      { label: "Profile and tagging", icon: "tag" as IconName, onPress: () => underDevelopment("Profile and tagging") },
      { label: "Blocking", icon: "blocking" as IconName, onPress: () => navigate("BlockedUsers") },
      { label: "Active status", icon: "active" as IconName, onPress: () => underDevelopment("Active status") },
    ],
    activity: [
      { label: "Activity log", icon: "activity" as IconName, onPress: () => underDevelopment("Activity log") },
      { label: "Device permissions", icon: "device" as IconName, onPress: () => underDevelopment("Device permissions") },
      { label: "Apps and websites", icon: "apps" as IconName, onPress: () => underDevelopment("Apps and websites") },
      { label: "Business integrations", icon: "business" as IconName, onPress: () => underDevelopment("Business integrations") },
      { label: "Learn how to manage your information", icon: "learn" as IconName, onPress: () => underDevelopment("Learn how to manage your information") },
    ],
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Settings & privacy</Text>
        <View style={styles.headerRight}>
          <Pressable accessibilityRole="button" accessibilityLabel="Search settings" hitSlop={8} onPress={() => underDevelopment("Search settings")}>
            <SearchIcon />
          </Pressable>
          <View style={styles.avatar}>
            <ProfileIcon stroke="#1877F2" />
          </View>
          <Text style={styles.avatarChevron}>⌄</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.searchBox}>
          <Text style={styles.searchPlaceholder}>Search settings</Text>
        </View>

        <SectionTitle title="Your account" />
        <SettingRow
          label="Accounts Center"
          description="Password, security, personal details, connected experiences, ad preferences, verification"
          icon="account"
          onPress={() => underDevelopment("Accounts Center")}
        />

        <SectionTitle title="Tools and resources" description="Our tools help you control and manage your privacy." />
        {rows.tools.map((row) => <SettingRow key={row.label} {...row} />)}

        <SectionTitle title="Preferences" description="Customize your experience on ReDom." />
        {rows.preferences.map((row) => <SettingRow key={row.label} {...row} />)}

        <SectionTitle title="Audience and visibility" description="Control who can see what you share on ReDom." />
        {rows.audience.map((row) => <SettingRow key={row.label} {...row} />)}

        <SectionTitle title="Payments" description="Manage your payment info and activity." />
        <SettingRow label="Ads payments" icon="payment" onPress={() => underDevelopment("Ads payments")} />

        <SectionTitle title="Your activity" description="Review your activity and content you're tagged in." />
        {rows.activity.map((row) => <SettingRow key={row.label} {...row} />)}

        <SectionTitle title="Community Standards and legal policies" />
        <SettingRow label="Terms of Service" icon="terms" onPress={() => policy("terms")} />
        <SettingRow label="Privacy Policy" icon="privacy" onPress={() => policy("privacy")} />
        <SettingRow label="Cookies policy" icon="cookies" onPress={() => underDevelopment("Cookies policy")} />

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
    </View>
  );
}

function SettingRow({
  label,
  description,
  icon,
  onPress,
}: {
  label: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.iconWrap}><SettingIcon name={icon} /></View>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

function SettingIcon({ name }: { name: IconName }) {
  const common = { stroke: "#050505", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const wrap = (children: React.ReactNode) => <Svg width={31} height={31} viewBox="0 0 32 32" fill="none">{children}</Svg>;

  switch (name) {
    case "account": return wrap(<><Circle cx="16" cy="16" r="13" {...common} /><Circle cx="16" cy="12" r="4" {...common} /><Path d="M8.5 25c1.8-4 4.3-5.8 7.5-5.8s5.7 1.8 7.5 5.8" {...common} /></>);
    case "privacy": return wrap(<><Rect x="8" y="13" width="16" height="13" rx="2.5" {...common} /><Path d="M11.5 13V9a4.5 4.5 0 0 1 9 0v4" {...common} /></>);
    case "family": return wrap(<><Path d="M5 14.5 16 6l11 8.5v11H5z" {...common} /><Circle cx="12" cy="17" r="2.7" {...common} /><Circle cx="21" cy="19" r="2.2" {...common} /><Path d="M8.5 25c.7-3 2-4.5 3.5-4.5S14.8 22 15.5 25M18.5 25c.4-2 1.3-3 2.5-3s2.1 1 2.5 3" {...common} /></>);
    case "audience": return wrap(<><Circle cx="16" cy="16" r="12.5" {...common} /><Circle cx="16" cy="12" r="3" {...common} /><Path d="M10.5 24c1.2-3.6 3-5.3 5.5-5.3s4.3 1.7 5.5 5.3" {...common} /></>);
    case "sliders": return wrap(<><Line x1="5" y1="9" x2="27" y2="9" {...common}/><Line x1="5" y1="16" x2="27" y2="16" {...common}/><Line x1="5" y1="23" x2="27" y2="23" {...common}/><Circle cx="11" cy="9" r="2.4" fill="#fff" {...common}/><Circle cx="21" cy="16" r="2.4" fill="#fff" {...common}/><Circle cx="14" cy="23" r="2.4" fill="#fff" {...common}/></>);
    case "reaction": return wrap(<><Circle cx="16" cy="16" r="11" {...common} /><Path d="M11.5 16.5c1.1 1.5 2.6 2.3 4.5 2.3s3.4-.8 4.5-2.3" {...common}/><Circle cx="12" cy="12.5" r="1" fill="#050505"/><Circle cx="20" cy="12.5" r="1" fill="#050505"/></>);
    case "bell": return wrap(<><Path d="M7.5 22h17l-2-3v-6a6.5 6.5 0 0 0-13 0v6z" {...common}/><Path d="M13.5 25h5" {...common}/></>);
    case "accessibility": return wrap(<><Circle cx="16" cy="16" r="12.5" {...common}/><Circle cx="16" cy="10.5" r="2" {...common}/><Path d="M9.5 14h13M16 13v9M12 25l4-5 4 5" {...common}/></>);
    case "pin": return wrap(<><Path d="m10 6 16 16-6 2-2 4-4-4-4 2 2-6-4-4z" {...common}/></>);
    case "globe": return wrap(<><Circle cx="16" cy="16" r="12.5" {...common}/><Path d="M3.8 16h24.4M16 3.5c3.2 3.2 4.7 7.3 4.7 12.5S19.2 25.3 16 28.5C12.8 25.3 11.3 21.2 11.3 16S12.8 6.7 16 3.5" {...common}/></>);
    case "media": return wrap(<><Rect x="7" y="6" width="17" height="19" rx="2" {...common}/><Rect x="11" y="10" width="14" height="15" rx="2" {...common}/><Circle cx="15" cy="15" r="1.5" {...common}/><Path d="m13 22 4-4 3 3 2-2 3 3" {...common}/></>);
    case "clock": return wrap(<><Circle cx="16" cy="16" r="12.5" {...common}/><Path d="M16 9v7l4.5 3" {...common}/></>);
    case "browser": return wrap(<><Rect x="5" y="6" width="22" height="20" rx="2.5" {...common}/><Line x1="5" y1="11" x2="27" y2="11" {...common}/><Circle cx="9" cy="8.5" r=".8" fill="#050505"/><Circle cx="12" cy="8.5" r=".8" fill="#050505"/></>);
    case "moon": return wrap(<Path d="M23.5 21.5A10.5 10.5 0 0 1 10.5 8.5a10.8 10.8 0 1 0 13 13z" {...common}/>);
    case "camera": return wrap(<><Path d="M7 10h4l1.5-2h7L21 10h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" {...common}/><Circle cx="16" cy="17" r="4.2" {...common}/></>);
    case "flask": return wrap(<><Path d="M12 5h8M14 5v7l-6 11a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 24 23l-6-11V5" {...common}/><Path d="M11 21h10" {...common}/></>);
    case "lock": return wrap(<><Path d="M7 13h18v13H7z" {...common}/><Path d="M11 13V9a5 5 0 0 1 10 0v4" {...common}/><Circle cx="16" cy="19" r="1.2" fill="#050505"/></>);
    case "profile": return wrap(<><Circle cx="16" cy="11" r="4" {...common}/><Path d="M8.5 26c1.2-5 3.7-7.5 7.5-7.5s6.3 2.5 7.5 7.5" {...common}/></>);
    case "pro": return wrap(<><Circle cx="13" cy="13" r="7" {...common}/><Path d="m18 18 7 7M7 23l-2 2M8 5 5 8" {...common}/></>);
    case "contact": return wrap(<><Circle cx="13" cy="10" r="4" {...common}/><Path d="M5.5 24c1.2-5 3.7-7.5 7.5-7.5s6.3 2.5 7.5 7.5M23 16v7M19.5 19.5h7" {...common}/></>);
    case "posts": return wrap(<><Rect x="6" y="7" width="20" height="18" rx="2.5" {...common}/><Line x1="10" y1="12" x2="22" y2="12" {...common}/><Line x1="10" y1="17" x2="19" y2="17" {...common}/></>);
    case "stories": return wrap(<><Circle cx="16" cy="16" r="10" strokeDasharray="4 3" {...common}/><Circle cx="16" cy="16" r="5" {...common}/><Path d="M16 8v4M16 20v4M8 16h4M20 16h4" {...common}/></>);
    case "reels": return wrap(<><Rect x="6" y="7" width="20" height="18" rx="3" {...common}/><Path d="M6 12h20M11 7l4 5M17 7l4 5" {...common}/><Path d="m14 15 5 3-5 3z" {...common}/></>);
    case "followers": return wrap(<><Rect x="6" y="8" width="20" height="17" rx="3" {...common}/><Circle cx="13" cy="14" r="3" {...common}/><Path d="M9 22c.8-3 2.1-4.5 4-4.5s3.2 1.5 4 4.5M22 15v7M18.5 18.5h7" {...common}/></>);
    case "tag": return wrap(<><Path d="m5 15 10-10h10v10L15 25 5 15z" {...common}/><Circle cx="19" cy="9" r="1.5" {...common}/></>);
    case "blocking": return wrap(<><Circle cx="12" cy="10" r="4" {...common}/><Path d="M5.5 24c1.1-4.8 3.3-7 6.5-7s5.4 2.2 6.5 7M21 16l7 7M28 16l-7 7" {...common}/></>);
    case "active": return wrap(<><Circle cx="12" cy="10" r="4" {...common}/><Path d="M5.5 24c1.1-4.8 3.3-7 6.5-7s5.4 2.2 6.5 7M24 13v9M20.5 18.5h7" {...common}/></>);
    case "payment": return wrap(<><Rect x="5" y="8" width="22" height="16" rx="2.5" {...common}/><Line x1="5" y1="13" x2="27" y2="13" {...common}/><Line x1="10" y1="19" x2="15" y2="19" {...common}/></>);
    case "activity": return wrap(<><Rect x="7" y="5" width="18" height="22" rx="2.5" {...common}/><Line x1="11" y1="11" x2="21" y2="11" {...common}/><Line x1="11" y1="16" x2="21" y2="16" {...common}/><Line x1="11" y1="21" x2="18" y2="21" {...common}/></>);
    case "device": return wrap(<><Rect x="9" y="4" width="14" height="24" rx="2.5" {...common}/><Line x1="13" y1="24" x2="19" y2="24" {...common}/></>);
    case "apps": return wrap(<><Path d="m16 4 11 7-11 7-11-7z" {...common}/><Path d="m5 17 11 7 11-7M5 22l11 7 11-7" {...common}/></>);
    case "business": return wrap(<><Rect x="6" y="9" width="20" height="16" rx="2.5" {...common}/><Path d="M11 9V6h10v3M11 16h10M16 13v6" {...common}/></>);
    case "learn": return wrap(<><Circle cx="13" cy="13" r="8" {...common}/><Path d="M19 19l7 7M11 10a3 3 0 0 1 5.5 1.5c0 2.5-2.5 2.5-2.5 4M14 19h.01" {...common}/></>);
    case "terms": return wrap(<><Path d="M7 5h14a3 3 0 0 1 3 3v19H10a3 3 0 0 1-3-3z" {...common}/><Path d="M10 27a3 3 0 0 1 3-3h11M11 10h9M11 15h9" {...common}/></>);
    case "cookies": return wrap(<><Circle cx="16" cy="16" r="11.5" {...common}/><Circle cx="12" cy="12" r="1" fill="#050505"/><Circle cx="19" cy="10" r="1" fill="#050505"/><Circle cx="20" cy="19" r="1" fill="#050505"/><Path d="M23 7a5 5 0 0 0 2 7 5 5 0 0 1-8 7 5 5 0 0 1-7-8 5 5 0 0 0 7-6 5 5 0 0 1 6 0z" {...common}/></>);
  }
}

function SearchIcon() {
  return <Svg width={31} height={31} viewBox="0 0 32 32" fill="none"><Circle cx="14" cy="14" r="9" stroke="#050505" strokeWidth="2.6"/><Path d="m21 21 7 7" stroke="#050505" strokeWidth="2.6" strokeLinecap="round"/></Svg>;
}

function ProfileIcon({ stroke = "#050505" }: { stroke?: string }) {
  return <Svg width={25} height={25} viewBox="0 0 32 32" fill="none"><Circle cx="16" cy="11" r="4" stroke={stroke} strokeWidth="2.4"/><Path d="M8.5 27c1.2-5.2 3.7-7.8 7.5-7.8s6.3 2.6 7.5 7.8" stroke={stroke} strokeWidth="2.4" strokeLinecap="round"/></Svg>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    height: 62,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  headerButton: { width: 44, alignItems: "flex-start", justifyContent: "center" },
  back: { color: "#050505", fontSize: 43, lineHeight: 43, fontWeight: "300", marginTop: -3 },
  headerTitle: { flex: 1, textAlign: "center", color: "#050505", fontSize: 20, fontWeight: "800" },
  headerRight: { width: 82, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E7F0FF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarChevron: { color: "#050505", fontSize: 17, marginTop: -5 },
  content: { paddingBottom: 34 },
  searchBox: { marginHorizontal: 22, marginTop: 23, marginBottom: 33, height: 67, borderRadius: 34, backgroundColor: "#F0F2F5", justifyContent: "center", paddingHorizontal: 27 },
  searchPlaceholder: { color: "#6B6F73", fontSize: 20 },
  section: { paddingHorizontal: 23, marginTop: 17, marginBottom: 7 },
  sectionTitle: { color: "#050505", fontSize: 25, lineHeight: 31, fontWeight: "800" },
  sectionDescription: { color: "#6B6F73", fontSize: 19, lineHeight: 25, marginTop: 3 },
  row: { minHeight: 70, paddingHorizontal: 23, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF" },
  rowPressed: { backgroundColor: "#F2F3F5" },
  iconWrap: { width: 48, alignItems: "flex-start", justifyContent: "center" },
  rowText: { flex: 1, paddingRight: 12 },
  label: { color: "#050505", fontSize: 18, lineHeight: 24, fontWeight: "600" },
  description: { color: "#6B6F73", fontSize: 16, lineHeight: 21, marginTop: 2 },
  bottomSpace: { height: 28 },
});
