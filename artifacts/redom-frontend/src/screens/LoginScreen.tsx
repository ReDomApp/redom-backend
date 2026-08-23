import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Svg, {
  Circle,
  Path,
} from "react-native-svg";

import {
  useNavigation,
} from "@react-navigation/native";

import type {
  NativeStackNavigationProp,
} from "@react-navigation/native-stack";

import {
  authService,
} from "../auth/service";

import {
  validateLoginIdentifier,
  validatePassword,
} from "../auth/validation";

import {
  getDeviceId,
} from "../utils/device";

import type {
  RootStackParamList,
} from "../routing/types";

type Navigation =
  NativeStackNavigationProp<
    RootStackParamList,
    "Login"
  >;

const BLUE = "#1877F2";

function EyeIcon({
  visible,
}: {
  visible: boolean;
}) {
  return (
    <Svg
      width={23}
      height={23}
      viewBox="0 0 24 24"
      fill="none"
    >
      <Path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        stroke="#65676B"
        strokeWidth={1.8}
      />

      <Circle
        cx="12"
        cy="12"
        r="3"
        stroke="#65676B"
        strokeWidth={1.8}
      />

      {!visible && (
        <Path
          d="M4 4l16 16"
          stroke="#65676B"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

export function LoginScreen() {
  const navigation =
    useNavigation<Navigation>();

  const [
    identifier,
    setIdentifier,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    passwordVisible,
    setPasswordVisible,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    deviceId,
    setDeviceId,
  ] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;

    getDeviceId()
      .then((id) => {
        if (mounted) {
          setDeviceId(id);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(
            "Unable to initialize this device.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const submitLogin =
    useCallback(
      async () => {
        if (loading) {
          return;
        }

        setError(null);

        const normalizedIdentifier =
          identifier.trim();

        const identifierError =
          validateLoginIdentifier(
            normalizedIdentifier,
          );

        if (identifierError) {
          setError(
            identifierError,
          );

          return;
        }

        const passwordError =
          validatePassword(
            password,
          );

        if (passwordError) {
          setError(
            passwordError,
          );

          return;
        }

        if (!deviceId) {
          setError(
            "This device has not finished initializing. Please try again.",
          );

          return;
        }

        setLoading(true);

        try {
          const result =
            await authService.login({
              identifier:
                normalizedIdentifier,

              password,

              platform:
                Platform.OS,

              deviceId,

              deviceType:
                "mobile",

              deviceName:
                Platform.OS ===
                "ios"
                  ? "iPhone"
                  : "Android Device",

              loginSource:
                "mobile",

              appVersion:
                "1.0.0",
            });

          if (
            result.requiresVerification &&
            result.verification
          ) {
            navigation.navigate(
              "LoginVerification",
              {
                challengeId:
                  result.verification
                    .challengeId,

                maskedTarget:
                  result.verification
                    .maskedTarget,

                channel:
                  result.verification
                    .channel,

                codeLength:
                  result.verification
                    .codeLength,

                expiresAt:
                  result.verification
                    .expiresAt,
              },
            );

            return;
          }

          if (
            result.success &&
            result.session &&
            result.user
          ) {
            /*
             * AuthContext/session storage will consume
             * this in the next integration step.
             */
            navigation.replace(
              "Home",
            );

            return;
          }

          setError(
            result.message ||
              "Login could not be completed.",
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Login failed. Please try again.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        deviceId,
        identifier,
        loading,
        navigation,
        password,
      ],
    );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={
          styles.scroll
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.card}>
          <Text style={styles.logo}>
            ReDom
          </Text>

          <Text style={styles.notice}>
            By proceeding you agree to{" "}
            <Text
              style={styles.link}
              onPress={() =>
                navigation.navigate(
                  "NetworkTerms",
                )
              }
            >
              Your Network Provider Terms
            </Text>
            {" "}which includes letting
            ReDom request and receive your
            phone number.
          </Text>

          <View style={styles.inputBox}>
            <TextInput
              value={identifier}
              onChangeText={(value) => {
                setIdentifier(
                  value,
                );

                if (error) {
                  setError(null);
                }
              }}
              placeholder="Mobile Number or Email"
              placeholderTextColor="#8A8D91"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="email-address"
              autoComplete="username"
              maxLength={100}
              editable={!loading}
              style={styles.input}
            />
          </View>

          <View style={styles.inputBox}>
            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(
                  value,
                );

                if (error) {
                  setError(null);
                }
              }}
              placeholder="Password"
              placeholderTextColor="#8A8D91"
              secureTextEntry={
                !passwordVisible
              }
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              maxLength={100}
              editable={!loading}
              style={[
                styles.input,
                styles.passwordInput,
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                passwordVisible
                  ? "Hide password"
                  : "Show password"
              }
              onPress={() =>
                setPasswordVisible(
                  (current) =>
                    !current,
                )
              }
              style={styles.eye}
            >
              <EyeIcon
                visible={
                  passwordVisible
                }
              />
            </Pressable>
          </View>

          {error ? (
            <Text
              accessibilityRole="alert"
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Login"
            disabled={loading}
            onPress={submitLogin}
            style={[
              styles.loginButton,
              loading &&
                styles.buttonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.loginButtonText
                }
              >
                Login
              </Text>
            )}
          </Pressable>

          <Pressable
            disabled={loading}
            onPress={() =>
              navigation.navigate(
                "ForgotPassword",
              )
            }
            style={styles.forgotButton}
          >
            {loading ? (
              <Text
                style={styles.link}
              >
                Forgot Password?
              </Text>
            ) : (
              <Text
                style={styles.link}
              >
                Forgot Password?
              </Text>
            )}
          </Pressable>

          <Pressable
            disabled={loading}
            onPress={() =>
              navigation.navigate(
                "Signup1",
              )
            }
            style={[
              styles.signupButton,
              loading &&
                styles.buttonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color={BLUE}
              />
            ) : (
              <Text
                style={
                  styles.signupButtonText
                }
              >
                Create New Account
              </Text>
            )}
          </Pressable>

          <Text style={styles.footer}>
            © ReDom 2026
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F0F2F5",
    },

    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 20,
    },

    card: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      paddingVertical: 35,
      paddingHorizontal: 30,

      shadowColor:
        "#000000",
      shadowOffset: {
        width: 0,
        height: 15,
      },
      shadowOpacity: 0.08,
      shadowRadius: 35,

      elevation: 6,
    },

    logo: {
      fontSize: 54,
      lineHeight: 62,
      fontWeight: "800",
      textAlign: "center",
      color: BLUE,
      letterSpacing: -2,
      marginBottom: 25,
    },

    notice: {
      textAlign: "center",
      fontSize: 14,
      lineHeight: 24,
      color: "#65676B",
      marginBottom: 28,
    },

    link: {
      color: BLUE,
      fontWeight: "600",
    },

    inputBox: {
      position: "relative",
      marginBottom: 18,
    },

    input: {
      width: "100%",
      height: 54,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: "#CCD0D5",
      borderRadius: 12,
      fontSize: 16,
      color: "#1C1E21",
      backgroundColor:
        "#FFFFFF",
    },

    passwordInput: {
      paddingRight: 58,
    },

    eye: {
      position: "absolute",
      right: 16,
      top: 15,
      width: 25,
      height: 25,
      alignItems: "center",
      justifyContent:
        "center",
    },

    error: {
      marginBottom: 16,
      textAlign: "center",
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "600",
      color: "#E41E3F",
    },

    loginButton: {
      width: "100%",
      height: 54,
      borderRadius: 12,
      backgroundColor: BLUE,
      alignItems: "center",
      justifyContent:
        "center",
    },

    buttonDisabled: {
      opacity: 0.75,
    },

    loginButtonText: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "700",
    },

    forgotButton: {
      height: 50,
      marginTop: 10,
      alignItems: "center",
      justifyContent:
        "center",
    },

    signupButton: {
      width: "100%",
      height: 54,
      marginTop: 18,
      borderWidth: 2,
      borderColor: BLUE,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
    },

    signupButtonText: {
      color: BLUE,
      fontSize: 16,
      fontWeight: "700",
    },

    footer: {
      marginTop: 35,
      textAlign: "center",
      fontSize: 13,
      color: "#65676B",
      lineHeight: 21,
    },
  });