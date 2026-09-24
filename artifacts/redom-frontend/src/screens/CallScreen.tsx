import { useEffect, useRef, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView, mediaDevices } from "react-native-webrtc";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../routing/types";
import { messageService, type CallRecord } from "../messages/messageService";

type Props = NativeStackScreenProps<RootStackParamList, "Call">;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function CallScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { conversationId, callType, callId: suppliedCallId } = route.params;
  const peer = useRef<RTCPeerConnection | null>(null); const stream = useRef<any>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const last = useRef<string | undefined>();
  const [call, setCall] = useState<CallRecord | null>(null); const [remote, setRemote] = useState<any>(null); const [muted, setMuted] = useState(false); const [camera, setCamera] = useState(callType === "video"); const [status, setStatus] = useState("Connecting…");
  useEffect(() => { let alive = true;
    const start = async () => { try {
      const created = suppliedCallId ? null : await messageService.createCall(conversationId, callType); if (!alive) return;
      const active = created?.call ?? ({ id: suppliedCallId!, conversationId, callType, callStatus: "connecting", participantCount: 1, maxParticipants: 2, microphoneEnabled: true, speakerEnabled: true, cameraEnabled: callType === "video", usingFrontCamera: true, encrypted: true } as CallRecord); setCall(active);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }); peer.current = pc;
      pc.onicecandidate = (e) => { if (e.candidate) void messageService.sendCallSignal(active.id, "ice", e.candidate.toJSON()); }; pc.ontrack = (e) => { if (e.streams?.[0]) setRemote(e.streams[0]); };
      stream.current = await mediaDevices.getUserMedia({ audio: true, video: callType === "video" }); stream.current.getTracks().forEach((track: any) => pc.addTrack(track, stream.current));
      if (!suppliedCallId) { const offer = await pc.createOffer({}); await pc.setLocalDescription(offer); await messageService.sendCallSignal(active.id, "offer", offer.toJSON()); setStatus("Calling…"); } else setStatus("Waiting for the other person…");
      await messageService.updateCall(active.id, { status: "connecting" });
      timer.current = setInterval(async () => { const result = await messageService.getCallSignals(active.id, last.current).catch(() => null); if (!result) return; for (const signal of result.signals) { last.current = signal.created_at;
        if (signal.signal_type === "offer" && suppliedCallId && !pc.currentRemoteDescription) { await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as any)); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await messageService.sendCallSignal(active.id, "answer", answer.toJSON()); await messageService.updateCall(active.id, { status: "active" }); setStatus("Connected"); }
        else if (signal.signal_type === "answer" && !suppliedCallId) { await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as any)); await messageService.updateCall(active.id, { status: "active" }); setStatus("Connected"); }
        else if (signal.signal_type === "ice") { try { await pc.addIceCandidate(new RTCIceCandidate(signal.payload as any)); } catch {} }
      } }, 900);
    } catch (e) { Alert.alert("Call unavailable", e instanceof Error ? e.message : "Call could not be started.", [{ text: "OK", onPress: () => navigation.goBack() }]); } };
    void start(); return () => { alive = false; if (timer.current) clearInterval(timer.current); stream.current?.getTracks?.().forEach((t: any) => t.stop()); peer.current?.close(); if (call?.id) void messageService.updateCall(call.id, { status: "ended" }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleMute = () => { const next = !muted; setMuted(next); stream.current?.getAudioTracks?.().forEach((t: any) => { t.enabled = !next; }); if (call) void messageService.updateCall(call.id, { status: "active", microphoneEnabled: !next }); };
  const toggleCamera = () => { const next = !camera; setCamera(next); stream.current?.getVideoTracks?.().forEach((t: any) => { t.enabled = next; }); if (call) void messageService.updateCall(call.id, { status: "active", cameraEnabled: next }); };
  const end = async () => { if (call) await messageService.updateCall(call.id, { status: "ended" }).catch(() => undefined); navigation.goBack(); };
  return <SafeAreaView style={styles.root}>{remote ? <RTCView streamURL={remote.toURL()} style={styles.remote} objectFit="cover" /> : <View style={styles.wait}><Text style={styles.status}>{status}</Text><Text style={styles.sub}>ReDom call</Text></View>}{callType === "video" && stream.current ? <RTCView streamURL={stream.current.toURL()} style={styles.local} objectFit="cover" mirror /> : null}<View style={styles.controls}><Pressable style={[styles.control, muted && styles.active]} onPress={toggleMute}><Text style={styles.controlText}>{muted ? "Unmute" : "Mute"}</Text></Pressable>{callType === "video" ? <Pressable style={[styles.control, !camera && styles.active]} onPress={toggleCamera}><Text style={styles.controlText}>{camera ? "Camera" : "Video off"}</Text></Pressable> : null}<Pressable style={styles.end} onPress={() => void end()}><Text style={styles.endText}>End</Text></Pressable></View></SafeAreaView>;
}
function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({ root:{flex:1,backgroundColor:"#050505"},remote:{flex:1},local:{position:"absolute",top:22,right:18,width:120,height:180,borderRadius:14},wait:{flex:1,alignItems:"center",justifyContent:"center"},status:{color:"#FFF",fontSize:21,fontWeight:"800"},sub:{color:"#AEB4BD",marginTop:8},controls:{position:"absolute",bottom:28,left:14,right:14,flexDirection:"row",justifyContent:"center",gap:10},control:{height:48,minWidth:76,paddingHorizontal:14,borderRadius:24,backgroundColor:colors.surfaceSecondary,alignItems:"center",justifyContent:"center"},active:{backgroundColor:colors.border},controlText:{color:"#FFF",fontWeight:"700"},end:{height:48,minWidth:76,paddingHorizontal:18,borderRadius:24,backgroundColor:"#E53935",alignItems:"center",justifyContent:"center"},endText:{color:"#FFF",fontWeight:"800"}}); }
