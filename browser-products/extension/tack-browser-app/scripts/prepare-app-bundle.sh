#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:?Usage: prepare-app-bundle.sh /path/to/App.app}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFO_PLIST="$APP_DIR/Contents/Info.plist"
RESOURCES_DIR="$APP_DIR/Contents/Resources"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Missing Info.plist: $INFO_PLIST" >&2
  exit 1
fi

cp "$ROOT_DIR/build/tack.icns" "$RESOURCES_DIR/tack.icns"
"$PLIST_BUDDY" -c "Set :CFBundleIconFile tack.icns" "$INFO_PLIST"
"$PLIST_BUDDY" -c "Set :LSApplicationCategoryType public.app-category.graphics-design" "$INFO_PLIST"

for key in \
  NSAudioCaptureUsageDescription \
  NSBluetoothAlwaysUsageDescription \
  NSBluetoothPeripheralUsageDescription \
  NSCameraUsageDescription \
  NSMicrophoneUsageDescription
do
  "$PLIST_BUDDY" -c "Delete :$key" "$INFO_PLIST" 2>/dev/null || true
done

"$PLIST_BUDDY" -c "Delete :NSAppTransportSecurity:NSAllowsArbitraryLoads" "$INFO_PLIST" 2>/dev/null || true
"$PLIST_BUDDY" -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent bool true" "$INFO_PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Set :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent true" "$INFO_PLIST"

plutil -lint "$INFO_PLIST" >/dev/null
