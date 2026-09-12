import { useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { RootStackParamList } from "../routing/types";
import BackIcon from "../assets/edit-profile/back.svg";
import CropIcon from "../assets/profile-media/crop.svg";

type Props = NativeStackScreenProps<RootStackParamList, "CoverPhotoAdjust">;
export function CoverPhotoAdjustScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions();
  const frameW = width;
  const frameH = Math.min(280, Math.round(width * 0.42));
  const sourceW = route.params.width || frameW;
  const sourceH = route.params.height || frameH;
  const fit = Math.max(frameW / sourceW, frameH / sourceH);
  const displayW = sourceW * fit;
  const displayH = sourceH * fit;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const start = useRef(offset);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = offset; },
    onPanResponderMove: (_, g) => {
      const maxX = Math.max(0, (displayW - frameW) / 2);
      const maxY = Math.max(0, (displayH - frameH) / 2);
      setOffset({ x: Math.max(-maxX, Math.min(maxX, start.current.x + g.dx)), y: Math.max(-maxY, Math.min(maxY, start.current.y + g.dy)) });
    },
  }), [displayW, displayH, frameW, frameH, offset]);
  const done = async () => {
    const cropW = frameW / fit;
    const cropH = frameH / fit;
    const x = Math.max(0, Math.min(sourceW - cropW, (sourceW - cropW) / 2 - offset.x / fit));
    const y = Math.max(0, Math.min(sourceH - cropH, (sourceH - cropH) / 2 - offset.y / fit));
    const result = await manipulateAsync(route.params.uri, [{ crop: { originX: Math.round(x), originY: Math.round(y), width: Math.round(cropW), height: Math.round(cropH) } }], { compress: 0.88, format: SaveFormat.JPEG, base64: true });
    navigation.replace("CoverPhotoPreview", { uri: result.uri, base64: result.base64 || route.params.base64, width: Math.round(cropW), height: Math.round(cropH) });
  };
  return <SafeAreaView style={styles.root}><View style={styles.header}><Pressable onPress={() => navigation.goBack()}><BackIcon width={26} height={26} /></Pressable><Text style={styles.title}>Drag to adjust</Text><Pressable style={styles.save} onPress={() => void done()}><Text style={styles.saveText}>SAVE</Text></Pressable></View><View style={styles.stage}><View style={[styles.frame, { width: frameW, height: frameH }]}><Image source={{ uri: route.params.uri }} style={{ width: displayW, height: displayH, transform: [{ translateX: offset.x }, { translateY: offset.y }] }} resizeMode="contain" {...pan.panHandlers} /></View><Text style={styles.tip}><CropIcon width={20} height={20} /> Drag Cover photo up & down until it appears exactly how you want it to appear on your profile.</Text></View></SafeAreaView>;
}
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:"#fff"},header:{height:64,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#E4E6EB"},title:{fontSize:20,fontWeight:"500",color:"#050505"},save:{backgroundColor:"#1877F2",borderRadius:10,paddingHorizontal:18,paddingVertical:11},saveText:{color:"#fff",fontWeight:"700"},stage:{flex:1,backgroundColor:"#000",paddingTop:0},frame:{overflow:"hidden",alignItems:"center",justifyContent:"center"},tip:{color:"#fff",fontSize:15,lineHeight:21,padding:22,textAlign:"center"}});
