import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { useAuthContext } from "../auth/context";
import { api } from "../api/client";
import ReDomLogo from "../assets/brand/redom-logo.svg";
import CloseIcon from "../assets/navigation/close.svg";
import InfoIcon from "../assets/profile-media/info.svg";
import VerifiedBadge from "../assets/auth/redom-verified-badge-blue.svg";
import VerifiedBadgeBlack from "../assets/auth/redom-verified-badge-black.svg";
import CheckIcon from "../assets/home-feed/check.svg";
import UnavailableIcon from "../assets/verification/unavailable.svg";
import ProfilePlaceholder from "../assets/home-feed/profile-placeholder.svg";

type Props = NativeStackScreenProps<RootStackParamList, "ReDomVerified">;
type PlanKey = "standard" | "plus" | "recognized";
type Person = { userId:string; firstName:string; lastName:string; username:string; profilePhoto:string|null; verified:boolean };
type Plan = { key:PlanKey; name:string; baseUsdMonthly:number|null; localCurrency:string; localAmount:number|null; localPrice:string; trialAvailable:boolean; reelsPerMonth:number|null };
type ResponseData = { success:boolean; countryCode:string; currency:string; plans:Plan[]; socialProof:Person[] };

const BLUE="#1877F2", TEXT="#050505", MUTED="#65676B", BORDER="#E4E6EB", SOFT="#F0F2F5", GREEN="#2E7D32", DISABLED="#8A8D91";
const SUPPORT:Record<PlanKey,string[]> = {
  standard:["Chat or email with agents"],
  plus:["Chat or email with agents","Get issues resolved more quickly","Request a call from an agent"],
  recognized:["Chat or email with agents","Get issues resolved more quickly","Request a call from an agent","Active case monitoring"],
};

