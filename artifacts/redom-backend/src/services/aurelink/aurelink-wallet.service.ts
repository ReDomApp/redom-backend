import type { PoolClient } from "pg";

export type WalletEntryType = "topup" | "purchase" | "refund" | "renewal" | "adjustment";
export async function ensureWallet(client: Pick<PoolClient,"query">, userId: string) {
  await client.query("INSERT INTO aurelink_wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[userId]);
  const result=await client.query("SELECT balance_minor,currency FROM aurelink_wallets WHERE user_id=$1 FOR UPDATE",[userId]);
  return result.rows[0] as {balance_minor:string;currency:string};
}
export async function walletCredit(client: Pick<PoolClient,"query">, input:{userId:string;amountMinor:number|string;reference:string;type:WalletEntryType;description:string;orderId?:string|null;paymentReference?:string|null;metadata?:Record<string,unknown>}) {
  const amount=BigInt(String(input.amountMinor));
  if(amount<=0n)throw new Error("Wallet credit must be positive.");
  const prior=await client.query("SELECT balance_after_minor FROM aurelink_wallet_ledger WHERE reference=$1 LIMIT 1",[input.reference]);
  if(prior.rows[0])return String(prior.rows[0].balance_after_minor);
  const wallet=await ensureWallet(client,input.userId);
  const next=BigInt(String(wallet.balance_minor))+amount;
  await client.query("UPDATE aurelink_wallets SET balance_minor=$1,updated_at=NOW() WHERE user_id=$2",[next.toString(),input.userId]);
  await client.query("INSERT INTO aurelink_wallet_ledger(user_id,entry_type,direction,amount_minor,balance_after_minor,currency,reference,order_id,payment_reference,description,metadata) VALUES($1,$2,'credit',$3,$4,'USD',$5,$6,$7,$8,$9::jsonb)",[input.userId,input.type,amount.toString(),next.toString(),input.reference,input.orderId??null,input.paymentReference??null,input.description,JSON.stringify(input.metadata??{})]);
  return next.toString();
}
export async function walletDebit(client: Pick<PoolClient,"query">, input:{userId:string;amountMinor:number|string;reference:string;type:WalletEntryType;description:string;orderId?:string|null;metadata?:Record<string,unknown>}) {
  const amount=BigInt(String(input.amountMinor));
  if(amount<=0n)throw new Error("Wallet debit must be positive.");
  const prior=await client.query("SELECT balance_after_minor FROM aurelink_wallet_ledger WHERE reference=$1 LIMIT 1",[input.reference]);
  if(prior.rows[0])return String(prior.rows[0].balance_after_minor);
  const wallet=await ensureWallet(client,input.userId);
  const current=BigInt(String(wallet.balance_minor));
  if(current<amount)throw new Error("INSUFFICIENT_AURELINK_CREDIT");
  const next=current-amount;
  await client.query("UPDATE aurelink_wallets SET balance_minor=$1,updated_at=NOW() WHERE user_id=$2",[next.toString(),input.userId]);
  await client.query("INSERT INTO aurelink_wallet_ledger(user_id,entry_type,direction,amount_minor,balance_after_minor,currency,reference,order_id,description,metadata) VALUES($1,$2,'debit',$3,$4,'USD',$5,$6,$7,$8::jsonb)",[input.userId,input.type,amount.toString(),next.toString(),input.reference,input.orderId??null,input.description,JSON.stringify(input.metadata??{})]);
  return next.toString();
}
