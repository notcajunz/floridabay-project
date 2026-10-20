-- Junior Management (formerly Trial Manager) Discord role. The main Discord already
-- has a role named Trial Manager: global-role reconciliation reuses it through the
-- legacy-role alias in sync.js and renames it, so no duplicate is created. The
-- missing staff Discord role is created on startup.
-- Bot-only migration: the game migration runner intentionally stops at the
-- ACE/rank definition in migration 088.

INSERT INTO network_syncs(
  group_name,role_name,scope,permissions,color,hoist,mentionable,
  all_channels,sort_order,placement,created_by,created_at
)
SELECT
  'junior_management','Junior Management','custom','0',0,FALSE,FALSE,
  FALSE,COALESCE(MAX(sort_order),0)+1,'below','migration',
  UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM network_syncs
ON DUPLICATE KEY UPDATE
  role_name=VALUES(role_name),
  scope=VALUES(scope),
  permissions=VALUES(permissions),
  placement=VALUES(placement);

INSERT IGNORE INTO network_sync_guilds(sync_id,guild_id)
SELECT sync.id,guild.guild_id
FROM network_syncs sync
JOIN network_guilds guild ON guild.kind IN ('main','staff')
WHERE sync.group_name='junior_management';

-- Keep the staff-server role directly below Assistant Community Manager. Head
-- Administrator is the next rank down, so this places Junior Management between them.
INSERT IGNORE INTO network_sync_anchors(sync_id,guild_id,below_role_id)
SELECT sync.id,role.guild_id,role.role_id
FROM network_syncs sync
JOIN network_guilds guild ON guild.kind='staff'
JOIN discord_guild_roles role
  ON role.guild_id=guild.guild_id
 AND LOWER(role.name)=LOWER('Assistant Community Manager')
WHERE sync.group_name='junior_management';
