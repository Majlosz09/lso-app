-- Fix: v_service_type must be service_type_enum, not text
CREATE OR REPLACE FUNCTION check_in_and_award_points(
  p_schedule_id uuid,
  p_profile_id uuid,
  p_parish_id uuid,
  p_method text DEFAULT 'manual',
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment_id uuid;
  v_assignment_status text;
  v_schedule_category text;
  v_service_type service_type_enum;
  v_points integer := 0;
  v_reason text := '';
BEGIN
  -- Idempotency: already checked in
  IF EXISTS (
    SELECT 1 FROM attendance
    WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id
  ) THEN
    RETURN jsonb_build_object('already_checked_in', true, 'points_awarded', 0, 'reason', '');
  END IF;

  -- Determine service category
  SELECT category INTO v_schedule_category
  FROM schedules WHERE id = p_schedule_id;

  -- Existing assignment (any status)
  SELECT id, status INTO v_assignment_id, v_assignment_status
  FROM schedule_assignments
  WHERE schedule_id = p_schedule_id AND profile_id = p_profile_id;

  -- Map to point_rules service_type
  IF v_schedule_category = 'msza' THEN
    v_service_type := CASE WHEN v_assignment_id IS NOT NULL THEN 'msza_assigned'::service_type_enum ELSE 'msza_extra'::service_type_enum END;
  ELSIF v_schedule_category = 'nabozenstwo' THEN
    v_service_type := 'nabozenstwo'::service_type_enum;
  ELSIF v_schedule_category = 'zbiorka' THEN
    v_service_type := 'zbiorka'::service_type_enum;
  END IF;

  -- Record attendance
  INSERT INTO attendance (schedule_id, profile_id, method, checked_at, parish_id, lat, lng, marked_by)
  VALUES (p_schedule_id, p_profile_id, p_method, now(), p_parish_id, p_lat, p_lng, p_profile_id)
  ON CONFLICT (schedule_id, profile_id) DO NOTHING;

  -- Update or create assignment
  IF v_assignment_id IS NOT NULL THEN
    UPDATE schedule_assignments SET status = 'present' WHERE id = v_assignment_id;
  ELSE
    INSERT INTO schedule_assignments (schedule_id, profile_id, role, status)
    VALUES (p_schedule_id, p_profile_id, 'ministrant', 'present')
    ON CONFLICT (schedule_id, profile_id) DO UPDATE SET status = 'present';
  END IF;

  -- Award points per parish rules
  IF v_service_type IS NOT NULL THEN
    SELECT points INTO v_points
    FROM point_rules
    WHERE parish_id = p_parish_id AND service_type = v_service_type;

    IF COALESCE(v_points, 0) > 0 THEN
      v_reason := CASE v_service_type::text
        WHEN 'msza_assigned' THEN 'Msza (dyżur)'
        WHEN 'msza_extra'    THEN 'Msza (dodatkowa)'
        WHEN 'nabozenstwo'   THEN 'Nabożeństwo'
        WHEN 'zbiorka'       THEN 'Zbiórka'
        ELSE 'Służba'
      END;
      INSERT INTO points (profile_id, amount, reason, parish_id, awarded_by)
      VALUES (p_profile_id, v_points, v_reason, p_parish_id, p_profile_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_checked_in', false,
    'points_awarded', COALESCE(v_points, 0),
    'reason', COALESCE(v_reason, '')
  );
END;
$$;
