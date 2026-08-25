import {
  useEffect,
  useState,
} from "react";

import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import {
  useAuthContext,
} from "../auth/context";

import {
  getNetworkProvider,
  fetchNetworkProvider,
  hasLoadedNetworkProvider,
} from "../auth/networkProvider";

import {
  LoginScreen,
} from "../screens/LoginScreen";

import {
  StartupScreen,
} from "../screens/StartupScreen";

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

  const [
    startupReady,
    setStartupReady,
  ] = useState(false);

  const [
    networkProviderReady,
    setNetworkProviderReady,
  ] = useState(
    hasLoadedNetworkProvider(),
  );

  useEffect(() => {
    let mounted = true;

    if (
      hasLoadedNetworkProvider()
    ) {
      setNetworkProviderReady(
        true,
      );

      return () => {
        mounted = false;
      };
    }

    fetchNetworkProvider()
      .then(() => {
        if (mounted) {
          setNetworkProviderReady(
            true,
          );
        }
      })
      .catch(() => {
        if (mounted) {
          setNetworkProviderReady(
            true,
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Startup is complete only after:
   *
   * 1. AuthProvider has resolved the
   *    persisted session state.
   *
   * 2. Network-provider preload has
   *    completed or safely failed.
   */
  useEffect(() => {
    if (
      status !== "loading" &&
      networkProviderReady
    ) {
      setStartupReady(true);
    }
  }, [
    status,
    networkProviderReady,
  ]);

  /*
   * Keep the startup artwork visible
   * until all required pre-entry work
   * has completed.
   */
  if (
    !startupReady ||
    status === "loading"
  ) {
    return (
      <StartupScreen />
    );
  }

  /*
   * The authenticated Home Feed is not
   * implemented yet.
   *
   * Do not invent it.
   */
  if (
    status ===
    "authenticated"
  ) {
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
        component={
          LoginScreen
        }
      />
    </Stack.Navigator>
  );
}