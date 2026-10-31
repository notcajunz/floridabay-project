-- Enable each coordinator sync in the main Discord.
INSERT IGNORE INTO network_sync_guilds(sync_id,guild_id)
SELECT id,'1557594282976747550' FROM network_syncs
WHERE group_name IN ('staff_coordination_team','department_coordinator','gang_coordination_team','business_coordinator');
