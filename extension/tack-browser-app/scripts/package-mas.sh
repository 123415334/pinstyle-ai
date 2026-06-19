#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "require('./package.json').version")"
APP_NAME="Tack Browser"
APP_DIR="out-mas/${APP_NAME}-mas-arm64/${APP_NAME}.app"
DIST_DIR="dist-mas"
PKG_PATH="${DIST_DIR}/Tack-Browser-${VERSION}-mas.pkg"
SIGNING_KEYCHAIN="${SIGNING_KEYCHAIN:-}"
SIGNING_KEYCHAIN_PASSWORD_FILE="${SIGNING_KEYCHAIN_PASSWORD_FILE:-}"

if [[ -n "$SIGNING_KEYCHAIN" ]]; then
  if [[ ! -f "$SIGNING_KEYCHAIN" ]]; then
    echo "Signing keychain does not exist: $SIGNING_KEYCHAIN" >&2
    exit 1
  fi
  if [[ -n "$SIGNING_KEYCHAIN_PASSWORD_FILE" ]]; then
    security unlock-keychain -p "$(cat "$SIGNING_KEYCHAIN_PASSWORD_FILE")" "$SIGNING_KEYCHAIN"
  fi
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

npm run package:mas

if [[ ! -d "$APP_DIR" ]]; then
  echo "Expected MAS app bundle was not created: $APP_DIR" >&2
  exit 1
fi

APP_SIGN_IDENTITY="${APPLE_DISTRIBUTION_IDENTITY:-}"
if [[ -z "$APP_SIGN_IDENTITY" ]]; then
  APP_SIGN_IDENTITY="$(security find-identity -v -p codesigning ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} 2>/dev/null | sed -n 's/.*"\(Mac App Distribution:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$APP_SIGN_IDENTITY" ]]; then
  APP_SIGN_IDENTITY="$(security find-identity -v -p codesigning ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} 2>/dev/null | sed -n 's/.*"\(3rd Party Mac Developer Application:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$APP_SIGN_IDENTITY" ]]; then
  APP_SIGN_IDENTITY="$(security find-identity -v -p codesigning ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} 2>/dev/null | sed -n 's/.*"\(Apple Distribution:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$APP_SIGN_IDENTITY" ]]; then
  echo "Missing Mac App Distribution signing identity." >&2
  echo "Create a Mac App Distribution certificate in Apple Developer, then rerun this script." >&2
  exit 1
fi

INSTALLER_SIGN_IDENTITY="${MAC_INSTALLER_DISTRIBUTION_IDENTITY:-}"
if [[ -z "$INSTALLER_SIGN_IDENTITY" ]]; then
  INSTALLER_SIGN_IDENTITY="$(security find-identity -v ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} 2>/dev/null | sed -n 's/.*"\(Mac Installer Distribution:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$INSTALLER_SIGN_IDENTITY" ]]; then
  INSTALLER_SIGN_IDENTITY="$(security find-identity -v ${SIGNING_KEYCHAIN:+"$SIGNING_KEYCHAIN"} 2>/dev/null | sed -n 's/.*"\(3rd Party Mac Developer Installer:[^"]*\)".*/\1/p' | head -1)"
fi
if [[ -z "$INSTALLER_SIGN_IDENTITY" ]]; then
  echo "Missing Mac Installer Distribution signing identity." >&2
  echo "Create it in Xcode > Settings > Accounts > Manage Certificates, then rerun this script." >&2
  exit 1
fi

SIGN_ARGS=(
  "$APP_DIR"
  "--identity=$APP_SIGN_IDENTITY"
  "--type=distribution"
  "--platform=mas"
  "--entitlements=build/entitlements.mas.plist"
  "--entitlements-inherit=build/entitlements.mas.inherit.plist"
)

if [[ -n "$SIGNING_KEYCHAIN" ]]; then
  SIGN_ARGS+=("--keychain=$SIGNING_KEYCHAIN")
fi

if [[ -n "${PROVISIONING_PROFILE:-}" ]]; then
  SIGN_ARGS+=("--provisioning-profile=$PROVISIONING_PROFILE")
fi

npx electron-osx-sign "${SIGN_ARGS[@]}"
codesign --verify --deep --strict --verbose=2 "$APP_DIR"

rm -f "$PKG_PATH"

PRODUCTBUILD_ARGS=(
  "--component" "$APP_DIR"
  "/Applications"
  "--sign" "$INSTALLER_SIGN_IDENTITY"
)

if [[ -n "$SIGNING_KEYCHAIN" ]]; then
  PRODUCTBUILD_ARGS+=("--keychain" "$SIGNING_KEYCHAIN")
fi

PRODUCTBUILD_ARGS+=("$PKG_PATH")

productbuild "${PRODUCTBUILD_ARGS[@]}"
pkgutil --check-signature "$PKG_PATH"

echo "Created:"
echo "  $PKG_PATH"
echo
echo "Upload with Transporter or:"
echo "  xcrun altool --validate-app -f \"$PKG_PATH\" -t macos -u APPLE_ID -p APP_SPECIFIC_PASSWORD"
echo "  xcrun altool --upload-app -f \"$PKG_PATH\" -t macos -u APPLE_ID -p APP_SPECIFIC_PASSWORD"
