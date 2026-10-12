-- Organization economy. Money only exists here (and on the website / Discord
-- bot): gangs earn it by producing and delivering product in game, businesses
-- by working the properties they own, and leaders spend it on properties
-- (MLOs), vehicles, armory permits, outfits (EUP) and perks. The shop catalog
-- is seeded by the bot (src/economy.js) and editable from live configuration.

CREATE TABLE IF NOT EXISTS org_wallets (
  org_id INT UNSIGNED PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  lifetime_earned BIGINT NOT NULL DEFAULT 0,
  lifetime_spent BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_wallet_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  kind VARCHAR(24) NOT NULL,
  description VARCHAR(200) NOT NULL,
  actor_id VARCHAR(32) NULL,
  ref VARCHAR(64) NULL,
  created_at BIGINT NOT NULL,
  INDEX org_tx(org_id,created_at),
  INDEX org_tx_kind(kind,created_at),
  CONSTRAINT fk_tx_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_shop_items (
  item_key VARCHAR(40) PRIMARY KEY,
  kind ENUM('property','vehicle','weapon','outfit','perk') NOT NULL,
  label VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  price INT UNSIGNED NOT NULL,
  org_types VARCHAR(80) NOT NULL DEFAULT 'gang,business',
  data JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_purchases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  item_key VARCHAR(40) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  label VARCHAR(80) NOT NULL,
  price INT UNSIGNED NOT NULL,
  purchased_by VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY org_item(org_id,item_key),
  INDEX purchase_item(item_key),
  CONSTRAINT fk_purchase_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A property (MLO) has exactly one owner at a time.
CREATE TABLE IF NOT EXISTS org_properties (
  item_key VARCHAR(40) PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  purchased_by VARCHAR(32) NOT NULL,
  purchased_at BIGINT NOT NULL,
  INDEX property_org(org_id),
  CONSTRAINT fk_property_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_drug_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NULL,
  discord_id VARCHAR(32) NULL,
  character_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  drug VARCHAR(16) NOT NULL,
  units INT UNSIGNED NOT NULL,
  payout INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('delivered','seized','confiscated') NOT NULL,
  seized_by VARCHAR(100) NULL,
  location VARCHAR(80) NULL,
  created_at BIGINT NOT NULL,
  INDEX drug_run_org(org_id,created_at),
  INDEX drug_run_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product a player is carrying, so a crash or reconnect does not erase it.
CREATE TABLE IF NOT EXISTS player_contraband (
  owner_key VARCHAR(120) PRIMARY KEY,
  org_id INT UNSIGNED NULL,
  drug VARCHAR(16) NOT NULL,
  units INT UNSIGNED NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
