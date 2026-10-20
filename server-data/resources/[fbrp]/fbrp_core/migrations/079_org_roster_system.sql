-- Organization roster system and organization profiles on the orgs website.
-- Comments here avoid apostrophes and semicolons: both migration runners split on them.

-- More rank permissions and a weekly duty requirement per rank (minutes, NULL = none).
ALTER TABLE org_ranks
  ADD COLUMN IF NOT EXISTS can_announce BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_discipline BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_applications BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_weekly_minutes SMALLINT UNSIGNED NULL;

-- Public profile: about text, Discord invite, recruitment and application questions.
CREATE TABLE IF NOT EXISTS org_profiles (
  org_id INT UNSIGNED NOT NULL PRIMARY KEY,
  tagline VARCHAR(120) NULL,
  about VARCHAR(2000) NULL,
  discord_invite VARCHAR(120) NULL,
  recruiting BOOLEAN NOT NULL DEFAULT FALSE,
  questions JSON NULL,
  public_roster BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  CONSTRAINT fk_org_profile_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Divisions (units, sections, crews) members are assigned to on the roster board.
CREATE TABLE IF NOT EXISTS org_divisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  color CHAR(7) NULL,
  description VARCHAR(160) NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY org_division_name(org_id,name),
  CONSTRAINT fk_division_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per member roster details. Kept apart from organization_members so they survive a
-- member briefly losing and regaining the access role.
CREATE TABLE IF NOT EXISTS org_member_profiles (
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  callsign VARCHAR(16) NULL,
  division_id INT UNSIGNED NULL,
  status ENUM('active','loa','probation','inactive','suspended') NOT NULL DEFAULT 'active',
  status_note VARCHAR(160) NULL,
  status_until BIGINT NULL,
  updated_by VARCHAR(32) NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(org_id,discord_id),
  UNIQUE KEY org_member_callsign(org_id,callsign),
  INDEX org_member_division(division_id),
  CONSTRAINT fk_member_profile_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_profile_division FOREIGN KEY(division_id) REFERENCES org_divisions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Member file: promotions, demotions, commendations, strikes and leadership notes.
CREATE TABLE IF NOT EXISTS org_member_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  kind ENUM('promotion','demotion','commendation','strike','note') NOT NULL,
  body VARCHAR(500) NOT NULL,
  actor_id VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  revoked_by VARCHAR(32) NULL,
  revoked_at BIGINT NULL,
  INDEX org_member_record_lookup(org_id,discord_id,id),
  CONSTRAINT fk_member_record_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  author_id VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX org_announcement_lookup(org_id,pinned,id),
  CONSTRAINT fk_announcement_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  discord_id VARCHAR(24) NOT NULL,
  answers JSON NOT NULL,
  status ENUM('pending','accepted','denied','withdrawn') NOT NULL DEFAULT 'pending',
  reviewer_id VARCHAR(32) NULL,
  review_note VARCHAR(500) NULL,
  created_at BIGINT NOT NULL,
  reviewed_at BIGINT NULL,
  INDEX org_application_queue(org_id,status,id),
  INDEX org_application_member(discord_id,org_id),
  CONSTRAINT fk_application_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
