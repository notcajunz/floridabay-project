-- Civilian identity: editable citizen details, ID card customisation, an audit
-- trail of identity changes (aliases), license applications and CAD report
-- addenda.

CREATE TABLE IF NOT EXISTS character_profiles (
  character_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  nickname VARCHAR(40) NULL,
  nationality VARCHAR(40) NULL,
  height_cm SMALLINT UNSIGNED NULL,
  weight_kg SMALLINT UNSIGNED NULL,
  eye_color VARCHAR(16) NULL,
  hair_color VARCHAR(16) NULL,
  blood_type VARCHAR(4) NULL,
  organ_donor BOOLEAN NOT NULL DEFAULT FALSE,
  occupation VARCHAR(60) NULL,
  address VARCHAR(120) NULL,
  phone VARCHAR(16) NULL,
  emergency_contact VARCHAR(80) NULL,
  marks VARCHAR(200) NULL,
  id_theme VARCHAR(16) NOT NULL DEFAULT 'classic',
  show_address BOOLEAN NOT NULL DEFAULT FALSE,
  show_phone BOOLEAN NOT NULL DEFAULT FALSE,
  show_licenses BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at BIGINT NOT NULL,
  INDEX profile_phone(phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS character_changes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  character_id BIGINT UNSIGNED NOT NULL,
  field VARCHAR(16) NOT NULL,
  old_value VARCHAR(100) NULL,
  new_value VARCHAR(100) NULL,
  changed_by VARCHAR(100) NULL,
  created_at BIGINT NOT NULL,
  INDEX change_character(character_id,field,created_at),
  INDEX change_old(field,old_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE mdt_licenses MODIFY status ENUM('valid','suspended','revoked','pending') NOT NULL DEFAULT 'valid';
ALTER TABLE mdt_licenses
  ADD COLUMN IF NOT EXISTS issued_at BIGINT NULL,
  ADD COLUMN IF NOT EXISTS restriction VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS show_on_id BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mdt_licenses ADD INDEX IF NOT EXISTS license_status(status,updated_at);

CREATE TABLE IF NOT EXISTS mdt_report_addenda (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  author_id VARCHAR(32) NULL,
  author_name VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX addendum_report(report_id,created_at),
  CONSTRAINT fk_report_addendum FOREIGN KEY(report_id) REFERENCES mdt_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
