-- Tags may be restricted to a specific organization duty. Organization-created
-- default tags are backfilled so the control panel accurately describes them.
ALTER TABLE headtags
  ADD COLUMN org_id INT UNSIGNED NULL AFTER guild_id,
  ADD INDEX tag_org(org_id),
  ADD CONSTRAINT fk_headtag_org FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE SET NULL;

UPDATE headtags t
JOIN organizations o ON o.tag_id=t.id
SET t.org_id=o.id
WHERE t.org_id IS NULL;
