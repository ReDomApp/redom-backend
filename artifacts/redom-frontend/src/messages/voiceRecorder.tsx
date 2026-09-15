import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { AiMicIcon, AiTrashIcon } from "../assets/ai/AiIcon";

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

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

const WAVEFORM = [18, 28, 12, 34, 22, 38, 16, 30, 24, 42, 20, 32, 14, 36, 26, 40, 18, 30, 22, 35, 16, 28, 12, 32];

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
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      Alert.alert("Voice message", error instanceof Error ? error.message : "Recording could not start.");
    }
  };

  const finishAndSend = async () => {
    if (!state.isRecording || busy) return;
    setBusy(true);
    try {
      const duration = Math.max(1, Math.round(state.durationMillis / 1000));
      await recorder.stop();
      if (!recorder.uri) throw new Error("The voice recording was not created.");
      const dataUri = await recordingToDataUri(recorder.uri);
      await onRecorded(dataUri, duration);
    } catch (error) {
      Alert.alert("Voice message", error instanceof Error ? error.message : "Voice message could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!state.isRecording || busy) return;
    setBusy(true);
    try {
      await recorder.stop();
    } catch {
      // The recording is being discarded; no message is sent.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => void (state.isRecording ? finishAndSend() : start())}
        disabled={disabled || busy}
        style={[styles.button, (disabled || busy) && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={state.isRecording ? "Send voice message" : "Record voice message"}
      >
        <AiMicIcon size={20} color="#667085" />
      </Pressable>

      <Modal transparent visible={state.isRecording} animationType="fade" onRequestClose={() => void cancel()}>
        <View style={styles.modalRoot} pointerEvents="box-none">
          <View style={styles.recordingComposer}>
            <Pressable
              onPress={() => void cancel()}
              disabled={busy}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Delete voice recording"
            >
              <AiTrashIcon size={20} color="#B42318" />
            </Pressable>

            <View style={styles.recordingContent}>
              <View style={styles.recordingMeta}>
                <View style={styles.liveDot} />
                <Text style={styles.recordingLabel}>Voice message</Text>
                <Text style={styles.timer}>{formatDuration(state.durationMillis / 1000)}</Text>
              </View>
              <View style={styles.waveform} accessibilityLabel="Voice recording waveform">
                {WAVEFORM.map((height, index) => <View key={index} style={[styles.waveBar, { height }]} />)}
              </View>
            </View>

            <Pressable
              onPress={() => void finishAndSend()}
              disabled={busy}
              style={[styles.sendButton, busy && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Send voice message"
            >
              <Text style={styles.sendText}>{busy ? "Sending" : "Send"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 42, height: 42, paddingHorizontal: 8, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F2F5" },
  disabled: { opacity: 0.45 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  recordingComposer: { minHeight: 58, marginHorizontal: 8, marginBottom: 8, paddingHorizontal: 8, borderRadius: 29, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E4E6EB", flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  cancelButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#FDECEC" },
  recordingContent: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  recordingMeta: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#B42318", marginRight: 6 },
  recordingLabel: { color: "#050505", fontSize: 12, fontWeight: "700", flex: 1 },
  timer: { color: "#65676B", fontSize: 12, fontVariant: ["tabular-nums"] },
  waveform: { height: 30, flexDirection: "row", alignItems: "center", gap: 3, overflow: "hidden" },
  waveBar: { width: 3, minHeight: 5, borderRadius: 2, backgroundColor: "#1877F2" },
  sendButton: { minWidth: 66, height: 42, borderRadius: 21, paddingHorizontal: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#1877F2" },
  sendText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
});
