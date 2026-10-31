-- The /announcement centre-screen announcement is available to the derived management team
-- (Assistant Community Manager and above), the same group that held the vMenu Enhanced announcement tool.
INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,'fbrp.announce.center','allow'
FROM ace_groups g
WHERE g.name='mgmt_team'
ON DUPLICATE KEY UPDATE mode=VALUES(mode);
