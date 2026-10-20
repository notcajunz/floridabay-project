-- Durable Tebex events and Discord entitlement ownership
CREATE TABLE IF NOT EXISTS tebex_webhook_events (
  webhook_id VARCHAR(64) PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  status ENUM('processing','done','attention','failed') NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  error VARCHAR(500) NULL,
  received_at BIGINT NOT NULL,
  processed_at BIGINT NULL,
  INDEX tebex_webhook_status (status, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tebex_store_entitlements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(190) NOT NULL,
  transaction_id VARCHAR(80) NOT NULL,
  recurring_reference VARCHAR(80) NULL,
  product_id VARCHAR(80) NULL,
  product_name VARCHAR(160) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at BIGINT NOT NULL,
  revoked_at BIGINT NULL,
  last_webhook_id VARCHAR(64) NOT NULL,
  UNIQUE KEY tebex_entitlement_source_role (source_key, role_id),
  INDEX tebex_entitlement_member_role (discord_id, role_id, active),
  INDEX tebex_entitlement_recurring (recurring_reference, active),
  INDEX tebex_entitlement_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tebex_store_role_states (
  discord_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  bot_managed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (discord_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
