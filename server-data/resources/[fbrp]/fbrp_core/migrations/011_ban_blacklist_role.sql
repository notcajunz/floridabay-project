-- The Ban/Blacklist Permission Discord role is intentionally limited to five destructive
-- commands. It is role-authoritative: holding the role grants this ACE group, and removing
-- the role removes the group on the next member sync.
INSERT IGNORE INTO ace_groups(name,label,rank_order,staff_only) VALUES
 ('ban_blacklist_moderator','Ban & Blacklist Moderator',550,FALSE);

INSERT INTO ace_entries(group_name,object,mode) VALUES
 ('ban_blacklist_moderator','fbrp.global.ban','allow'),
 ('ban_blacklist_moderator','fbrp.global.kick','allow'),
 ('ban_blacklist_moderator','fbrp.global.blacklist','allow'),
 ('ban_blacklist_moderator','fbrp.discord.mod.ban','allow'),
 ('ban_blacklist_moderator','fbrp.discord.mod.kick','allow')
ON DUPLICATE KEY UPDATE mode=VALUES(mode);

INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name) VALUES
 ('1557594282976747550','1558329130817421423','ban_blacklist_moderator');

CREATE TABLE IF NOT EXISTS command_cooldowns (
  actor_id VARCHAR(24) NOT NULL,
  command_key VARCHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY(actor_id,command_key),
  INDEX command_cooldown_expiry(expires_at)
) ENGINE=InnoDB;
