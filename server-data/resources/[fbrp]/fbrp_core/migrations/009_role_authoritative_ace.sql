-- The three gameplay access groups use their main-server Discord roles as an
-- alternate source of ACE membership. The bot reconciles membership on every
-- member update and full sync.
INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name) VALUES
 ('1557594282976747550','1557690711007035392','law_enforcement'),
 ('1557594282976747550','1557690864057192458','fire_rescue'),
 ('1557594282976747550','1558246218092646471','verified');
