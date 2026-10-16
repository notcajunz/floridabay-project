-- Coordination positions become staff roster jobs bound to their staff server roles.
-- In the staff server those roles are sources for the sector groups, so the mirrored display
-- roles in the sector servers and the staff server are unlinked (the roles themselves are kept).
DELETE r FROM network_sync_roles r JOIN network_syncs s ON s.id=r.sync_id
WHERE s.group_name IN ('gang_coordination_team','business_coordinator');
DELETE g FROM network_sync_guilds g JOIN network_syncs s ON s.id=g.sync_id
WHERE s.group_name IN ('gang_coordination_team','business_coordinator');
DELETE a FROM network_sync_anchors a JOIN network_syncs s ON s.id=a.sync_id
WHERE s.group_name IN ('gang_coordination_team','business_coordinator');

INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name) VALUES
  ('1557600357163474946','1560433543388069991','gang_coordination_team'),
  ('1557600357163474946','1560433544197832746','business_coordinator');

INSERT IGNORE INTO staff_roster_jobs(name,description,discord_role_id,discord_guild_id,sort_order,created_at) VALUES
  ('Staff Coordination Team','Staff coordination team',  '1558267361797210142','1557600357163474946',10,UNIX_TIMESTAMP()*1000),
  ('Gang Coordination Team','Gang coordination team',    '1560433543388069991','1557600357163474946',11,UNIX_TIMESTAMP()*1000),
  ('Department Coordinator','Department coordinator',    '1560412319140548678','1557600357163474946',12,UNIX_TIMESTAMP()*1000),
  ('Business Coordinator','Business coordinator',        '1560433544197832746','1557600357163474946',13,UNIX_TIMESTAMP()*1000);
