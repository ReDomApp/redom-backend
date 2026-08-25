import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import {
  LoginScreen,
} from "../screens/LoginScreen";

import {
  StartupScreen,
} from "../screens/StartupScreen";

import {
  useAuthContext,
} from "../auth/context";

import type {
  RootStackParamList,
} from "./types";

const Stack =
  createNativeStackNavigator<
    RootStackParamList
  >();

export function AppNavigator() {
  const {
    status,
  } = useAuthContext();

  /*
   * FIRST APP STATE
   *
   * AuthProvider starts with:
   *
   * status = loading
   *
   * and performs the real persisted-session
   * lookup / backend refresh.
   *
   * While that is happening, ReDom displays
   * the startup artwork.
   */
  if (status === "loading") {
    return (
      <StartupScreen />
    );
  }

  /*
   * AUTHENTICATED
   *
   * We intentionally do NOT create a Home
   * screen here yet.
   *
   * You will define the Home Feed before
   * we implement it.
   */
  if (
    status ===
    "authenticated"
  ) {
    return null;
  }

  /*
   * UNAUTHENTICATED
   *
   * Login is the first defined
   * unauthenticated screen.
   */
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      <Stack.Screen
        name="Login"
        component={
          LoginScreen
        }
      />
    </Stack.Navigator>
  );
}