const nameOf=(p:Person|{firstName:string;lastName:string})=>\`\${p.firstName} \${p.lastName}\`.trim();

function socialCopy(people:Person[]) {
  const verified=people.filter(p=>p.verified).slice(0,3);
  if(verified.length){
    const names=verified.map(nameOf);
    const label=names.length===1?names[0]:names.length===2?\`\${names[0]} and \${names[1]}\`:\`\${names[0]}, \${names[1]} and \${names[2]}\`;
    return { people:verified, text:\`\${label} already have a verified badge.\`, empty:false };
  }
  const photo=people.find(p=>!!p.profilePhoto);
  if(photo) return { people:[photo], text:\`\${nameOf(photo)} already has a profile photo.\`, empty:false };
  return { people:[], text:"Be the first to Verify your account officially with ReDom amongst your friends & followers", empty:true };
}

function Benefit({ included, label, supporting }: { included:boolean; label:string; supporting?:string }) {
  return <View style={s.benefitRow}>
    <View style={s.benefitIcon}>{included?<CheckIcon width={23} height={23} color={TEXT}/>:<UnavailableIcon width={22} height={22}/>}</View>
    <View style={s.benefitCopy}>
      <Text style={[s.benefitText,!included&&s.disabled]}>{label}</Text>
      {supporting?<Text style={s.supporting}>{supporting}</Text>:null}
    </View>
  </View>;
}

function PlanCard({ plan, selected, height }: { plan:Plan; selected:boolean; height:number }) {
  const featured=plan.key!=="standard";
  const themes=plan.key!=="standard";
  const reels=plan.key!=="standard";
  const allowance=plan.key==="plus"?4:plan.key==="recognized"?6:null;
  return <View accessible accessibilityRole="button" accessibilityLabel={\`ReDom Verified \${plan.name} plan\${selected?", selected":""}\`} accessibilityState={{selected}} style={[s.card,selected&&s.selectedCard,{height}]}>
    <ScrollView nestedScrollEnabled directionalLockEnabled showsVerticalScrollIndicator={false} style={s.cardScroll} contentContainerStyle={s.cardContent}>
      <Text style={s.planTitle}>{plan.name}</Text>
      <Text style={s.price}>{plan.localPrice}</Text>
      <View style={s.trialRow}><InfoIcon width={20} height={20}/><Text style={s.trialText}>Trial benefit.</Text><Text style={s.link}>Learn more</Text></View>
      {plan.key==="standard"?<View style={s.pill}><Text style={s.pillText}>Recommended</Text></View>:null}
      <View style={s.verifiedBenefit}><VerifiedBadgeBlack width={30} height={30}/><Text style={s.verifiedBenefitText}>Verified badge</Text></View>

      <Text style={s.category}>Maximize discovery</Text>
      <Benefit included label="Search optimization"/>
      <Benefit included={featured} label="Featured profile"/>
      <Benefit included={reels} label="Add links to Reels" supporting={allowance?\`\${allowance} per month\`:undefined}/>

      <Text style={s.category}>Drive engagement</Text>
      <Benefit included label="Upgraded profile links"/>
      <Benefit included label="Exclusive stickers"/>
      <Benefit included={themes} label="Custom chat themes"/>

      <Text style={s.category}>Protect your brand</Text>
      <Benefit included label="Impersonation protection"/>
      <Benefit included label="Enhanced support" supporting={SUPPORT[plan.key].join("\\n")}/>

      <Pressable accessibilityRole="button" accessibilityLabel={\`See \${plan.name} benefit details\`} style={s.details} onPress={()=>undefined}>
        <Text style={s.detailsText}>See benefit details</Text>
      </Pressable>
    </ScrollView>
  </View>;
}

export function ReDomVerifiedScreen({navigation}:Props){
  const insets=useSafeAreaInsets();
  const {user}=useAuthContext();
  const {width,height}=useWindowDimensions();
  const railRef=useRef<ScrollView>(null);
  const [data,setData]=useState<ResponseData|null>(null);
  const [loading,setLoading]=useState(true);
  const [selectedIndex,setSelectedIndex]=useState(0);
  const cardWidth=Math.min(width*0.82,420);
  const gap=12;
  const sideInset=Math.max(18,(width-cardWidth)/2);
  const cardHeight=Math.max(540,Math.min(height*0.78,720));
  const snap=cardWidth+gap;

  const load=useCallback(async()=>{
    setLoading(true);
    try{setData(await api.get<ResponseData>("/orders-payments/verified-plans"));}catch{}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const social=useMemo(()=>socialCopy(data?.socialProof??[]),[data?.socialProof]);
  const selectedPlan=data?.plans?.[selectedIndex]??data?.plans?.[0];

  const onMomentumEnd=(event:any)=>{
    const x=Number(event.nativeEvent.contentOffset?.x??0);
    setSelectedIndex(Math.max(0,Math.min(2,Math.round(x/snap))));
  };
  const selectPlan=(index:number)=>{
    railRef.current?.scrollTo({x:index*snap,animated:true});
    setSelectedIndex(index);
  };
  const unlock=()=>{ /* checkout/verification handoff is intentionally deferred to the next workflow */ void selectedPlan; };

  return <View style={s.root}>
    <View style={[s.header,{paddingTop:insets.top+6}]}>
      <Pressable onPress={()=>navigation.goBack()} style={s.close} accessibilityRole="button" accessibilityLabel="Close ReDom Verified"><CloseIcon width={30} height={30}/></Pressable>
      <ReDomLogo width={86} height={28}/>
    </View>

    <ScrollView style={s.page} showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{paddingBottom:insets.bottom+112}}>
      <Text style={s.headline}>Unlock exclusive benefits{"\\n"}just for you</Text>

      <View style={s.identity}>
        <View style={s.avatarWrap}>{user?.profilePhoto?<Image source={{uri:user.profilePhoto}} style={s.avatar}/>:<ProfilePlaceholder width={116} height={116}/>}</View>
        <View style={s.nameRow}><Text style={s.name} numberOfLines={1}>{user?nameOf(user):"Your ReDom profile"}</Text><VerifiedBadge width={22} height={22}/></View>
      </View>

      <View style={s.social}>
        {social.people.length?<View style={s.socialPhotos}>{social.people.map((p,i)=>p.profilePhoto?<Image key={p.userId} source={{uri:p.profilePhoto}} style={[s.socialPhoto,i>0&&{marginLeft:-12}]}/>:null)}</View>:null}
        <Text style={[s.socialText,social.empty&&s.emptySocial]}>{social.text}</Text>
      </View>

      {loading?<View style={[s.loading,{height:cardHeight}]}><ActivityIndicator size="small" color={BLUE}/></View>:
        <ScrollView
          ref={railRef}
          horizontal
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={snap}
          snapToAlignment="start"
          contentContainerStyle={{paddingHorizontal:sideInset,gap}}
          onMomentumScrollEnd={onMomentumEnd}
          nestedScrollEnabled
        >
          {(data?.plans??[]).map((plan,index)=><View key={plan.key} style={{width:cardWidth}}><PlanCard plan={plan} selected={index===selectedIndex} height={cardHeight}/></View>)}
        </ScrollView>
      }

      {!loading?<View style={s.dots}>{(data?.plans??[]).map((plan,index)=><Pressable key={plan.key} onPress={()=>selectPlan(index)} accessibilityRole="button" accessibilityLabel={\`Select ReDom Verified \${plan.name} plan\`}><View style={[s.dot,index===selectedIndex&&s.dotActive]}/></Pressable>)}</View>:null}
    </ScrollView>

    <View style={[s.bottom,{paddingBottom:Math.max(12,insets.bottom+8)]}>
      <Text style={s.eligibility}>ReDom Verified is available for eligible profiles.</Text>
      <Pressable onPress={unlock} disabled={!selectedPlan} accessibilityRole="button" accessibilityLabel={selectedPlan?\`Unlock \${selectedPlan.name} benefits\`:"Unlock benefits"} style={[s.cta,!selectedPlan&&{opacity:.6}]}>
        <Text style={s.ctaText}>Unlock benefits</Text>
      </Pressable>
    </View>
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:"#FFF"},
  header:{height:72,backgroundColor:"#FFF",alignItems:"center",justifyContent:"center"},
  close:{position:"absolute",left:10,bottom:8,width:44,height:44,alignItems:"center",justifyContent:"center"},
  page:{flex:1},
  headline:{fontSize:32,lineHeight:36,fontWeight:"800",color:TEXT,textAlign:"center",paddingHorizontal:28,marginBottom:26},
  identity:{alignItems:"center"},
  avatarWrap:{width:116,height:116,borderRadius:58,overflow:"hidden",backgroundColor:SOFT},
  avatar:{width:116,height:116,borderRadius:58},
  nameRow:{marginTop:14,flexDirection:"row",alignItems:"center",justifyContent:"center",paddingHorizontal:22,gap:7},
  name:{fontSize:18,fontWeight:"700",color:TEXT,maxWidth:"82%"},
  social:{marginTop:18,minHeight:54,paddingHorizontal:24,flexDirection:"row",alignItems:"center",justifyContent:"center"},
  socialPhotos:{flexDirection:"row",alignItems:"center",marginRight:10},
  socialPhoto:{width:40,height:40,borderRadius:20,borderWidth:2,borderColor:"#FFF"},
  socialText:{flexShrink:1,fontSize:16,fontWeight:"600",lineHeight:21,color:MUTED},
  emptySocial:{textAlign:"center",color:TEXT},
  loading:{alignItems:"center",justifyContent:"center"},
  card:{borderRadius:22,borderWidth:1,borderColor:BORDER,backgroundColor:"#FFF",overflow:"hidden"},
  selectedCard:{borderColor:"#C9DAF8"},
  cardScroll:{flex:1},
  cardContent:{paddingHorizontal:24,paddingTop:22,paddingBottom:24},
  planTitle:{fontSize:22,lineHeight:28,fontWeight:"800",color:TEXT},
  price:{fontSize:17,lineHeight:24,color:MUTED,marginTop:6},
  trialRow:{marginTop:16,flexDirection:"row",alignItems:"center",flexWrap:"wrap"},
  trialText:{fontSize:15.5,lineHeight:21,color:MUTED,marginLeft:7},
  link:{fontSize:15.5,lineHeight:21,color:BLUE,fontWeight:"600",marginLeft:5},
  pill:{alignSelf:"flex-start",backgroundColor:"#E8F2FF",borderRadius:16,paddingHorizontal:12,paddingVertical:6,marginTop:13},
  pillText:{fontSize:13,fontWeight:"700",color:BLUE},
  verifiedBenefit:{flexDirection:"row",alignItems:"center",marginTop:24,marginBottom:22},
  verifiedBenefitText:{fontSize:17,fontWeight:"600",color:TEXT,marginLeft:12},
  category:{fontSize:18,fontWeight:"800",color:TEXT,marginTop:22,marginBottom:8},
  benefitRow:{minHeight:48,flexDirection:"row",alignItems:"flex-start",paddingVertical:8},
  benefitIcon:{width:32,alignItems:"flex-start",paddingTop:1},
  benefitCopy:{flex:1,paddingLeft:6},
  benefitText:{fontSize:16,lineHeight:21,color:TEXT},
  disabled:{color:DISABLED},
  supporting:{fontSize:15,lineHeight:20,color:GREEN,marginTop:1},
  details:{alignSelf:"flex-start",marginTop:18,paddingVertical:8},
  detailsText:{fontSize:16,fontWeight:"700",color:BLUE},
  dots:{flexDirection:"row",justifyContent:"center",alignItems:"center",gap:7,paddingVertical:12},
  dot:{width:6,height:6,borderRadius:3,backgroundColor:"#CCD0D5"},
  dotActive:{width:18,backgroundColor:BLUE},
  bottom:{position:"absolute",left:0,right:0,bottom:0,backgroundColor:"#FFF",borderTopWidth:1,borderTopColor:SOFT,paddingHorizontal:18,paddingTop:12},
  eligibility:{fontSize:14.5,lineHeight:20,color:MUTED,textAlign:"center",marginBottom:10},
  cta:{height:56,borderRadius:30,backgroundColor:BLUE,alignItems:"center",justifyContent:"center"},
  ctaText:{fontSize:18,fontWeight:"800",color:"#FFF"},
});
