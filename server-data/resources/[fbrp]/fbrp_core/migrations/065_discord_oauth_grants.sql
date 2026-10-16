-- Short-lived, encrypted Discord OAuth grants used only for direct network joins.
-- The reversible token is encrypted by the bot before it reaches MariaDB.
CREATE TABLE IF NOT EXISTS discord_oauth_grants (
  discord_id VARCHAR(24) NOT NULL PRIMARY KEY,
  token_ciphertext TEXT NOT NULL,
  scopes VARCHAR(500) NOT NULL,
  expires_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX discord_oauth_grants_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
