-- Internal Affairs Agency bot (services/fbrp-bot/src/iaa). Bot-only tables, not loaded by fbrp_core.
-- Rank ladder, roster, discipline, investigations, duty hours, leave, awards and the IAA blacklist.

CREATE TABLE IF NOT EXISTS iaa_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value LONGTEXT NOT NULL,
  updated_by VARCHAR(24) NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_ranks (
  role_id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  level INT NOT NULL,
  tier VARCHAR(32) NOT NULL,
  tier_role_id VARCHAR(24) NULL,
  INDEX iaa_ranks_level(level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_members (
  discord_id VARCHAR(24) PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  callsign VARCHAR(16) NULL,
  rank_role_id VARCHAR(24) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  joined_at BIGINT NOT NULL,
  rank_changed_at BIGINT NOT NULL,
  removed_at BIGINT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY iaa_members_callsign(callsign)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  action VARCHAR(32) NOT NULL,
  from_role VARCHAR(24) NULL,
  to_role VARCHAR(24) NULL,
  actor_id VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at BIGINT NOT NULL,
  INDEX iaa_history_member(discord_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_discipline (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  case_id INT UNSIGNED NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  saved_roles LONGTEXT NULL,
  revoked_by VARCHAR(24) NULL,
  revoked_at BIGINT NULL,
  revoke_reason VARCHAR(500) NULL,
  INDEX iaa_discipline_member(discord_id, active),
  INDEX iaa_discipline_expiry(active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_cases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(20) NULL,
  subject_id VARCHAR(24) NOT NULL,
  subject_name VARCHAR(80) NOT NULL,
  type VARCHAR(24) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  summary VARCHAR(1500) NOT NULL,
  opened_by VARCHAR(24) NOT NULL,
  lead_id VARCHAR(24) NULL,
  thread_id VARCHAR(24) NULL,
  file_message_id VARCHAR(24) NULL,
  flagged TINYINT(1) NOT NULL DEFAULT 0,
  notify_subject TINYINT(1) NOT NULL DEFAULT 0,
  intel LONGTEXT NULL,
  opened_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_activity_at BIGINT NOT NULL,
  reminded_at BIGINT NULL,
  closed_at BIGINT NULL,
  closed_by VARCHAR(24) NULL,
  verdict VARCHAR(24) NULL,
  outcome VARCHAR(24) NULL,
  findings VARCHAR(2000) NULL,
  UNIQUE KEY iaa_cases_reference(reference),
  INDEX iaa_cases_subject(subject_id),
  INDEX iaa_cases_status(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_case_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id INT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  url VARCHAR(500) NULL,
  created_at BIGINT NOT NULL,
  INDEX iaa_case_entries_case(case_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_shifts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  seconds INT NOT NULL DEFAULT 0,
  end_reason VARCHAR(16) NULL,
  INDEX iaa_shifts_member(discord_id, started_at),
  INDEX iaa_shifts_open(ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_leaves (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  role_applied TINYINT(1) NOT NULL DEFAULT 0,
  decided_by VARCHAR(24) NULL,
  decided_at BIGINT NULL,
  decision_note VARCHAR(500) NULL,
  channel_id VARCHAR(24) NULL,
  message_id VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  INDEX iaa_leaves_member(discord_id, status),
  INDEX iaa_leaves_status(status, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_awards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  award VARCHAR(32) NOT NULL,
  citation VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX iaa_awards_member(discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS iaa_blacklist (
  discord_id VARCHAR(24) PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  case_id INT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  lifted_by VARCHAR(24) NULL,
  lifted_at BIGINT NULL,
  lift_reason VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rival agencies and clans. Membership in one of these servers counts as a dual clanning lead.
CREATE TABLE IF NOT EXISTS iaa_watch_servers (
  guild_id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  reason VARCHAR(300) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per member and flagged server, so the background sweep alerts once per finding.
CREATE TABLE IF NOT EXISTS iaa_alerts (
  discord_id VARCHAR(24) NOT NULL,
  guild_id VARCHAR(24) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  alerted_at BIGINT NOT NULL,
  PRIMARY KEY(discord_id, guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The IAA bot edits ranks in bulk (promotions, suspensions, inactivity sweeps), which the network
-- anti-nuke would otherwise score as a role purge. Exempt it in the IAA server only.
INSERT IGNORE INTO discord_security_exemption_scopes(discord_id,guild_id,reason,added_by,added_at)
VALUES('1559312455996280927','1558227271641210912','IAA Systems bot (rank management)','1559312455996280927',1791849600000);
