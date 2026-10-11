-- Global bans can also ban the alt accounts linked to the banned user through game identifiers.
-- source_case_id ties an alt ban to the ban it was derived from (lifting the source lifts the alts,
-- and a lifted alt is never re-banned by the sweep). alt_scan marks bans that keep looking for newly
-- linked alts. It defaults to FALSE so existing bans are untouched.

ALTER TABLE moderation_cases
  ADD COLUMN IF NOT EXISTS source_case_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS alt_scan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX IF NOT EXISTS cases_source(source_case_id);
