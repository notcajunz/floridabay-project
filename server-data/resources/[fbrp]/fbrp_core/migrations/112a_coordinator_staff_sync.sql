-- Define the staff coordination sync used by the main Discord role mirror.
INSERT IGNORE INTO network_syncs(group_name,role_name,scope,permissions,color,hoist,mentionable,all_channels,sort_order,placement,created_by,created_at) VALUES
  ('staff_coordination_team','FBRP | Staff Coordinator','custom','0',0,0,0,0,4,'below','migration',UNIX_TIMESTAMP()*1000);
