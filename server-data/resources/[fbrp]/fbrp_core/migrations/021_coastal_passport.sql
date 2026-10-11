-- Persistent exploration stamps, reputation and rotating daily goals.

CREATE TABLE IF NOT EXISTS passport_profiles (
  license VARCHAR(100) PRIMARY KEY,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  discoveries INT UNSIGNED NOT NULL DEFAULT 0,
  daily_completed INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  INDEX passport_points(points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passport_discoveries (
  license VARCHAR(100) NOT NULL,
  landmark_id VARCHAR(40) NOT NULL,
  character_id BIGINT UNSIGNED NULL,
  discovered_at BIGINT NOT NULL,
  PRIMARY KEY (license, landmark_id),
  INDEX passport_landmark(landmark_id, discovered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passport_daily_progress (
  license VARCHAR(100) NOT NULL,
  day_key CHAR(10) NOT NULL,
  goal_id VARCHAR(24) NOT NULL,
  progress INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at BIGINT NULL,
  PRIMARY KEY (license, day_key, goal_id),
  INDEX passport_daily(day_key, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
