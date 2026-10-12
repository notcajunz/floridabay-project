-- Corrections and CAD: prison behaviour and work credit, community service,
-- incident reports, citizen flags/notes, licenses and unit callsigns.

ALTER TABLE jail_sentences
  ADD COLUMN IF NOT EXISTS behaviour INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS jobs_done INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reduced_seconds INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE criminal_records
  MODIFY kind ENUM('arrest','citation','warning','service') NOT NULL;

CREATE TABLE IF NOT EXISTS community_service (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NULL,
  license VARCHAR(100) NOT NULL,
  discord_id VARCHAR(32) NULL,
  name VARCHAR(100) NOT NULL,
  officer_id VARCHAR(32) NULL,
  officer_name VARCHAR(100) NOT NULL,
  minutes INT UNSIGNED NOT NULL,
  charges JSON NOT NULL,
  seconds_total INT UNSIGNED NOT NULL,
  seconds_remaining INT UNSIGNED NOT NULL,
  collected INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('serving','completed','escaped','released','converted') NOT NULL DEFAULT 'serving',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  finished_at BIGINT NULL,
  INDEX service_character(character_id,status),
  INDEX service_license(license,status),
  INDEX service_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(24) NOT NULL,
  title VARCHAR(120) NOT NULL,
  location VARCHAR(120) NULL,
  narrative TEXT NOT NULL,
  citizens JSON NOT NULL,
  officers JSON NOT NULL,
  author_id VARCHAR(32) NULL,
  author_name VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  INDEX report_created(created_at),
  INDEX report_author(author_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_report_citizens (
  report_id BIGINT UNSIGNED NOT NULL,
  character_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'involved',
  PRIMARY KEY(report_id,character_id),
  INDEX report_citizen(character_id,report_id),
  CONSTRAINT fk_report_citizen FOREIGN KEY(report_id) REFERENCES mdt_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_citizen_flags (
  character_id BIGINT UNSIGNED NOT NULL,
  flag VARCHAR(24) NOT NULL,
  added_by VARCHAR(100) NOT NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(character_id,flag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_citizen_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(600) NOT NULL,
  author_id VARCHAR(32) NULL,
  author_name VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX note_character(character_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_licenses (
  character_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  status ENUM('valid','suspended','revoked') NOT NULL DEFAULT 'valid',
  points INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by VARCHAR(100) NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(character_id,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mdt_units (
  discord_id VARCHAR(32) PRIMARY KEY,
  callsign VARCHAR(12) NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
