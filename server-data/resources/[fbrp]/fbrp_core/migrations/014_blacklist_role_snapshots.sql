-- Immutable pre-blacklist role snapshots. discord_member_cache remains a live
-- cache and can legitimately change while the member is isolated, so restore must
-- use this table instead.
CREATE TABLE IF NOT EXISTS discord_role_restore_snapshots (
  guild_id VARCHAR(24) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  roles JSON NOT NULL,
  captured_by VARCHAR(24) NOT NULL,
  captured_at BIGINT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'global_blacklist',
  PRIMARY KEY(guild_id,discord_id),
  INDEX restore_snapshot_member(discord_id,guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
