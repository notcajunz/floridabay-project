-- Property setup approval and police station doors.
-- A bought property stays pending until DevOps marks it set up. Properties owned before this
-- migration are already working, so they start as ready and only new purchases wait.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.
ALTER TABLE org_properties
  ADD COLUMN IF NOT EXISTS setup_status VARCHAR(10) NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS setup_by VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS setup_at BIGINT NULL,
  ADD COLUMN IF NOT EXISTS setup_channel_id VARCHAR(24) NULL,
  ADD COLUMN IF NOT EXISTS setup_message_id VARCHAR(24) NULL;

ALTER TABLE org_properties ALTER COLUMN setup_status SET DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS station_doors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  station VARCHAR(60) NOT NULL,
  model BIGINT NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  z DOUBLE NOT NULL,
  added_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  INDEX station_door_station(station)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
