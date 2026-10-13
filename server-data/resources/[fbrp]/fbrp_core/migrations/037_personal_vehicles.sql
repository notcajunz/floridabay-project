-- Personal vehicles: a vehicle model reserved for one owner. The owner may trust a
-- few more people (the limit is enforced by the bot and the control panel) and a
-- vehicle may also be locked to tags so everyone holding the tag can use it.
CREATE TABLE IF NOT EXISTS personal_vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(40) NOT NULL,
  label VARCHAR(60) NOT NULL,
  plate VARCHAR(8) NULL,
  owner_id VARCHAR(24) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(24) NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY personal_plate(plate),
  INDEX personal_owner(owner_id),
  INDEX personal_model(model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_vehicle_trust (
  personal_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(personal_id,discord_id),
  INDEX personal_trust_member(discord_id),
  CONSTRAINT fk_personal_trust FOREIGN KEY(personal_id) REFERENCES personal_vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_vehicle_tags (
  personal_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  added_by VARCHAR(24) NULL,
  added_at BIGINT NOT NULL,
  PRIMARY KEY(personal_id,tag_id),
  INDEX personal_tag_lookup(tag_id),
  CONSTRAINT fk_personal_tag_vehicle FOREIGN KEY(personal_id) REFERENCES personal_vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_personal_tag_tag FOREIGN KEY(tag_id) REFERENCES headtags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
