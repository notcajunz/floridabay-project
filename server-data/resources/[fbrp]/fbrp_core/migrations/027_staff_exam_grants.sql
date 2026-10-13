-- Exam access is handed out by Assistant Community Director and above with /exam give.
-- A grant opens one exam for one member for 60 minutes and is used up on submit.

CREATE TABLE IF NOT EXISTS staff_exam_grants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_key VARCHAR(32) NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  granted_by VARCHAR(24) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT NULL,
  revoked_at BIGINT NULL,
  revoked_by VARCHAR(24) NULL,
  INDEX exam_grant_member(discord_id,exam_key,expires_at),
  INDEX exam_grant_active(expires_at,used_at,revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
