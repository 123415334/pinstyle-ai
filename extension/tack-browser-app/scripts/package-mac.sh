#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
APP_NAME="Tack Browser"
APP_DIR="out/${APP_NAME}-darwin-arm64/${APP_NAME}.app"
DIST_DIR="dist"
ZIP_PATH="${DIST_DIR}/Tack-Browser-${VERSION}-mac-arm64.zip"
DMG_PATH="${DIST_DIR}/Tack-Browser-${VERSION}-mac-arm64.dmg"
STAGING_DIR="${DIST_DIR}/dmg-staging"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

npm run package:mac

if [[ ! -d "$APP_DIR" ]]; then
  echo "Expected app bundle was not created: $APP_DIR" >&2
  exit 1
fi

SIGN_IDENTITY="${CODESIGN_IDENTITY:-}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -1)"
fi

if [[ -n "$SIGN_IDENTITY" ]]; then
  echo "Signing with: $SIGN_IDENTITY"
  SIGN_TYPE="distribution"
  if [[ "$SIGN_IDENTITY" == Apple\ Development:* ]]; then
    SIGN_TYPE="development"
  fi
  npx electron-osx-sign "$APP_DIR" --identity="$SIGN_IDENTITY" --type="$SIGN_TYPE"
else
  echo "No code signing identity found. Using ad-hoc signing."
  codesign --force --deep --sign - "$APP_DIR"
fi

codesign --verify --deep --strict --verbose=2 "$APP_DIR"

ditto -c -k --keepParent "$APP_DIR" "$ZIP_PATH"

mkdir -p "$STAGING_DIR"
cp -R "$APP_DIR" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH"
rm -rf "$STAGING_DIR"

shasum -a 256 "$ZIP_PATH" "$DMG_PATH" > "${DIST_DIR}/SHA256SUMS.txt"

echo "Created:"
echo "  $ZIP_PATH"
echo "  $DMG_PATH"
echo "  ${DIST_DIR}/SHA256SUMS.txt"
