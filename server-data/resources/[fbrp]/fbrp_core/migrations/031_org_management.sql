-- Organization management: rank ladders with permissions, a message of the day,
-- limited-stock and prerequisite shop items, wallet transfers between
-- organizations, and department (LEO / fire / government) budgets funded by
-- duty time and drug seizures.

-- Ranks are optional. Members without one keep the default member access
-- (armory and garage, no spending). Leaders (organization_members.manager)
-- always have every permission.
CREATE TABLE IF NOT EXISTS org_ranks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  level TINYINT UNSIGNED NOT NULL DEFAULT 10,
  can_spend BOOLEAN NOT NULL DEFAULT FALSE,
  can_roster BOOLEAN NOT NULL DEFAULT FALSE,
  can_armory BOOLEAN NOT NULL DEFAULT TRUE,
  can_garage BOOLEAN NOT NULL DEFAULT TRUE,
  spend_limit INT UNSIGNED NULL,
  created_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY org_rank_name(org_id,name),
  INDEX org_rank_level(org_id,level),
  CONSTRAINT fk_rank_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS rank_id INT UNSIGNED NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS motd VARCHAR(300) NULL;

-- stock: how many organizations may own the item at once (NULL = unlimited,
-- properties are always exclusive). requires: item_key that must be owned first.
ALTER TABLE org_shop_items ADD COLUMN IF NOT EXISTS stock INT UNSIGNED NULL;
ALTER TABLE org_shop_items ADD COLUMN IF NOT EXISTS requires VARCHAR(40) NULL;

-- Which department seized a run, so departments can see their own record.
ALTER TABLE org_drug_runs ADD COLUMN IF NOT EXISTS seized_org_id INT UNSIGNED NULL;
CREATE INDEX IF NOT EXISTS drug_run_seizer ON org_drug_runs(seized_org_id,created_at);
CREATE INDEX IF NOT EXISTS org_tx_actor ON org_transactions(org_id,actor_id,created_at);

-- Weapon permits form a ladder, and the heaviest ones are limited.
UPDATE org_shop_items SET requires='wpn_sidearms' WHERE item_key IN ('wpn_shotgun','wpn_smg') AND requires IS NULL;
UPDATE org_shop_items SET requires='wpn_smg' WHERE item_key='wpn_rifle' AND requires IS NULL;
UPDATE org_shop_items SET stock=3 WHERE item_key='wpn_rifle' AND stock IS NULL;
UPDATE org_shop_items SET stock=4 WHERE item_key IN ('veh_kuruma2','veh_schafter6') AND stock IS NULL;
