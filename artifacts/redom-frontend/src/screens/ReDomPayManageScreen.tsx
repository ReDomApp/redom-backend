import { useEffect, useState } from "react";
import { Alert, SafeAreaView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthContext } from "../auth/context";
import type { RootStackParamList } from "../routing/types";
import { ordersPaymentsService, type PaymentAddress } from "../services/ordersPaymentsService";
import BackIcon from "../assets/navigation/back.svg";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import AddPaymentIllustration from "../assets/home-feed/add-payment-method.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import GamingIcon from "../assets/home-feed/gaming.svg";
import ShippingIcon from "../assets/home-feed/shipping-address.svg";
import SecurityIcon from "../assets/home-feed/security.svg";
import CurrencyIcon from "../assets/home-feed/currency.svg";
import HelpIcon from "../assets/home-feed/help-support.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function ReDomPayManageScreen() {
  const navigation = useNavigation<Navigation>();
  const { user } = useAuthContext();
  const [balance, setBalance] = useState<number | null>(null);
  const [address, setAddress] = useState<PaymentAddress | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      ordersPaymentsService.starsActivity(),
      ordersPaymentsService.paymentAddresses(),
      ordersPaymentsService.getSettings(),
    ]).then(([stars, addresses, settings]) => {
      if (!active) return;
      setBalance(stars.balance);
      setAddress(addresses.addresses.find((item) => item.is_default) ?? addresses.addresses[0] ?? null);
      setCurrency(settings.settings.currency || "USD");
    }).catch(() => {
      if (!active) return;
      setBalance(null);
      setAddress(null);
      setCurrency(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={28} height={28} />
        </Pressable>
        <View style={styles.brandTitle}>
          <ReDomLogo width={34} height={28} />
          <Text style={styles.headerTitle}>ReDom Pay</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => navigation.replace("ReDomPayTransactions")} style={styles.topTab} accessibilityRole="tab" accessibilityState={{ selected: false }}>
          <Text style={styles.topTabText}>Transactions</Text>
        </Pressable>
        <Pressable style={[styles.topTab, styles.topTabSelected]} accessibilityRole="tab" accessibilityState={{ selected: true }}>
          <Text style={styles.topTabTextSelected}>Manage</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introText}>Manage your saved payment info and which accounts have access to it. <Text onPress={() => navigation.navigate("Policy", { slug: "payments" })} style={styles.learnMore}>Learn more</Text></Text>
        </View>

        <View style={styles.paymentCard}>
          <AddPaymentIllustration width="100%" height={184} />
          <View style={styles.paymentCardBody}>
            <Text style={styles.cardTitle}>Add a payment method</Text>
            <Text style={styles.cardDescription}>Save a card or link your PayPal to make your next purchase easier.</Text>
            <Pressable onPress={() => navigation.navigate("AddPaymentMethod")} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add payment method">
              <Text style={styles.addButtonText}>Add payment method</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Balances</Text>
        <View style={styles.groupCard}>
          <Pressable onPress={() => navigation.navigate("StarsActivity")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="ReDom Stars">
            <View style={styles.iconWrap}><StarsIcon width={34} height={34} /></View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>ReDom Stars</Text>
              <Text style={styles.rowValue}>{loading ? "Loading..." : balance == null ? "—" : `${balance.toLocaleString()} Stars`}</Text>
            </View>
            <ChevronIcon width={22} height={22} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => Alert.alert("Facebook Gaming", "Not available in any region right now. This feature is under development.")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Facebook Gaming">
            <View style={styles.iconWrap}><GamingIcon width={34} height={34} /></View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>Facebook Gaming</Text>
              <Text style={styles.rowValue}>$0.00</Text>
            </View>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Shipping info</Text>
        <View style={styles.groupCard}>
          <View style={styles.row}>
            <View style={styles.iconWrap}><ShippingIcon width={34} height={34} /></View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>Shipping address</Text>
              {address ? <Text numberOfLines={2} style={styles.rowValue}>{formatAddress(address)}</Text> : null}
            </View>
          </View>
          <View style={styles.divider} />
          <Pressable onPress={() => Alert.alert("Email", "Please go to Accounts Center to edit your contact information.")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Email">
            <View style={styles.iconWrap} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>Email</Text>
              {user?.email ? <Text numberOfLines={1} style={styles.rowValue}>{user.email}</Text> : null}
            </View>
            <ChevronIcon width={22} height={22} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => Alert.alert("Phone number", "For your security, please go to Accounts Center to change or update your phone number.")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Phone number">
            <View style={styles.iconWrap} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>Phone number</Text>
              {user?.phoneNumber ? <Text numberOfLines={1} style={styles.rowValue}>{user.phoneNumber}</Text> : null}
            </View>
            <ChevronIcon width={22} height={22} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.groupCard}>
          <Pressable onPress={() => navigation.navigate("PaymentSecurity")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Security">
            <View style={styles.iconWrap}><SecurityIcon width={34} height={34} /></View>
            <Text style={styles.rowTitleOnly}>Security</Text>
            <ChevronIcon width={22} height={22} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => navigation.navigate("PaymentCurrency", { selectedCurrency: currency ?? undefined })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Currency">
            <View style={styles.iconWrap}><CurrencyIcon width={34} height={34} /></View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowTitle}>Currency</Text>
              {currency ? <Text style={styles.rowValue}>{currency}</Text> : null}
            </View>
            <ChevronIcon width={22} height={22} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => navigation.navigate("MetaPaySupport")} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Help">
            <View style={styles.iconWrap}><HelpIcon width={34} height={34} /></View>
            <Text style={styles.rowTitleOnly}>Help</Text>
            <ChevronIcon width={22} height={22} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={() => navigation.navigate("Policy", { slug: "payments" })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Terms and privacy">
            <View style={styles.iconWrap}><TermsIcon width={34} height={34} /></View>
            <Text style={styles.rowTitleOnly}>Terms and privacy</Text>
            <ChevronIcon width={22} height={22} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatAddress(address: PaymentAddress): string {
  return [address.address_line1, address.address_line2, address.city, address.state, address.postal_code, address.country_name].filter(Boolean).join(", ");
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { minHeight: 122, paddingTop: 30, paddingHorizontal: 31, flexDirection: "row", alignItems: "center" },
  backButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  brandTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 7 },
  headerTitle: { color: "#1C1E21", fontSize: 27, fontWeight: "500" },
  headerSpacer: { width: 42 },
  tabs: { marginHorizontal: 31, height: 65, flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#DADDE1" },
  topTab: { flex: 1, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  topTabSelected: { borderBottomColor: "#1C1E21" },
  topTabTextSelected: { color: "#1C1E21", fontSize: 22, fontWeight: "600" },
  topTabText: { color: "#65676B", fontSize: 22, fontWeight: "500" },
  content: { paddingHorizontal: 31, paddingTop: 31, paddingBottom: 55 },
  intro: { marginBottom: 28 },
  introText: { color: "#1C1E21", fontSize: 22, lineHeight: 31, fontWeight: "500" },
  learnMore: { color: "#1877F2", fontWeight: "700" },
  paymentCard: { borderWidth: 1, borderColor: "#DADDE1", borderRadius: 20, overflow: "hidden", backgroundColor: "#FFFFFF" },
  paymentCardBody: { paddingHorizontal: 30, paddingTop: 23, paddingBottom: 27 },
  cardTitle: { color: "#1C1E21", fontSize: 23, fontWeight: "800" },
  cardDescription: { color: "#1C1E21", fontSize: 21, lineHeight: 30, marginTop: 7 },
  addButton: { minHeight: 58, borderRadius: 30, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center", marginTop: 22 },
  addButtonText: { color: "#1C1E21", fontSize: 19, fontWeight: "600" },
  sectionTitle: { color: "#050505", fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 33, marginBottom: 13 },
  groupCard: { borderWidth: 1, borderColor: "#DADDE1", borderRadius: 20, overflow: "hidden", backgroundColor: "#FFFFFF" },
  row: { minHeight: 78, paddingHorizontal: 29, paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  pressed: { opacity: 0.6 },
  divider: { height: 1, backgroundColor: "#DADDE1", marginLeft: 29 },
  iconWrap: { width: 52, alignItems: "flex-start", justifyContent: "center" },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#1C1E21", fontSize: 20, fontWeight: "600" },
  rowTitleOnly: { color: "#1C1E21", fontSize: 20, fontWeight: "600", flex: 1 },
  rowValue: { color: "#65676B", fontSize: 18, lineHeight: 25, marginTop: 3 },
});
