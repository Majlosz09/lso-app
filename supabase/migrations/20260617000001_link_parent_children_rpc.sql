-- RPC pozwalająca rodzicowi powiązać swój profil z dzieckiem/dziećmi
-- SECURITY DEFINER omija RLS — rodzic nie może edytować obcych profili bezpośrednio

CREATE OR REPLACE FUNCTION link_parent_to_children(p_child_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_parish_id uuid;
  v_role      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pobierz parish_id i role wywołującego użytkownika
  SELECT parish_id, role INTO v_parish_id, v_role
    FROM profiles WHERE id = v_user_id;

  IF v_role NOT IN ('parent', 'admin') THEN
    RAISE EXCEPTION 'Only parents or admins can link children';
  END IF;

  IF v_parish_id IS NULL THEN
    RAISE EXCEPTION 'User has no parish assigned';
  END IF;

  -- Ustaw parent_id tylko na dzieciach z tej samej parafii o roli member
  UPDATE profiles
    SET parent_id = v_user_id
    WHERE id = ANY(p_child_ids)
      AND parish_id = v_parish_id
      AND role = 'member';
END;
$$;
