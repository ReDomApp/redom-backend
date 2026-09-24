import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./auth/context";
import { LanguageContainer } from "./i18n/LanguageContainer";
import { ThemeProvider, useTheme } from "./theme/ThemeProvider";
import { AppNavigator } from "./routing/AppNavigator";

const linking={prefixes:["redom://","https://redom.app"],config:{screens:{Profile:"profile/username/:userId",HomeFeed:"home",Search:"search",Notifications:"notifications",Messages:"messages",Chat:"messages/:conversationId",CallLinkJoin:"call-link/:token",GroupInvite:"group-invite/:token",Settings:"settings",Policy:"policy/:slug"}}};

function AppShell(){
  const {isDark,colors}=useTheme();
  const navigationTheme=isDark
    ? {...NavigationDarkTheme,colors:{...NavigationDarkTheme.colors,background:colors.background,card:colors.surface,text:colors.text,border:colors.border,primary:colors.primary}}
    : {...NavigationLightTheme,colors:{...NavigationLightTheme.colors,background:colors.background,card:colors.surface,text:colors.text,border:colors.border,primary:colors.primary}};
  return <AuthProvider><NavigationContainer linking={linking} theme={navigationTheme}><StatusBar style={isDark?"light":"dark"}/><AppNavigator/></NavigationContainer></AuthProvider>;
}

export function App(){return <SafeAreaProvider><LanguageContainer><ThemeProvider><AppShell/></ThemeProvider></LanguageContainer></SafeAreaProvider>;}
