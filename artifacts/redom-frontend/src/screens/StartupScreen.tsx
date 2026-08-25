import {
  useEffect,
  useRef,
} from "react";

import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";

import StartupArtwork from "../assets/brand/startup.svg";

import {
  fetchNetworkProvider,
} from "../auth/networkProvider";

export function StartupScreen({
  onReady,
}: {
  onReady?: (
    networkProvider:
      | string
      | null,
  ) => void;
}) {
  const rotation =
    useRef(
      new Animated.Value(0),
    ).current;

  useEffect(() => {
    const animation =
      Animated.loop(
        Animated.timing(
          rotation,
          {
            toValue: 1,
            duration: 950,
            easing:
              Easing.linear,
            useNativeDriver: true,
          },
        ),
      );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [rotation]);

  useEffect(() => {
    let mounted = true;

    async function preload() {
      const networkProvider =
        await fetchNetworkProvider();

      if (
        mounted &&
        onReady
      ) {
        onReady(
          networkProvider,
        );
      }
    }

    void preload();

    return () => {
      mounted = false;
    };
  }, [onReady]);

  const rotate =
    rotation.interpolate({
      inputRange: [0, 1],
      outputRange: [
        "0deg",
        "360deg",
      ],
    });

  return (
    <View
      style={
        styles.screen
      }
    >
      <View
        style={
          styles.artworkContainer
        }
      >
        <StartupArtwork
          width={343}
          height={768}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.spinner,
            {
              transform: [
                {
                  rotate,
                },
              ],
            },
          ],
        }
        >
          <View
            style={
              styles.spinnerTrack
            }
          >
            <View
              style={
                styles.spinnerArc
              }
            />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#FFFFFF",

      alignItems: "center",
      justifyContent:
        "center",
    },

    artworkContainer: {
      width: 343,
      height: 768,

      alignItems: "center",
      justifyContent:
        "center",

      position: "relative",
    },

    spinner: {
      position: "absolute",

      top: 277,
      left: 0,
      right: 0,

      height: 24,

      alignItems: "center",
      justifyContent:
        "center",
    },

    spinnerTrack: {
      width: 18,
      height: 18,

      borderRadius: 9,

      borderWidth: 2,

      borderColor:
        "rgba(255,255,255,0.35)",

      alignItems: "center",
      justifyContent:
        "center",
    },

    spinnerArc: {
      width: 18,
      height: 18,

      borderRadius: 9,

      borderWidth: 2,

      borderTopColor:
        "#FFFFFF",

      borderRightColor:
        "transparent",

      borderBottomColor:
        "transparent",

      borderLeftColor:
        "transparent",

      position: "absolute",
    },
  });