-- Live, Discord-managed chain of command.  The message IDs are kept so the
-- board is edited in place rather than reposted every time somebody changes it.
CREATE TABLE IF NOT EXISTS chain_of_command_config (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  channel_id VARCHAR(32) NOT NULL,
  title VARCHAR(100) NOT NULL DEFAULT 'Florida Bay Roleplay | Chain of Command',
  message_ids LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(message_ids)),
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chain_of_command_entries (
  guild_id VARCHAR(32) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  title VARCHAR(100) NULL,
  positions TEXT NULL,
  assistant_ids LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(assistant_ids)),
  color VARCHAR(7) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  added_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (guild_id, discord_id),
  INDEX coc_entry_order (guild_id, active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
