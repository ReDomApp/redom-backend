import { AppState, type AppStateStatus } from "react-native";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
import { productService } from "../product/productService";

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
  const [ready, setReady] = useState(false);\n  const [deviceLanguageSelected, setDeviceLanguageSelected] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadLanguage(),
      AsyncStorage.getItem(LANGUAGE_EXPLICIT_KEY),
    ]).then(([value, explicit]) => {
      if (mounted) {
        setCurrentLanguage(value);
        setDeviceLanguageSelected(explicit !== "1");
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

  const setLanguage = useCallback(async (value: LanguageCode) => {
    // Persist locally first so the language change is immediate and survives a restart.
    await saveLanguage(value);
    setCurrentLanguage(value);
    // Keep the authenticated profile setting in sync so the same language follows the account.
    try {
      await productService.updateSettings({ language: value });
    } catch {
      // Local language remains authoritative for this device if the network is unavailable.
    }
    void notifyLanguageUpdated(
      t(value, "languageUpdated"),
      t(value, "languageUpdatedBody", { language: languageName(value) }),
    );
  }, []);

  const useDeviceLanguage = useCallback(async () => {
    const value = detectDeviceLanguage();
    await AsyncStorage.multiRemove([LANGUAGE_EXPLICIT_KEY, LANGUAGE_STORAGE_KEY]);
    setCurrentLanguage(value);
    setDeviceLanguageSelected(true);
    try {
      await productService.updateSettings({ language: "system" });
    } catch {}
    void notifyLanguageUpdated(
      t(value, "languageUpdated"),
      t(value, "languageUpdatedBody", { language: languageName(value) }),
    );
  }, []);

  const localizeText = useCallback(async (text: string, context?: string) => {
    if (language === "en") return text;

    const key = `${language}\u0000${context ?? "ReDom UI"}\u0000${text}`;
    const cached = runtimeTextCache.get(key);
    if (cached) return cached;

    const [translated] = await localizeUiTexts(language, [text], context);
    runtimeTextCache.set(key, translated);
    return translated;
  }, [language]);

  const value = useMemo(() => ({
    language,
    languageName: languageName(language),
    setLanguage,
    t: (key: string, vars?: Record<string, string>) => t(language, key, vars),
    uiMessage: (key: string, vars?: Record<string, string>) => uiMessage(language, key, vars),
    localizeText,
    ready,
  }), [language, localizeText, ready, setLanguage, deviceLanguageSelected, useDeviceLanguage]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

export { LANGUAGES };
