import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { getDeviceAccounts, type DeviceAccount } from "../auth/deviceAccounts";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import ReDomAiIcon from "../assets/home-feed/redom-ai.svg";
import SavedIcon from "../assets/home-feed/saved.svg";
import MemoriesIcon from "../assets/home-feed/memories.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";
import GroupsIcon from "../assets/home-feed/groups.svg";
import AccountAddIcon from "../assets/home-feed/account-add.svg";
import HelpSupportIcon from "../assets/home-feed/help-support.svg";
import ScamIcon from "../assets/home-feed/scam-protection-center.svg";
import SupportIcon from "../assets/home-feed/support.svg";
import ReportIcon from "../assets/home-feed/report-problem.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import SettingsIcon from "../assets/home-feed/settings.svg";
import PrivacyIcon from "../assets/home-feed/privacy-center.svg";
import TimeIcon from "../assets/home-feed/time-management.svg";
import DeviceRequestsIcon from "../assets/home-feed/device-requests.svg";
import AdsIcon from "../assets/home-feed/recent-ad-activity.svg";
import OrdersIcon from "../assets/home-feed/orders-payments.svg";
import LinkHistoryIcon from "../assets/home-feed/link-history.svg";
import DarkModeIcon from "../assets/home-feed/dark-mode.svg";
import LanguageIcon from "../assets/home-feed/language.svg";
import UpgradesIcon from "../assets/home-feed/upgrades.svg";
import AlsoFromReDomIcon from "../assets/home-feed/also-from-redom.svg";
import CloseIcon from "../assets/navigation/close.svg";
import DropdownIcon from "../assets/home-feed/profile-dropdown.svg";
import FriendsIcon from "../assets/home-feed/friends.svg";
import EventsIcon from "../assets/home-feed/events.svg";
import PagesIcon from "../assets/home-feed/pages.svg";
import ProfessionalDashboardIcon from "../assets/home-feed/professional-dashboard.svg";
import CreatorToolsIcon from "../assets/home-feed/creator-tools.svg";
import GamingIcon from "../assets/home-feed/gaming.svg";
import FundraisersIcon from "../assets/home-feed/fundraisers.svg";
import ActivityIcon from "../assets/home-feed/activity.svg";

type Props = { visible: boolean; onClose: () => void };

const shortcuts = [
  { label: "ReDom AI", Icon: ReDomAiIcon, route: "ReDomAI" as const },
  { label: "Saved", Icon: SavedIcon, route: "Saved" as const },
  { label: "Memories", Icon: MemoriesIcon },
  { label: "Marketplace", Icon: MarketplaceIcon, route: "Marketplace" as const },
  { label: "Groups", Icon: GroupsIcon, route: "Groups" as const },
];

const supportRows = [
  { label: "Scam Protection Center", Icon: ScamIcon, route: "Support" as const },
  { label: "Support", Icon: SupportIcon, route: "Support" as const },
  { label: "Report a problem", Icon: ReportIcon, route: "ReportProblem" as const },
  { label: "Terms and Policies", Icon: TermsIcon, route: "TermsPolicies" as const },
];

const moreRows = [
  { label: "Friends", Icon: FriendsIcon, route: "Friends" as const },
  { label: "Events", Icon: EventsIcon, route: "Events" as const },
  { label: "Pages", Icon: PagesIcon },
  { label: "Professional dashboard", Icon: ProfessionalDashboardIcon },
  { label: "Creator tools", Icon: CreatorToolsIcon },
  { label: "Gaming", Icon: GamingIcon },
  { label: "Fundraisers", Icon: FundraisersIcon },
  { label: "Activity", Icon: ActivityIcon },
];

const settingsRows = [
  { label: "Settings", Icon: SettingsIcon, route: "Settings" as const },
  { label: "Privacy Center", Icon: PrivacyIcon, route: "PrivacySettings" as const },
  { label: "Time management", Icon: TimeIcon, route: "Settings" as const },
  { label: "Device requests", Icon: DeviceRequestsIcon, route: "LinkedDevices" as const },
  { label: "Recent ad activity", Icon: AdsIcon, route: "Settings" as const },
  { label: "Orders and payments", Icon: OrdersIcon, route: "Settings" as const },
  { label: "Link history", Icon: LinkHistoryIcon, route: "Settings" as const },
  { label: "Dark mode", Icon: DarkModeIcon, route: "Settings" as const },
  { label: "Language", Icon: LanguageIcon, route: "Settings" as const },
];

