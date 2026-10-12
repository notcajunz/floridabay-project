-- Promotion exams taken on the member portal. Trial Head Administrators sit the
-- Head Administrator exam and Head Administrators sit the Management exam. Head
-- of Management and above review them. Exam definitions are seeded by the bot
-- (src/staff-exams.js) and stay editable from the live configuration panel.

CREATE TABLE IF NOT EXISTS staff_exams (
  exam_key VARCHAR(32) PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  target_rank VARCHAR(80) NOT NULL,
  eligible_group VARCHAR(64) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  pass_role_name VARCHAR(80) NOT NULL,
  pass_role_id VARCHAR(24) NULL,
  questions JSON NOT NULL,
  pass_mark INT UNSIGNED NOT NULL DEFAULT 70,
  cooldown_days INT UNSIGNED NOT NULL DEFAULT 14,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_exam_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_key VARCHAR(32) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  rank_at_submit VARCHAR(80) NOT NULL DEFAULT '',
  answers JSON NOT NULL,
  auto_score INT NULL,
  status ENUM('submitted','under_review','passed','failed','withdrawn') NOT NULL DEFAULT 'submitted',
  score INT NULL,
  reviewer_id VARCHAR(24) NULL,
  review_notes VARCHAR(2000) NULL,
  role_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  reviewed_at BIGINT NULL,
  INDEX exam_app_status(exam_key,status,created_at),
  INDEX exam_app_member(discord_id,exam_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
