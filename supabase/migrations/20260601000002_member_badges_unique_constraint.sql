-- Remove duplicate member_badges rows (keep the oldest per profile+definition)
-- then add unique constraint to prevent future duplicates.
DELETE FROM member_badges
WHERE id NOT IN (
  SELECT DISTINCT ON (profile_id, badge_definition_id) id
  FROM member_badges
  ORDER BY profile_id, badge_definition_id, awarded_at ASC
);

ALTER TABLE member_badges
  DROP CONSTRAINT IF EXISTS member_badges_profile_id_badge_definition_id_key;

ALTER TABLE member_badges
  ADD CONSTRAINT member_badges_profile_id_badge_definition_id_key
  UNIQUE (profile_id, badge_definition_id);
