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

import {
  useAuthContext,
} from "../auth/context";

import {
  validateLoginIdentifier,
  validatePassword,
} from "../auth/validation";

import {
  getDeviceId,
} from "../utils/device";

/*
 * ReDom SVG assets
 */
import ReDomLogo from "../assets/brand/redom-logo.svg";
import PasswordVisible from "../assets/auth/password-visible.svg";
import PasswordHidden from "../assets/auth/password-hidden.svg";

const BLUE = "#1877F2";

export function LoginScreen() {
  const {
    login,
  } = useAuthContext();

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

  /*
   * Get the real device identifier before
   * allowing authentication to be submitted.
   */
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

        /*
         * Local validation happens before
         * anything reaches the backend.
         *
         * This includes rejecting a 15-digit
         * numeric/public-ID-style identifier.
         */
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
          /*
           * AuthContext → authService →
           * POST /auth/login
           */
          const result =
            await login({
              identifier:
                normalizedIdentifier,

              password,

              platform:
                Platform.OS,

              deviceId,

              deviceType:
                "mobile",

              deviceName:
                Platform.OS === "ios"
                  ? "iPhone"
                  : "Android Device",

              loginSource:
                "mobile",

              appVersion:
                "1.0.0",
            });

          /*
           * The backend may require additional
           * verification for a new device.
           *
           * We deliberately do not invent or
           * navigate to a verification screen yet.
           */
          if (
            result.requiresVerification
          ) {
            setError(
              result.message ||
                "Additional login verification is required.",
            );

            return;
          }

          /*
           * AuthContext has already stored the
           * session and changed the authentication
           * state when login succeeds.
           *
           * No manual navigation is performed here.
           * The authenticated destination will be
           * connected after its screen is defined.
           */
          if (
            result.success &&
            result.session &&
            result.user
          ) {
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
        login,
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

          {/* ReDom official brand SVG */}
          <View
            style={styles.logoContainer}
          >
            <ReDomLogo
              width={190}
              height={53}
            />
          </View>

          <Text style={styles.notice}>
            By proceeding you agree to{" "}
            <Text style={styles.link}>
              Your Network Provider Terms
            </Text>{" "}
            which includes letting
            ReDom request and receive your
            phone number.
          </Text>

          {/* Identifier */}
          <View style={styles.inputBox}>
            <TextInput
              value={identifier}
              onChangeText={(value) => {
                setIdentifier(value);

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

          {/* Password */}
          <View style={styles.inputBox}>
            <TextInput
              value={password}
              onChangeText={(value) => {
                setPassword(value);

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
              disabled={loading}
              onPress={() =>
                setPasswordVisible(
                  (current) =>
                    !current,
                )
              }
              style={styles.eye}
            >
              {passwordVisible ? (
                <PasswordVisible
                  width={23}
                  height={23}
                />
              ) : (
                <PasswordHidden
                  width={23}
                  height={23}
                />
              )}
            </Pressable>
          </View>

          {/* Error */}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={styles.error}
            >
              {error}
            </Text>
          ) : null}

          {/* Login */}
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

          {/* Forgot Password */}
          <Pressable
            disabled={loading}
            onPress={() => {
              /*
               * Not connected yet.
               *
               * The Forgot Password screen and
               * its exact behavior will be defined
               * before implementation.
               */
            }}
            style={styles.forgotButton}
          >
            <Text style={styles.link}>
              Forgot Password?
            </Text>
          </Pressable>

          {/* Create Account */}
          <Pressable
            disabled={loading}
            onPress={() => {
              /*
               * Not connected yet.
               *
               * The Create Account screen and
               * its exact behavior will be defined
               * before implementation.
               */
            }}
            style={[
              styles.signupButton,
              loading &&
                styles.buttonDisabled,
            ]}
          >
            <Text
              style={
                styles.signupButtonText
              }
            >
              Create New Account
            </Text>
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

    logoContainer: {
      alignItems: "center",
      justifyContent:
        "center",
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