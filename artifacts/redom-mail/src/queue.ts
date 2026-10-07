import type { NormalizedMessage, DeliveryResult } from "./types.js";
import { deliverDirect } from "./smtp.js";

export class MailQueue {
  private readonly pending: NormalizedMessage[] = [];
  private running = false;

  constructor(private readonly config: Parameters<typeof deliverDirect>[1]) {}

  enqueue(message: NormalizedMessage): void {
    this.pending.push(message);
    void this.drain();
  }

  size(): number {
    return this.pending.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.pending.length) {
        const message = this.pending.shift()!;
        const result = await deliverDirect(message, this.config);
        const outcome: DeliveryResult = result.retryable
          ? { ok: false, id: message.id, retryable: true, error: result.response }
          : result.retryable === false && result.response.startsWith("250")
            ? { ok: true, id: message.id }
            : { ok: false, id: message.id, retryable: false, error: result.response };

        if (!outcome.ok && outcome.retryable && message.attempt < 4) {
          const retry = { ...message, attempt: message.attempt + 1 };
          setTimeout(() => this.pending.push(retry) && void this.drain(), 5000 * retry.attempt);
        }
        console.log(JSON.stringify({ event: outcome.ok ? "email.delivered" : "email.failed", ...outcome }));
      }
    } finally {
      this.running = false;
    }
  }
}
