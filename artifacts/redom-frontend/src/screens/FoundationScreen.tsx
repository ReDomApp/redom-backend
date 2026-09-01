import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuthContext } from "../auth/context";

export function FoundationScreen() {
  const { user, logout } = useAuthContext();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>ReDom</Text>

      <Text style={styles.title}>
        Welcome{user?.firstName ? `, ${user.firstName}` : ""}
      </Text>

      <Text style={styles.subtitle}>
        Your authenticated ReDom app shell is ready.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        onPress={() => void logout()}
        style={styles.logoutButton}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
  },

  logo: {
    color: "#1877F2",
    fontSize: 42,
    fontWeight: "700",
  },

  title: {
    marginTop: 24,
    color: "#1C1E21",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },

  subtitle: {
    marginTop: 10,
    color: "#65676B",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },

  logoutButton: {
    marginTop: 28,
    minWidth: 140,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: "#1877F2",
    alignItems: "center",
    justifyContent: "center",
  },

  logoutText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});