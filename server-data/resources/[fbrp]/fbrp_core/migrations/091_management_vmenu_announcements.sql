-- vMenu Enhanced's own admin tools are retired in favor of EasyAdmin (see config_vmenu.lua).
-- The one exception is the announcement tool: every member of the derived management team
-- group may open the staff menu and send vMenu announcements.
INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,v.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.Enhanced.Menus.Admin.Menu' AS object
  UNION ALL SELECT 'vMenu.Enhanced.Menus.Admin.Announce'
) v
WHERE g.name='mgmt_team'
ON DUPLICATE KEY UPDATE mode=VALUES(mode);
