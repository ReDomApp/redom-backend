import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Pressable, StyleSheet, View } from "react-native";
import type { RootStackParamList } from "../routing/types";
import { HomeFeedScreenV3 } from "./HomeFeedScreenV3";

/** Keeps the existing Home Feed intact while making its existing Search action navigable. */
export function HomeFeedScreenV3SearchOverlay() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.root}>
      <HomeFeedScreenV3 />
      <Pressable
        style={styles.searchHitArea}
        onPress={() => navigation.push("Search")}
        accessibilityRole="button"
        accessibilityLabel="Search"
        testID="home-feed-search-button"
        hitSlop={6}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchHitArea: {
    position: "absolute",
    top: 10,
    right: 59,
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 100,
    elevation: 100,
  },
});
