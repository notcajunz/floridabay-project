-- Bring the Florida Bay global Discord role sync to feature parity with Ascent.
ALTER TABLE network_syncs
  ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'all' AFTER role_name,
  ADD COLUMN IF NOT EXISTS permissions VARCHAR(24) NOT NULL DEFAULT '0' AFTER scope,
  ADD COLUMN IF NOT EXISTS all_channels BOOLEAN NOT NULL DEFAULT FALSE AFTER mentionable;

CREATE TABLE IF NOT EXISTS network_sync_guilds (
  sync_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  PRIMARY KEY(sync_id,guild_id),
  CONSTRAINT fk_sync_guild_sync FOREIGN KEY(sync_id) REFERENCES network_syncs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Older FBRP builds treated a bound Discord role as the source of ACE membership.
-- The Ascent model makes ACE membership authoritative and gates the Discord role from it.
-- Preserve existing access once as a direct membership before removing the circular origin.
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT discord_id,group_name,'manual',added_by,added_at
FROM ace_memberships
WHERE origin LIKE 'discord:%';

DELETE FROM ace_memberships WHERE origin LIKE 'discord:%';
