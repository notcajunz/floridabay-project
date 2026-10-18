-- Character phones and the organization roster website (orgs.floridabay.net).
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.

-- The phone (sky_phone) issues each character a persistent number. Once issued, the
-- citizen record keeps that number and the citizen editor shows it read only.
ALTER TABLE character_profiles ADD COLUMN IF NOT EXISTS phone_from_device BOOLEAN NOT NULL DEFAULT FALSE;

-- Customizable ranks: colour, description and the remaining permissions.
ALTER TABLE org_ranks
  ADD COLUMN IF NOT EXISTS color CHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS description VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS can_sell BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_ranks BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_motd BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_ledger BOOLEAN NOT NULL DEFAULT TRUE;

-- Discord roles bound to a rank.
CREATE TABLE IF NOT EXISTS org_rank_roles (
  rank_id INT UNSIGNED NOT NULL,
  org_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(32) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(rank_id,guild_id,role_id),
  INDEX org_rank_role_org(org_id,added_at),
  CONSTRAINT fk_rank_role_rank FOREIGN KEY(rank_id) REFERENCES org_ranks(id) ON DELETE CASCADE,
  CONSTRAINT fk_rank_role_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- role_sync: rank changes on the website give and remove the bound Discord roles.
-- auto_rank: members are ranked by the highest bound role they hold in Discord.
CREATE TABLE IF NOT EXISTS org_roster_settings (
  org_id INT UNSIGNED NOT NULL PRIMARY KEY,
  role_sync BOOLEAN NOT NULL DEFAULT TRUE,
  auto_rank BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_roster_settings_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roster activity shown on the organization page.
CREATE TABLE IF NOT EXISTS org_roster_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  actor_id VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target_id VARCHAR(32) NULL,
  detail JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX org_roster_log_lookup(org_id,id),
  CONSTRAINT fk_roster_log_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
