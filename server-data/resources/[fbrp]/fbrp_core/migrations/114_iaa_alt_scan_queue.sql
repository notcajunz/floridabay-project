-- The IAA bot is only in the IAA and main servers, so /intel alt-scan hands every other network
-- server to the main bot (src/altscan-queue.js). The main bot writes one row per member it saw.
CREATE TABLE IF NOT EXISTS iaa_altscan_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_ids TEXT NOT NULL,
  requested_by VARCHAR(32) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'queued',
  progress VARCHAR(255) NULL,
  problems TEXT NULL,
  requested_at BIGINT NOT NULL,
  started_at BIGINT NULL,
  finished_at BIGINT NULL,
  KEY idx_iaa_altscan_status (status, requested_at)
);
CREATE TABLE IF NOT EXISTS iaa_altscan_members (
  job_id BIGINT NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  username VARCHAR(64) NULL,
  display VARCHAR(64) NULL,
  default_avatar TINYINT(1) NOT NULL DEFAULT 0,
  servers INT NOT NULL DEFAULT 1,
  PRIMARY KEY (job_id, discord_id)
);
