-- Organization events with member RSVPs on the orgs website.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.

CREATE TABLE IF NOT EXISTS org_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(1000) NULL,
  location VARCHAR(80) NULL,
  starts_at BIGINT NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  cancelled_at BIGINT NULL,
  INDEX org_events_lookup(org_id,starts_at),
  CONSTRAINT fk_org_event_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_event_rsvps (
  event_id BIGINT UNSIGNED NOT NULL,
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  response ENUM('going','maybe','no') NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(event_id,discord_id),
  INDEX org_event_rsvp_org(org_id),
  CONSTRAINT fk_org_event_rsvp_event FOREIGN KEY(event_id) REFERENCES org_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
