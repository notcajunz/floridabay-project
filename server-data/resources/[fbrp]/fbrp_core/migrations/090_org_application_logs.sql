-- Application logs for organizations on the orgs website.
-- Bot-only migration: the game migration runner intentionally stops at the
-- ACE/rank definition in migration 088. The main department application log
-- (Department Management) is the bot_config key dept_application_main_log.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.

-- The log channel high command picks for its own organization, the role it pings and
-- whether the message carries Accept and Deny buttons or only the website link.
CREATE TABLE IF NOT EXISTS org_application_logs (
  org_id INT UNSIGNED NOT NULL PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  ping_role_id VARCHAR(32) NULL,
  buttons BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_org_application_log_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discord messages posted for each application, edited when it is reviewed.
CREATE TABLE IF NOT EXISTS org_application_messages (
  application_id BIGINT UNSIGNED NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  PRIMARY KEY(application_id, channel_id),
  CONSTRAINT fk_org_application_message_app FOREIGN KEY(application_id) REFERENCES org_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accepted department applicants are added to the department Discord. When the
-- applicant has not authorized direct joins yet the join waits for verification.
ALTER TABLE org_applications
  ADD COLUMN IF NOT EXISTS join_state VARCHAR(24) NULL,
  ADD COLUMN IF NOT EXISTS join_guild_id VARCHAR(32) NULL;
