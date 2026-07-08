#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BROWSER="${1:-edge}"

if [[ "$BROWSER" != "chrome" && "$BROWSER" != "edge" ]]; then
  echo "Usage: $0 [chrome|edge]" >&2
  exit 1
fi

VERSION="$(node -p "require('$ROOT_DIR/manifest.json').version")"
STAGE_DIR="$ROOT_DIR/dist-extensions/$BROWSER"
ZIP_PATH="$ROOT_DIR/dist-extensions/tack-$BROWSER-$VERSION.zip"
FILES=(
  manifest.json
  background.js
  sidepanel.html
  sidepanel.css
  sidepanel.js
  sidepanel-helpers.js
  tack_logo.png
  tack_logo.svg
  icons
)

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
for file in "${FILES[@]}"; do
  cp -R "$ROOT_DIR/$file" "$STAGE_DIR/"
done

node "$ROOT_DIR/scripts/validate-extension.mjs" "$STAGE_DIR"
rm -f "$ZIP_PATH"
(
  cd "$STAGE_DIR"
  zip -qr "$ZIP_PATH" .
)
echo "Created $ZIP_PATH"
