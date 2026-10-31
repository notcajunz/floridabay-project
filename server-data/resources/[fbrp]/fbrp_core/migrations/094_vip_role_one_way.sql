-- The VIP Membership role grants vehicle tuning permissions one way only.
-- It was bound like a normal ACE role, which made the bot treat the role as gated. Unbind it
-- and make the role a source for the group instead, so holding the role is the only way in
-- and the role is never granted or stripped by the bot.

DELETE FROM discord_role_bindings
WHERE guild_id='1557594282976747550' AND role_id='1557689749198868520' AND group_name='vip_vehicle_tuning';

INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name)
VALUES ('1557594282976747550','1557689749198868520','vip_vehicle_tuning');
