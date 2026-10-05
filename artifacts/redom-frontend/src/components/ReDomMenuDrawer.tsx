import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useTheme } from "../theme/ThemeProvider";
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

const REDOM_BADGE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAFI0lEQVR42u3dwZITSQwEUKuC///l4sAFIjB0eMZuqfK98x7GXcostVmGxwMAAAAAAAAAAAAAAAAAAAAAAAAAAICP2h5BrvIIBN88KADc+OZCAWDNNx8KAO/3ZkUBIPhmRgEg+GZHASD0ZkgBIPhmSQEg+GZKASSFrgR/1Hxt860AOoSvwkLf6RmYbw8o8ubFjF+yPAJQALj9naECABQAbg5nqQAABeDGwJkqAEABuClwtgoAUABuCJyxAgAUAKAArIY4awUAKAA3As5cAQAKwE2As1cAgAJwA2AGFACgADQ/ZkEBAApA42MmFACgADQ9ZuP7lcOF3Gws4YfcmSmHCLk5WcIPubNUDgtyM7OEH3JnbDkYyJ21chiQm6El/JA7g+WhQ26elvBD7myWhwu52VrCD7kzWx4i5OZsCT/kzrJfCALBFAAoAO9N4DsAwAYAKADAu8nt/HEgvwZhPx+FqpIxBUBa8AcUQeuMeQXgmPC/8t97BbABcEDwG28DNgBwiyuAk7cUGoa/QZGUAoAbA2ubUABY+1EApIZfuSgA3PwMLgBfBAr/NH4nILj5FQAIvwIA4VcAvgcQ/vOVAoAm4W/8V4UVAMKPAkD43f4KAOEXfgXwjzN1ZMJvRm0ACL/bXwEg/MKvABB+4Y8oAH+eJPzdw78VAMLv5lcACL/wKwDrv/CnhX8rAITfza8AEH7hVwDWf+FPC/9WAAi/m18BIPzCrwCs/8KfFv6tABB+N78CQPiFXwFY/4U/LfytZ/iHUadb8N38CmB0UKYOr/Dn6fyk9/SQTBpk4c/Mmi8B3xiSKb8XT/htADaANwek63ALvw1A+IOCJvxm2ivATSHpVALCjwK4ISQdgif8dC6A4//nnzsDKPxm2wbQICh3BFH4UQChm4DwM6EAthIQfq8BNgAlIPwoACUg/CQVQCkB4T9cKQDeGlzhZ/KNe9TfAfh0ePwiD5mbvgGYnheDLPzC7xUgdJiFHwVw2FBfDbXwc1oBmKaL4RZ+678N4PABfxZy4UcBhJaA8HN6AZQS+HsJCL/1P+Vde/xvBrYN0Tlny4MTAJ8995L1HYAg+My+A0AgfFYFYIUSDOGPmV0bgIAIvw0AQRF+BWCVEhjhj5tZG4DgCL8NAAESfgVgpYoOkvDnzaoNAOG3AZAcKuFXAFar0HAJf/aM2gCCQyb8KIDQsAk/CiA0dMLP1ALYSkD4zagNQAkIPwpACQg/CkAJCD8KQAkIP+cWwFYCwm9WbQBKQPhRAOeWwFfDK/xcnhVrVfMPffEfIRF62Tq5AHb6ND0rAsGXLwUA8uU7AEABAAoAOKEAvP8z1VYAgAIAFACgAAAF8H++AGS6rQAABQAoAEABeP/H9wAKAFAAgAL4nd90wSnKD+b7AATfBmAbQPj9kLYBBN8GYBtA+P3AtgEE3wZgG8AM+uFtA8iODcA2gFlTAEoAM+bDeCVAVmwAyg2z5IPZBpAPG4CDxMz4kLYBZMIG4IAxGwoAUACaHjOhAAAFoPExCwoAUACaHzOgAMAGgC3A2SsAQAG4CXDmCgBQAG4EnLUCABQAoACshjhjBQAoADcEzlYBAArATYEzVQCAAnBj4CwVAKAA3Bw4QwUAaMdh9k3PeJuz2569AuCPIawGP4P5mnVmDoi4IjBTCoDAIjBLCoDAIjBDCoDAMjA7CoDAIjAzCoDAIjArCoCwIjAfCoDAMjAXCoDAIjAPoAgAAAAAAAAAAAAAAAAAAAAAAAAAAAB4i59otpO0gBFQawAAAABJRU5ErkJggg==";
const REDOM_VERIFIED_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAFdElEQVR42u3dQZLTShAE0JHC94DDwamGw8FJhg2wIGYiBLLUVZXvrfkL3JXZJX9jv7wAAAAAAAAAAAAAAAAAAAAAAAAAAABwoy/f37wIuTYvgeD/8e2zeVAAxN/4ikABYM1XBAoAz/fKQAEQG3xFoAAQfEWgAEgPvSJQAAi+IlAACL4iUABBoVs92B0/sbfyNatwZgrArXtqCKd8THfVa6AAFEDkzYsSOGj3EoACwO3vDBUAoABwczhLBQAoADcGzlQBAArATYGzVQCAAnBD4IwVAKAAAAVgNcRZKwBAAbgRcOYKAFAAbgKcvQIAFIAbADOgAAAFoPkxCwoAUAAaHzOhAAAFoOkxG8+3OVx4R8gvCu3CD7kzszlEyN0GduGH3FnaHBbkbgO78EPujO0OBnJnbXMYkPtIsAs/5M7g5kWH3G1gF37Inc3Niwu528Au/JA7s5sXEXK3gV34IXeWfSEIBFMAoAA8N4H3AAAbAKAAgOHqP2f734H88vb66eNB/vrD8/9/eBgrOgf/7z9Ttgg8AsA14T/z59PZABgRfNuADQDhZ1wB+ECQ8HctkgazawNg9M1vm1AAWPtRAKSGX7koANz8tC0AbwQKfze+ExDc/AoAhF8BgPArAO8DCP98jWbVBsD48Ps3AQoANz8KgLTwu/0VAMLPiALwRqDwm1EbAMLv9lcACL/wKwCEX/gzCsBXhAt/9fA3m1EbAMJvAwDhVwDWf4Q/alZtAAi/DQCEXwFY/xH+qJm1ASD8NgAQfgVglUL4o2bXBoDw2wBA+BWAFQrhj5rhh1GnWvDd/AqgdVC6Dq/w56n79UVFV6d/CUmnQRb+ixX9qjBvAl4Yki7fiyf8HgG4KCC//9uqwy382WpuAAPf/a+4DQi/mfYIcGNIKpWA8KMAFoSkQvCEn7oFEPDhn5UBFH6zbQMoEJQVQRR+FEDoJiD81C+AwM/+3xFM4TfjNoDQEhB+FEBoCQg/vQog/Oe/J37mQPhrz7gNYGAJCD8KoPHwPuPfHqx+7YRfAXgMuLkEfIuP9d8GEDrMwo8CCH0UEH5mFYDHgMPhFn7rvw1g+IB/FHLhRwGEloDwM7sACq5MVUpA+K3/NgCbgPAzvACKNmdyAIR/zu1vAxAEf2cbAALh76oArFCCIfxRs2sDEBDhtwEgKMKvAKxSAiP8cTNrAxAc4bcBIEDCrwCsVNFBEv68WbUBIPw2AJJDJfwKwGoVGi7hz55RG0BwyIQfBRAaNuFHAYSGTvjpWQADfj14dfiE34zaAEJLQPhRAKElIPwogNASEH4UQGgJCD8zCmDAG4B3h1T4zaoNILQEhB8F0LQEzoZX+Dk8K9aq2o7+EIjQF9PlW6yEv3cRCL4SOOPhlDLfIwDvAYACABQAoADK8QYgXTWYXRsA2AAABQAoAEABrOcNQLorPsM2ALABAAoAUACenSBjlm0AYAMAFEAlDX8JGLrNsm8EguBLbPdCQu7M9guWbQDBD9sAbAOYTRuAbQDBT98AbAOYQRuAbQDBT98AbAOYNQWgBDBj6Y8AHgkQ/PANwDaAWbIB2AYQ/PQNwDaAmbEB2AYQ/PQNwDaA2VAAgAKwBWAmbABAbgHYAjALNgCwAWh+zIACABSAGwBnrwAABeAmwJkrAEABuBFw1goAUACAArAa4owVAKAA3BA4WwUAKAA3Bc5UAQAKwI2Bs1QAgAJwc+AMFQCwiHY84syvCZ25gab8itGq18DtrwCeVgCrh6ljGax8zSqcmQIgrgiETgEQWASCrwAILALBVwAEloHgKwACi0DwFQCBRSD4CoCwIhB6BUBgGQi+AiCwCAQfFAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAX+Qm2OJFF36zyNAAAAABJRU5ErkJggg==";

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
  { label: "Orders and payments", Icon: OrdersIcon, route: "OrdersPayments" as const },
  { label: "Link history", Icon: LinkHistoryIcon, route: "LinkHistory" as const },
  { label: "Dark mode", Icon: DarkModeIcon, route: "DarkMode" as const },
  { label: "Language", Icon: LanguageIcon, route: "Language" as const },
];

