-- Compatibility placeholder for the existing Drizzle journal entry 0014_high_lilith.
-- The original SQL migration file is missing from the repository, while its journal
-- entry is retained. Keep this migration intentionally side-effect free so Drizzle
-- can reconcile the existing migration history and continue with 0015+.
SELECT 1;
