-- Bug reports move out of the main server ticket system: players now DM the FBRP | DevOps bot
-- (services/fbrp-bot/src/devops/intake.js), which collects details and logs them for the dev team.
UPDATE ticket_types SET enabled=FALSE WHERE type_key='bug';

CREATE TABLE IF NOT EXISTS devops_intake (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  username VARCHAR(80) NOT NULL,
  answers LONGTEXT NOT NULL,
  log_message_id VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_intake_user(discord_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
