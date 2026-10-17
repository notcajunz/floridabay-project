-- Custom EUP clothing packs and personal vehicle liveries, both managed from the website
-- by the personal vehicle manager. Only the website reads these tables.
-- An EUP pack is its own resource streamed to everyone. A livery is a named bundle of
-- stream files added to one personal vehicle, so it can be taken out again exactly.
CREATE TABLE IF NOT EXISTS custom_eup (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  label VARCHAR(60) NOT NULL,
  notes VARCHAR(300) NULL,
  file_count INT UNSIGNED NOT NULL DEFAULT 0,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY custom_eup_name(name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_liveries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  personal_id INT UNSIGNED NOT NULL,
  label VARCHAR(60) NOT NULL,
  token VARCHAR(24) NOT NULL,
  files JSON NOT NULL,
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  UNIQUE KEY personal_livery_label(personal_id,label),
  CONSTRAINT fk_personal_livery FOREIGN KEY(personal_id) REFERENCES personal_vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
