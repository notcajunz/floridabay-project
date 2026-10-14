-- Keep existing personals within the new access limits before enforcing one tag per vehicle.
DELETE duplicate_tag
FROM personal_vehicle_tags duplicate_tag
JOIN personal_vehicle_tags kept_tag
  ON kept_tag.personal_id=duplicate_tag.personal_id
 AND (kept_tag.added_at<duplicate_tag.added_at
   OR (kept_tag.added_at=duplicate_tag.added_at AND kept_tag.tag_id<duplicate_tag.tag_id));

DELETE trust_row
FROM personal_vehicle_trust trust_row
JOIN (
  SELECT personal_id,discord_id
  FROM (
    SELECT personal_id,discord_id,
      ROW_NUMBER() OVER (PARTITION BY personal_id ORDER BY added_at,discord_id) AS trust_number
    FROM personal_vehicle_trust
  ) ranked_trust
  WHERE trust_number>2
) excess_trust
  ON excess_trust.personal_id=trust_row.personal_id
 AND excess_trust.discord_id=trust_row.discord_id
JOIN personal_vehicle_tags tag_lock ON tag_lock.personal_id=trust_row.personal_id;

ALTER TABLE personal_vehicle_tags ADD UNIQUE KEY personal_one_tag(personal_id);
