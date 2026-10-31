-- Bind each coordinator group to its fixed main Discord role.
INSERT INTO network_sync_roles(sync_id,guild_id,role_id,managed)
SELECT s.id,'1557594282976747550',r.role_id,0
FROM network_syncs s JOIN (
  SELECT 'staff_coordination_team' group_name,'1565463763019235450' role_id
  UNION ALL SELECT 'department_coordinator','1565463893306777754'
  UNION ALL SELECT 'gang_coordination_team','1565463571289088041'
  UNION ALL SELECT 'business_coordinator','1565464270504730684'
) r ON r.group_name=s.group_name
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),managed=VALUES(managed);
