import AsyncStorage from "@react-native-async-storage/async-storage";

export type LanguageCode = "en" | "es" | "fr" | "de" | "pt" | "it" | "nl" | "ar" | "zh" | "ja" | "ko" | "hi" | "ru" | "tr";
export const LANGUAGE_STORAGE_KEY = "redom.language";
export const LANGUAGES: Array<{ code: LanguageCode; nativeName: string; englishName: string }> = [
  { code: "en", nativeName: "English", englishName: "English" }, { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" }, { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" }, { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch" }, { code: "ar", nativeName: "العربية", englishName: "Arabic" },
  { code: "zh", nativeName: "中文", englishName: "Chinese" }, { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" }, { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" }, { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
];
const FALLBACK: LanguageCode = "en";
export function detectDeviceLanguage(): LanguageCode {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.split("-")[0]?.toLowerCase() ?? "en";
  return LANGUAGES.some((item) => item.code === locale) ? locale as LanguageCode : FALLBACK;
}
export async function loadLanguage(): Promise<LanguageCode> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored && LANGUAGES.some((item) => item.code === stored) ? stored as LanguageCode : detectDeviceLanguage();
}
export async function saveLanguage(language: LanguageCode) { await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language); }
const base: Record<string, string> = {
  languageUpdated: "ReDom INAPP language Updated", joinToday: "Join ReDom Today",
  createDescription: "Create an account to connect with friends, family and communities of people who share your interests around the globe.",
  createAccount: "Create New Account", findAccount: "Find Your Account", alreadyAccount: "Already have an account?", login: "Login",
  loginTitle: "Log in to ReDom", mobileOrEmail: "Mobile Number or Email", password: "Password", forgotPassword: "Forgot Password?", or: "OR",
  whatsName: "What's Your Name?", realName: "Enter the name you use in real life.", everydayName: "Please write the name you use in everyday life.",
  firstName: "First name", lastName: "Last name", continue: "Continue", flowId: "Your ReDom Flow ID is {flowId}, Use it within 30 Minutes.",
  language: "Language", terms: "Terms & Conditions", privacy: "Privacy Policy", guidelines: "Community Guidelines", company: "ReDom Platforms, Inc.",
};
const translations: Partial<Record<LanguageCode, Record<string, string>>> = {
  en: base,
  es: { ...base, languageUpdated: "Idioma INAPP de ReDom actualizado", joinToday: "Únete a ReDom hoy", createDescription: "Crea una cuenta para conectar con amigos, familiares y comunidades de personas que comparten tus intereses en todo el mundo.", createAccount: "Crear una cuenta nueva", findAccount: "Encontrar tu cuenta", alreadyAccount: "¿Ya tienes una cuenta?", login: "Iniciar sesión", loginTitle: "Inicia sesión en ReDom", mobileOrEmail: "Número móvil o correo electrónico", password: "Contraseña", forgotPassword: "¿Olvidaste tu contraseña?", or: "O", whatsName: "¿Cuál es tu nombre?", realName: "Escribe el nombre que usas en la vida real.", everydayName: "Escribe el nombre que usas todos los días.", firstName: "Nombre", lastName: "Apellido", continue: "Continuar", flowId: "Tu ID de flujo de ReDom es {flowId}. Úsalo dentro de 30 minutos.", language: "Idioma", terms: "Términos y condiciones", privacy: "Política de privacidad", guidelines: "Normas comunitarias" },
  fr: { languageUpdated: "Langue INAPP ReDom mise à jour" }, de: { languageUpdated: "ReDom INAPP-Sprache aktualisiert" }, pt: { languageUpdated: "Idioma INAPP do ReDom atualizado" },
  it: { languageUpdated: "Lingua INAPP di ReDom aggiornata" }, nl: { languageUpdated: "ReDom INAPP-taal bijgewerkt" }, ar: { languageUpdated: "تم تحديث لغة ReDom داخل التطبيق" },
  zh: { languageUpdated: "ReDom 应用内语言已更新" }, ja: { languageUpdated: "ReDomアプリ内言語を更新しました" }, ko: { languageUpdated: "ReDom 앱 언어가 업데이트되었습니다" },
  hi: { languageUpdated: "ReDom इनऐप भाषा अपडेट की गई" }, ru: { languageUpdated: "Язык ReDom в приложении обновлён" }, tr: { languageUpdated: "ReDom uygulama dili güncellendi" },
};
export function t(language: LanguageCode, key: string, vars?: Record<string, string>) {
  const value = translations[language]?.[key] ?? base[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? `{${name}}`);
}
export function languageName(code: LanguageCode) { return LANGUAGES.find((item) => item.code === code)?.nativeName ?? "English"; }
