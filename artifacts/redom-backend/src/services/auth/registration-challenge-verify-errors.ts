import { registrationChallengeService } from "./registration-challenge.service";

const originalVerify = registrationChallengeService.verify.bind(registrationChallengeService);

(registrationChallengeService as any).verify = async (params: Parameters<typeof originalVerify>[0]) => {
  try {
    const result = await originalVerify(params);
    return { ...result, message: "Verification code successful." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    if (/expired/i.test(message)) throw new Error("Verification code has expired.");
    if (/invalid verification code|verification code is invalid/i.test(message)) throw new Error("Verification Code Is Incorrect.");
    throw error;
  }
};
