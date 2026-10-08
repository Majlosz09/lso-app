#!/usr/bin/env bash
# =============================================================================
# Wydanie 1.2.0 — migracje bazy PRODUKCYJNEJ. URUCHAMIA WYŁĄCZNIE WŁAŚCICIEL (nie asystent).
#
#   bash scripts/release-prod-sql.sh check     # tylko sprawdza, co już jest w bazie PROD (nic nie zmienia)
#   bash scripts/release-prod-sql.sh migrate   # uruchamia BRAKUJĄCE migracje po kolei, stop na pierwszym błędzie
#   bash scripts/release-prod-sql.sh verify    # kontrola po migracji
#
# Każda migracja jest rozpoznawana po obiekcie, który tworzy (tabela / kolumna / funkcja), więc
# ponowne uruchomienie pomija to, co już zrobione. Na koniec CLI wraca do LSO-dev (scripts/dev-sql.sh działa dalej).
# =============================================================================
set -euo pipefail
PROD_REF="kvqjaoprxxiemynyihfs"
DEV_REF="phwoxylvcazcnaifcqab"
MODE="${1:-check}"
cd "$(dirname "$0")/.."
if [ -f .env.supabase.local ]; then set -a; . ./.env.supabase.local; set +a; fi
# Produkcja jest na innym koncie Supabase niż LSO-dev: osobny token SUPABASE_PROD_ACCESS_TOKEN w .env.supabase.local
DEV_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "${SUPABASE_PROD_ACCESS_TOKEN:-}" ]; then
  echo "Brak SUPABASE_PROD_ACCESS_TOKEN w .env.supabase.local (token z konta, na którym jest projekt LSO)."; exit 1
fi
LOG="release-1.2.0-prod.log"

# plik migracji → wyrażenie SQL zwracające true, gdy migracja jest już w bazie
MIGRATIONS=(
  "20260927000000_security_hardening.sql|to_regprocedure('public.is_chat_member(uuid)') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_chat_member')"
  "20260927000001_delete_my_account.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='delete_my_account')"
  "20260927000002_drop_legacy_policies.sql|EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parishes' AND policyname='parishes_select_own')"
  "20260928000000_admin_tools.sql|to_regclass('public.recurring_assignments') IS NOT NULL"
  "20260928010000_points_approval_hardening.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points' AND column_name='source')"
  "20260928020000_chat_perf_rodo.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='parish_allows_member_dm')"
  "20260928030000_fix_rls_recursion.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='my_created_parish_count')"
  "20260929000000_app_announcements.sql|to_regclass('public.app_announcements') IS NOT NULL"
  "20260930000000_user_blocks.sql|to_regclass('public.user_blocks') IS NOT NULL"
  "20260930000100_attendance_methods.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parishes' AND column_name='attendance_methods')"
  "20261001000000_rejected_excuse_penalty.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parishes' AND column_name='rejected_excuse_penalty')"
  "20261001010000_parent_child_absence.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='report_child_absence')"
  "20261001020000_swap_requests.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='request_swap')"
  "20261001030000_chat_settings.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name='members_can_create_polls')"
  "20261001040000_content_reads.sql|to_regclass('public.content_reads') IS NOT NULL"
  "20261001050000_notifications_center.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='add_notification')"
  "20261001060000_daily_word.sql|to_regclass('public.daily_word') IS NOT NULL"
  "20261001070000_schedule_roles.sql|to_regclass('public.schedule_role_slots') IS NOT NULL"
  "20261004000000_rozklad_okresowy.sql|to_regclass('public.mass_periods') IS NOT NULL"
  "20261004010000_attendance_reports.sql|to_regclass('public.attendance_reports') IS NOT NULL"
  "20261004020000_push_for_new_notifications.sql|EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_notifications_push')"
  "20261005000000_rozklad_liturgiczny.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='liturgical_anchor')"
  "20261005010000_churches.sql|to_regclass('public.churches') IS NOT NULL"
  "20261005020000_period_churches.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mass_periods' AND column_name='church_ids')"
  "20261005030000_kids_without_phones.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='unsign_child')"
  "20261005040000_auto_schedule.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='apply_auto_schedule')"
  "20261005050000_liturgical_functions.sql|to_regclass('public.parish_functions') IS NOT NULL"
  "20261005060000_helper_role.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_helper')"
  "20261005070000_public_schedule_calendar.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parishes' AND column_name='public_token')"
  "20261005080000_managed_members.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='claim_code')"
  "20261005090000_formation_path.sql|to_regclass('public.rank_requirements') IS NOT NULL"
  "20261005100000_challenges.sql|to_regclass('public.challenges') IS NOT NULL"
  "20261005110000_monthly_report.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='monthly_report')"
  "20261005120000_offline_checkin.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='check_in_offline')"
  "20261006000000_system_ranks_toggle.sql|EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='parishes' AND column_name='system_ranks_enabled')"
  "20261006010000_point_categories.sql|to_regclass('public.point_categories') IS NOT NULL"
  "20261006020000_formation_without_wiedza.sql|to_regclass('public.rank_requirements') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='_formation_progress' AND prosrc ILIKE '%wiedza_keys%')"
  "20261008000000_push_tokens.sql|EXISTS (SELECT 1 FROM pg_proc WHERE proname='claim_push_token')"
)

