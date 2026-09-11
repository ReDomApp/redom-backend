import { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuthContext } from "../auth/context";
import { DeviceVerificationScreen } from "../screens/DeviceVerificationScreen";
import { LoginTwoFactorScreen } from "../screens/LoginTwoFactorScreen";
import { FindAccountScreen } from "../screens/FindAccountScreen";
import { FoundationScreen } from "../screens/FoundationScreen";
import { HomeFeedScreen } from "../screens/HomeFeedScreen";
import { CustomizingExperienceScreen } from "../screens/CustomizingExperienceScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { StartupScreen } from "../screens/StartupScreen";
import { RegistrationWelcomeScreen } from "../screens/registration/RegistrationWelcomeScreen";
import { RegistrationIdentityScreen } from "../screens/registration/RegistrationIdentityScreen";
import { RegistrationBirthdayScreen } from "../screens/registration/RegistrationBirthdayScreen";
import { RegistrationGenderScreen } from "../screens/registration/RegistrationGenderScreen";
import { RegistrationPhoneScreen } from "../screens/registration/RegistrationPhoneScreen";
import { RegistrationEmailScreen } from "../screens/registration/RegistrationEmailScreen";
import { RegistrationPasswordScreen } from "../screens/registration/RegistrationPasswordScreen";
import { RegistrationReviewScreen } from "../screens/registration/RegistrationReviewScreen";
import { RegistrationVerificationScreen } from "../screens/registration/RegistrationVerificationScreen";
import type { RootStackParamList } from "./types";
const Stack = createNativeStackNavigator<RootStackParamList>();
export function AppNavigator() {
  const { status } = useAuthContext(); const [startupReady, setStartupReady] = useState(false);
  useEffect(() => { if (status === "loading") setStartupReady(false); }, [status]);
  if (!startupReady || status === "loading") return <StartupScreen onComplete={() => setStartupReady(true)} />;
  return <Stack.Navigator initialRouteName={status === "authenticated" ? "HomeFeed" : "Login"} screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#FFFFFF" } }}>
    {status === "authenticated" ? <><Stack.Screen name="HomeFeed" component={HomeFeedScreen}/><Stack.Screen name="Foundation" component={FoundationScreen}/></> : <>
      <Stack.Screen name="Login" component={LoginScreen}/><Stack.Screen name="FindAccount" component={FindAccountScreen}/><Stack.Screen name="DeviceVerification" component={DeviceVerificationScreen}/><Stack.Screen name="LoginTwoFactor" component={LoginTwoFactorScreen}/><Stack.Screen name="RegistrationWelcome" component={RegistrationWelcomeScreen}/><Stack.Screen name="RegistrationIdentity" component={RegistrationIdentityScreen}/><Stack.Screen name="RegistrationBirthday" component={RegistrationBirthdayScreen}/><Stack.Screen name="RegistrationGender" component={RegistrationGenderScreen}/><Stack.Screen name="RegistrationPhone" component={RegistrationPhoneScreen}/><Stack.Screen name="RegistrationEmail" component={RegistrationEmailScreen} options={{ presentation: "transparentModal", animation: "slide_from_bottom", contentStyle: { backgroundColor: "transparent" }, gestureEnabled: true }}/><Stack.Screen name="RegistrationPassword" component={RegistrationPasswordScreen}/><Stack.Screen name="RegistrationReview" component={RegistrationReviewScreen}/><Stack.Screen name="RegistrationVerification" component={RegistrationVerificationScreen}/><Stack.Screen name="CustomizingExperience" component={CustomizingExperienceScreen}/>
    </>}
  </Stack.Navigator>;
}
