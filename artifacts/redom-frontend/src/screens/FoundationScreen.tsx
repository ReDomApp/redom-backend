import {
  StyleSheet,
  Text,
  View,
} from "react-native";

export function FoundationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>
        ReDom
      </Text>

      <Text style={styles.subtitle}>
        Your social world.
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
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

    subtitle: {
      marginTop: 8,
      color: "#65676B",
      fontSize: 16,
    },
  });