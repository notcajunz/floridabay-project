-- Approve and Deny review of bans and blacklists. A punishment takes effect immediately, then a higher rank
-- approves it or denies it, and denying reverts it. A NULL approval_status means the case predates reviews.
-- log_channel_id and log_message_id point at the log message that carries the buttons.

ALTER TABLE moderation_cases
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(12) NULL,
  ADD COLUMN IF NOT EXISTS approval_by VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS approval_at BIGINT NULL,
  ADD COLUMN IF NOT EXISTS log_channel_id VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS log_message_id VARCHAR(32) NULL;
