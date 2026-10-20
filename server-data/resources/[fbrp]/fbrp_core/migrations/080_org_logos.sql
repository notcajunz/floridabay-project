-- Organization logos shown on the orgs website, the portal and in Discord embeds.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.
-- The image itself is stored here (256 pixels or less, 512 KB at most) so it is served by the
-- website with no external hosting and never expires like a Discord attachment link.
CREATE TABLE IF NOT EXISTS org_logos (
  org_id INT UNSIGNED NOT NULL PRIMARY KEY,
  mime VARCHAR(24) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_org_logo_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
