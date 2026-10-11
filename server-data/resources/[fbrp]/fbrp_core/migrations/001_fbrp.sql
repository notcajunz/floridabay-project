CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS players (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  license VARCHAR(100) NOT NULL UNIQUE,
  discord_id VARCHAR(24) NULL,
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX player_discord(discord_id),
  INDEX player_seen(last_seen)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_identifiers (
  player_id INT UNSIGNED NOT NULL,
  identifier VARCHAR(160) NOT NULL,
  PRIMARY KEY(player_id,identifier),
  INDEX identifier_lookup(identifier),
  CONSTRAINT fk_identifier_player FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ace_groups (
  name VARCHAR(64) PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  rank_order INT NOT NULL DEFAULT 0,
  staff_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_by VARCHAR(24) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ace_entries (
  group_name VARCHAR(64) NOT NULL,
  object VARCHAR(120) NOT NULL,
  mode ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  PRIMARY KEY(group_name,object),
  CONSTRAINT fk_ace_group FOREIGN KEY(group_name) REFERENCES ace_groups(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ace_memberships (
  discord_id VARCHAR(24) NOT NULL,
  group_name VARCHAR(64) NOT NULL,
  origin VARCHAR(96) NOT NULL DEFAULT 'manual',
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(discord_id,group_name,origin),
  INDEX membership_group(group_name,discord_id),
  CONSTRAINT fk_membership_group FOREIGN KEY(group_name) REFERENCES ace_groups(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discord_role_bindings (
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  group_name VARCHAR(64) NOT NULL,
  PRIMARY KEY(guild_id,role_id,group_name),
  INDEX binding_group(group_name),
  CONSTRAINT fk_binding_group FOREIGN KEY(group_name) REFERENCES ace_groups(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discord_member_cache (
  guild_id VARCHAR(24) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  roles JSON NOT NULL,
  nickname VARCHAR(80) NULL,
  username VARCHAR(80) NOT NULL,
  avatar VARCHAR(300) NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,discord_id),
  INDEX cached_member(discord_id,guild_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discord_guild_roles (
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,role_id),
  INDEX cached_role_name(guild_id,name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS headtags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('head','gang') NOT NULL,
  label VARCHAR(40) NOT NULL,
  color CHAR(7) NOT NULL DEFAULT '#43E8D8',
  role_id VARCHAR(24) NULL,
  guild_id VARCHAR(24) NULL,
  priority INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(24) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY tag_role(guild_id,role_id),
  INDEX tag_kind(kind,priority)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS headtag_grants (
  discord_id VARCHAR(24) NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  origin VARCHAR(96) NOT NULL DEFAULT 'manual',
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(discord_id,tag_id,origin),
  CONSTRAINT fk_tag_grant FOREIGN KEY(tag_id) REFERENCES headtags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_tag_selection (
  discord_id VARCHAR(24) PRIMARY KEY,
  headtag_id INT UNSIGNED NULL,
  gangtag_id INT UNSIGNED NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_selected_head FOREIGN KEY(headtag_id) REFERENCES headtags(id) ON DELETE SET NULL,
  CONSTRAINT fk_selected_gang FOREIGN KEY(gangtag_id) REFERENCES headtags(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  type ENUM('gang','business','leo','fire','government','other') NOT NULL DEFAULT 'other',
  color CHAR(7) NOT NULL DEFAULT '#43E8D8',
  tag_id INT UNSIGNED NOT NULL,
  ace_group VARCHAR(64) NULL,
  guild_id VARCHAR(24) NULL,
  role_id VARCHAR(24) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(24) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_tag FOREIGN KEY(tag_id) REFERENCES headtags(id),
  CONSTRAINT fk_org_group FOREIGN KEY(ace_group) REFERENCES ace_groups(name) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organization_members (
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  rank_name VARCHAR(60) NOT NULL DEFAULT 'Member',
  manager BOOLEAN NOT NULL DEFAULT FALSE,
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(org_id,discord_id),
  INDEX org_member(discord_id,org_id),
  CONSTRAINT fk_org_member_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organization_shifts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  player_id INT UNSIGNED NULL,
  name VARCHAR(80) NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  heartbeat_at BIGINT NOT NULL,
  seconds INT UNSIGNED NOT NULL DEFAULT 0,
  end_reason VARCHAR(24) NULL,
  INDEX org_shift_member(org_id,discord_id,started_at),
  INDEX org_shift_open(ended_at),
  CONSTRAINT fk_org_shift_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_shifts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  player_id INT UNSIGNED NULL,
  name VARCHAR(80) NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  heartbeat_at BIGINT NOT NULL,
  seconds INT UNSIGNED NOT NULL DEFAULT 0,
  end_reason VARCHAR(24) NULL,
  actor_id VARCHAR(24) NULL,
  note VARCHAR(200) NULL,
  INDEX staff_shift_member(discord_id,started_at),
  INDEX staff_shift_open(ended_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS server_state (
  `key` VARCHAR(64) PRIMARY KEY,
  value JSON NOT NULL,
  updated_by VARCHAR(80) NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dispatch_calls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL DEFAULT '911',
  caller_discord VARCHAR(24) NULL,
  caller_name VARCHAR(80) NOT NULL,
  message VARCHAR(300) NOT NULL,
  location VARCHAR(120) NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  z DOUBLE NOT NULL,
  status ENUM('open','attached','closed') NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  closed_at BIGINT NULL,
  INDEX dispatch_queue(status,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS moderation_cases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(24) NULL,
  target_id VARCHAR(24) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  expires_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  INDEX cases_target(target_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NULL UNIQUE,
  author_id VARCHAR(24) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  claimed_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  closed_at BIGINT NULL,
  INDEX ticket_queue(guild_id,status,created_at),
  INDEX ticket_author(author_id,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_members (
  discord_id VARCHAR(24) PRIMARY KEY,
  rank_name VARCHAR(80) NOT NULL,
  callsign INT UNSIGNED NULL UNIQUE,
  status ENUM('active','inactive','loa','removed') NOT NULL DEFAULT 'active',
  joined_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  removed_at BIGINT NULL,
  removal_reason VARCHAR(300) NULL,
  INDEX roster_rank_status(rank_name,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_roster_discipline (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  kind ENUM('warning','strike') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  revoked_at BIGINT NULL,
  INDEX roster_discipline_member(discord_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS offices (
  guild_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NOT NULL,
  owner_id VARCHAR(24) NOT NULL,
  set_by VARCHAR(24) NOT NULL,
  set_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,channel_id),
  INDEX office_owner(guild_id,owner_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(100) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_id VARCHAR(100) NULL,
  payload JSON NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX audit_actor(actor_id,created_at),
  INDEX audit_action(action,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_guilds (
  guild_id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'other',
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_syncs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_name VARCHAR(64) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  color INT UNSIGNED NOT NULL DEFAULT 0,
  hoist BOOLEAN NOT NULL DEFAULT FALSE,
  mentionable BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT fk_sync_group FOREIGN KEY(group_name) REFERENCES ace_groups(name) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_sync_roles (
  sync_id INT UNSIGNED NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  managed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY(sync_id,guild_id),
  UNIQUE KEY sync_role(guild_id,role_id),
  CONSTRAINT fk_sync_role FOREIGN KEY(sync_id) REFERENCES network_syncs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS protected_roles (
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,role_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS protected_role_access (
  guild_id VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  subject_type ENUM('user','role') NOT NULL,
  subject_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  PRIMARY KEY(guild_id,role_id,subject_type,subject_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_allowed_bots (
  bot_id VARCHAR(24) PRIMARY KEY,
  label VARCHAR(80) NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_bot_adder_allowlist (
  guild_id VARCHAR(24) NOT NULL,
  subject_type ENUM('user','role') NOT NULL,
  subject_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(guild_id,subject_type,subject_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_security_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  actor_id VARCHAR(24) NULL,
  target_id VARCHAR(24) NULL,
  outcome VARCHAR(32) NOT NULL,
  details JSON NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX security_guild(guild_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discord_security_exemptions (
  discord_id VARCHAR(24) PRIMARY KEY,
  reason VARCHAR(200) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO ace_groups(name,label,rank_order,staff_only) VALUES
 ('owner','Owner',1000,TRUE),
 ('admin','Administrator',800,TRUE),
 ('moderator','Moderator',600,TRUE),
 ('law_enforcement','Law Enforcement',400,FALSE),
 ('fire_rescue','Fire & Rescue',350,FALSE),
 ('verified','Verified Civilian',100,FALSE);

INSERT IGNORE INTO ace_entries(group_name,object,mode) VALUES
 ('owner','*','allow'),
 ('owner','easyadmin','allow'),
 ('owner','vMenu.Everything','allow'),
 ('admin','fbrp.*','allow'),
 ('admin','easyadmin','allow'),
 ('admin','vMenu.Staff','allow'),
 ('admin','vMenu.NoClip','allow'),
 ('admin','vMenu.OnlinePlayers.Menu','allow'),
 ('admin','vMenu.OnlinePlayers.All','allow'),
 ('moderator','fbrp.staff','allow'),
 ('moderator','fbrp.announce','allow'),
 ('moderator','fbrp.aop','allow'),
 ('moderator','fbrp.vehicles.staff','allow'),
 ('moderator','easyadmin','allow'),
 ('moderator','vMenu.Staff','allow'),
 ('law_enforcement','fbrp.police','allow'),
 ('law_enforcement','fbrp.police.cuff','allow'),
 ('law_enforcement','fbrp.police.arrest','allow'),
 ('law_enforcement','fbrp.police.search','allow'),
 ('law_enforcement','fbrp.police.escort','allow'),
 ('law_enforcement','fbrp.vehicles.leo','allow'),
 ('fire_rescue','fbrp.vehicles.fire','allow'),
 ('verified','fbrp.civ.restrain','allow'),
 ('verified','fbrp.vehicles','allow');

INSERT IGNORE INTO server_state(`key`,value,updated_by,updated_at) VALUES
 ('aop','"Statewide"','migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('peacetime','false','migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000),
 ('priority','{"active":false,"cooldown":0,"label":"Available"}','migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000);
