-- The Ban and Blacklist Moderator Discord role grants its ACE group one way only.
-- Holding the role gives the permissions and losing the role takes them away, with no
-- /ace member-add or member-remove needed. The role was bound like a normal ACE role, which
-- made the bot treat it as gated. Turn each existing binding for the group into a role
-- source and drop the binding so the bot never grants or strips the role itself.

INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name)
SELECT guild_id,role_id,group_name FROM discord_role_bindings
WHERE group_name='ban_blacklist_moderator';

INSERT IGNORE INTO discord_role_sources(guild_id,role_id,group_name) VALUES
 ('1557594282976747550','1558329130817421423','ban_blacklist_moderator');

DELETE FROM discord_role_bindings WHERE group_name='ban_blacklist_moderator';
