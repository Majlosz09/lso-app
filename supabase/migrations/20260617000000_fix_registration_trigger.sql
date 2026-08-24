-- Pozwól na ustawienie parish_id i role przy pierwszej rejestracji
-- Trigger blokuje zmianę tych pól tylko gdy parish_id było już ustawione
-- (czyli user jest już zarejestrowany w parafii)

CREATE OR REPLACE FUNCTION trg_profiles_protect_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (NEW.parish_id IS DISTINCT FROM OLD.parish_id
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin)
  THEN
    -- Zezwól na pierwszą rejestrację: gdy parish_id było NULL (user dopiero dołącza)
    -- is_admin musi pozostać false (blokuje self-elevation)
    IF OLD.parish_id IS NULL AND NEW.is_admin IS NOT TRUE THEN
      RETURN NEW;
    END IF;

    -- W pozostałych przypadkach wymagaj uprawnień admina
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND (role = 'admin' OR is_admin = true)
    ) THEN
      RAISE EXCEPTION 'Brak uprawnień do zmiany parish_id, role lub is_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
