-- Persistent staff handoff board for live operations.

CREATE TABLE IF NOT EXISTS staff_handoff_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  author_id VARCHAR(32) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at BIGINT NULL,
  resolved_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  INDEX handoff_open(resolved_at, pinned, created_at),
  INDEX handoff_author(author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
