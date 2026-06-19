# Tack Browser

Tack Browser is a desktop MVP for a branded Tack browsing experience: browse real sites, scan visible images, select references in context, capture a region when URLs are unavailable, and generate from the selected visual direction.

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

## What is intentionally still local/mock

- It does not save references to Supabase yet.
- It does not include login/account sync yet.
- Public builds still need Developer ID signing and Apple notarization for normal Gatekeeper-approved installs.

## Next production steps

- Connect the tray to Tack auth and saved `reference_images`.
- Share auth with Tack accounts so paid-plan output counts, usage, and saved history match the Chrome extension.
- Add Developer ID signing, notarization, and auto-update.
- Expand site-specific extractors for Instagram, Behance, and ecommerce pages.
- Add a library view that syncs with the web app instead of becoming a separate data silo.
