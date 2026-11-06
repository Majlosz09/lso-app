-- Audyt 2026-11-05, Etap 7 (decyzja właściciela): codzienny e-mail do opiekunów pracujących na webie (bez push).
-- Raz dziennie, tylko gdy coś czeka: osoby do zatwierdzenia, nieobecności do decyzji, zgłoszenia obecności
-- (te same liczby co licznik „Zgłoszenia” / „Członkowie” w aplikacji — hooks/useNavBadges.ts).
-- Wysyła Edge Function send-admin-digest (SMTP Google Workspace, sekrety SMTP_USER / SMTP_PASS w Supabase);
-- pg_cron woła ją przez pg_net z tajnym nagłówkiem z tabeli app_private.cron_secrets (bez ręcznego klucza).

-- wyłącznik dla opiekuna (Profil → powiadomienia)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT true;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS app_private.cron_secrets (
  name   text PRIMARY KEY,
  secret text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
INSERT INTO app_private.cron_secrets (name) VALUES ('admin_digest') ON CONFLICT DO NOTHING;

-- dziennik wysyłek: jeden e-mail na opiekuna dziennie
CREATE TABLE IF NOT EXISTS app_private.admin_digest_emails (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  send_date  date NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  items      jsonb,
  PRIMARY KEY (profile_id, send_date)
);

-- kto dziś dostaje e-mail i co w nim jest (wołane przez Edge Function kluczem service_role)
CREATE OR REPLACE FUNCTION public.admin_digest_due(p_secret text)
 RETURNS TABLE (profile_id uuid, email text, full_name text, parish_name text,
                pending_members int, pending_absences int, pending_reports int)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Warsaw')::date;
BEGIN
  IF p_secret IS DISTINCT FROM (SELECT secret FROM app_private.cron_secrets WHERE name = 'admin_digest') THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  RETURN QUERY
  WITH counts AS (
    SELECT pa.id AS parish_id, pa.name,
      (SELECT count(*) FROM profiles x WHERE x.parish_id = pa.id AND NOT x.approved)::int AS m,
      (SELECT count(*) FROM schedule_assignments sa JOIN schedules s ON s.id = sa.schedule_id
        WHERE s.parish_id = pa.id AND sa.status = 'excused')::int AS a,
      (SELECT count(*) FROM attendance_reports r WHERE r.parish_id = pa.id AND r.status = 'pending')::int AS r
    FROM parishes pa
  )
  SELECT p.id, u.email::text, p.full_name, c.name, c.m, c.a, c.r
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    JOIN counts c ON c.parish_id = p.parish_id
   WHERE p.approved AND p.email_digest AND (p.role = 'admin' OR p.is_admin)
     AND coalesce(p.managed, false) = false
     AND u.email IS NOT NULL AND u.email NOT ILIKE '%.test'
     AND c.m + c.a + c.r > 0
     AND NOT EXISTS (SELECT 1 FROM app_private.admin_digest_emails d WHERE d.profile_id = p.id AND d.send_date = v_today);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_digest_mark_sent(p_secret text, p_profile_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_secret IS DISTINCT FROM (SELECT secret FROM app_private.cron_secrets WHERE name = 'admin_digest') THEN
    RAISE EXCEPTION 'Brak uprawnień';
  END IF;
  INSERT INTO app_private.admin_digest_emails (profile_id, send_date, items)
  VALUES (p_profile_id, (now() AT TIME ZONE 'Europe/Warsaw')::date, p_items)
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_digest_due(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_digest_mark_sent(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_digest_due(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_digest_mark_sent(text, uuid, jsonb) TO service_role;

-- cron: codziennie 16:00 UTC (17:00 zimą / 18:00 latem w Polsce) → Edge Function z sekretem w nagłówku.
-- Adres projektu nie jest dostępny z bazy — wpis 'project_url' w app_private.cron_secrets ustawia się raz na środowisko:
--   INSERT INTO app_private.cron_secrets (name, secret) VALUES ('project_url', 'https://<ref>.supabase.co')
--   ON CONFLICT (name) DO UPDATE SET secret = excluded.secret;
-- Bez niego zadanie nic nie robi.
CREATE OR REPLACE FUNCTION public.poke_admin_digest()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url    text := (SELECT secret FROM app_private.cron_secrets WHERE name = 'project_url');
  v_secret text := (SELECT secret FROM app_private.cron_secrets WHERE name = 'admin_digest');
BEGIN
  IF v_url IS NULL THEN
    RAISE NOTICE 'poke_admin_digest: brak project_url w app_private.cron_secrets';
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url     := v_url || '/functions/v1/send-admin-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-digest-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.poke_admin_digest() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lso-admin-digest';
SELECT cron.schedule('lso-admin-digest', '0 16 * * *', $cron$SELECT public.poke_admin_digest()$cron$);
