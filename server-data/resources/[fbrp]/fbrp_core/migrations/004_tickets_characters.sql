ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS type VARCHAR(24) NOT NULL DEFAULT 'support';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS form_data JSON NULL;
ALTER TABLE support_tickets MODIFY status ENUM('open','claimed','closed') NOT NULL DEFAULT 'open';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TINYINT NOT NULL DEFAULT 3;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS due_at BIGINT NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS claimed_at BIGINT NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at BIGINT NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_by VARCHAR(24) NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS close_reason VARCHAR(500) NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS close_requested_by VARCHAR(24) NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS close_requested_at BIGINT NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_activity BIGINT NULL;

CREATE TABLE IF NOT EXISTS ticket_participants (
  ticket_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(ticket_id,user_id),
  CONSTRAINT fk_ticket_participant FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  author_id VARCHAR(24) NOT NULL,
  body TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX ticket_notes_lookup(ticket_id,created_at),
  CONSTRAINT fk_ticket_note FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NULL,
  guild_id VARCHAR(24) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_id VARCHAR(24) NULL,
  detail JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX ticket_event_lookup(ticket_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_support_roles (
  guild_id VARCHAR(24) NOT NULL,
  ticket_type VARCHAR(24) NOT NULL,
  role_id VARCHAR(24) NOT NULL,
  level ENUM('support','manager') NOT NULL DEFAULT 'support',
  PRIMARY KEY(guild_id,ticket_type,role_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_settings (
  guild_id VARCHAR(24) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  value JSON NULL,
  PRIMARY KEY(guild_id,`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS characters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_license VARCHAR(100) NOT NULL,
  discord_id VARCHAR(24) NULL,
  first_name VARCHAR(40) NOT NULL,
  last_name VARCHAR(40) NOT NULL,
  date_of_birth VARCHAR(10) NOT NULL,
  gender VARCHAR(24) NOT NULL,
  backstory VARCHAR(500) NULL,
  last_x DOUBLE NULL,
  last_y DOUBLE NULL,
  last_z DOUBLE NULL,
  last_heading FLOAT NULL,
  last_spawn_key VARCHAR(40) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_played_at BIGINT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX character_owner(owner_license,archived),
  INDEX character_discord(discord_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_character_selection (
  owner_license VARCHAR(100) PRIMARY KEY,
  character_id BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_character_selection FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
) ENGINE=InnoDB;
