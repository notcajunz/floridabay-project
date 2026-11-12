-- IAA roster, SOP and locked alt database documents, their controlled access list and the alt records.
-- Google file IDs live only here, never in the repository or the Discord channels.
CREATE TABLE IF NOT EXISTS iaa_documents (
  doc_key VARCHAR(16) NOT NULL PRIMARY KEY,
  kind VARCHAR(8) NOT NULL,
  title VARCHAR(120) NOT NULL,
  google_id VARCHAR(128) NOT NULL,
  content_hash VARCHAR(64) NULL,
  created_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  synced_at BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_doc_access (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_key VARCHAR(16) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  email VARCHAR(190) NOT NULL,
  level VARCHAR(10) NOT NULL DEFAULT 'reader',
  permission_id VARCHAR(128) NULL,
  granted_by VARCHAR(24) NOT NULL,
  granted_at BIGINT NOT NULL,
  revoked_at BIGINT NULL,
  revoked_by VARCHAR(24) NULL,
  revoke_reason VARCHAR(190) NULL,
  revoke_pending TINYINT(1) NOT NULL DEFAULT 0,
  KEY iaa_doc_access_member (discord_id, revoked_at),
  KEY iaa_doc_access_doc (doc_key, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_alt_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  main_discord_id VARCHAR(24) NOT NULL,
  alt_discord_id VARCHAR(24) NOT NULL,
  alt_username VARCHAR(80) NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'manual',
  evidence VARCHAR(500) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  added_by VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY iaa_alt_pair (main_discord_id, alt_discord_id),
  KEY iaa_alt_alt (alt_discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
