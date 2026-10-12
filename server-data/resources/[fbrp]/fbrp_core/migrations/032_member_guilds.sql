-- Discord servers a member belongs to, as reported by Discord when they sign in on the website
-- (the guilds scope). Replaced wholesale on every sign-in, so it always reflects the last
-- sign-in. Staff read it in /userinfo to see where a member is outside the network.

CREATE TABLE IF NOT EXISTS member_guilds (
  discord_id VARCHAR(24) NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  guild_name VARCHAR(100) NOT NULL,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  PRIMARY KEY(discord_id,guild_id),
  INDEX member_guilds_guild(guild_id)
) ENGINE=InnoDB;
