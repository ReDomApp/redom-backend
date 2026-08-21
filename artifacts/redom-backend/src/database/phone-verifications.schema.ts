/**
 * LEGACY VERIFICATION SCHEMA
 *
 * ReDom v7.0.211
 *
 * Phone OTP challenges are now stored exclusively
 * in:
 *
 *   database/verifications.schema.ts
 *
 * Do NOT create or write new records into the
 * legacy phone_verifications table.
 *
 * ReDom itself generates, hashes, stores and verifies
 * the OTP.
 *
 * Providers are delivery mechanisms only.
 */

export {};