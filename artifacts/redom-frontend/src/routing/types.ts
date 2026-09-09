export type RegistrationRouteParams = {
  challengeId: string;
  flowId: string;
  maskedTarget: string;
  expiresAt: string;
};

export type RootStackParamList = {
  Login: undefined;
  DeviceVerification: {
    challengeId: string;
    channel: "sms" | "email" | "whatsapp";
    maskedTarget: string;
    expiresAt: string;
  };
  RegistrationContact: undefined;
  RegistrationIdentity: RegistrationRouteParams;
  RegistrationUsername: RegistrationRouteParams;
  RegistrationProfile: RegistrationRouteParams;
  RegistrationPassword: RegistrationRouteParams;
  RegistrationReview: RegistrationRouteParams;
  RegistrationVerification: RegistrationRouteParams & {
    verificationChallengeId: string;
    channel: "sms" | "email" | "whatsapp";
    codeLength: number;
  };
  Foundation: undefined;
};
