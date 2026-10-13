-- FBRP DevOps server bot (services/fbrp-bot/src/devops). Bot-only tables, not loaded by fbrp_core.
-- Roster and ranks, discipline, leave, awards, tasks, incidents, releases, standups and the ticket system.

CREATE TABLE IF NOT EXISTS devops_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value LONGTEXT NOT NULL,
  updated_by VARCHAR(24) NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_ranks (
  role_id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  level INT NOT NULL,
  tier VARCHAR(32) NOT NULL,
  INDEX devops_ranks_level(level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_members (
  discord_id VARCHAR(24) PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  rank_role_id VARCHAR(24) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  joined_at BIGINT NOT NULL,
  rank_changed_at BIGINT NOT NULL,
  trial_ends_at BIGINT NULL,
  trial_notified TINYINT(1) NOT NULL DEFAULT 0,
  removed_at BIGINT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  action VARCHAR(32) NOT NULL,
  from_role VARCHAR(24) NULL,
  to_role VARCHAR(24) NULL,
  actor_id VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_history_member(discord_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_discipline (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  saved_roles LONGTEXT NULL,
  revoked_by VARCHAR(24) NULL,
  revoked_at BIGINT NULL,
  revoke_reason VARCHAR(500) NULL,
  INDEX devops_discipline_member(discord_id, active),
  INDEX devops_discipline_expiry(active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_leaves (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  decided_by VARCHAR(24) NULL,
  decided_at BIGINT NULL,
  decision_note VARCHAR(500) NULL,
  channel_id VARCHAR(24) NULL,
  message_id VARCHAR(24) NULL,
  role_applied TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX devops_leaves_member(discord_id, status),
  INDEX devops_leaves_window(status, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_awards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  award VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_awards_member(discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  details VARCHAR(2000) NULL,
  area VARCHAR(24) NOT NULL DEFAULT 'general',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  status VARCHAR(12) NOT NULL DEFAULT 'todo',
  assignee_id VARCHAR(24) NULL,
  creator_id VARCHAR(24) NOT NULL,
  due_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  completed_at BIGINT NULL,
  completed_by VARCHAR(24) NULL,
  INDEX devops_tasks_status(status, priority),
  INDEX devops_tasks_assignee(assignee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_incidents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  severity TINYINT NOT NULL DEFAULT 3,
  status VARCHAR(16) NOT NULL DEFAULT 'investigating',
  component VARCHAR(40) NULL,
  commander_id VARCHAR(24) NULL,
  opened_by VARCHAR(24) NOT NULL,
  public_channel_id VARCHAR(24) NULL,
  public_message_id VARCHAR(24) NULL,
  team_channel_id VARCHAR(24) NULL,
  team_message_id VARCHAR(24) NULL,
  opened_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  resolved_at BIGINT NULL,
  resolved_by VARCHAR(24) NULL,
  INDEX devops_incidents_status(status, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_incident_updates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id INT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL,
  body VARCHAR(1500) NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_incident_updates_incident(incident_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_releases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  notes TEXT NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  channel_id VARCHAR(24) NULL,
  message_id VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_releases_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_standups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discord_id VARCHAR(24) NOT NULL,
  yesterday VARCHAR(1000) NOT NULL,
  today VARCHAR(1000) NOT NULL,
  blockers VARCHAR(1000) NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_standups_member(discord_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(24) NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  type VARCHAR(24) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'open',
  priority TINYINT NOT NULL DEFAULT 3,
  channel_id VARCHAR(24) NULL,
  claimed_by VARCHAR(24) NULL,
  claimed_at BIGINT NULL,
  first_response_at BIGINT NULL,
  due_at BIGINT NULL,
  overdue_notified TINYINT(1) NOT NULL DEFAULT 0,
  form_data LONGTEXT NULL,
  close_requested_by VARCHAR(24) NULL,
  close_requested_at BIGINT NULL,
  closed_at BIGINT NULL,
  closed_by VARCHAR(24) NULL,
  close_reason VARCHAR(300) NULL,
  reopen_count INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX devops_tickets_author(guild_id, author_id, status),
  INDEX devops_tickets_open(guild_id, status),
  INDEX devops_tickets_channel(channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_ticket_participants (
  ticket_id INT UNSIGNED NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(ticket_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_ticket_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NULL,
  event_type VARCHAR(24) NOT NULL,
  actor_id VARCHAR(24) NULL,
  detail LONGTEXT NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_ticket_events_ticket(ticket_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devops_ticket_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX devops_ticket_notes_ticket(ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
