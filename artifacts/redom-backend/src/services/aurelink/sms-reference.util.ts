/** Public SMS purchase and credit-ledger references use the same opaque format. */
export const isAurelinkSmsPublicReference = (value: string): boolean => /^[A-Z0-9]{18,19}$/.test(value);
