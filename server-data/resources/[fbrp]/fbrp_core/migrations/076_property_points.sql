-- Exact spots inside or at a property, set by staff standing there with /propset.
-- door, door2 and door3 are scan centres for the door locks. terminal is the work spot,
-- stash replaces it at a hideout, armory and wardrobe open the organization hub.
CREATE TABLE IF NOT EXISTS property_points (
  property_key VARCHAR(40) NOT NULL,
  point VARCHAR(12) NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  z DOUBLE NOT NULL,
  set_by VARCHAR(24) NULL,
  set_at BIGINT NOT NULL,
  PRIMARY KEY(property_key,point)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
