-- Total in-game time per Cfx license. fbrp_core adds each session in
-- batches and on disconnect. The Discord bot sums rows per Discord ID.
CREATE TABLE IF NOT EXISTS player_playtime (
  license VARCHAR(100) NOT NULL PRIMARY KEY,
  discord_id VARCHAR(24) NULL,
  name VARCHAR(80) NOT NULL,
  seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sessions INT UNSIGNED NOT NULL DEFAULT 0,
  afk_kicks INT UNSIGNED NOT NULL DEFAULT 0,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  INDEX playtime_discord(discord_id),
  INDEX playtime_seconds(seconds)
) ENGINE=InnoDB;
