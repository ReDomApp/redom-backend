export type RootStackParamList = {
  Login: undefined;
  DeviceVerification: {
    challengeId: string;
    channel: "sms" | "email" | "whatsapp";
    maskedTarget: string;
    expiresAt: string;
  };
  Foundation: undefined;
};
