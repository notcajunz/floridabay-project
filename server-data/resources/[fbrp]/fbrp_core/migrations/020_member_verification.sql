-- Website verification. A member must sign in with Discord on the website before joining the
-- network servers or the game. Only salted hashes of IP addresses and linked accounts (Steam,
-- Xbox, and similar connections) are kept, so ban evasion can be detected without storing raw IPs.

CREATE TABLE IF NOT EXISTS member_verifications (
  discord_id VARCHAR(24) NOT NULL PRIMARY KEY,
  verified_at BIGINT NOT NULL,
  last_verified_at BIGINT NOT NULL,
  method VARCHAR(24) NOT NULL,
  granted_by VARCHAR(24) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS identity_links (
  discord_id VARCHAR(24) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  value_hash CHAR(64) NOT NULL,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  PRIMARY KEY(discord_id,kind,value_hash),
  INDEX identity_lookup(value_hash)
) ENGINE=InnoDB;
