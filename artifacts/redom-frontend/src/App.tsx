import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./auth/context";
import { LanguageContainer } from "./i18n/LanguageContainer";
import { ThemeProvider, useTheme } from "./theme/ThemeProvider";
import { AppNavigator } from "./routing/AppNavigator";
import { StripeProviderCompat } from "./services/stripeNative";
import { useEffect, useState } from "react";
import { ordersPaymentsService } from "./services/ordersPaymentsService";

const linking={prefixes:["redom://","https://redom.app"],config:{screens:{Profile:"profile/username/:userId",HomeFeed:"home",Search:"search",Notifications:"notifications",Messages:"messages",Chat:"messages/:conversationId",CallLinkJoin:"call-link/:token",GroupInvite:"group-invite/:token",Settings:"settings",Policy:"policy/:slug"}}};

function AppShell(){
  const {isDark,colors}=useTheme();
  const [stripeKey,setStripeKey]=useState("");
  useEffect(()=>{let active=true; ordersPaymentsService.stripePublishableKey().then(r=>{if(active&&r.success)setStripeKey(r.publishableKey);}).catch(()=>{}); return()=>{active=false;};},[]);
  const navigationTheme=isDark
    ? {...NavigationDarkTheme,colors:{...NavigationDarkTheme.colors,background:colors.background,card:colors.surface,text:colors.text,border:colors.border,primary:colors.primary}}
    : {...NavigationLightTheme,colors:{...NavigationLightTheme.colors,background:colors.background,card:colors.surface,text:colors.text,border:colors.border,primary:colors.primary}};
  return <AuthProvider><StripeProviderCompat publishableKey={stripeKey} urlScheme="redom"><NavigationContainer linking={linking} theme={navigationTheme}><StatusBar style={isDark?"light":"dark"}/><AppNavigator/></NavigationContainer></StripeProviderCompat></AuthProvider>;
}

export function App(){return <SafeAreaProvider><LanguageContainer><ThemeProvider><AppShell/></ThemeProvider></LanguageContainer></SafeAreaProvider>;}
