-- Drop trigger that conflicted with check_in_and_award_points:
-- 1. Used text vs service_type_enum causing operator error
-- 2. Always used msza_assigned (didn't distinguish extra attendance)
-- 3. Double-awarded points when used alongside the RPC function
-- Points are now awarded exclusively by check_in_and_award_points.
DROP TRIGGER IF EXISTS trg_award_points ON schedule_assignments;
