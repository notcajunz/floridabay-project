-- A member may appeal the same punishment again after a denial, so closed appeal
-- rows must not collide. "One open appeal per case" is enforced by the portal.
ALTER TABLE moderation_appeals
  ADD INDEX IF NOT EXISTS appeal_case(case_id,author_id),
  DROP INDEX IF EXISTS one_open_appeal;
