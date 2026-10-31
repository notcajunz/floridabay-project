CREATE TABLE IF NOT EXISTS temporary_discord_roles (
  guild_id VARCHAR(32) NOT NULL,
  member_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  granted_by VARCHAR(32) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  granted_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  status ENUM('active','expiring','expired') NOT NULL DEFAULT 'active',
  removed_at BIGINT NULL,
  removal_error VARCHAR(500) NULL,
  PRIMARY KEY (guild_id, member_id, role_id),
  KEY idx_temporary_discord_roles_expiry (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
