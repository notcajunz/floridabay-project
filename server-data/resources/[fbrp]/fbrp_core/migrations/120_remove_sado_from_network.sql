-- The San Andreas Department of Transportation server is no longer part of the Florida Bay network.
-- Forget it everywhere the network tracks guilds. Discord backups of the guild are kept as history.
DELETE FROM network_sync_roles WHERE guild_id='1560427159355400242';
DELETE FROM network_sync_anchors WHERE guild_id='1560427159355400242';
DELETE FROM network_sync_guild_settings WHERE guild_id='1560427159355400242';
DELETE FROM network_sync_guilds WHERE guild_id='1560427159355400242';
DELETE FROM discord_role_bindings WHERE guild_id='1560427159355400242';
DELETE FROM discord_role_sources WHERE guild_id='1560427159355400242';
DELETE FROM protected_roles WHERE guild_id='1560427159355400242';
DELETE FROM discord_guild_roles WHERE guild_id='1560427159355400242';
DELETE FROM discord_member_cache WHERE guild_id='1560427159355400242';
DELETE FROM network_guilds WHERE guild_id='1560427159355400242';
