import { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import type { PolicySlug } from "../product/productService";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import PrivacyIcon from "../assets/home-feed/privacy-center.svg";
import SecurityIcon from "../assets/home-feed/security.svg";
import AiIcon from "../assets/home-feed/redom-ai.svg";
import NotificationsIcon from "../assets/home-feed/notifications.svg";
import MessagingIcon from "../assets/home-feed/friend-message.svg";
import MediaIcon from "../assets/home-feed/add-media.svg";
import SavedIcon from "../assets/home-feed/saved.svg";
import EventsIcon from "../assets/home-feed/events.svg";
import SupportIcon from "../assets/home-feed/support.svg";
import OrdersIcon from "../assets/home-feed/orders-payments.svg";

type Props = NativeStackScreenProps<RootStackParamList, "TermsPolicies">;
type IconComponent = React.ComponentType<{ width?: number; height?: number }>;
type PolicyItem = { slug: PolicySlug; title: string; description: string; Icon: IconComponent };
type PolicyGroup = { title: string; Icon: IconComponent; items: PolicyItem[] };

const groups: PolicyGroup[] = [
  { title: "Using ReDom", Icon: TermsIcon, items: [
    { slug: "terms", title: "Terms of Use", description: "Rules for using ReDom and its services.", Icon: TermsIcon },
    { slug: "community", title: "Community Standards", description: "Safety and conduct standards for the ReDom community.", Icon: TermsIcon },
    { slug: "ai", title: "ReDom AI Policy", description: "How ReDom AI can assist and the limits that apply.", Icon: AiIcon },
  ] },
  { title: "Account, Privacy and Security", Icon: PrivacyIcon, items: [
    { slug: "privacy", title: "Privacy Policy", description: "How ReDom collects, uses, protects and shares information.", Icon: PrivacyIcon },
    { slug: "security", title: "Security Policy", description: "Account, device, authentication and security controls.", Icon: SecurityIcon },
    { slug: "verification", title: "Verification Policy", description: "Eligibility, security and review principles for verification.", Icon: SecurityIcon },
    { slug: "notifications", title: "Notification Policy", description: "How notification events and controls work.", Icon: NotificationsIcon },
  ] },
  { title: "Messaging, Media and Calls", Icon: MessagingIcon, items: [
    { slug: "messaging", title: "Messaging Policy", description: "Rules, privacy controls and safety behavior for conversations.", Icon: MessagingIcon },
    { slug: "media", title: "Messaging Media Policy", description: "Rules for photos, video, audio, documents and attachments.", Icon: MediaIcon },
    { slug: "calls", title: "Calls Policy", description: "Privacy, permissions, safety and call lifecycle rules.", Icon: MessagingIcon },
  ] },
  { title: "Products, Availability and Payments", Icon: OrdersIcon, items: [
    { slug: "saved", title: "Saved Content Policy", description: "How Saved, collections and collaboration controls work.", Icon: SavedIcon },
    { slug: "events", title: "Events Terms of Use", description: "Rules for creating, discovering and attending Events.", Icon: EventsIcon },
    { slug: "regional", title: "Regional Policy", description: "Country and region-specific availability and controls.", Icon: OrdersIcon },
    { slug: "refunds", title: "Refund Policy", description: "Rules for supported refund requests.", Icon: OrdersIcon },
  ] },
  { title: "Support and Reporting", Icon: SupportIcon, items: [
    { slug: "support", title: "Support and Reporting Policy", description: "How users can get help, report problems and follow supported cases.", Icon: SupportIcon },
  ] },
];

export function TermsPoliciesScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(Object.fromEntries(groups.map((group, index) => [group.title, index === 0])));
  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return groups;
    return groups.map((group) => ({ ...group, items: group.items.filter((item) => [item.title, item.description, group.title].some((value) => value.toLowerCase().includes(normalized))) })).filter((group) => group.items.length > 0);
  }, [query]);
  const toggle = (title: string) => setOpenGroups((current) => ({ ...current, [title]: !current[title] }));
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Terms and Policies</Text><View style={styles.headerSpacer} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}><View style={styles.heroIcon}><TermsIcon width={48} height={48} /></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>Terms and Policies</Text><Text style={styles.heroText}>Learn how ReDom works, how your information is handled, and the rules that apply to each ReDom feature.</Text></View></View>
        <View style={styles.searchBox}><Text style={styles.searchGlyph}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search terms and policies..." placeholderTextColor="#65676B" style={styles.searchInput} accessibilityLabel="Search terms and policies" returnKeyType="search" /></View>
        <Text style={styles.sectionIntro}>Policies</Text><Text style={styles.sectionHint}>Choose a category to see the policies available for that part of ReDom.</Text>
        {filteredGroups.map((group) => {
          const open = Boolean(openGroups[group.title]) || Boolean(query.trim());
          return <View key={group.title} style={styles.group}>
            <Pressable style={styles.groupHeader} onPress={() => toggle(group.title)} accessibilityRole="button" accessibilityLabel={(open ? "Collapse " : "Expand ") + group.title}>
              <View style={styles.groupIcon}><group.Icon width={28} height={28} /></View><Text style={styles.groupTitle}>{group.title}</Text><Text style={styles.chevron}>{open ? "⌃" : "⌄"}</Text>
            </Pressable>
            {open ? <View style={styles.items}>{group.items.map((item) => <Pressable key={item.slug} style={styles.item} onPress={() => navigation.navigate("Policy", { slug: item.slug })} accessibilityRole="button" accessibilityLabel={"Open " + item.title}>
              <View style={styles.itemIcon}><item.Icon width={25} height={25} /></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemDescription}>{item.description}</Text></View><Text style={styles.itemArrow}>›</Text>
            </Pressable>)}</View> : null}
          </View>;
        })}
        {!filteredGroups.length ? <View style={styles.empty}><TermsIcon width={56} height={56} /><Text style={styles.emptyTitle}>No policies found</Text><Text style={styles.emptyText}>Try another search term.</Text></View> : null}
        <Text style={styles.footer}>ReDom user-facing policies are connected to their individual policy endpoints. Feature-specific policies can be updated as ReDom features evolve.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { height: 58, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E4E6EB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  back: { fontSize: 38, lineHeight: 38, color: "#050505", marginTop: -3 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#050505" },
  headerSpacer: { width: 40 }, content: { padding: 16, paddingBottom: 48 },
  hero: { backgroundColor: "#1877F2", borderRadius: 16, padding: 18, flexDirection: "row", alignItems: "center" },
  heroIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginRight: 14 },
  heroCopy: { flex: 1 }, heroTitle: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" }, heroText: { color: "#FFFFFF", fontSize: 13, lineHeight: 19, marginTop: 5 },
  searchBox: { marginTop: 16, minHeight: 54, borderRadius: 28, backgroundColor: "#F0F2F5", flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  searchGlyph: { fontSize: 30, color: "#65676B", marginRight: 8, marginTop: -3 }, searchInput: { flex: 1, color: "#050505", fontSize: 16, paddingVertical: 12 },
  sectionIntro: { marginTop: 24, color: "#050505", fontSize: 22, fontWeight: "800" }, sectionHint: { marginTop: 4, marginBottom: 10, color: "#65676B", fontSize: 14, lineHeight: 20 },
  group: { borderBottomWidth: 1, borderBottomColor: "#E4E6EB" }, groupHeader: { minHeight: 66, flexDirection: "row", alignItems: "center" },
  groupIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", marginRight: 12 }, groupTitle: { flex: 1, color: "#050505", fontSize: 17, fontWeight: "800" },
  chevron: { color: "#65676B", fontSize: 23, fontWeight: "800", width: 28, textAlign: "center" }, items: { paddingBottom: 7 },
  item: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingLeft: 16 }, itemIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  itemCopy: { flex: 1, paddingRight: 8 }, itemTitle: { color: "#050505", fontSize: 15, fontWeight: "700" }, itemDescription: { color: "#65676B", fontSize: 12, lineHeight: 17, marginTop: 2 }, itemArrow: { color: "#65676B", fontSize: 28, width: 25, textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: 60 }, emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800", color: "#050505" }, emptyText: { marginTop: 4, color: "#65676B", fontSize: 14 },
  footer: { marginTop: 28, color: "#8A8D91", fontSize: 12, lineHeight: 18 },
});