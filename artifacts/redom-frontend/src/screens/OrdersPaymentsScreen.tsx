import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";

import BackIcon from "../assets/navigation/back.svg";
import CartIcon from "../assets/home-feed/cart.svg";
import MenuIcon from "../assets/home-feed/menu.svg";
import StarsIcon from "../assets/home-feed/stars.svg";
import SubscriptionsIcon from "../assets/home-feed/subscriptions.svg";
import SecurityIcon from "../assets/home-feed/security-controls.svg";
import HelpIcon from "../assets/home-feed/help-support.svg";
import TermsIcon from "../assets/home-feed/terms-policies.svg";
import ChevronIcon from "../assets/home-feed/chevron-right.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function OrdersPaymentsScreen() {
  const navigation = useNavigation<Navigation>();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          style={styles.headerButton}
        >
          <BackIcon width={27} height={27} />
        </Pressable>

        <Text style={styles.headerTitle}>Orders and payments</Text>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate("Cart")}
            accessibilityRole="button"
            accessibilityLabel="Cart"
            hitSlop={8}
            style={styles.headerButton}
          >
            <CartIcon width={29} height={29} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menu"
            hitSlop={8}
            style={styles.headerButton}
            onPress={() => {}}
          >
            <MenuIcon width={29} height={29} />
          </Pressable>
          <View style={styles.avatarWrap}>
            <ProfilePlaceholder width={34} height={34} />
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Pressable
          onPress={() => navigation.navigate("ReDomPayTransactions")}
          accessibilityRole="button"
          accessibilityLabel="ReDom Pay"
          style={({ pressed }) => [styles.payCard, pressed && styles.payCardPressed]}
        >
          <View style={styles.payBrandRow}>
            <Text style={styles.reDomMark}>R</Text>
            <Text style={styles.payTitle}>ReDom Pay</Text>
          </View>
          <Text style={styles.payDescription}>
            Transactions, credit cards, debit cards, shipping info, PayPal
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Balances</Text>

        <Pressable
          onPress={() => navigation.navigate("BuyStars")}
          accessibilityRole="button"
          accessibilityLabel="ReDom Stars"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconWrap}>
            <StarsIcon width={34} height={34} />
          </View>
          <Text style={styles.rowLabel}>ReDom Stars</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>

        <Text style={[styles.sectionTitle, styles.paymentInfoTitle]}>Payment information</Text>

        <Pressable
          onPress={() => navigation.navigate("Subscriptions")}
          accessibilityRole="button"
          accessibilityLabel="Subscriptions"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconWrap}>
            <SubscriptionsIcon width={34} height={34} />
          </View>
          <Text style={styles.rowLabel}>Subscriptions</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>

        <Text style={[styles.sectionTitle, styles.settingsTitle]}>Settings</Text>

        <Pressable
          onPress={() => navigation.navigate("PaymentSecurity")}
          accessibilityRole="button"
          accessibilityLabel="Security and controls"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconWrap}>
            <SecurityIcon width={34} height={34} />
          </View>
          <Text style={styles.rowLabel}>Security and controls</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("MetaPaySupport")}
          accessibilityRole="button"
          accessibilityLabel="Help"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconWrap}>
            <HelpIcon width={34} height={34} />
          </View>
          <Text style={styles.rowLabel}>Help</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("Policy", { slug: "payments" })}
          accessibilityRole="button"
          accessibilityLabel="Terms and privacy"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.iconWrap}>
            <TermsIcon width={34} height={34} />
          </View>
          <Text style={styles.rowLabel}>Terms and privacy</Text>
          <ChevronIcon width={22} height={22} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    height: 62,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E6EB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
  },
  headerButton: {
    width: 34,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#050505",
    fontSize: 21,
    fontWeight: "800",
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  content: {
    paddingHorizontal: 31,
    paddingTop: 24,
  },
  payCardPressed: { opacity: 0.65 },
  payCard: {
    minHeight: 153,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E3E6",
    paddingHorizontal: 38,
    paddingVertical: 31,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  payBrandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reDomMark: {
    color: "#1877F2",
    fontSize: 31,
    fontWeight: "900",
    marginRight: 4,
  },
  payTitle: {
    color: "#1C1E21",
    fontSize: 25,
    fontWeight: "500",
  },
  payDescription: {
    color: "#1C1E21",
    fontSize: 20,
    lineHeight: 29,
    marginTop: 18,
  },
  sectionTitle: {
    color: "#050505",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    marginTop: 31,
    marginBottom: 13,
  },
  paymentInfoTitle: {
    marginTop: 17,
  },
  settingsTitle: {
    marginTop: 18,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 49,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    color: "#050505",
    fontSize: 20,
    fontWeight: "600",
  },
});
