import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import BackIcon from "../assets/navigation/back.svg";
import SearchIcon from "../assets/home-feed/search.svg";
import MarketplaceIcon from "../assets/home-feed/marketplace.svg";

export function MarketplaceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
          <BackIcon width={28} height={28} />
        </Pressable>
        <Text style={styles.title}>Marketplace</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search Marketplace">
          <SearchIcon width={28} height={28} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <MarketplaceIcon width={72} height={72} />
        <Text style={styles.heading}>Marketplace</Text>
        <Text style={styles.description}>Buy and sell products on ReDom.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFF"},
  header:{height:58,borderBottomWidth:1,borderBottomColor:"#E4E6EB",flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:16},
  title:{fontSize:20,fontWeight:"800",color:"#050505"},
  body:{flex:1,alignItems:"center",justifyContent:"center",paddingHorizontal:30},
  heading:{fontSize:26,fontWeight:"800",color:"#050505",marginTop:18},
  description:{fontSize:16,color:"#65676B",marginTop:7,textAlign:"center"},
});
