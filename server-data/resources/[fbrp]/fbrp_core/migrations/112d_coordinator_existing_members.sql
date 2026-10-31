-- Queue existing coordinator memberships for immediate reconciliation.
INSERT INTO network_sync_queue(discord_id,requested_by,requested_at)
SELECT DISTINCT discord_id,'migration-112',UNIX_TIMESTAMP()*1000
FROM ace_memberships
WHERE group_name IN ('staff_coordination_team','department_coordinator','gang_coordination_team','business_coordinator')
ON DUPLICATE KEY UPDATE requested_by=VALUES(requested_by),requested_at=VALUES(requested_at);
