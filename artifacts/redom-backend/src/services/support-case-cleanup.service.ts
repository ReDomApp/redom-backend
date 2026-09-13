import { logger } from "../lib/logger";
import { getInactiveWaitingCases, permanentlyCloseSupportCase, markReminderSent, sendSupportEmail, sendSupportReminder } from "./support/support.service";

let timer: NodeJS.Timeout | undefined;
let running = false;

async function processSupportCases(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cases = await getInactiveWaitingCases();
    for (const supportCase of cases) {
      try {
        if (!supportCase.reminderSentAt) {
          if (supportCase.requesterEmail) await sendSupportReminder(supportCase.requesterEmail, supportCase.caseNumber);
          await markReminderSent(supportCase.id);
          continue;
        }
        await permanentlyCloseSupportCase(supportCase.id);
        if (supportCase.requesterEmail) {
          await sendSupportEmail(
            supportCase.requesterEmail,
            `Support Case ${supportCase.caseNumber} — CLOSED`,
            `Case Status: CLOSED\n\nThis support case has been permanently closed because we did not receive a response within the required time.\n\nIf you are experiencing a new issue, please create a new support case. For your security, closed case numbers cannot be reused.\n\nCase Number: ${supportCase.caseNumber}`,
          );
        }
      } catch (error) {
        logger.error({ err: error, caseNumber: supportCase.caseNumber }, "Support case lifecycle processing failed");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Support case cleanup failed");
  } finally {
    running = false;
  }
}

export function startSupportCaseCleanup(): void {
  if (timer) return;
  timer = setInterval(() => { void processSupportCases(); }, 5 * 60 * 1000);
  void processSupportCases();
}

export function stopSupportCaseCleanup(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
