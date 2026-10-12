-- Multi-stage ban appeals: structured answers and evidence, staff claiming,
-- information requests the member answers on the portal, internal notes and
-- votes, and approve / reduce / deny decisions with a full timeline.

ALTER TABLE moderation_appeals
  MODIFY status ENUM('submitted','under_review','info_requested','approved','reduced','denied','withdrawn') NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS answers JSON NULL AFTER statement,
  ADD COLUMN IF NOT EXISTS evidence JSON NULL AFTER answers,
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(24) NULL AFTER reviewed_by,
  ADD COLUMN IF NOT EXISTS reduced_until BIGINT NULL AFTER assigned_to,
  ADD COLUMN IF NOT EXISTS decided_at BIGINT NULL AFTER updated_at;

CREATE TABLE IF NOT EXISTS moderation_appeal_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appeal_id BIGINT UNSIGNED NOT NULL,
  actor_id VARCHAR(24) NOT NULL,
  kind VARCHAR(24) NOT NULL,
  visibility ENUM('member','staff') NOT NULL DEFAULT 'member',
  body TEXT NULL,
  data JSON NULL,
  created_at BIGINT NOT NULL,
  INDEX appeal_event(appeal_id,created_at),
  CONSTRAINT fk_appeal_event FOREIGN KEY(appeal_id) REFERENCES moderation_appeals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
