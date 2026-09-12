import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./auth/context";
import { LanguageContainer } from "./i18n/LanguageContainer";
import { AppNavigator } from "./routing/AppNavigator";

const linking = {
  prefixes: ["redom://", "https://redom.app"],
  config: {
    screens: {
      Profile: "profile/username/:userId",
    },
  },
};

export function App() {
  return (
    <SafeAreaProvider>
      <LanguageContainer>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <StatusBar style="auto" />
            <AppNavigator />
          </NavigationContainer>
        </AuthProvider>
      </LanguageContainer>
    </SafeAreaProvider>
  );
}
