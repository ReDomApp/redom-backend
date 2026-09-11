export type RegistrationFlowReservationRouteParams = { reservationId: string; flowId: string; expiresAt: string };
export type RegistrationRouteParams = { challengeId: string; flowId: string; maskedTarget: string; expiresAt: string };
export type RootStackParamList = {
  Login: undefined;
  FindAccount: undefined;
  DeviceVerification: { challengeId: string; channel: "sms" | "email" | "whatsapp"; maskedTarget: string; expiresAt: string };
  RegistrationWelcome: undefined;
  RegistrationIdentity: RegistrationFlowReservationRouteParams;
  RegistrationBirthday: RegistrationFlowReservationRouteParams;
  RegistrationGender: RegistrationFlowReservationRouteParams;
  RegistrationPhone: RegistrationFlowReservationRouteParams;
  RegistrationEmail: RegistrationFlowReservationRouteParams;
  RegistrationPassword: RegistrationFlowReservationRouteParams;
  RegistrationReview: RegistrationFlowReservationRouteParams;
  RegistrationVerification: { verificationChallengeId: string; reservationId?: string; deviceId?: string; flowId: string; channel: "sms" | "email"; maskedTarget: string; expiresAt: string };
  CustomizingExperience: { verificationChallengeId: string; reservationId?: string; flowId: string };
  HomeFeed: undefined;
  Foundation: undefined;
};
