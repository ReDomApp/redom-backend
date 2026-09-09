import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { LanguageCode, LANGUAGES, languageName, loadLanguage, saveLanguage, t } from "./language";

type LanguageContextValue = { language: LanguageCode; languageName: string; setLanguage: (language: LanguageCode) => Promise<void>; t: (key: string, vars?: Record<string, string>) => string; ready: boolean };
const Context = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<LanguageCode>("en");
  const [ready, setReady] = useState(false);
  useEffect(() => { let mounted = true; loadLanguage().then((value) => { if (mounted) { setCurrentLanguage(value); setReady(true); } }).catch(() => { if (mounted) setReady(true); }); return () => { mounted = false; }; }, []);
  const setLanguage = async (value: LanguageCode) => { await saveLanguage(value); setCurrentLanguage(value); };
  const value = useMemo(() => ({ language, languageName: languageName(language), setLanguage, t: (key: string, vars?: Record<string, string>) => t(language, key, vars), ready }), [language, ready]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLanguage() { const value = useContext(Context); if (!value) throw new Error("useLanguage must be used inside LanguageProvider"); return value; }
export { LANGUAGES, AsyncStorage };
