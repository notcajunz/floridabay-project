-- Organization badges: a template picture per badge tier plus where each line of text goes on it.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.
-- The Department Manager bot fills the template with a member name, rank and callsign.
-- fields holds the text placement as JSON measured in fractions of the picture, so any size works.
CREATE TABLE IF NOT EXISTS org_badge_templates (
  org_id INT UNSIGNED NOT NULL,
  tier VARCHAR(16) NOT NULL,
  mime VARCHAR(24) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  fields TEXT NOT NULL,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(org_id, tier),
  CONSTRAINT fk_badge_tpl_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which badge tier a rank wears. A rank without a row uses the tier its permissions suggest.
CREATE TABLE IF NOT EXISTS org_badge_rank_tiers (
  org_id INT UNSIGNED NOT NULL,
  rank_id INT UNSIGNED NOT NULL,
  tier VARCHAR(16) NOT NULL,
  PRIMARY KEY(org_id, rank_id),
  CONSTRAINT fk_badge_rank_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_badge_rank_rank FOREIGN KEY(rank_id) REFERENCES org_ranks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
