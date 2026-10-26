import { timingSafeEqual, createHash } from "node:crypto";

export function parseServiceKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length >= 32);
}

/** Hash before comparison so timingSafeEqual always receives fixed-length buffers. */
export function isAuthorizedBearer(
  authorization: string | undefined,
  acceptedKeys: readonly string[],
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const candidate = authorization.slice(7).trim();
  if (!candidate || acceptedKeys.length === 0) return false;
  const candidateHash = createHash("sha256").update(candidate).digest();
  return acceptedKeys.some((key) => {
    const expectedHash = createHash("sha256").update(key).digest();
    return timingSafeEqual(candidateHash, expectedHash);
  });
}

export class SlidingWindowLimiter {
  private readonly events = new Map<string, number[]>();

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxTrackedKeys: number;

  constructor(limit: number, windowMs: number, maxTrackedKeys = 10_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxTrackedKeys = maxTrackedKeys;
  }

  consume(key: string, now = Date.now()): boolean {
    const recent = (this.events.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.limit) {
      this.events.set(key, recent);
      return false;
    }
    recent.push(now);
    this.events.set(key, recent);
    if (this.events.size > this.maxTrackedKeys) {
      for (const [trackedKey, times] of this.events) {
        if (times.length === 0 || now - (times[times.length - 1] ?? 0) >= this.windowMs) {
          this.events.delete(trackedKey);
        }
        if (this.events.size <= this.maxTrackedKeys) break;
      }
    }
    return true;
  }
}
