DROP VIEW IF EXISTS points_summary;

CREATE VIEW points_summary AS
SELECT
  p.id AS profile_id,
  p.full_name,
  p.parish_id,
  COALESCE(a.services_count, 0) AS services_count,
  ((COALESCE(a.services_count, 0) * 5) + COALESCE(pt.manual_points, 0)) AS total_points
FROM profiles p
LEFT JOIN (
  SELECT profile_id, count(*)::integer AS services_count
  FROM attendance GROUP BY profile_id
) a ON a.profile_id = p.id
LEFT JOIN (
  SELECT profile_id, COALESCE(sum(amount), 0)::integer AS manual_points
  FROM points GROUP BY profile_id
) pt ON pt.profile_id = p.id
WHERE p.is_active = true AND p.role = 'member';
