-- Status tracking for DM bug reports and suggestions (buttons in the dev log channel) and the
-- twice-daily reminder of unfinished items.
ALTER TABLE devops_intake
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(24) NULL,
  ADD COLUMN IF NOT EXISTS resolved_at BIGINT NULL,
  ADD INDEX IF NOT EXISTS devops_intake_status(status,created_at);
