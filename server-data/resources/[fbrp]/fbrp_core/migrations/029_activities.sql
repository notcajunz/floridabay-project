-- Persistent open-world challenge records and daily geocache progression.

CREATE TABLE IF NOT EXISTS activity_profiles (
  license VARCHAR(100) PRIMARY KEY,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  completions INT UNSIGNED NOT NULL DEFAULT 0,
  caches_found INT UNSIGNED NOT NULL DEFAULT 0,
  cache_streak INT UNSIGNED NOT NULL DEFAULT 0,
  last_cache_day CHAR(10) NULL,
  updated_at BIGINT NOT NULL,
  INDEX activity_points(points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_records (
  license VARCHAR(100) NOT NULL,
  character_id BIGINT UNSIGNED NULL,
  challenge_id VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  best_ms INT UNSIGNED NOT NULL,
  completions INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (license, challenge_id),
  INDEX activity_challenge_record(challenge_id, best_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_cache_finds (
  license VARCHAR(100) NOT NULL,
  day_key CHAR(10) NOT NULL,
  cache_id VARCHAR(40) NOT NULL,
  character_id BIGINT UNSIGNED NULL,
  found_at BIGINT NOT NULL,
  PRIMARY KEY (license, day_key),
  INDEX activity_cache_day(day_key, cache_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
