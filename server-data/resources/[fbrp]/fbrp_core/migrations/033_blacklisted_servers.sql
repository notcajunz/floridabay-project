-- Discord servers whose members should be highlighted during /userinfo investigations.

CREATE TABLE IF NOT EXISTS blacklisted_servers (
  guild_id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  updated_by VARCHAR(24) NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX blacklisted_servers_name(name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
