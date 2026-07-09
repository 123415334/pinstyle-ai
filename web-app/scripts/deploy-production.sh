#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"

npm test

if [[ ! -d ".vercel" ]]; then
  vercel link --yes --project tack
fi

if [[ "${ALLOW_INSECURE_VERCEL_TLS:-}" == "1" ]]; then
  NODE_TLS_REJECT_UNAUTHORIZED=0 vercel deploy --prod
else
  vercel deploy --prod
fi
