import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, View } from "react-native";

export function ViewOnceVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  const event = useEvent(player, "playingChange", { isPlaying: player.playing });
  const isPlaying = Boolean(event?.isPlaying);
  return <View style={styles.container}><VideoView style={styles.video} player={player} nativeControls allowsFullscreen contentFit="contain" /><View accessible accessibilityLabel={isPlaying ? "Playing View Once video" : "View Once video ready"} /></View>;
}
const styles = StyleSheet.create({ container: { width: 250, height: 250, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" }, video: { width: 250, height: 250 } });
