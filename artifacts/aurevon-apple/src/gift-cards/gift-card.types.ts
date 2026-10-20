export type GiftCardStatus = "active" | "redeemed" | "void" | "expired";

export interface GiftCardRecord {
  id: string;
  codeHash: string;
  currency: string;
  initialBalanceMinor: number;
  balanceMinor: number;
  status: GiftCardStatus;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  metadata: Record<string, string>;
}

export interface GiftCardPublicView {
  id: string;
  currency: string;
  initialBalanceMinor: number;
  balanceMinor: number;
  status: GiftCardStatus;
  issuedAt: string;
  expiresAt: string | null;
}

export interface GiftCardRepository {
  insert(record: GiftCardRecord): Promise<void>;
  findByCodeHash(codeHash: string): Promise<GiftCardRecord | null>;
  /** Must be atomic: update balance/status only if current balance is sufficient and active. */
  redeemAtomic(input: {
    id: string;
    amountMinor: number;
    redeemedAt: string;
  }): Promise<GiftCardRecord | null>;
  voidAtomic(input: { id: string }): Promise<GiftCardRecord | null>;
}

export interface IssueGiftCardInput {
  amountMinor: number;
  currency: string;
  expiresAt?: string | null;
  metadata?: Record<string, string>;
}
