import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";
import CloseIcon from "../assets/navigation/close.svg";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "Profile";
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <ReDomLogo width={112} height={32} />
        <Pressable onPress={() => navigation.goBack()} style={styles.close} accessibilityLabel="Close profile">
          <CloseIcon width={26} height={26} />
        </Pressable>
      </View>
      <View style={styles.profile}>
        <ProfilePlaceholder width={118} height={118} />
        <Text style={styles.name}>{name}</Text>
        {user?.username ? <Text style={styles.username}>@{user.username.replace(/^@/, "")}</Text> : null}
        <View style={styles.identity}>
          <Text style={styles.identityLabel}>Profile ID</Text>
          <Text style={styles.identityValue}>{user?.profileId ?? ""}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#F0F2F5"},
  header:{height:64,paddingHorizontal:16,backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#D9DDE3",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  close:{width:40,height:40,alignItems:"center",justifyContent:"center"},
  profile:{alignItems:"center",paddingTop:42},
  name:{marginTop:18,fontSize:24,fontWeight:"900",color:"#1C1E21"},
  username:{marginTop:4,fontSize:15,color:"#65676B"},
  identity:{marginTop:28,paddingHorizontal:24,paddingVertical:16,borderRadius:14,backgroundColor:"#FFF",minWidth:260,alignItems:"center"},
  identityLabel:{fontSize:12,color:"#65676B",fontWeight:"700"},
  identityValue:{marginTop:4,fontSize:16,fontWeight:"800",color:"#1C1E21"},
});
