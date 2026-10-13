-- Florida Bay Pastimes: Bay Rep progression, side jobs, supply drops, street duels, skydiving,
-- achievements and weekly community goals.

CREATE TABLE IF NOT EXISTS pastime_profiles (
  license VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL DEFAULT '',
  rep INT UNSIGNED NOT NULL DEFAULT 0,
  jobs_done INT UNSIGNED NOT NULL DEFAULT 0,
  drops_won INT UNSIGNED NOT NULL DEFAULT 0,
  duels_won INT UNSIGNED NOT NULL DEFAULT 0,
  duels_lost INT UNSIGNED NOT NULL DEFAULT 0,
  duel_streak INT UNSIGNED NOT NULL DEFAULT 0,
  best_duel_streak INT UNSIGNED NOT NULL DEFAULT 0,
  duel_rating INT NOT NULL DEFAULT 1000,
  skydives INT UNSIGNED NOT NULL DEFAULT 0,
  bullseyes INT UNSIGNED NOT NULL DEFAULT 0,
  daily_streak INT UNSIGNED NOT NULL DEFAULT 0,
  best_daily_streak INT UNSIGNED NOT NULL DEFAULT 0,
  last_daily_day CHAR(10) NULL,
  title VARCHAR(40) NULL,
  updated_at BIGINT NOT NULL,
  INDEX pastime_rep(rep),
  INDEX pastime_rating(duel_rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_job_stats (
  license VARCHAR(100) NOT NULL,
  job_id VARCHAR(40) NOT NULL,
  completions INT UNSIGNED NOT NULL DEFAULT 0,
  best_ms INT UNSIGNED NULL,
  rep_total INT UNSIGNED NOT NULL DEFAULT 0,
  meters_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (license, job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  license VARCHAR(100) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  ref VARCHAR(40) NULL,
  amount INT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  INDEX pastime_log_kind(kind, created_at),
  INDEX pastime_log_license(license, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_achievements (
  license VARCHAR(100) NOT NULL,
  achievement_id VARCHAR(40) NOT NULL,
  unlocked_at BIGINT NOT NULL,
  PRIMARY KEY (license, achievement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_duels (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  winner_license VARCHAR(100) NOT NULL,
  loser_license VARCHAR(100) NOT NULL,
  winner_name VARCHAR(100) NOT NULL,
  loser_name VARCHAR(100) NOT NULL,
  meters INT UNSIGNED NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  rating_delta INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  INDEX pastime_duel_winner(winner_license),
  INDEX pastime_duel_loser(loser_license)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_skydive_records (
  license VARCHAR(100) NOT NULL,
  jump_id VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  best_cm INT UNSIGNED NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (license, jump_id),
  INDEX pastime_skydive_best(jump_id, best_cm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pastime_goal_claims (
  week_key CHAR(10) NOT NULL,
  goal_id VARCHAR(40) NOT NULL,
  license VARCHAR(100) NOT NULL,
  claimed_at BIGINT NOT NULL,
  PRIMARY KEY (week_key, goal_id, license)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
