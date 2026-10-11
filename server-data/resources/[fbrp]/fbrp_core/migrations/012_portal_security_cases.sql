-- Website identity, appeals, stable moderation IDs, and server-scoped security bypasses.

ALTER TABLE moderation_cases
  ADD COLUMN IF NOT EXISTS ban_id VARCHAR(24) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'discord_bot' AFTER action,
  ADD COLUMN IF NOT EXISTS target_name VARCHAR(100) NULL AFTER target_id,
  ADD UNIQUE KEY IF NOT EXISTS moderation_ban_id(ban_id),
  ADD INDEX IF NOT EXISTS cases_game_ban(game_ban_id);

UPDATE moderation_cases
SET ban_id=CONCAT('FB-',LPAD(id,8,'0'))
WHERE ban_id IS NULL;

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  ticket_id BIGINT UNSIGNED NULL,
  status ENUM('submitted','under_review','approved','denied','withdrawn') NOT NULL DEFAULT 'submitted',
  statement TEXT NOT NULL,
  response TEXT NULL,
  reviewed_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY one_open_appeal(case_id,author_id,status),
  INDEX appeal_author(author_id,created_at),
  INDEX appeal_queue(status,created_at),
  CONSTRAINT fk_appeal_case FOREIGN KEY(case_id) REFERENCES moderation_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_appeal_ticket FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_sessions (
  session_hash CHAR(64) PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  username VARCHAR(100) NOT NULL,
  avatar VARCHAR(300) NULL,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX portal_session_user(discord_id,expires_at),
  INDEX portal_session_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- '*' means every network server. A concrete guild ID bypasses automated
-- protection only in that Discord server. Manual moderation and ACE checks
-- are intentionally never bypassed.
CREATE TABLE IF NOT EXISTS discord_security_exemption_scopes (
  discord_id VARCHAR(24) NOT NULL,
  guild_id VARCHAR(24) NOT NULL DEFAULT '*',
  reason VARCHAR(200) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(discord_id,guild_id),
  INDEX exemption_scope(guild_id,discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO discord_security_exemption_scopes(discord_id,guild_id,reason,added_by,added_at)
SELECT discord_id,'*',reason,added_by,added_at FROM discord_security_exemptions;
