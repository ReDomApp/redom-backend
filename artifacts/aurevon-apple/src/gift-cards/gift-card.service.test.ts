import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GiftCardService, GiftCardError } from "./gift-card.service.js";
import type { GiftCardRecord, GiftCardRepository } from "./gift-card.types.js";

class MemoryRepository implements GiftCardRepository {
  records = new Map<string, GiftCardRecord>();

  async insert(record: GiftCardRecord) {
    if ([...this.records.values()].some((r) => r.codeHash === record.codeHash)) {
      throw new Error("duplicate code hash");
    }
    this.records.set(record.id, { ...record });
  }

  async findByCodeHash(codeHash: string) {
    const record = [...this.records.values()].find((r) => r.codeHash === codeHash);
    return record ? { ...record } : null;
  }

  async redeemAtomic(input: { id: string; amountMinor: number; redeemedAt: string }) {
    const record = this.records.get(input.id);
    if (!record || record.status !== "active" || record.balanceMinor < input.amountMinor) return null;
    const nextBalance = record.balanceMinor - input.amountMinor;
    const updated: GiftCardRecord = {
      ...record,
      balanceMinor: nextBalance,
      status: nextBalance === 0 ? "redeemed" : "active",
      redeemedAt: nextBalance === 0 ? input.redeemedAt : null,
    };
    this.records.set(record.id, updated);
    return { ...updated };
  }

  async voidAtomic(input: { id: string }) {
    const record = this.records.get(input.id);
    if (!record || record.status !== "active") return null;
    const updated = { ...record, status: "void" as const };
    this.records.set(record.id, updated);
    return { ...updated };
  }
}

describe("GiftCardService", () => {
  it("issues a first-party code and does not expose the stored hash", async () => {
    const service = new GiftCardService(new MemoryRepository(), () => new Date("2026-01-01T00:00:00Z"));
    const result = await service.issue({ amountMinor: 2500, currency: "usd" });
    assert.match(result.code, /^AUR-/);
    assert.equal(result.card.balanceMinor, 2500);
    assert.equal("codeHash" in result.card, false);
  });

  it("supports balance checks and partial then full redemption", async () => {
    const service = new GiftCardService(new MemoryRepository(), () => new Date("2026-01-01T00:00:00Z"));
    const issued = await service.issue({ amountMinor: 5000, currency: "USD" });
    const partial = await service.redeem(issued.code, 1200);
    assert.equal(partial.balanceMinor, 3800);
    const final = await service.redeem(issued.code, 3800);
    assert.equal(final.balanceMinor, 0);
    assert.equal(final.status, "redeemed");
  });

  it("rejects a redemption greater than the balance", async () => {
    const service = new GiftCardService(new MemoryRepository());
    const issued = await service.issue({ amountMinor: 1000, currency: "USD" });
    await assert.rejects(
      () => service.redeem(issued.code, 1001),
      (error: unknown) => error instanceof GiftCardError && error.code === "INSUFFICIENT_BALANCE",
    );
  });

  it("rejects invalid issue amounts", async () => {
    const service = new GiftCardService(new MemoryRepository());
    await assert.rejects(
      () => service.issue({ amountMinor: 0, currency: "USD" }),
      (error: unknown) => error instanceof GiftCardError && error.code === "INVALID_AMOUNT",
    );
  });

  it("rejects unknown codes", async () => {
    const service = new GiftCardService(new MemoryRepository());
    await assert.rejects(
      () => service.checkBalance("AUR-UNKNOWN-CODE"),
      (error: unknown) => error instanceof GiftCardError && error.code === "NOT_FOUND",
    );
  });
});
