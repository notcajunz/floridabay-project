-- Justice (prison, records, warrants, BOLOs, vehicle registry), medical and
-- civilian activity tables. Character ids are NULL for players who were
-- jailed or cited before choosing a character.

CREATE TABLE IF NOT EXISTS jail_sentences (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NULL,
  license VARCHAR(100) NOT NULL,
  discord_id VARCHAR(32) NULL,
  name VARCHAR(100) NOT NULL,
  officer_id VARCHAR(32) NULL,
  officer_name VARCHAR(100) NOT NULL,
  months INT UNSIGNED NOT NULL,
  charges JSON NOT NULL,
  seconds_total INT UNSIGNED NOT NULL,
  seconds_remaining INT UNSIGNED NOT NULL,
  status ENUM('serving','released','escaped') NOT NULL DEFAULT 'serving',
  release_reason VARCHAR(40) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  released_at BIGINT NULL,
  INDEX jail_character(character_id,status),
  INDEX jail_license(license,status),
  INDEX jail_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS criminal_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NULL,
  license VARCHAR(100) NULL,
  name VARCHAR(100) NOT NULL,
  kind ENUM('arrest','citation','warning') NOT NULL,
  charges JSON NOT NULL,
  months INT UNSIGNED NOT NULL DEFAULT 0,
  fine INT UNSIGNED NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  officer_id VARCHAR(32) NULL,
  officer_name VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX record_character(character_id,created_at),
  INDEX record_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warrants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NULL,
  subject_name VARCHAR(100) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('active','served','cleared') NOT NULL DEFAULT 'active',
  created_by_id VARCHAR(32) NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  closed_by VARCHAR(100) NULL,
  closed_at BIGINT NULL,
  INDEX warrant_character(character_id,status),
  INDEX warrant_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bolos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('person','vehicle') NOT NULL,
  plate VARCHAR(8) NULL,
  description VARCHAR(500) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id VARCHAR(32) NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  closed_at BIGINT NULL,
  INDEX bolo_active(active,created_at),
  INDEX bolo_plate(plate,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicle_registrations (
  plate VARCHAR(8) PRIMARY KEY,
  model VARCHAR(40) NOT NULL,
  label VARCHAR(60) NULL,
  character_id BIGINT UNSIGNED NULL,
  owner_name VARCHAR(100) NOT NULL,
  license VARCHAR(100) NULL,
  discord_id VARCHAR(32) NULL,
  stolen BOOLEAN NOT NULL DEFAULT FALSE,
  impounded_at BIGINT NULL,
  impounded_by VARCHAR(100) NULL,
  registered_at BIGINT NOT NULL,
  INDEX registration_character(character_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fishing_catches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NULL,
  license VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  species VARCHAR(40) NOT NULL,
  weight DECIMAL(6,2) NOT NULL,
  water ENUM('salt','fresh') NOT NULL,
  rarity VARCHAR(16) NOT NULL,
  x DOUBLE NULL,
  y DOUBLE NULL,
  created_at BIGINT NOT NULL,
  INDEX catch_species(species,weight),
  INDEX catch_license(license,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
