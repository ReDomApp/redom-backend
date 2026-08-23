import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import type {
  RootStackParamList,
} from "./types";

import { FoundationScreen } from "../screens/FoundationScreen";

const Stack =
  createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Foundation"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="Foundation"
        component={FoundationScreen}
      />
    </Stack.Navigator>
  );
}