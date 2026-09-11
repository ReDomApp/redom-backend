import { eq } from "drizzle-orm";
import { db } from "../../database/db";
import { registrationChallenges } from "../../database/registration-challenges.schema";
import { registrationChallengeService } from "./registration-challenge.service";

const originalComplete = registrationChallengeService.complete.bind(registrationChallengeService);
(registrationChallengeService as any).complete = async (params: Parameters<typeof originalComplete>[0]) => {
  const challenge = await db.query.registrationChallenges.findFirst({ where: eq(registrationChallenges.id, params.challengeId) });
  const rawFlowId = challenge?.flowId;
  const result = await originalComplete(params) as any;
  return rawFlowId ? { ...result, flowId: rawFlowId } : result;
};
