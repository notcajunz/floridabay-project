-- Durable website-hosted ticket transcripts. Content is structured JSON so the
-- viewer can render accessible messages without generating downloadable files.

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  ticket_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  content JSON NOT NULL,
  message_count INT UNSIGNED NOT NULL DEFAULT 0,
  generated_at BIGINT NOT NULL,
  generated_by VARCHAR(32) NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_transcript_ticket FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  INDEX transcript_generated(generated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
