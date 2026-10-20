-- Badge AI reading: when the AI finds sample text on a template it erases that text from the stored picture.
-- original keeps the picture as it was uploaded so the reading can be run again. NULL means the stored picture is the original.
ALTER TABLE org_badge_templates
  ADD COLUMN IF NOT EXISTS original MEDIUMBLOB NULL,
  ADD COLUMN IF NOT EXISTS detected_at BIGINT NULL;
