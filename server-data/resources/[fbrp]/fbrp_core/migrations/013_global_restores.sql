-- Role snapshots authorized by /global restore. A row is consumed after the
-- member rejoins and the saved, still-manageable roles have been applied.
CREATE TABLE IF NOT EXISTS discord_pending_role_restores (
  guild_id VARCHAR(24) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  roles JSON NOT NULL,
  requested_by VARCHAR(24) NOT NULL,
  requested_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,discord_id),
  INDEX pending_restore_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
