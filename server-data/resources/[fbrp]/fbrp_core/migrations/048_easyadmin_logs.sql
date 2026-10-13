INSERT INTO discord_channel_bindings(purpose,guild_id,channel_id,updated_by,updated_at) VALUES
 ('easyadmin','1557600357163474946','1559636651850997871','codex',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE
 guild_id=VALUES(guild_id),
 channel_id=VALUES(channel_id),
 updated_by=VALUES(updated_by),
 updated_at=VALUES(updated_at);
