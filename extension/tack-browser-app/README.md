# Tack Browser

Tack Browser is the Mac app for a branded Tack browsing experience: browse real sites, scan visible images, select references in context, capture a region when URLs are unavailable, generate from the selected visual direction, and organize saved generations into boards.

## Run locally

```sh
cd tack-browser-app
npm install --cache .npm-cache
npm start
```

## Package a Mac app

```sh
cd tack-browser-app
npm run dist:mac
```

Downloadable artifacts are written to `tack-browser-app/dist/`:

- `Tack-Browser-<version>-mac-arm64.zip`
- `Tack-Browser-<version>-mac-arm64.dmg`
- `SHA256SUMS.txt`

See `RELEASE.md` for GitHub release and Apple signing/notarization steps.

## Package for the Mac App Store

```sh
cd tack-browser-app
npm run dist:mas
```

This creates an Apple-submittable package in `tack-browser-app/dist-mas/` once the Apple Distribution and Mac Installer Distribution certificates are installed. See `APP_STORE_SUBMISSION.md` for the App Store Connect checklist.

## What works now

- Loads real websites in an Electron webview.
- Supports browser controls: address bar, back, forward, reload, preset tabs, and open in Chrome.
- Scans the loaded page for visible `img` and CSS background-image references.
- Uses the same Pinterest URL-upgrade path as the Chrome extension so selected pins are sent as higher-quality `i.pinimg.com/736x/` references when available.
- Injects a Tack selection layer into the page.
- Prevents normal page navigation when selecting detected images.
- Adds selected image references to the Tack tray with source URLs.
- Supports Capture region for visible pixels when direct image selection is not enough.
- Updates style-read tags and enables generation from selected references.
- Calls the live Tack `/api/analyze` endpoint with the same core payload shape as the Chrome extension: `imageUrls`, `subject`, `anonymousId`, `aspectRatio`, `aspect_ratio`, and output dimensions.

## Public release status

- Login, account usage, synced generations, and boards are connected to the Tack account system.
- Generation calls the live Tack `/api/analyze` endpoint.
- Public builds still need Apple distribution signing, notarization, and/or App Store approval before normal customer installs.

## Next production steps

- Add Apple distribution signing, notarization, and auto-update.
- Expand site-specific extractors for Instagram, Behance, and ecommerce pages.
