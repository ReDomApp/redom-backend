ALTER TABLE redom_ai_images
  ADD COLUMN IF NOT EXISTS outputs jsonb,
  ADD COLUMN IF NOT EXISTS settings jsonb;
