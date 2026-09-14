import { Animated, Easing } from "react-native";

/** ReDom animation API. Uses the platform Animated runtime so no extra animation dependency is required. */
export function fadeIn(value: Animated.Value, duration = 180) {
  value.setValue(0);
  return Animated.timing(value, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
}

export function pressScale(value: Animated.Value, pressed: boolean, duration = 100) {
  return Animated.timing(value, { toValue: pressed ? 0.97 : 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true });
}

export function slideIn(value: Animated.Value, from = 18, duration = 220) {
  value.setValue(from);
  return Animated.timing(value, { toValue: 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
}
