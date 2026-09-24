import { AppState, Appearance, type ColorSchemeName, type AppStateStatus } from "react-native";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { productService } from "../product/productService";

export type ThemeMode = "system" | "light" | "dark";
type ThemeColors = { background:string; surface:string; surfaceSecondary:string; text:string; textSecondary:string; border:string; icon:string; primary:string; overlay:string; };
export const LIGHT_COLORS:ThemeColors = { background:"#F0F2F5", surface:"#FFFFFF", surfaceSecondary:"#F7F8FA", text:"#050505", textSecondary:"#65676B", border:"#E4E6EB", icon:"#1C1E21", primary:"#1877F2", overlay:"rgba(0,0,0,0.45)" } as const;
export const DARK_COLORS:ThemeColors = { background:"#18191A", surface:"#242526", surfaceSecondary:"#3A3B3C", text:"#E4E6EB", textSecondary:"#B0B3B8", border:"#3E4042", icon:"#E4E6EB", primary:"#4599FF", overlay:"rgba(0,0,0,0.68)" } as const;
type ThemeContextValue = { mode:ThemeMode; isDark:boolean; colors:ThemeColors; setTheme:(mode:ThemeMode)=>Promise<void> };
const STORAGE_KEY="redom.theme.mode";
const Context=createContext<ThemeContextValue|null>(null);
const isDarkMode=(mode:ThemeMode, system:ColorSchemeName|null)=>mode==="dark" || (mode==="system" && system==="dark");
const applyNative=(mode:ThemeMode)=>{if(mode!=="system") Appearance.setColorScheme(mode);};

export function ThemeProvider({children}:{children:ReactNode}){
 const [mode,setMode]=useState<ThemeMode>("system"); const [system,setSystem]=useState<ColorSchemeName>(Appearance.getColorScheme() ?? "light");
 useEffect(()=>{let mounted=true; AsyncStorage.getItem(STORAGE_KEY).then(v=>{if(!mounted)return; const m:ThemeMode=v==="dark"||v==="light"||v==="system"?v:"system"; setMode(m); applyNative(m);}).catch(()=>{}); const s=Appearance.addChangeListener(({colorScheme})=>setSystem(colorScheme ?? "light")); return()=>{mounted=false;s.remove();};},[]);
 useEffect(()=>{const refresh=async(s:AppStateStatus)=>{if(s!=="active")return;setSystem(Appearance.getColorScheme() ?? "light");const v=await AsyncStorage.getItem(STORAGE_KEY);if(v==="dark"||v==="light"||v==="system")setMode(v);};const s=AppState.addEventListener("change",refresh);return()=>s.remove();},[]);
 const setTheme=useCallback(async(value:ThemeMode)=>{setMode(value);applyNative(value);await AsyncStorage.setItem(STORAGE_KEY,value);try{await productService.updateSettings({theme:value});}catch{}},[]);
 const isDark=isDarkMode(mode,system); const colors=isDark?DARK_COLORS:LIGHT_COLORS;
 const value=useMemo(()=>({mode,isDark,colors,setTheme}),[mode,isDark,colors,setTheme]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTheme(){const value=useContext(Context);if(!value)throw new Error("useTheme must be used inside ThemeProvider");return value;}