export function ReDomMenuDrawer({ visible, onClose }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, switchDeviceAccount, prepareForAccountLogin } = useAuthContext();
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(-Math.min(width * 0.88, 390))).current;
  const [supportOpen, setSupportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);

  const drawerWidth = Math.min(width * 0.88, 390);
  const displayName = useMemo(() => user ? `${user.firstName} ${user.lastName}`.trim() : "Your ReDom profile", [user]);

  useEffect(() => {
    if (!visible) return;
    setSupportOpen(false);
    setSettingsOpen(false);
    setUpgradesOpen(false);
    setProductsOpen(false);
    setAccountsOpen(false);
    setMoreOpen(false);
    void getDeviceAccounts().then(setAccounts);
    translateX.setValue(-drawerWidth);
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.8 }).start();
  }, [visible, drawerWidth, translateX]);

  const close = () => {
    Animated.timing(translateX, { toValue: -drawerWidth, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const go = (route: keyof RootStackParamList, params?: never) => {
    close();
    setTimeout(() => {
      if (params) navigation.navigate(route as never, params as never);
      else navigation.navigate(route as never);
    }, 190);
  };

  const openProfile = () => {
    close();
    setTimeout(() => navigation.navigate("Profile"), 190);
  };

  const switchAccount = async (account: DeviceAccount) => {
    setAccountsOpen(false);
    if (account.user.id === user?.id) return;
    try {
      await switchDeviceAccount(account.user.id);
      close();
      setTimeout(() => navigation.reset({ index: 0, routes: [{ name: "HomeFeed" }] }), 210);
    } catch (error) {
      Alert.alert("ReDom", error instanceof Error ? error.message : "Unable to switch profiles.");
    }
  };

  const addAccount = async () => {
    setAccountsOpen(false);
    close();
    await new Promise((resolve) => setTimeout(resolve, 190));
    await prepareForAccountLogin();
  };

  const row = (label: string, Icon: any, onPress?: () => void) => (
    <Pressable key={label} style={styles.menuRow} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label}>
      <Icon width={32} height={32} />
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
        <View style={styles.root}>
          <Pressable style={styles.backdrop} onPress={close} />
          <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}>
            <View style={styles.topSafe}>
              <View style={styles.accountHeader}>
                <Pressable style={styles.accountIdentity} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open my ReDom profile">
                  {user?.profilePhoto ? <Image source={{ uri: user.profilePhoto }} style={styles.avatar} /> : <ProfilePlaceholder width={styles.avatar.width} height={styles.avatar.height} />}
                  <View style={styles.accountCopy}>
                    <Text style={styles.accountName} numberOfLines={1}>{displayName}</Text>
                    {user?.username ? <Text style={styles.accountUsername} numberOfLines={1}>@{user.username.replace(/^@/, "")}</Text> : null}
                  </View>
                </Pressable>
                <Pressable style={styles.accountArrow} onPress={() => setAccountsOpen(true)} accessibilityRole="button" accessibilityLabel="Switch ReDom profile or Page">
                  <DropdownIcon width={28} height={28} />
                </Pressable>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.sectionLabel}>Your shortcuts</Text>
              {shortcuts.map(({ label, Icon, route }) => row(label, Icon, route ? () => go(route) : label === "Memories" ? () => Alert.alert("Memories", "Coming Soon") : undefined))}
              <Pressable style={styles.seeMore} onPress={() => setMoreOpen((value) => !value)} accessibilityRole="button" accessibilityLabel="See more ReDom destinations">
                <Text style={styles.seeMoreText}>{moreOpen ? "See less" : "See more"}</Text>
              </Pressable>
              {moreOpen ? (
                <View style={styles.moreList}>
                  {moreRows.map(({ label, Icon, route }) => (
                    <Pressable
                      key={label}
                      style={styles.menuRow}
                      onPress={() => {
                        if (route) { go(route); return; }
                        if (label === "Gaming") {
                          Alert.alert("Gaming", "Gaming is not available in your region right now.");
                          return;
                        }
                        Alert.alert("ReDom", `${label} is ready in the menu. We’ll connect its full ReDom experience next.`);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      <Icon width={32} height={32} />
                      <Text style={styles.menuText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setSupportOpen((v) => !v)}>
                <HelpSupportIcon width={35} height={35} />
                <Text style={styles.sectionTitle}>Help and support</Text>
                <Text style={styles.sectionChevron}>{supportOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {supportOpen ? supportRows.map((item) => row(item.label, item.Icon, () => go(item.route, item.params as never))) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setSettingsOpen((v) => !v)}>
                <SettingsIcon width={35} height={35} />
                <Text style={styles.sectionTitle}>Settings and privacy</Text>
                <Text style={styles.sectionChevron}>{settingsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {settingsOpen ? settingsRows.map((item) => row(item.label, item.Icon, () => go(item.route))) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setUpgradesOpen((v) => !v)}>
                <UpgradesIcon width={35} height={35} />
                <Text style={styles.sectionTitle}>Upgrades</Text>
                <Text style={styles.sectionChevron}>{upgradesOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {upgradesOpen ? <View style={styles.subsection}><Text style={styles.subsectionText}>ReDom upgrades and professional features will appear here.</Text></View> : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setProductsOpen((v) => !v)}>
                <AlsoFromReDomIcon width={35} height={35} />
                <Text style={styles.sectionTitle}>Also from ReDom</Text>
                <Text style={styles.sectionChevron}>{productsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {productsOpen ? <Pressable style={styles.productRow} onPress={() => go("ReDomAI")}><ReDomAiIcon width={32} height={32} /><Text style={styles.menuText}>ReDom AI</Text></Pressable> : null}

              <Pressable style={styles.logoutRow} onPress={() => { close(); setTimeout(() => void logout(), 190); }} accessibilityRole="button" accessibilityLabel="Log out">
                <Text style={styles.logoutText}>Log out</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={accountsOpen} transparent animationType="slide" onRequestClose={() => setAccountsOpen(false)}>
        <View style={styles.accountModalRoot}>
          <Pressable style={styles.accountBackdrop} onPress={() => setAccountsOpen(false)} />
          <View style={styles.accountSheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Switch profile or Page</Text>
              <Pressable onPress={() => setAccountsOpen(false)} accessibilityLabel="Close profile switcher"><CloseIcon width={25} height={25} /></Pressable>
            </View>
            <Text style={styles.sheetHint}>Profiles signed in on this device and ReDom Pages you manage can appear here.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {accounts.map((account) => (
                <Pressable key={account.user.id} style={styles.accountRow} onPress={() => void switchAccount(account)} accessibilityRole="button" accessibilityLabel={`Switch to ${account.user.firstName} ${account.user.lastName}`}>
                  {account.user.profilePhoto ? <Image source={{ uri: account.user.profilePhoto }} style={styles.accountAvatar} /> : <ProfilePlaceholder width={52} height={52} />}
                  <View style={styles.accountRowCopy}>
                    <Text style={styles.accountRowName} numberOfLines={1}>{account.user.firstName} {account.user.lastName}</Text>
                    <Text style={styles.accountRowMeta}>{account.user.id === user?.id ? "Current profile" : `@${account.user.username}`}</Text>
                  </View>
                  {account.user.id === user?.id ? <View style={styles.selected}><Text style={styles.selectedMark}>✓</Text></View> : null}
                </Pressable>
              ))}
              <Pressable style={styles.addAccountRow} onPress={() => void addAccount()} accessibilityRole="button" accessibilityLabel="Add another ReDom account">
                <AccountAddIcon width={52} height={52} />
                <View style={styles.accountRowCopy}><Text style={styles.accountRowName}>Add another ReDom account</Text><Text style={styles.accountRowMeta}>Sign in to another profile on this device</Text></View>
              </Pressable>
              <View style={styles.pageNotice}><Text style={styles.pageNoticeTitle}>ReDom Pages</Text><Text style={styles.pageNoticeText}>Creator and business Pages that you manage will appear in this switcher when Page access is available in ReDom.</Text></View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#FFFFFF", elevation: 24, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 8, height: 0 } },
  topSafe: { paddingTop: 34, paddingHorizontal: 18 },
  accountHeader: { minHeight: 78, borderRadius: 16, borderWidth: 1, borderColor: "#E4E6EB", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, backgroundColor: "#FFFFFF", elevation: 2 },
  accountIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  accountCopy: { flex: 1 },
  accountName: { color: "#050505", fontSize: 17, fontWeight: "800" },
  accountUsername: { color: "#65676B", fontSize: 12, marginTop: 2 },
  accountArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 28, paddingTop: 18 },
  sectionLabel: { color: "#65676B", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  menuRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 2 },
  menuText: { color: "#050505", fontSize: 16, fontWeight: "600", flex: 1 },
  seeMore: { height: 46, borderRadius: 12, backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center", marginTop: 4 },
  seeMoreText: { color: "#050505", fontSize: 15, fontWeight: "800" },
  moreList: { marginTop: 4 },
  divider: { height: 1, backgroundColor: "#E4E6EB", marginVertical: 12 },
  sectionHeader: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { flex: 1, color: "#050505", fontSize: 17, fontWeight: "800" },
  sectionChevron: { color: "#050505", fontSize: 24, fontWeight: "800", width: 26, textAlign: "center" },
  subsection: { paddingLeft: 46, paddingVertical: 8 },
  subsectionText: { color: "#65676B", fontSize: 13, lineHeight: 18 },
  productRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 13, paddingLeft: 3 },
  logoutRow: { height: 52, borderRadius: 12, backgroundColor: "#E4E6EB", alignItems: "center", justifyContent: "center", marginTop: 16 },
  logoutText: { color: "#050505", fontSize: 16, fontWeight: "800" },
  accountModalRoot: { flex: 1, justifyContent: "flex-end" },
  accountBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  accountSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 26, maxHeight: "78%" },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: "#CCD0D5", alignSelf: "center", marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { color: "#050505", fontSize: 19, fontWeight: "800" },
  sheetHint: { color: "#65676B", fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  accountRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  accountAvatar: { width: 52, height: 52, borderRadius: 26 },
  accountRowCopy: { flex: 1 },
  accountRowName: { color: "#050505", fontSize: 16, fontWeight: "700" },
  accountRowMeta: { color: "#65676B", fontSize: 12, marginTop: 2 },
  selected: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  selectedMark: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  addAccountRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  pageNotice: { padding: 14, marginTop: 12, borderRadius: 12, backgroundColor: "#F0F2F5" },
  pageNoticeTitle: { color: "#050505", fontSize: 15, fontWeight: "800" },
  pageNoticeText: { color: "#65676B", fontSize: 12, lineHeight: 17, marginTop: 4 },
});
