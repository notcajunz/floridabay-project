-- The staff bot is only in the staff server, so the staff onboarding DM is requested here
-- and sent by the main bot (src/staff-queue.js).
CREATE TABLE IF NOT EXISTS staff_welcome_queue (
  discord_id VARCHAR(24) NOT NULL PRIMARY KEY,
  rank_name VARCHAR(80) NOT NULL,
  callsign VARCHAR(24) NOT NULL,
  staff_only TINYINT(1) NOT NULL DEFAULT 0,
  requested_by VARCHAR(32) NOT NULL,
  requested_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0
);
