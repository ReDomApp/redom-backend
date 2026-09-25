import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
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

const iconSources: Record<IconName, ReturnType<typeof require>> = {
  account: require("../assets/home-feed/settings-accounts-center.svg"),
  privacy: require("../assets/home-feed/privacy-center.svg"),
  family: require("../assets/home-feed/settings-family-center.svg"),
  audience: require("../assets/home-feed/settings-audience.svg"),
  sliders: require("../assets/home-feed/settings-content-preferences.svg"),
  reaction: require("../assets/home-feed/settings-reaction-preferences.svg"),
  bell: require("../assets/home-feed/notifications.svg"),
  accessibility: require("../assets/home-feed/settings-accessibility.svg"),
  pin: require("../assets/home-feed/settings-tab-bar.svg"),
  globe: require("../assets/home-feed/language.svg"),
  media: require("../assets/home-feed/settings-media.svg"),
  clock: require("../assets/home-feed/time-management.svg"),
  browser: require("../assets/home-feed/settings-browser.svg"),
  moon: require("../assets/home-feed/dark-mode.svg"),
  camera: require("../assets/home-feed/settings-camera-roll.svg"),
  flask: require("../assets/home-feed/settings-early-access.svg"),
  lock: require("../assets/home-feed/settings-profile-locking.svg"),
  profile: require("../assets/home-feed/settings-profile-details.svg"),
  pro: require("../assets/home-feed/settings-pro-mode.svg"),
  contact: require("../assets/home-feed/settings-contact.svg"),
  posts: require("../assets/home-feed/settings-posts.svg"),
  stories: require("../assets/home-feed/settings-stories.svg"),
  reels: require("../assets/home-feed/settings-reels.svg"),
  followers: require("../assets/home-feed/settings-followers.svg"),
  tag: require("../assets/home-feed/settings-profile-tagging.svg"),
  blocking: require("../assets/home-feed/settings-blocking.svg"),
  active: require("../assets/home-feed/settings-active-status.svg"),
  payment: require("../assets/home-feed/orders-payments.svg"),
  activity: require("../assets/home-feed/activity.svg"),
  device: require("../assets/home-feed/device-requests.svg"),
  apps: require("../assets/home-feed/settings-apps-websites.svg"),
  business: require("../assets/home-feed/settings-business-integrations.svg"),
  learn: require("../assets/home-feed/settings-learn-information.svg"),
  terms: require("../assets/home-feed/terms-policies.svg"),
  cookies: require("../assets/home-feed/settings-cookies.svg"),
};

function SettingIcon({ name }: { name: IconName }) {
  return <Image source={iconSources[name]} style={styles.settingIcon} resizeMode="contain" />;
}

function SearchIcon() {
  return <Image source={require("../assets/home-feed/search.svg")} style={styles.headerIcon} resizeMode="contain" />;
}

function ProfileIcon({ stroke = "#050505" }: { stroke?: string }) {
  return <Image source={require("../assets/home-feed/profile-placeholder.svg")} style={[styles.profileIcon, { opacity: stroke === "#050505" ? 0.95 : 1 }]} resizeMode="contain" />;
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
  settingIcon: { width: 34, height: 34 },
  headerIcon: { width: 30, height: 30 },
  profileIcon: { width: 29, height: 29 },
  label: { color: "#050505", fontSize: 18, lineHeight: 24, fontWeight: "600" },
  description: { color: "#6B6F73", fontSize: 16, lineHeight: 21, marginTop: 2 },
  bottomSpace: { height: 28 },
});
