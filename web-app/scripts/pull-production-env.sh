#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"

if [[ ! -d ".vercel" ]]; then
  vercel link --yes --project tack
fi

if ! vercel whoami >/dev/null 2>&1; then
  if [[ "${ALLOW_INSECURE_VERCEL_TLS:-}" == "1" ]]; then
    NODE_TLS_REJECT_UNAUTHORIZED=0 vercel env pull .env.vercel.local --environment=production
  else
    cat >&2 <<'EOF'
Vercel CLI is not reachable with the current TLS settings.

If this machine uses a custom certificate chain, prefer setting NODE_EXTRA_CA_CERTS.
For a temporary local workaround:
  ALLOW_INSECURE_VERCEL_TLS=1 npm run env:pull:prod
EOF
    exit 2
  fi
else
  vercel env pull .env.vercel.local --environment=production
fi
