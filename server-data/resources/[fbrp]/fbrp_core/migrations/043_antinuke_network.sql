-- Network-wide anti-nuke offender list. An account that trips anti-nuke anywhere is contained in
-- every network server and stopped instantly on any later action or join until it is pardoned.
CREATE TABLE IF NOT EXISTS network_nuke_offenders (
  discord_id VARCHAR(24) PRIMARY KEY,
  origin_guild_id VARCHAR(24) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  punishment VARCHAR(16) NOT NULL,
  details JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL,
  cleared_by VARCHAR(24) NULL,
  cleared_at BIGINT NULL,
  INDEX nuke_offender_active(active,created_at)
) ENGINE=InnoDB;
