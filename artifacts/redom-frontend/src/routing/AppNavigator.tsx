import { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthContext } from "../auth/context";
import { fetchNetworkProvider, hasLoadedNetworkProvider } from "../auth/networkProvider";
import { DeviceVerificationScreen } from "../screens/DeviceVerificationScreen";
import { FoundationScreen } from "../screens/FoundationScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { StartupScreen } from "../screens/StartupScreen";
import { RegistrationContactScreen } from "../screens/registration/RegistrationContactScreen";
import { RegistrationIdentityScreen } from "../screens/registration/RegistrationIdentityScreen";
import { RegistrationUsernameScreen } from "../screens/registration/RegistrationUsernameScreen";
import { RegistrationProfileScreen } from "../screens/registration/RegistrationProfileScreen";
import { RegistrationPasswordScreen } from "../screens/registration/RegistrationPasswordScreen";
import { RegistrationReviewScreen } from "../screens/registration/RegistrationReviewScreen";
import { RegistrationVerificationScreen } from "../screens/registration/RegistrationVerificationScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const { status } = useAuthContext();
  const [startupReady, setStartupReady] = useState(false);
  const [networkProviderReady, setNetworkProviderReady] = useState(hasLoadedNetworkProvider());

  useEffect(() => {
    let mounted = true;
    if (hasLoadedNetworkProvider()) { setNetworkProviderReady(true); return () => { mounted = false; }; }
    fetchNetworkProvider().then(() => { if (mounted) setNetworkProviderReady(true); }).catch(() => { if (mounted) setNetworkProviderReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (status !== "loading" && networkProviderReady) setStartupReady(true);
  }, [status, networkProviderReady]);

  if (!startupReady || status === "loading") return <StartupScreen />;

  return <Stack.Navigator initialRouteName={status === "authenticated" ? "Foundation" : "Login"} screenOptions={{ headerShown: false, animation: "fade" }}>
    {status === "authenticated" ? <Stack.Screen name="Foundation" component={FoundationScreen} /> : <>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="DeviceVerification" component={DeviceVerificationScreen} />
      <Stack.Screen name="RegistrationContact" component={RegistrationContactScreen} />
      <Stack.Screen name="RegistrationIdentity" component={RegistrationIdentityScreen} />
      <Stack.Screen name="RegistrationUsername" component={RegistrationUsernameScreen} />
      <Stack.Screen name="RegistrationProfile" component={RegistrationProfileScreen} />
      <Stack.Screen name="RegistrationPassword" component={RegistrationPasswordScreen} />
      <Stack.Screen name="RegistrationReview" component={RegistrationReviewScreen} />
      <Stack.Screen name="RegistrationVerification" component={RegistrationVerificationScreen} />
    </>}
  </Stack.Navigator>;
}
