import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useLanguage, LANGUAGES } from "../i18n/LanguageProvider";
import type { LanguageCode } from "../i18n/language";

const SWITCHING_LABELS: Partial<Record<LanguageCode, string>> = {
  en: "Switching Language",
  "en-GB": "Switching Language",
  es: "Cambiando idioma",
  "es-ES": "Cambiando idioma",
  fr: "Changement de langue",
  de: "Sprache wird gewechselt",
  pt: "Alterando idioma",
  "pt-PT": "A mudar o idioma",
  it: "Cambio lingua",
  nl: "Taal wijzigen",
  ar: "جارٍ تغيير اللغة",
  "zh-CN": "正在切换语言",
  "zh-HK": "正在切換語言",
  ja: "言語を切り替えています",
  ko: "언어 전환 중",
  hi: "भाषा बदली जा रही है",
  ru: "Смена языка",
  tr: "Dil değiştiriliyor",
};

export function LanguageScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation();
  const {
    language,
    languageName,
    setLanguage,
    useDeviceLanguage,
    deviceLanguageSelected,
    t,
    localizeText,
  } = useLanguage();
  const [switching, setSwitching] = useState(false);
  const [switchingLabel, setSwitchingLabel] = useState("Switching Language");
  const [deviceLabel, setDeviceLabel] = useState("Device Language");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [device, switchingText] = await Promise.all([
          language === "en" ? "Device Language" : localizeText("Device Language", "ReDom Language Settings"),
          language === "en" ? "Switching Language" : localizeText("Switching Language", "ReDom Language Settings"),
        ]);
        if (mounted) {
          setDeviceLabel(device);
          setSwitchingLabel(switchingText);
        }
      } catch {
        if (mounted) {
          setDeviceLabel(t("deviceLanguage"));
          setSwitchingLabel(SWITCHING_LABELS[language] ?? t("switchingLanguage"));
        }
      }
    })();
    return () => { mounted = false; };
  }, [language, localizeText, t]);

  const choose = useCallback(async (next: LanguageCode | "device") => {
    if (switching) return;
    if (next === "device" && deviceLanguageSelected) return;
    if (next !== "device" && !deviceLanguageSelected && next === language) return;

    let label = SWITCHING_LABELS[language] ?? switchingLabel;
    try {
      if (!SWITCHING_LABELS[language] && language !== "en") {
        label = await localizeText("Switching Language", "ReDom Language Settings");
      }
    } catch {}
    setSwitchingLabel(label);
    setSwitching(true);
    try {
      if (next === "device") await useDeviceLanguage();
      else await setLanguage(next);
      // Keep the spinner visible long enough to communicate the global app switch.
      await new Promise((resolve) => setTimeout(resolve, 450));
      navigation.goBack();
    } finally {
      setSwitching(false);
    }
  }, [deviceLanguageSelected, language, localizeText, navigation, setLanguage, switching, switchingLabel, useDeviceLanguage]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!switching) navigation.goBack(); }}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            disabled={switching}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{t("language")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={true}
          bounces
        >
          <Pressable
            style={styles.row}
            disabled={switching}
            onPress={() => void choose("device")}
            accessibilityRole="radio"
            accessibilityState={{ checked: deviceLanguageSelected }}
            accessibilityLabel={deviceLabel}
          >
            <Text style={styles.name}>{deviceLabel}</Text>
            <Radio selected={deviceLanguageSelected} />
          </Pressable>

          {LANGUAGES.map((item) => {
            const selected = !deviceLanguageSelected && item.code === language;
            return (
              <Pressable
                key={item.code}
                style={styles.row}
                disabled={switching}
                onPress={() => void choose(item.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={item.nativeName}
              >
                <Text style={styles.name}>{item.nativeName}</Text>
                <Radio selected={selected} />
              </Pressable>
            );
          })}
        </ScrollView>

        {switching ? (
          <View style={styles.loadingBackdrop} accessibilityRole="alert">
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#1877F2" />
              <Text style={styles.loadingTitle}>{switchingLabel}</Text>
              <Text style={styles.loadingSubtitle}>{languageName}</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

function makeStyles(colors:ReturnType<typeof useTheme>["colors"]){return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    height: 58,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: "#A6A6A6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  backButton: { width: 42, height: 48, justifyContent: "center" },
  back: { fontSize: 44, lineHeight: 46, fontWeight: "300", color: colors.text },
  title: { flex: 1, fontSize: 25, fontWeight: "400", color: colors.text, marginLeft: 2 },
  headerSpacer: { width: 42 },
  list: { paddingBottom: 30 },
  row: {
    minHeight: 66,
    paddingHorizontal: 29,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D8D8D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: { flex: 1, fontSize: 22, lineHeight: 30, color: colors.text, fontWeight: "400" },
  radio: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 4,
    borderColor: "#E1E2E7",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 18,
  },
  radioSelected: { borderColor: "#D9DCE2" },
  radioDot: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#6E9DF7" },
  loadingBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingCard: {
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  loadingTitle: { marginTop: 12, fontSize: 17, fontWeight: "700", color: colors.text },
  loadingSubtitle: { marginTop: 5, fontSize: 13, color: colors.textSecondary },
}); }

