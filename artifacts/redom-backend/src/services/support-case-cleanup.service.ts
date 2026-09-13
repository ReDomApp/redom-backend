import { logger } from "../lib/logger";
import { getInactiveWaitingCases, permanentlyCloseSupportCase, markReminderSent } from "./support/support.service";
import { sendGeneratedSupportEmail } from "./support/supportEmail.service";

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
          if (supportCase.requesterEmail) {
            const reply = `We haven't received a response regarding your support request.\n\nIf you still need assistance, please reply within the next 2 hours to keep this case active.\n\nCase Number: ${supportCase.caseNumber}`;
            await sendGeneratedSupportEmail({ to: supportCase.requesterEmail, subject: `Re: Support Case ${supportCase.caseNumber}`, caseNumber: supportCase.caseNumber, category: supportCase.category, supportReply: reply });
          }
          await markReminderSent(supportCase.id);
          continue;
        }
        const reply = `Case Status: CLOSED\n\nThis support case has been permanently closed because we did not receive a response within the required time.\n\nIf you are experiencing a new issue, please create a new support case. For your security, closed case numbers cannot be reused.\n\nCase Number: ${supportCase.caseNumber}`;
        await permanentlyCloseSupportCase(supportCase.id);
        if (supportCase.requesterEmail) await sendGeneratedSupportEmail({ to: supportCase.requesterEmail, subject: `Support Case ${supportCase.caseNumber} — CLOSED`, caseNumber: supportCase.caseNumber, category: supportCase.category, supportReply: reply });
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
