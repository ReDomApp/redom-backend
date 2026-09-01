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
  fetchNetworkProvider,
  hasLoadedNetworkProvider,
} from "../auth/networkProvider";

import {
  FoundationScreen,
} from "../screens/FoundationScreen";

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
      setNetworkProviderReady(true);
      return () => {
        mounted = false;
      };
    }

    fetchNetworkProvider()
      .then(() => {
        if (mounted) {
          setNetworkProviderReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setNetworkProviderReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

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

  if (
    !startupReady ||
    status === "loading"
  ) {
    return <StartupScreen />;
  }

  return (
    <Stack.Navigator
      initialRouteName={
        status === "authenticated"
          ? "Foundation"
          : "Login"
      }
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      {status === "authenticated" ? (
        <Stack.Screen
          name="Foundation"
          component={FoundationScreen}
        />
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
        />
      )}
    </Stack.Navigator>
  );
}