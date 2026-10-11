CREATE TABLE IF NOT EXISTS discord_channel_bindings (
  purpose VARCHAR(40) PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NOT NULL UNIQUE,
  updated_by VARCHAR(24) NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organization_role_requirements (
  org_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(org_id,guild_id,role_id),
  INDEX organization_requirement_role(guild_id,role_id),
  CONSTRAINT fk_org_requirement_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  callsign_start INT UNSIGNED NOT NULL,
  callsign_end INT UNSIGNED NOT NULL,
  nickname_prefix VARCHAR(8) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY roster_category_name(name),
  UNIQUE KEY roster_category_range(callsign_start,callsign_end)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_ranks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  discord_role_id VARCHAR(24) NULL,
  discord_guild_id VARCHAR(24) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  weekly_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  minimum_days INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY roster_rank_name(name),
  INDEX roster_rank_role(discord_guild_id,discord_role_id),
  CONSTRAINT fk_roster_rank_category FOREIGN KEY(category_id) REFERENCES staff_roster_categories(id)
) ENGINE=InnoDB;

ALTER TABLE staff_roster_members
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(80) NOT NULL DEFAULT '' AFTER discord_id,
  ADD COLUMN IF NOT EXISTS username VARCHAR(80) NOT NULL DEFAULT '' AFTER display_name,
  ADD COLUMN IF NOT EXISTS rank_id INT UNSIGNED NULL AFTER rank_name,
  ADD COLUMN IF NOT EXISTS rank_changed_at BIGINT NOT NULL DEFAULT 0 AFTER joined_at,
  ADD COLUMN IF NOT EXISTS tickets_handled INT UNSIGNED NOT NULL DEFAULT 0 AFTER rank_changed_at,
  ADD COLUMN IF NOT EXISTS activity_note VARCHAR(500) NOT NULL DEFAULT '' AFTER tickets_handled,
  ADD COLUMN IF NOT EXISTS removed_by VARCHAR(24) NULL AFTER removed_at,
  ADD INDEX IF NOT EXISTS roster_rank_id(rank_id);

ALTER TABLE staff_roster_discipline
  ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(24) NULL AFTER revoked_at,
  ADD COLUMN IF NOT EXISTS revoke_reason VARCHAR(300) NULL AFTER revoked_by;

CREATE TABLE IF NOT EXISTS staff_roster_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  action VARCHAR(40) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  details JSON NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX roster_history_member(discord_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  discord_role_id VARCHAR(24) NULL,
  discord_guild_id VARCHAR(24) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE KEY staff_job_name(name),
  INDEX staff_job_role(discord_guild_id,discord_role_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_member_jobs (
  discord_id VARCHAR(24) NOT NULL,
  job_id INT UNSIGNED NOT NULL,
  assigned_by VARCHAR(24) NOT NULL,
  assigned_at BIGINT NOT NULL,
  PRIMARY KEY(discord_id,job_id),
  INDEX staff_job_members(job_id,discord_id),
  CONSTRAINT fk_staff_job_member FOREIGN KEY(discord_id) REFERENCES staff_roster_members(discord_id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_job FOREIGN KEY(job_id) REFERENCES staff_roster_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bot_config (
  `key` VARCHAR(80) PRIMARY KEY,
  value JSON NOT NULL,
  updated_by VARCHAR(24) NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO staff_roster_categories(name,callsign_start,callsign_end,nickname_prefix,sort_order,created_at) VALUES
 ('Ownership / Management',100,199,'!',100,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('Staff Coordination',200,299,'#',200,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('High Staff',300,399,'$',300,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('Staff',400,499,'',400,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);

INSERT IGNORE INTO staff_roster_ranks(category_id,name,sort_order,weekly_seconds,minimum_days,created_at) VALUES
 ((SELECT id FROM staff_roster_categories WHERE name='Ownership / Management'),'Owner',10,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Ownership / Management'),'Co-Owner',20,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Ownership / Management'),'Community Director',30,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Ownership / Management'),'Community Manager',40,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff Coordination'),'Staff Director',10,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff Coordination'),'Staff Manager',20,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff Coordination'),'Staff Coordinator',30,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='High Staff'),'Head Administrator',10,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='High Staff'),'Senior Administrator',20,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='High Staff'),'Administrator',30,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff'),'Head Moderator',10,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff'),'Senior Moderator',20,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff'),'Moderator',30,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ((SELECT id FROM staff_roster_categories WHERE name='Staff'),'Trial Moderator',40,0,0,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);

DELETE FROM ace_entries WHERE group_name <> 'owner';
DELETE FROM ace_memberships WHERE group_name <> 'owner';
INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES
 ('1090083387638812755','owner','bootstrap','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('1099651002208104488','owner','bootstrap','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);

INSERT IGNORE INTO network_guilds(guild_id,name,kind,added_by,added_at) VALUES
 ('1557594282976747550','Florida Bay Roleplay','main','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('1557600357163474946','FBRP | Staff Team','staff','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);

INSERT INTO discord_channel_bindings(purpose,guild_id,channel_id,updated_by,updated_at) VALUES
 ('moderation','1557594282976747550','1558525525058912256','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('staff_duty','1557594282976747550','1558525525834600519','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('role_sync','1557594282976747550','1558525526493241547','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('organizations','1557594282976747550','1558525527545880687','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('game','1557594282976747550','1558525528128888883','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('security','1557594282976747550','1558258302687776788','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('staff_audit','1557600357163474946','1558274290346889216','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('roster','1557600357163474946','1558274945228742768','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('callsigns','1557600357163474946','1558275244567961690','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('tickets','1557600357163474946','1558483582685544509','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('ticket_panel','1557594282976747550','1558173819150012436','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),channel_id=VALUES(channel_id),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at);

INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES
 ('ticket_panel','{"channel_id":"1558173819150012436","message_id":null}','1558518806417117305',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)
ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at);
