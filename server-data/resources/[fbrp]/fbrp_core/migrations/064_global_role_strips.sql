-- Reversible network-wide role removals. The active row is also a quarantine
-- marker: Discord role sync and FiveM ACE resolution ignore the account until
-- /global unrolestrip finishes restoring this snapshot.
CREATE TABLE IF NOT EXISTS global_role_strips (
  discord_id VARCHAR(24) NOT NULL PRIMARY KEY,
  ace_memberships JSON NOT NULL,
  guild_roles JSON NOT NULL,
  target_level INT NOT NULL DEFAULT -1,
  reason VARCHAR(300) NOT NULL,
  stripped_by VARCHAR(24) NOT NULL,
  stripped_at BIGINT NOT NULL,
  restoring BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX global_role_strips_state(restoring,stripped_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
