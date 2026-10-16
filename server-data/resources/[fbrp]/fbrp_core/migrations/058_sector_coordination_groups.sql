-- Sector coordination ACE groups. Members join through a source role (the team role that the sector
-- /coord add command hands out, or a rank role in the staff server) and wear a synced display role
-- in the other network servers. Bot-only migration, so it is not listed in fbrp_core database.lua.
ALTER TABLE network_syncs ADD COLUMN IF NOT EXISTS placement VARCHAR(8) NOT NULL DEFAULT 'top';

CREATE TABLE IF NOT EXISTS discord_role_sources (
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  group_name VARCHAR(64) NOT NULL,
  PRIMARY KEY (guild_id, role_id, group_name)
);

INSERT IGNORE INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES
  ('gang_coordination_team','Gang Coordination Team',0,FALSE,'migration'),
  ('department_coordinator','Department Coordinator',0,FALSE,'migration'),
  ('business_coordinator','Business Coordinator',0,FALSE,'migration');

INSERT IGNORE INTO network_syncs(group_name,role_name,scope,permissions,color,hoist,mentionable,all_channels,sort_order,placement,created_by,created_at) VALUES
  ('gang_coordination_team','FBRP | Gang Coordination Team','custom','500362386',0,0,0,0,5,'below','migration',UNIX_TIMESTAMP()*1000),
  ('department_coordinator','FBRP | Department Coordinator','custom','500362386',0,0,0,0,6,'below','migration',UNIX_TIMESTAMP()*1000),
  ('business_coordinator','FBRP | Business Coordinator','custom','500362386',0,0,0,0,7,'below','migration',UNIX_TIMESTAMP()*1000);

-- Servers each role is created in: gangs plus staff, every department server except the hub, businesses plus staff.
-- The hub and the staff server already own a Department Coordinator role that is itself a source, so it is not mirrored.
INSERT IGNORE INTO network_sync_guilds(sync_id,guild_id)
SELECT s.id,g.guild_id FROM network_syncs s JOIN (
  SELECT 'gang_coordination_team' grp,'1558950044042797169' guild_id
  UNION ALL SELECT 'gang_coordination_team','1557600357163474946'
  UNION ALL SELECT 'department_coordinator','1558238773958017024'
  UNION ALL SELECT 'department_coordinator','1559832199971340318'
  UNION ALL SELECT 'department_coordinator','1559832450069438534'
  UNION ALL SELECT 'business_coordinator','1559682840411635813'
  UNION ALL SELECT 'business_coordinator','1557600357163474946'
) g ON g.grp=s.group_name;

-- Existing roles reused as they are in the main sector servers (managed=0 keeps their permissions).
-- Highway Patrol and Fire & Rescue already had a same-named role with no permissions, so those are managed.
INSERT INTO network_sync_roles(sync_id,guild_id,role_id,managed)
SELECT s.id,r.guild_id,r.role_id,r.managed FROM network_syncs s JOIN (
  SELECT 'gang_coordination_team' grp,'1558950044042797169' guild_id,'1559682517659943033' role_id,0 managed
  UNION ALL SELECT 'business_coordinator','1559682840411635813','1559701166261141534',0
  UNION ALL SELECT 'department_coordinator','1559832199971340318','1559832200806137938',1
  UNION ALL SELECT 'department_coordinator','1559832450069438534','1559832450392137781',1
) r ON r.grp=s.group_name
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),managed=VALUES(managed);

-- Where new roles go: right under Management Team, and under Staff Coordination Team in the staff server.
-- The role is placed directly under its anchor each time the bot syncs roles.
CREATE TABLE IF NOT EXISTS network_sync_anchors (
  sync_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  below_role_id VARCHAR(24) NOT NULL,
  PRIMARY KEY (sync_id, guild_id)
);
INSERT IGNORE INTO network_sync_anchors(sync_id,guild_id,below_role_id)
SELECT s.id,a.guild_id,a.below_role_id FROM network_syncs s JOIN (
  SELECT 'gang_coordination_team' grp,'1557600357163474946' guild_id,'1558267361797210142' below_role_id
  UNION ALL SELECT 'business_coordinator','1557600357163474946','1558267361797210142'
  UNION ALL SELECT 'department_coordinator','1558238773958017024','1558621583298404422'
  UNION ALL SELECT 'department_coordinator','1559832199971340318','1559832200806137944'
  UNION ALL SELECT 'department_coordinator','1559832450069438534','1559832450392137784'
) a ON a.grp=s.group_name;

-- Source roles. Holding one makes the member part of the group in every network server.
INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name) VALUES
  ('1558950044042797169','1559682517659943033','gang_coordination_team'),
  ('1559682840411635813','1559701166261141534','business_coordinator'),
  ('1558235113295315004','1560393453479657563','department_coordinator'),
  ('1557600357163474946','1560412018975055963','department_coordinator'),
  ('1557600357163474946','1559580246355869716','department_coordinator'),
  ('1557600357163474946','1560412319140548678','department_coordinator'),
  ('1557600357163474946','1558268799931785266','department_coordinator');
