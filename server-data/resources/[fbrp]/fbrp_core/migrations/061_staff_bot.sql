-- Staff Assistant bot (src/staff). Bot-only migration, so it is not listed in fbrp_core database.lua.
-- The Staff Coordination Team gets its own ACE group, which the staff bot keeps in line with the
-- team role. The staff bot is only in the staff server, so everything it needs done elsewhere is
-- queued here and carried out by the main bot, which is in every server.
INSERT IGNORE INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES
  ('staff_coordination_team','Staff Coordination Team',0,FALSE,'migration');

CREATE TABLE IF NOT EXISTS network_sync_queue (
  discord_id VARCHAR(24) NOT NULL PRIMARY KEY,
  requested_by VARCHAR(32) NOT NULL,
  requested_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS network_role_queue (
  guild_id VARCHAR(24) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  action VARCHAR(8) NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  requested_by VARCHAR(32) NOT NULL,
  requested_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, discord_id, role_id),
  KEY role_queue_time (requested_at)
);
