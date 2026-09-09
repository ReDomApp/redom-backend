import { AppState, type AppStateStatus } from "react-native";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  LanguageCode,
  LANGUAGES,
  detectDeviceLanguage,
  languageName,
  loadLanguage,
  saveLanguage,
  t,
  LANGUAGE_EXPLICIT_KEY,
} from "./language";
import { uiMessage } from "./uiMessages";
import { localizeUiTexts } from "./aiLocalization";
import { notifyLanguageUpdated } from "../notifications/notificationService";

type LanguageContextValue = {
  language: LanguageCode;
  languageName: string;
  setLanguage: (language: LanguageCode) => Promise<void>;
  t: (key: string, vars?: Record<string, string>) => string;
  uiMessage: (key: string, vars?: Record<string, string>) => string;
  localizeText: (text: string, context?: string) => Promise<string>;
  ready: boolean;
};

const Context = createContext<LanguageContextValue | null>(null);
const runtimeTextCache = new Map<string, string>();

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<LanguageCode>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadLanguage().then((value) => {
      if (mounted) {
        setCurrentLanguage(value);
        setReady(true);
      }
    }).catch(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      const explicit = await AsyncStorage.getItem(LANGUAGE_EXPLICIT_KEY);
      if (explicit === "1") return;
      setCurrentLanguage(detectDeviceLanguage());
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);

  const setLanguage = async (value: LanguageCode) => {
    await saveLanguage(value);
    setCurrentLanguage(value);
    void notifyLanguageUpdated(
      t(value, "languageUpdated"),
      t(value, "languageUpdatedBody", { language: languageName(value) }),
    );
  };

  const localizeText = async (text: string, context?: string) => {
    if (language === "en") return text;

    const key = `${language}\u0000${context ?? "ReDom UI"}\u0000${text}`;
    const cached = runtimeTextCache.get(key);
    if (cached) return cached;

    const [translated] = await localizeUiTexts(language, [text], context);
    runtimeTextCache.set(key, translated);
    return translated;
  };

  const value = useMemo(() => ({
    language,
    languageName: languageName(language),
    setLanguage,
    t: (key: string, vars?: Record<string, string>) => t(language, key, vars),
    uiMessage: (key: string, vars?: Record<string, string>) => uiMessage(language, key, vars),
    localizeText,
    ready,
  }), [language, ready]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export { LANGUAGES };
