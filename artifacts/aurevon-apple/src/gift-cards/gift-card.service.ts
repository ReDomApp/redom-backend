import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  GiftCardPublicView,
  GiftCardRecord,
  GiftCardRepository,
  IssueGiftCardInput,
} from "./gift-card.types.js";

const CODE_PREFIX = "AUR";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MIN_AMOUNT_MINOR = 100;
const MAX_AMOUNT_MINOR = 1_000_000_00;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class GiftCardError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_AMOUNT"
      | "INVALID_CURRENCY"
      | "INVALID_EXPIRY"
      | "NOT_FOUND"
      | "NOT_ACTIVE"
      | "INSUFFICIENT_BALANCE"
      | "INVALID_CODE",
  ) {
    super(message);
    this.name = "GiftCardError";
  }
}

function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function generateCode(): string {
  // Uniform rejection sampling avoids modulo bias. The code is random and is
  // valid only in the AUREVON-issued gift-card ledger; it is not an Apple code.
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  let body = "";
  while (body.length < 20) {
    for (const byte of randomBytes(32)) {
      if (byte >= limit) continue;
      body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (body.length === 20) break;
    }
  }
  return `${CODE_PREFIX}-${body.match(/.{1,5}/g)!.join("-")}`;
}

function publicView(record: GiftCardRecord): GiftCardPublicView {
  return {
    id: record.id,
    currency: record.currency,
    initialBalanceMinor: record.initialBalanceMinor,
    balanceMinor: record.balanceMinor,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
}

export class GiftCardService {
  constructor(
    private readonly repository: GiftCardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(input: IssueGiftCardInput): Promise<{
    card: GiftCardPublicView;
    code: string;
  }> {
    if (
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor < MIN_AMOUNT_MINOR ||
      input.amountMinor > MAX_AMOUNT_MINOR
    ) {
      throw new GiftCardError("Amount is outside the permitted range.", "INVALID_AMOUNT");
    }

    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new GiftCardError("Currency must be a three-letter ISO currency code.", "INVALID_CURRENCY");
    }

    const issuedAt = this.now();
    let expiresAt: string | null = null;
    if (input.expiresAt) {
      const expiry = new Date(input.expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry <= issuedAt) {
        throw new GiftCardError("Expiry must be a valid future date.", "INVALID_EXPIRY");
      }
      expiresAt = expiry.toISOString();
    }

    // Collision handling is delegated to a unique constraint on codeHash in
    // the persistent store; callers should retry only on that specific conflict.
    const code = generateCode();
    const record: GiftCardRecord = {
      id: randomUUID(),
      codeHash: hashCode(code),
      currency,
      initialBalanceMinor: input.amountMinor,
      balanceMinor: input.amountMinor,
      status: "active",
      issuedAt: issuedAt.toISOString(),
      expiresAt,
      redeemedAt: null,
      metadata: input.metadata ?? {},
    };

    await this.repository.insert(record);
    return { card: publicView(record), code };
  }

  async checkBalance(code: string): Promise<GiftCardPublicView> {
    if (!code || normalizeCode(code).length < 10) {
      throw new GiftCardError("Gift-card code is invalid.", "INVALID_CODE");
    }
    const record = await this.repository.findByCodeHash(hashCode(code));
    if (!record) throw new GiftCardError("Gift card was not found.", "NOT_FOUND");
    return publicView(this.applyExpiry(record));
  }

  async redeem(code: string, amountMinor: number): Promise<GiftCardPublicView> {
    if (!code || normalizeCode(code).length < 10) {
      throw new GiftCardError("Gift-card code is invalid.", "INVALID_CODE");
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new GiftCardError("Redemption amount must be a positive integer in minor currency units.", "INVALID_AMOUNT");
    }

    const existing = await this.repository.findByCodeHash(hashCode(code));
    if (!existing) throw new GiftCardError("Gift card was not found.", "NOT_FOUND");
    const current = this.applyExpiry(existing);
    if (current.status !== "active") {
      throw new GiftCardError("Gift card is not active.", "NOT_ACTIVE");
    }
    if (amountMinor > current.balanceMinor) {
      throw new GiftCardError("Redemption exceeds the available balance.", "INSUFFICIENT_BALANCE");
    }

    // The repository operation must use a database transaction / conditional
    // update to prevent concurrent redemptions from spending the same balance.
    const updated = await this.repository.redeemAtomic({
      id: current.id,
      amountMinor,
      redeemedAt: this.now().toISOString(),
    });
    if (!updated) {
      throw new GiftCardError("Gift card changed during redemption; re-check the balance.", "NOT_ACTIVE");
    }
    return publicView(updated);
  }

  async void(code: string): Promise<GiftCardPublicView> {
    const existing = await this.repository.findByCodeHash(hashCode(code));
    if (!existing) throw new GiftCardError("Gift card was not found.", "NOT_FOUND");
    const updated = await this.repository.voidAtomic({ id: existing.id });
    if (!updated) throw new GiftCardError("Gift card could not be voided.", "NOT_ACTIVE");
    return publicView(updated);
  }

  private applyExpiry(record: GiftCardRecord): GiftCardRecord {
    if (
      record.status === "active" &&
      record.expiresAt &&
      new Date(record.expiresAt) <= this.now()
    ) {
      return { ...record, status: "expired", balanceMinor: record.balanceMinor };
    }
    return record;
  }
}
