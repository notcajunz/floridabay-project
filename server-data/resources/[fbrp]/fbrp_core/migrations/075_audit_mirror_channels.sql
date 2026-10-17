-- Channels the bot created in the audit category, one per kind of log entry.
CREATE TABLE IF NOT EXISTS audit_mirror_channels (
  channel_key VARCHAR(100) NOT NULL PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
