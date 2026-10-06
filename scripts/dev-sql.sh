#!/usr/bin/env bash
# SQL tylko na LSO-dev. Użycie:
#   bash scripts/dev-sql.sh --link                 (jednorazowo: podlinkuj CLI do LSO-dev)
#   bash scripts/dev-sql.sh "select 1"
#   bash scripts/dev-sql.sh -f supabase/migrations/plik.sql
# Token konta Supabase z dostępem do LSO-dev: .env.supabase.local (SUPABASE_ACCESS_TOKEN=...), plik gitignored.
# Odmawia, jeśli Supabase CLI jest podlinkowane do czegokolwiek innego niż LSO-dev.
set -euo pipefail
DEV_REF="phwoxylvcazcnaifcqab"
cd "$(dirname "$0")/.."
if [ -f .env.supabase.local ]; then
  set -a; . ./.env.supabase.local; set +a
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "STOP: brak SUPABASE_ACCESS_TOKEN w .env.supabase.local." >&2
  exit 1
fi
if [ "${1:-}" = "--link" ]; then
  exec npx supabase link --project-ref "$DEV_REF"
fi
REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [ "$REF" != "$DEV_REF" ]; then
  echo "STOP: CLI jest podlinkowane do '${REF:-nic}', a nie do LSO-dev ($DEV_REF). Nic nie wykonano." >&2
  exit 1
fi
exec npx supabase db query --linked "$@"