banner() {
  echo "=============================================================="
  echo "  BAZA PRODUKCYJNA ($PROD_REF) — prawdziwe dane parafii"
  echo "  Tryb: $MODE"
  echo "=============================================================="
}
q() { npx supabase db query --linked "$@"; }
applied() {  # $1 = wyrażenie SQL → 0 gdy prawda
  q "select ($1) as applied" 2>&1 | grep -q '"applied": true'
}
back_to_dev() {
  echo "→ Przełączam Supabase CLI z powrotem na LSO-dev"
  SUPABASE_ACCESS_TOKEN="$DEV_TOKEN" npx supabase link --project-ref "$DEV_REF" >/dev/null 2>&1 || echo "  (przełącz ręcznie: bash scripts/dev-sql.sh --link)"
}

banner
read -r -p "Wpisz PRODUKCJA, aby kontynuować: " ans
[ "$ans" = "PRODUKCJA" ] || { echo "Przerwano."; exit 1; }
trap back_to_dev EXIT
export SUPABASE_ACCESS_TOKEN="$SUPABASE_PROD_ACCESS_TOKEN"
npx supabase link --project-ref "$PROD_REF"

case "$MODE" in
  check)
    echo; echo "Stan migracji na PROD:"
    for m in "${MIGRATIONS[@]}"; do
      f="${m%%|*}"; cond="${m#*|}"
      if applied "$cond"; then echo "  [jest]     $f"; else echo "  [BRAKUJE]  $f"; fi
    done
    echo; echo "Rozszerzenia (wymagane: pg_cron do raportu miesięcznego):"
    q "select extname from pg_extension where extname in ('pg_cron','pg_net') order by 1"
    ;;
  backup)
    # kopia danych wszystkich tabel public do JSON (lokalnie, katalog w .gitignore)
    dir="backups/prod-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$dir"
    tables=$(q "select string_agg(tablename, ' ' order by tablename) as t from pg_tables where schemaname = 'public'" | grep -o '"t": "[^"]*' | sed 's/"t": "//')
    for t in $tables; do
      q "select count(*) as n, coalesce(json_agg(x), '[]'::json) as rows from public.\"$t\" x" > "$dir/$t.json" 2>&1 || echo "  ✖ $t"
      echo "  $t: $(grep -o '"n": [0-9]*' "$dir/$t.json" | head -1)"
    done
    echo "Kopia: $dir"
    ;;
  query)
    # tylko odczyt: bash scripts/release-prod-sql.sh query "select ..."
    case "$(echo "${2:-}" | tr 'A-Z' 'a-z' | sed 's/^ *//')" in
      select*|with*) q "$2" ;;
      *) echo "Tylko zapytania SELECT/WITH."; exit 1 ;;
    esac
    ;;
  counts)
    q "select (select count(*) from profiles) profiles, (select count(*) from schedules) schedules, (select count(*) from schedule_assignments) assignments, (select count(*) from points) points, (select count(*) from attendance) attendance, (select count(*) from mass_templates) mass_templates, (select count(*) from parishes) parishes, (select count(*) from chat_messages) chat, (select count(*) from member_badges) badges, (select count(*) from churches) churches"
    ;;
  migrate)
    if ! applied "EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')"; then
      echo "STOP: brak rozszerzenia pg_cron. Włącz: Supabase → Database → Extensions → pg_cron, potem uruchom ponownie."
      exit 1
    fi
    echo "Log: $LOG"; echo "=== $(date) migrate" >> "$LOG"
    for m in "${MIGRATIONS[@]}"; do
      f="${m%%|*}"; cond="${m#*|}"
      if applied "$cond"; then echo "  pomijam (już jest)  $f"; continue; fi
      echo "  ▶ uruchamiam        $f"
      if ! q -f "supabase/migrations/$f" >> "$LOG" 2>&1; then
        echo "  ✖ BŁĄD w $f — zatrzymano. Szczegóły w $LOG (koniec pliku). Nic dalej nie uruchomiono."
        exit 1
      fi
      if ! applied "$cond"; then
        echo "  ✖ $f wykonana, ale kontrola nie widzi zmian — zatrzymano. Sprawdź $LOG."
        exit 1
      fi
      echo "    ✓ $f"; echo "ok $f" >> "$LOG"
    done
    echo; echo "Wszystkie migracje są w bazie. Uruchom: bash scripts/release-prod-sql.sh verify"
    ;;
  verify)
    missing=0
    for m in "${MIGRATIONS[@]}"; do
      f="${m%%|*}"; cond="${m#*|}"
      applied "$cond" || { echo "  [BRAKUJE] $f"; missing=1; }
    done
    [ $missing = 0 ] && echo "  ✓ wszystkie migracje są w bazie"
    q "select jobname, schedule from cron.job where jobname='lso-monthly-report'"
    q "select count(*) filter (where system_ranks_enabled) as parafie_z_rangami_systemowymi, count(*) as parafie from parishes"
    q "select count(*) as kosciol_glowny_brak from parishes p where not exists (select 1 from churches c where c.parish_id=p.id and c.is_main)"
    ;;
  *) echo "Użycie: bash scripts/release-prod-sql.sh check|backup|migrate|verify|counts|query"; exit 1 ;;
esac
