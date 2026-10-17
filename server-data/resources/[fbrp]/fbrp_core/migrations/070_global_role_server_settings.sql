-- A shared Discord role can grant different role permissions and channel access
-- in each network server. Missing rows inherit the sync-wide defaults.
CREATE TABLE IF NOT EXISTS network_sync_guild_settings (
  sync_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  permissions VARCHAR(24) NOT NULL DEFAULT '0',
  all_channels BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY(sync_id,guild_id),
  CONSTRAINT fk_sync_guild_settings_sync FOREIGN KEY(sync_id) REFERENCES network_syncs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
