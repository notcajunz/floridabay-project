-- Discord giveaways run by /giveaway (Co-Owner and above). Bot-only tables.
CREATE TABLE IF NOT EXISTS giveaways (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NOT NULL,
  message_id VARCHAR(24) NULL,
  prize VARCHAR(200) NOT NULL,
  description VARCHAR(500) NULL,
  winner_count INT NOT NULL DEFAULT 1,
  host_id VARCHAR(24) NOT NULL,
  ends_at BIGINT NOT NULL,
  ended BOOLEAN NOT NULL DEFAULT FALSE,
  winners JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX giveaway_due(ended,ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INT NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  entered_at BIGINT NOT NULL,
  PRIMARY KEY(giveaway_id,discord_id)
) ENGINE=InnoDB;
