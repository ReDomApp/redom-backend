import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import { LoginScreen } from "../screens/LoginScreen";

import { useAuthContext } from "../auth/context";

import type {
  RootStackParamList,
} from "./types";

const Stack =
  createNativeStackNavigator<
    RootStackParamList
  >();

export function AppNavigator() {
  const { status } =
    useAuthContext();

  /*
   * Authentication is resolved by AuthProvider
   * before the unauthenticated/authenticated
   * application state is decided.
   *
   * We deliberately do not create or redirect to
   * an authenticated screen here yet because the
   * ReDom Home Feed has not been specified/created.
   */

  if (status === "loading") {
    return null;
  }

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
        component={LoginScreen}
      />
    </Stack.Navigator>
  );
}