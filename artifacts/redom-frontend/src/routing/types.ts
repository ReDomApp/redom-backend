export type RegistrationFlowReservationRouteParams = { reservationId: string; flowId: string; expiresAt: string; };
export type RegistrationRouteParams = { challengeId: string; flowId: string; maskedTarget: string; expiresAt: string; };
export type RootStackParamList = {
  Login: undefined;
  FindAccount: undefined;
  DeviceVerification: { challengeId: string; channel: "sms" | "email" | "whatsapp"; maskedTarget: string; expiresAt: string; };
  RegistrationWelcome: undefined;
  RegistrationContact: RegistrationFlowReservationRouteParams;
  RegistrationIdentity: RegistrationRouteParams;
  RegistrationUsername: RegistrationRouteParams;
  RegistrationProfile: RegistrationRouteParams;
  RegistrationPassword: RegistrationRouteParams;
  RegistrationReview: RegistrationRouteParams;
  RegistrationVerification: RegistrationRouteParams & { verificationChallengeId: string; channel: "sms" | "email" | "whatsapp"; codeLength: number; };
  Foundation: undefined;
};
