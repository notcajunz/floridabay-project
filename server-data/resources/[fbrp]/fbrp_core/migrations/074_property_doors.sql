-- Door locks for organization properties. Doors are found automatically near each
-- property. These rows are staff corrections: an include row locks a door the scan
-- missed and an exclude row frees an object the scan wrongly treated as a door.
CREATE TABLE IF NOT EXISTS property_doors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_key VARCHAR(40) NOT NULL,
  kind VARCHAR(8) NOT NULL DEFAULT 'include',
  model BIGINT NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  z DOUBLE NOT NULL,
  added_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  INDEX property_door_key(property_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
