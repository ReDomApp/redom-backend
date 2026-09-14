import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";

async function recordingToDataUri(uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read recording."));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read recording."));
    reader.readAsDataURL(blob);
  });
  return dataUri;
}

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }

export function VoiceRecorderButton({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (dataUri: string, durationSeconds: number) => Promise<void> }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  const permissionAsked = useRef(false);

  useEffect(() => { void setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); }, []);

  const start = async () => {
    if (disabled || busy || state.isRecording) return;
    const permission = await AudioModule.getRecordingPermissionsAsync();
    const granted = permission.granted || (await AudioModule.requestRecordingPermissionsAsync()).granted;
    permissionAsked.current = true;
    if (!granted) { Alert.alert("Microphone permission", "ReDom needs microphone access to record voice messages."); return; }
    try { await recorder.prepareToRecordAsync(); recorder.record(); } catch (error) { Alert.alert("Voice message", error instanceof Error ? error.message : "Recording could not start."); }
  };

  const stop = async () => {
    if (!state.isRecording || busy) return;
    setBusy(true);
    try {
      const duration = Math.max(1, Math.round(state.durationMillis / 1000));
      await recorder.stop();
      if (!recorder.uri) throw new Error("The voice recording was not created.");
      const dataUri = await recordingToDataUri(recorder.uri);
      await onRecorded(dataUri, duration);
    } catch (error) { Alert.alert("Voice message", error instanceof Error ? error.message : "Voice message could not be sent."); }
    finally { setBusy(false); }
  };

  return <Pressable onPress={state.isRecording ? () => void stop() : () => void start()} disabled={disabled || busy} style={[styles.button, (disabled || busy) && styles.disabled, state.isRecording && styles.recording]} accessibilityRole="button" accessibilityLabel={state.isRecording ? "Stop voice recording" : "Record voice message"}>
    <Text style={styles.icon}>{state.isRecording ? "■" : "🎙"}</Text>
    {state.isRecording ? <Text style={styles.timer}>{formatDuration(state.durationMillis / 1000)}</Text> : null}
  </Pressable>;
}

const styles = StyleSheet.create({ button: { minWidth: 42, height: 42, paddingHorizontal: 8, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2F5", flexDirection: "row" }, disabled: { opacity: 0.45 }, recording: { backgroundColor: "#FDECEC" }, icon: { fontSize: 19 }, timer: { marginLeft: 4, color: "#B42318", fontWeight: "700", fontSize: 11 } });
