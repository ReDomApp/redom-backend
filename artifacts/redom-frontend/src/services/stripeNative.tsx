import Constants from "expo-constants";
import { View, Text, StyleSheet } from "react-native";
import type { ComponentType, ReactNode } from "react";

const isExpoGo = Constants.appOwnership === "expo";

type StripeModule = {
  StripeProvider: ComponentType<any>;
  useStripe: () => any;
  CardForm: ComponentType<any>;
};

let cachedModule: StripeModule | null | undefined;

function getStripeModule(): StripeModule | null {
  if (isExpoGo) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    // Load Stripe only when running in a native build that can contain its
    // native TurboModule. This prevents Expo Go from evaluating StripeSdk.
    cachedModule = require("@stripe/stripe-react-native") as StripeModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function StripeProviderCompat({ children, ...props }: { children: ReactNode; [key: string]: any }) {
  const mod = getStripeModule();
  if (!mod?.StripeProvider) return <>{children}</>;
  const Provider = mod.StripeProvider;
  return <Provider {...props}>{children}</Provider>;
}

export function useStripeCompat() {
  const mod = getStripeModule();
  if (mod?.useStripe) return mod.useStripe();
  return {
    createPaymentMethod: async () => ({
      error: {
        code: "StripeNativeModuleUnavailable",
        message: "Stripe card entry requires a ReDom development build. Expo Go can run the rest of ReDom normally."
      }
    }),
    confirmSetupIntent: async () => ({
      error: {
        code: "StripeNativeModuleUnavailable",
        message: "Stripe card verification requires a ReDom development build."
      }
    }),
    confirmPayment: async () => ({
      error: {
        code: "StripeNativeModuleUnavailable",
        message: "Stripe payment confirmation requires a ReDom development build."
      }
    }),
    handleNextAction: async () => ({
      error: {
        code: "StripeNativeModuleUnavailable",
        message: "Stripe payment authentication requires a ReDom development build."
      }
    })
  };
}

export function CardFormCompat(props: any) {
  const mod = getStripeModule();
  if (mod?.CardForm) {
    const CardForm = mod.CardForm;
    return <CardForm {...props} />;
  }

  return (
    <View style={styles.unavailable}>
      <Text style={styles.title}>Secure Stripe card entry</Text>
      <Text style={styles.text}>
        ReDom Pay's native Stripe card field requires the ReDom development build. Expo Go remains available for testing the rest of the app.
      </Text>
    </View>
  );
}

export const stripeNativeAvailable = !isExpoGo && Boolean(getStripeModule());

const styles = StyleSheet.create({
  unavailable: {
    flex: 1,
    minHeight: 120,
    borderRadius: 14,
    backgroundColor: "#F0F2F5",
    borderWidth: 1,
    borderColor: "#DADDE1",
    padding: 16,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 6,
  },
  text: {
    fontSize: 13,
    lineHeight: 19,
    color: "#65676B",
  },
});
