import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

export type LanguageCode = "en" | "es" | "fr" | "de" | "pt" | "it" | "nl" | "ar" | "zh" | "ja" | "ko" | "hi" | "ru" | "tr";
export const LANGUAGE_STORAGE_KEY = "redom.language";
export const LANGUAGE_EXPLICIT_KEY = "redom.language.explicit";

export const LANGUAGES: Array<{ code: LanguageCode; nativeName: string; englishName: string }> = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "fr", nativeName: "Français", englishName: "French" },
  { code: "de", nativeName: "Deutsch", englishName: "German" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "it", nativeName: "Italiano", englishName: "Italian" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic" },
  { code: "zh", nativeName: "中文", englishName: "Chinese" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese" },
  { code: "ko", nativeName: "한국어", englishName: "Korean" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "ru", nativeName: "Русский", englishName: "Russian" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish" },
];

const FALLBACK: LanguageCode = "en";

export function detectDeviceLanguage(): LanguageCode {
  const locale = getLocales()[0]?.languageCode?.toLowerCase() ?? FALLBACK;
  return LANGUAGES.some((item) => item.code === locale) ? locale as LanguageCode : FALLBACK;
}

export async function loadLanguage(): Promise<LanguageCode> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  const explicit = await AsyncStorage.getItem(LANGUAGE_EXPLICIT_KEY);
  if (explicit === "1" && stored && LANGUAGES.some((item) => item.code === stored)) {
    return stored as LanguageCode;
  }
  return detectDeviceLanguage();
}

export async function saveLanguage(language: LanguageCode) {
  await AsyncStorage.multiSet([
    [LANGUAGE_STORAGE_KEY, language],
    [LANGUAGE_EXPLICIT_KEY, "1"],
  ]);
}

const base: Record<string, string> = {
  languageUpdated: "ReDom INAPP language Updated",
  languageUpdatedBody: "Your ReDom app language is now {language}.",
  joinToday: "Join ReDom Today",
  createDescription: "Create an account to connect with friends, family and communities of people who share your interests around the globe.",
  createAccount: "Create New Account",
  findAccount: "Find Your Account",
  alreadyAccount: "Already have an account?",
  login: "Login",
  loginTitle: "Log in to ReDom",
  mobileOrEmail: "Mobile Number or Email",
  password: "Password",
  forgotPassword: "Forgot Password?",
  or: "OR",
  whatsName: "What's Your Name?",
  realName: "Enter the name you use in real life.",
  everydayName: "Please write the name you use in everyday life.",
  firstName: "First Name",
  lastName: "Last Name",
  continue: "Continue",
  flowId: "Your ReDom Flow ID is {flowId}, Use it within 30 Minutes.",
  language: "Language",
  terms: "Terms & Conditions",
  privacy: "Privacy Policy",
  guidelines: "Community Guidelines",
  company: "ReDom Platforms, Inc.",
};

const translations: Record<LanguageCode, Record<string, string>> = {
  en: base,
  es: {
    ...base,
    languageUpdated: "Idioma INAPP de ReDom actualizado",
    languageUpdatedBody: "El idioma de tu aplicación ReDom ahora es {language}.",
    joinToday: "Únete a ReDom hoy",
    createDescription: "Crea una cuenta para conectar con amigos, familiares y comunidades de personas que comparten tus intereses en todo el mundo.",
    createAccount: "Crear una cuenta nueva", findAccount: "Encontrar tu cuenta", alreadyAccount: "¿Ya tienes una cuenta?", login: "Iniciar sesión",
    loginTitle: "Inicia sesión en ReDom", mobileOrEmail: "Número móvil o correo electrónico", password: "Contraseña", forgotPassword: "¿Olvidaste tu contraseña?", or: "O",
    whatsName: "¿Cuál es tu nombre?", realName: "Escribe el nombre que usas en la vida real.", everydayName: "Escribe el nombre que usas todos los días.", firstName: "Nombre", lastName: "Apellido", continue: "Continuar",
    flowId: "Tu ID de flujo de ReDom es {flowId}. Úsalo dentro de 30 minutos.", language: "Idioma", terms: "Términos y condiciones", privacy: "Política de privacidad", guidelines: "Normas comunitarias",
  },
  fr: {
    ...base, languageUpdated: "Langue INAPP ReDom mise à jour", languageUpdatedBody: "La langue de votre application ReDom est maintenant {language}.", joinToday: "Rejoignez ReDom aujourd'hui",
    createDescription: "Créez un compte pour vous connecter avec des amis, votre famille et des communautés de personnes qui partagent vos centres d'intérêt dans le monde entier.", createAccount: "Créer un compte", findAccount: "Retrouver votre compte", alreadyAccount: "Vous avez déjà un compte ?", login: "Connexion", loginTitle: "Se connecter à ReDom", mobileOrEmail: "Numéro de mobile ou e-mail", password: "Mot de passe", forgotPassword: "Mot de passe oublié ?", or: "OU", whatsName: "Quel est votre nom ?", realName: "Saisissez le nom que vous utilisez dans la vie réelle.", everydayName: "Saisissez le nom que vous utilisez au quotidien.", firstName: "Prénom", lastName: "Nom", continue: "Continuer", flowId: "Votre ID de flux ReDom est {flowId}. Utilisez-le dans les 30 minutes.", language: "Langue", terms: "Conditions d'utilisation", privacy: "Politique de confidentialité", guidelines: "Règles de la communauté",
  },
  de: {
    ...base, languageUpdated: "ReDom INAPP-Sprache aktualisiert", languageUpdatedBody: "Die Sprache deiner ReDom-App ist jetzt {language}.", joinToday: "Heute ReDom beitreten", createDescription: "Erstelle ein Konto, um dich mit Freunden, Familie und Communities von Menschen auf der ganzen Welt zu verbinden, die deine Interessen teilen.", createAccount: "Neues Konto erstellen", findAccount: "Dein Konto finden", alreadyAccount: "Du hast bereits ein Konto?", login: "Anmelden", loginTitle: "Bei ReDom anmelden", mobileOrEmail: "Handynummer oder E-Mail", password: "Passwort", forgotPassword: "Passwort vergessen?", or: "ODER", whatsName: "Wie heißt du?", realName: "Gib den Namen ein, den du im echten Leben verwendest.", everydayName: "Gib den Namen ein, den du im Alltag verwendest.", firstName: "Vorname", lastName: "Nachname", continue: "Weiter", flowId: "Deine ReDom-Flow-ID ist {flowId}. Verwende sie innerhalb von 30 Minuten.", language: "Sprache", terms: "Nutzungsbedingungen", privacy: "Datenschutzrichtlinie", guidelines: "Community-Richtlinien",
  },
  pt: {
    ...base, languageUpdated: "Idioma INAPP do ReDom atualizado", languageUpdatedBody: "O idioma do seu aplicativo ReDom agora é {language}.", joinToday: "Entre no ReDom hoje", createDescription: "Crie uma conta para se conectar com amigos, familiares e comunidades de pessoas que compartilham seus interesses em todo o mundo.", createAccount: "Criar nova conta", findAccount: "Encontrar sua conta", alreadyAccount: "Já tem uma conta?", login: "Entrar", loginTitle: "Entrar no ReDom", mobileOrEmail: "Número de celular ou e-mail", password: "Senha", forgotPassword: "Esqueceu a senha?", or: "OU", whatsName: "Qual é o seu nome?", realName: "Digite o nome que você usa na vida real.", everydayName: "Digite o nome que você usa no dia a dia.", firstName: "Nome", lastName: "Sobrenome", continue: "Continuar", flowId: "Seu ID de fluxo do ReDom é {flowId}. Use-o dentro de 30 minutos.", language: "Idioma", terms: "Termos e Condições", privacy: "Política de Privacidade", guidelines: "Diretrizes da Comunidade",
  },
  it: {
    ...base, languageUpdated: "Lingua INAPP di ReDom aggiornata", languageUpdatedBody: "La lingua della tua app ReDom ora è {language}.", joinToday: "Unisciti a ReDom oggi", createDescription: "Crea un account per connetterti con amici, familiari e comunità di persone che condividono i tuoi interessi in tutto il mondo.", createAccount: "Crea nuovo account", findAccount: "Trova il tuo account", alreadyAccount: "Hai già un account?", login: "Accedi", loginTitle: "Accedi a ReDom", mobileOrEmail: "Numero di cellulare o e-mail", password: "Password", forgotPassword: "Password dimenticata?", or: "O", whatsName: "Come ti chiami?", realName: "Inserisci il nome che usi nella vita reale.", everydayName: "Inserisci il nome che usi ogni giorno.", firstName: "Nome", lastName: "Cognome", continue: "Continua", flowId: "Il tuo ID flusso ReDom è {flowId}. Usalo entro 30 minuti.", language: "Lingua", terms: "Termini e condizioni", privacy: "Informativa sulla privacy", guidelines: "Linee guida della community",
  },
  nl: {
    ...base, languageUpdated: "ReDom INAPP-taal bijgewerkt", languageUpdatedBody: "De taal van je ReDom-app is nu {language}.", joinToday: "Word vandaag lid van ReDom", createDescription: "Maak een account om contact te maken met vrienden, familie en communities van mensen over de hele wereld die jouw interesses delen.", createAccount: "Nieuw account maken", findAccount: "Je account vinden", alreadyAccount: "Heb je al een account?", login: "Inloggen", loginTitle: "Inloggen bij ReDom", mobileOrEmail: "Mobiel nummer of e-mail", password: "Wachtwoord", forgotPassword: "Wachtwoord vergeten?", or: "OF", whatsName: "Hoe heet je?", realName: "Voer de naam in die je in het echte leven gebruikt.", everydayName: "Voer de naam in die je dagelijks gebruikt.", firstName: "Voornaam", lastName: "Achternaam", continue: "Doorgaan", flowId: "Je ReDom-flow-ID is {flowId}. Gebruik deze binnen 30 minuten.", language: "Taal", terms: "Algemene voorwaarden", privacy: "Privacybeleid", guidelines: "Communityrichtlijnen",
  },
  ar: {
    ...base, languageUpdated: "تم تحديث لغة ReDom داخل التطبيق", languageUpdatedBody: "لغة تطبيق ReDom لديك الآن هي {language}.", joinToday: "انضم إلى ReDom اليوم", createDescription: "أنشئ حسابًا للتواصل مع الأصدقاء والعائلة ومجتمعات الأشخاص الذين يشاركونك اهتماماتك حول العالم.", createAccount: "إنشاء حساب جديد", findAccount: "العثور على حسابك", alreadyAccount: "هل لديك حساب بالفعل؟", login: "تسجيل الدخول", loginTitle: "تسجيل الدخول إلى ReDom", mobileOrEmail: "رقم الهاتف المحمول أو البريد الإلكتروني", password: "كلمة المرور", forgotPassword: "هل نسيت كلمة المرور؟", or: "أو", whatsName: "ما اسمك؟", realName: "أدخل الاسم الذي تستخدمه في حياتك الحقيقية.", everydayName: "اكتب الاسم الذي تستخدمه كل يوم.", firstName: "الاسم الأول", lastName: "اسم العائلة", continue: "متابعة", flowId: "معرّف تدفق ReDom الخاص بك هو {flowId}. استخدمه خلال 30 دقيقة.", language: "اللغة", terms: "الشروط والأحكام", privacy: "سياسة الخصوصية", guidelines: "إرشادات المجتمع",
  },
  zh: {
    ...base, languageUpdated: "ReDom 应用内语言已更新", languageUpdatedBody: "你的 ReDom 应用语言现在是 {language}。", joinToday: "立即加入 ReDom", createDescription: "创建账户，与世界各地兴趣相投的朋友、家人和社区建立联系。", createAccount: "创建新账户", findAccount: "查找你的账户", alreadyAccount: "已经有账户？", login: "登录", loginTitle: "登录 ReDom", mobileOrEmail: "手机号或电子邮箱", password: "密码", forgotPassword: "忘记密码？", or: "或", whatsName: "你的名字是什么？", realName: "输入你现实生活中使用的姓名。", everydayName: "请输入你日常使用的姓名。", firstName: "名字", lastName: "姓氏", continue: "继续", flowId: "你的 ReDom 流程 ID 是 {flowId}。请在 30 分钟内使用。", language: "语言", terms: "条款与条件", privacy: "隐私政策", guidelines: "社区守则",
  },
  ja: {
    ...base, languageUpdated: "ReDomアプリ内言語を更新しました", languageUpdatedBody: "ReDomアプリの言語が{language}になりました。", joinToday: "今すぐReDomに参加", createDescription: "アカウントを作成して、世界中の興味の合う友達、家族、コミュニティとつながりましょう。", createAccount: "新しいアカウントを作成", findAccount: "アカウントを検索", alreadyAccount: "すでにアカウントをお持ちですか？", login: "ログイン", loginTitle: "ReDomにログイン", mobileOrEmail: "携帯電話番号またはメール", password: "パスワード", forgotPassword: "パスワードをお忘れですか？", or: "または", whatsName: "お名前は？", realName: "実生活で使用している名前を入力してください。", everydayName: "普段使用している名前を入力してください。", firstName: "名", lastName: "姓", continue: "続行", flowId: "ReDomフローIDは{flowId}です。30分以内に使用してください。", language: "言語", terms: "利用規約", privacy: "プライバシーポリシー", guidelines: "コミュニティガイドライン",
  },
  ko: {
    ...base, languageUpdated: "ReDom 앱 언어가 업데이트되었습니다", languageUpdatedBody: "ReDom 앱 언어가 이제 {language}입니다.", joinToday: "오늘 ReDom에 가입하세요", createDescription: "계정을 만들어 전 세계에서 관심사를 공유하는 친구, 가족 및 커뮤니티와 연결하세요.", createAccount: "새 계정 만들기", findAccount: "계정 찾기", alreadyAccount: "이미 계정이 있나요?", login: "로그인", loginTitle: "ReDom에 로그인", mobileOrEmail: "휴대폰 번호 또는 이메일", password: "비밀번호", forgotPassword: "비밀번호를 잊으셨나요?", or: "또는", whatsName: "이름이 무엇인가요?", realName: "실생활에서 사용하는 이름을 입력하세요.", everydayName: "일상에서 사용하는 이름을 입력하세요.", firstName: "이름", lastName: "성", continue: "계속", flowId: "ReDom 플로우 ID는 {flowId}입니다. 30분 이내에 사용하세요.", language: "언어", terms: "이용약관", privacy: "개인정보처리방침", guidelines: "커뮤니티 가이드라인",
  },
  hi: {
    ...base, languageUpdated: "ReDom इनऐप भाषा अपडेट की गई", languageUpdatedBody: "आपकी ReDom ऐप भाषा अब {language} है।", joinToday: "आज ही ReDom से जुड़ें", createDescription: "दोस्तों, परिवार और दुनिया भर में अपनी रुचियां साझा करने वाले समुदायों से जुड़ने के लिए खाता बनाएं।", createAccount: "नया खाता बनाएं", findAccount: "अपना खाता खोजें", alreadyAccount: "पहले से खाता है?", login: "लॉग इन", loginTitle: "ReDom में लॉग इन करें", mobileOrEmail: "मोबाइल नंबर या ईमेल", password: "पासवर्ड", forgotPassword: "पासवर्ड भूल गए?", or: "या", whatsName: "आपका नाम क्या है?", realName: "वह नाम दर्ज करें जिसे आप वास्तविक जीवन में उपयोग करते हैं।", everydayName: "वह नाम लिखें जिसे आप रोज़मर्रा में उपयोग करते हैं।", firstName: "पहला नाम", lastName: "उपनाम", continue: "जारी रखें", flowId: "आपकी ReDom Flow ID {flowId} है। इसे 30 मिनट के भीतर उपयोग करें।", language: "भाषा", terms: "नियम और शर्तें", privacy: "गोपनीयता नीति", guidelines: "कम्युनिटी दिशानिर्देश",
  },
  ru: {
    ...base, languageUpdated: "Язык ReDom в приложении обновлён", languageUpdatedBody: "Язык вашего приложения ReDom теперь {language}.", joinToday: "Присоединиться к ReDom сегодня", createDescription: "Создайте аккаунт, чтобы общаться с друзьями, семьёй и сообществами людей со схожими интересами по всему миру.", createAccount: "Создать аккаунт", findAccount: "Найти аккаунт", alreadyAccount: "Уже есть аккаунт?", login: "Войти", loginTitle: "Войти в ReDom", mobileOrEmail: "Номер телефона или эл. почта", password: "Пароль", forgotPassword: "Забыли пароль?", or: "ИЛИ", whatsName: "Как вас зовут?", realName: "Введите имя, которое вы используете в реальной жизни.", everydayName: "Введите имя, которое вы используете каждый день.", firstName: "Имя", lastName: "Фамилия", continue: "Продолжить", flowId: "Ваш Flow ID ReDom: {flowId}. Используйте его в течение 30 минут.", language: "Язык", terms: "Условия использования", privacy: "Политика конфиденциальности", guidelines: "Правила сообщества",
  },
  tr: {
    ...base, languageUpdated: "ReDom uygulama dili güncellendi", languageUpdatedBody: "ReDom uygulamanızın dili artık {language}.", joinToday: "Bugün ReDom'a katıl", createDescription: "Dünyanın dört bir yanında ilgi alanlarınızı paylaşan arkadaşlarınız, aileniz ve topluluklarla bağlantı kurmak için bir hesap oluşturun.", createAccount: "Yeni Hesap Oluştur", findAccount: "Hesabınızı Bulun", alreadyAccount: "Zaten hesabınız var mı?", login: "Giriş Yap", loginTitle: "ReDom'a giriş yap", mobileOrEmail: "Cep telefonu numarası veya e-posta", password: "Şifre", forgotPassword: "Şifrenizi mi unuttunuz?", or: "VEYA", whatsName: "Adınız nedir?", realName: "Gerçek hayatta kullandığınız adı girin.", everydayName: "Günlük hayatta kullandığınız adı yazın.", firstName: "Ad", lastName: "Soyad", continue: "Devam", flowId: "ReDom Flow ID'niz {flowId}. 30 dakika içinde kullanın.", language: "Dil", terms: "Şartlar ve Koşullar", privacy: "Gizlilik Politikası", guidelines: "Topluluk Kuralları",
  },
};

export function t(language: LanguageCode, key: string, vars?: Record<string, string>) {
  const value = translations[language]?.[key] ?? base[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? `{${name}}`);
}

export function languageName(code: LanguageCode) {
  return LANGUAGES.find((item) => item.code === code)?.nativeName ?? "English";
}
