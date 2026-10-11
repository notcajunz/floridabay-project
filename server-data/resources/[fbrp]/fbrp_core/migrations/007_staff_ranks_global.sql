-- Staff ranks map to ACE groups (/staff add), callsign nickname prefixes are gone,
-- and moderation cases can be network-wide (/global) with an active flag and a linked game ban.

ALTER TABLE staff_roster_ranks
  ADD COLUMN IF NOT EXISTS ace_group VARCHAR(64) NULL AFTER discord_guild_id;

ALTER TABLE staff_roster_ranks
  ADD CONSTRAINT fk_roster_rank_ace_group FOREIGN KEY IF NOT EXISTS (ace_group) REFERENCES ace_groups(name) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE staff_roster_categories
  DROP COLUMN IF EXISTS nickname_prefix;

ALTER TABLE moderation_cases
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS duration_ms BIGINT NULL,
  ADD COLUMN IF NOT EXISTS game_ban_id INT NULL,
  ADD INDEX IF NOT EXISTS cases_global(guild_id,action,active);
