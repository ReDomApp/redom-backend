import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";

import { FoundationScreen } from "../screens/FoundationScreen";

import type {
  RootStackParamList,
} from "./types";

const Stack =
  createNativeStackNavigator<
    RootStackParamList
  >();

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