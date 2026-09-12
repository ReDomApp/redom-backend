import { useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { RootStackParamList } from "../routing/types";
import BackIcon from "../assets/edit-profile/back.svg";
import CropIcon from "../assets/profile-media/crop.svg";

type Props = NativeStackScreenProps<RootStackParamList, "ProfilePictureAdjust">;
export function ProfilePictureAdjustScreen({ navigation, route }: Props) {
  const { width } = useWindowDimensions(); const cropSize = Math.min(width - 32, 360);
  const sourceW = route.params.width || cropSize; const sourceH = route.params.height || cropSize; const side = Math.min(sourceW, sourceH);
  const fit = cropSize / side; const displayW = sourceW * fit; const displayH = sourceH * fit;
  const [offset,setOffset]=useState({x:0,y:0});
  const offsetRef=useRef({x:0,y:0});
  const start=useRef({x:0,y:0});

  const pan=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:()=>{start.current={...offsetRef.current};},
    onPanResponderMove:(_,g)=>{
      const maxX=Math.max(0,(displayW-cropSize)/2);
      const maxY=Math.max(0,(displayH-cropSize)/2);
      const next={
        x:Math.max(-maxX,Math.min(maxX,start.current.x+g.dx)),
        y:Math.max(-maxY,Math.min(maxY,start.current.y+g.dy))
      };
      offsetRef.current=next;
      setOffset(next);
    }
  }),[cropSize,displayW,displayH]);

  const done=async()=>{
    try{
      const current=offsetRef.current;
      const x=Math.max(0,Math.min(sourceW-side,(sourceW-side)/2-current.x/fit));
      const y=Math.max(0,Math.min(sourceH-side,(sourceH-side)/2-current.y/fit));
      const result=await manipulateAsync(
        route.params.uri,
        [{crop:{
          originX:Math.round(x),
          originY:Math.round(y),
          width:Math.round(side),
          height:Math.round(side)
        }}],
        {compress:.88,format:SaveFormat.JPEG,base64:true}
      );
      navigation.replace("ProfilePicturePreview",{
        uri:result.uri,
        base64:result.base64||route.params.base64,
        width:side,
        height:side
      });
    }catch(error){
      const {Alert}=require("react-native");
      Alert.alert(
        "Crop failed",
        error instanceof Error ? error.message : "Unable to crop this photo."
      );
    }
  };
  return <SafeAreaView style={styles.root}><View style={styles.header}><Pressable onPress={()=>navigation.goBack()}><BackIcon width={26} height={26}/></Pressable><Text style={styles.title}>Drag to adjust</Text><Pressable style={styles.save} onPress={()=>void done()}><Text style={styles.saveText}>DONE</Text></Pressable></View><View style={styles.stage}><View style={[styles.frame,{width:cropSize,height:cropSize}]}><Image source={{uri:route.params.uri}} style={{width:displayW,height:displayH,transform:[{translateX:offset.x},{translateY:offset.y}]}} resizeMode="contain" {...pan.panHandlers}/></View><View pointerEvents="none" style={[styles.overlay,{width:cropSize,height:cropSize,borderRadius:cropSize/2}]}/><View style={styles.hint}><CropIcon width={20} height={20}/><Text style={styles.hintText}>Drag to position your photo inside the profile circle.</Text></View></View></SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:"#fff"},header:{height:64,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:"#E4E6EB"},title:{fontSize:20,fontWeight:"600",color:"#050505"},save:{backgroundColor:"#1877F2",borderRadius:10,paddingHorizontal:17,paddingVertical:11},saveText:{color:"#fff",fontSize:15,fontWeight:"700"},stage:{flex:1,backgroundColor:"#000",alignItems:"center",paddingTop:44},frame:{overflow:"hidden",alignItems:"center",justifyContent:"center"},overlay:{position:"absolute",top:44,borderWidth:2,borderColor:"#fff"},hint:{marginTop:28,paddingHorizontal:24,flexDirection:"row",alignItems:"center",gap:9},hintText:{flex:1,color:"#fff",fontSize:14,lineHeight:20}});