// GitHub typecheck trigger: menu drawer JSX verified and repaired.
export function ReDomMenuDrawer({ visible, onClose }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, switchDeviceAccount, prepareForAccountLogin } = useAuthContext();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(-Math.min(width * 0.88, 602))).current;
  const [supportOpen, setSupportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accounts, setAccounts] = useState<DeviceAccount[]>([]);

  const drawerWidth = Math.min(width * 0.88, 602);
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
      if (params) navigation.navigate(route as any, params as any);
      else navigation.navigate(route as any);
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
      <Text style={[styles.menuText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
        <View style={styles.root}>
          <Pressable style={styles.backdrop} onPress={close} />
          <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }], backgroundColor: colors.surface }]}>
            <View style={styles.topSafe}>
              <View style={[styles.accountHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>

                <Pressable style={styles.accountIdentity} onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open my ReDom profile">
                  {user?.profilePhoto ? <Image source={{ uri: user.profilePhoto }} style={styles.avatar} /> : <ProfilePlaceholder width={styles.avatar.width} height={styles.avatar.height} />}
                  <View style={styles.accountCopy}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>{displayName}</Text>
                    {user?.username ? <Text style={[styles.accountUsername, { color: colors.textSecondary }]} numberOfLines={1}>@{user.username.replace(/^@/, "")}</Text> : null}
                  </View>
                </Pressable>
                <Pressable style={styles.accountArrow} onPress={() => setAccountsOpen(true)} accessibilityRole="button" accessibilityLabel="Switch ReDom profile or Page">
                  <DropdownIcon width={28} height={28} />
                </Pressable>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Your shortcuts</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutRail}>
                {shortcuts.map(({ label, Icon, route }) => (
                  <Pressable
                    key={label}
                    style={styles.shortcutCard}
                    onPress={route ? () => go(route) : label === "Memories" ? () => Alert.alert("Memories", "Coming Soon") : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                  >
                    <View style={styles.shortcutMedia}><Icon width={54} height={54} /></View>
                    <Text style={[styles.shortcutText, { color: colors.text }]} numberOfLines={1}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
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
                      <Icon width={27} height={27} />
                      <Text style={[styles.menuText, { color: colors.text }]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable style={styles.sectionHeader} onPress={() => setSupportOpen((v) => !v)}>
                <HelpSupportIcon width={28} height={28} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Help and support</Text>
                <Text style={[styles.sectionChevron, { color: colors.text }]}>{supportOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {supportOpen ? supportRows.map((item) => row(item.label, item.Icon, () => go(item.route))) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setSettingsOpen((v) => !v)}>
                <SettingsIcon width={28} height={28} />
                <Text style={styles.sectionTitle}>Settings and privacy</Text>
                <Text style={styles.sectionChevron}>{settingsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {settingsOpen ? settingsRows.map((item) => row(item.label, item.Icon, () => {
                if (item.label === "Privacy Center") {
                  close();
                  setTimeout(() => Alert.alert("Privacy Center", "Under Development"), 190);
                  return;
                }
                if (item.label === "Time management") {
                  close();
                  setTimeout(() => Alert.alert("Time management", "Under Development"), 190);
                  return;
                }
                if (item.route) go(item.route);
              })) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setUpgradesOpen((v) => !v)}>
                <UpgradesIcon width={28} height={28} />
                <Text style={styles.sectionTitle}>Upgrades</Text>
                <Text style={styles.sectionChevron}>{upgradesOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {upgradesOpen ? (
                <View style={styles.upgradeGrid}>
                  <Pressable
                    style={styles.upgradeCard}
                    accessibilityRole="button"
                    accessibilityLabel="ReDom Badge"
                    onPress={() => undefined}
                  >
                    <View style={styles.upgradeArtwork}>
                      <Image source={{ uri: REDOM_BADGE_PNG }} style={styles.upgradeBadgeImage} resizeMode="contain" />
                    </View>
                    <View style={styles.upgradeCopy}>
                      <Text style={[styles.upgradeTitle, { color: colors.text }]} numberOfLines={1}>ReDom Badge</Text>
                      <Text style={[styles.upgradeDescription, { color: colors.textSecondary }]} numberOfLines={3}>Give Your Profile a badge to represent it on ReDom.</Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.upgradeCard}
                    accessibilityRole="button"
                    accessibilityLabel="ReDom Verified"
                    onPress={() => undefined}
                  >
                    <View style={styles.upgradeArtwork}>
                      <Image source={{ uri: REDOM_VERIFIED_PNG }} style={styles.upgradeBadgeImage} resizeMode="contain" />
                    </View>
                    <View style={styles.upgradeCopy}>
                      <Text style={styles.upgradeOfficial}>$ Official</Text>
                      <Text style={[styles.upgradeTitle, { color: colors.text }]} numberOfLines={1}>ReDom Verified</Text>
                      <Text style={[styles.upgradeDescription, { color: colors.textSecondary }]} numberOfLines={3}>Build Trust with a ReDom Official Verified Badge.</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.divider} />
              <Pressable style={styles.sectionHeader} onPress={() => setProductsOpen((v) => !v)}>
                <AlsoFromReDomIcon width={28} height={28} />
                <Text style={styles.sectionTitle}>Also from ReDom</Text>
                <Text style={styles.sectionChevron}>{productsOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {productsOpen ? <Pressable style={styles.productRow} onPress={() => go("ReDomAI")}><ReDomAiIcon width={27} height={27} /><Text style={styles.menuText}>ReDom AI</Text></Pressable> : null}

              <Pressable style={styles.logoutRow} onPress={() => { close(); setTimeout(() => void logout(), 190); }} accessibilityRole="button" accessibilityLabel="Log out">
                <Text style={[styles.logoutText, { color: colors.text }]}>Log out</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={accountsOpen} transparent animationType="slide" onRequestClose={() => setAccountsOpen(false)}>
        <View style={styles.accountModalRoot}>
          <Pressable style={styles.accountBackdrop} onPress={() => setAccountsOpen(false)} />
          <View style={[styles.accountSheet, { backgroundColor: colors.surface }]}>

            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Switch profile or Page</Text>
              <Pressable onPress={() => setAccountsOpen(false)} accessibilityLabel="Close profile switcher"><CloseIcon width={25} height={25} /></Pressable>
            </View>
            <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>Profiles signed in on this device and ReDom Pages you manage can appear here.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {accounts.map((account) => (
                <Pressable key={account.user.id} style={styles.accountRow} onPress={() => void switchAccount(account)} accessibilityRole="button" accessibilityLabel={`Switch to ${account.user.firstName} ${account.user.lastName}`}>
                  {account.user.profilePhoto ? <Image source={{ uri: account.user.profilePhoto }} style={styles.accountAvatar} /> : <ProfilePlaceholder width={52} height={52} />}
                  <View style={styles.accountRowCopy}>
                    <Text style={[styles.accountRowName, { color: colors.text }]} numberOfLines={1}>{account.user.firstName} {account.user.lastName}</Text>
                    <Text style={[styles.accountRowMeta, { color: colors.textSecondary }]}>{account.user.id === user?.id ? "Current profile" : `@${account.user.username}`}</Text>
                  </View>
                  {account.user.id === user?.id ? <View style={styles.selected}><Text style={styles.selectedMark}>✓</Text></View> : null}
                </Pressable>
              ))}
              <Pressable style={styles.addAccountRow} onPress={() => void addAccount()} accessibilityRole="button" accessibilityLabel="Add another ReDom account">
                <AccountAddIcon width={52} height={52} />
                <View style={styles.accountRowCopy}><Text style={styles.accountRowName}>Add another ReDom account</Text><Text style={styles.accountRowMeta}>Sign in to another profile on this device</Text></View>
              </Pressable>
              <View style={[styles.pageNotice, { backgroundColor: colors.background }]}>
<Text style={[styles.pageNoticeTitle, { color: colors.text }]}>ReDom Pages</Text><Text style={[styles.pageNoticeText, { color: colors.textSecondary }]}>Creator and business Pages that you manage will appear in this switcher when Page access is available in ReDom.</Text></View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.44)" },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 8, height: 0 },
  },
  topSafe: { paddingTop: 16, paddingHorizontal: 16 },
  accountHeader: {
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  accountIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  accountCopy: { flex: 1 },
  accountName: { color: "#050505", fontSize: 16, fontWeight: "700" },
  accountUsername: { color: "#65676B", fontSize: 12, marginTop: 2 },
  accountArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
  sectionLabel: { fontSize: 16, fontWeight: "800", marginBottom: 10 },
  shortcutRail: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 5,
  },
  shortcutCard: {
    width: 112,
    height: 128,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E6EB",
    overflow: "hidden",
    alignItems: "stretch",
  },
  shortcutMedia: {
    height: 92,
    width: "100%",
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutText: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 5,
  },
  menuRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  menuText: { fontSize: 16, fontWeight: "600", flex: 1 },
  seeMore: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#E4E6EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  seeMoreText: { color: "#050505", fontSize: 14, fontWeight: "700" },
  moreList: { marginTop: 3 },
  divider: { height: 1, backgroundColor: "#E4E6EB", marginVertical: 0 },
  sectionHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 3,
    borderRadius: 10,
  },
  sectionTitle: { flex: 1, color: "#050505", fontSize: 17, fontWeight: "800" },
  sectionChevron: { color: "#050505", fontSize: 21, fontWeight: "700", width: 24, textAlign: "center" },
  upgradeGrid: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 3,
    paddingTop: 4,
    paddingBottom: 14,
  },
  upgradeCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E6EB",
    overflow: "hidden",
  },
  upgradeArtwork: {
    height: 116,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeBadgeImage: { width: 82, height: 82 },
  upgradeCopy: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 12, minHeight: 108 },
  upgradeOfficial: { fontSize: 10, fontWeight: "800", color: "#65676B", marginBottom: 2 },
  upgradeTitle: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
  upgradeDescription: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  subsection: { paddingLeft: 42, paddingVertical: 7 },
  subsectionText: { color: "#65676B", fontSize: 12.5, lineHeight: 18 },
  productRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 13, paddingLeft: 4 },
  logoutRow: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#E4E6EB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  logoutText: { color: "#050505", fontSize: 15, fontWeight: "700" },
  accountModalRoot: { flex: 1, justifyContent: "flex-end" },
  accountBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.48)" },
  accountSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 26,
    maxHeight: "78%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CCD0D5", alignSelf: "center", marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { color: "#050505", fontSize: 18, fontWeight: "700" },
  sheetHint: { color: "#65676B", fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  accountRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  accountAvatar: { width: 50, height: 50, borderRadius: 25 },
  accountRowCopy: { flex: 1 },
  accountRowName: { color: "#050505", fontSize: 15, fontWeight: "700" },
  accountRowMeta: { color: "#65676B", fontSize: 12, marginTop: 2 },
  selected: { width: 27, height: 27, borderRadius: 14, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  selectedMark: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  addAccountRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "#E4E6EB" },
  pageNotice: { padding: 13, marginTop: 11, borderRadius: 11, backgroundColor: "#F0F2F5" },
  pageNoticeTitle: { color: "#050505", fontSize: 14, fontWeight: "700" },
  pageNoticeText: { color: "#65676B", fontSize: 12, lineHeight: 17, marginTop: 4 },
});;
