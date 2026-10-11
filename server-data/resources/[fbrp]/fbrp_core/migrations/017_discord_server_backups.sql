-- Point-in-time backups of every Discord network server (roles, channels, overwrites,
-- guild settings and member role assignments). Written by /backup save, read by /backup restore.
CREATE TABLE IF NOT EXISTS discord_server_backups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(100) NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  guild_count INT UNSIGNED NOT NULL DEFAULT 0,
  skipped TEXT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discord_server_backup_guilds (
  backup_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NULL,
  roles INT UNSIGNED NOT NULL DEFAULT 0,
  channels INT UNSIGNED NOT NULL DEFAULT 0,
  members INT UNSIGNED NOT NULL DEFAULT 0,
  data LONGBLOB NOT NULL,
  PRIMARY KEY (backup_id, guild_id),
  CONSTRAINT fk_server_backup_guild FOREIGN KEY (backup_id) REFERENCES discord_server_backups(id) ON DELETE CASCADE
) ENGINE=InnoDB;
