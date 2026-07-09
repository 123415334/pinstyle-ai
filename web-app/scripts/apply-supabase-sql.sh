#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DIR="$ROOT_DIR/web-app"
SQL_FILE="${1:-}"
SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-2.109.1}"

if [[ -z "$SQL_FILE" ]]; then
  echo "Usage: npm run db:query -- api/supabase-migration-v10-anonymous-free-generations.sql" >&2
  exit 2
fi

cd "$WEB_DIR"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 2
fi

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

if [[ -f ".env.local" ]]; then
  load_env_file ".env.local"
fi
if [[ -f ".env.vercel.local" ]]; then
  load_env_file ".env.vercel.local"
fi

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  npx --yes "supabase@$SUPABASE_CLI_VERSION" --workdir "$ROOT_DIR" db query --db-url "$SUPABASE_DB_URL" --file "$SQL_FILE"
  exit 0
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "SUPABASE_URL is missing. Run: npm run env:pull:prod" >&2
  exit 2
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$PROJECT_REF" ]]; then
  SUPABASE_HOST="${SUPABASE_URL#https://}"
  PROJECT_REF="${SUPABASE_HOST%%.*}"
fi

if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == "$SUPABASE_URL" ]]; then
  echo "Could not derive Supabase project ref from SUPABASE_URL. Set SUPABASE_PROJECT_REF." >&2
  exit 2
fi

if ! npx --yes "supabase@$SUPABASE_CLI_VERSION" --workdir "$ROOT_DIR" projects list >/dev/null 2>&1; then
  cat >&2 <<EOF
Supabase CLI is not authenticated.

One-time setup:
  npx --yes supabase@$SUPABASE_CLI_VERSION login

Or set SUPABASE_ACCESS_TOKEN in web-app/.env.local.

For passwordless migration runs, you can also add SUPABASE_DB_URL to web-app/.env.local.
EOF
  exit 2
fi

npx --yes "supabase@$SUPABASE_CLI_VERSION" --workdir "$ROOT_DIR" link --project-ref "$PROJECT_REF" >/dev/null
npx --yes "supabase@$SUPABASE_CLI_VERSION" --workdir "$ROOT_DIR" db query --linked --file "$SQL_FILE"
