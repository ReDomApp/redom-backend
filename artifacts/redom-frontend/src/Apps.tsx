import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaView, StatusBar, StyleSheet } from "react-native";

import { AuthProvider } from "./auth/context";
import { AppNavigator } from "./routing/AppNavigator";

export function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={colors.background}
        />

        <SafeAreaView style={styles.container}>
          <AppNavigator />
        </SafeAreaView>
      </NavigationContainer>
    </AuthProvider>
  );
}

const colors = {
  background: "#FFFFFF",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});