/**
 * LEGACY VERIFICATION SCHEMA
 *
 * ReDom v7.0.211
 *
 * Email OTP challenges are now stored exclusively
 * in:
 *
 *   database/verifications.schema.ts
 *
 * Do NOT create or write new records into the
 * legacy email_verifications table.
 *
 * This file is retained temporarily so existing
 * imports do not break while the database migration
 * removes the legacy table.
 *
 * Security rule:
 *
 * plaintext OTPs MUST NEVER be stored.
 */

export {};