import { Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { AiSparkIcon } from "../assets/ai/AiIcon";

export function GlobalReDomAiAssistant() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return <Pressable accessibilityRole="button" accessibilityLabel="Open ReDom AI" onPress={() => navigation.navigate("ReDomAI", {})} style={styles.aiButton}><AiSparkIcon size={22} color="#FFFFFF"/></Pressable>;
}

const styles = StyleSheet.create({
  aiButton: { position: "absolute", top: 11, right: 62, zIndex: 100, width: 38, height: 38, borderRadius: 19, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
});
