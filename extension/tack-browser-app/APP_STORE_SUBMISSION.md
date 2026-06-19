# Tack Browser App Store Submission

## Current App Store Connect record

- App name: Tack Browser
- Platform: macOS
- Bundle ID: `com.tack.browser`
- SKU: `tack-browser-mac-001`
- Status: Prepare for Submission

## What is ready

- The private App Store Connect app shell exists.
- The Apple Developer Bundle ID exists.
- The project has a separate Mac App Store packaging script: `npm run dist:mas`.
- The existing public-download DMG/ZIP path remains separate: `npm run dist:mac`.

## What still needs your Apple account

Open Xcode, then go to Settings > Accounts > Manage Certificates and add:

1. Apple Distribution
2. Mac Installer Distribution

After those certificates exist in Keychain, run:

```sh
cd extension/tack-browser-app
npm run dist:mas
```

The App Store package will be created at:

```sh
dist-mas/Tack-Browser-0.1.1-mas.pkg
```

Upload that package with Apple's Transporter app, or with `xcrun altool`.

## App Store listing draft

### Promotional Text

Create product imagery from the visual references you find while browsing.

### Description

Tack Browser is a visual reference browser for creating product imagery. Browse the web, select images that define the look you want, describe the object or scene to create, and generate polished image directions from your chosen references.

Use Tack Browser to collect references from real pages, capture visible regions when an image URL is not available, generate new images from a visual style direction, and save generations into your Tack library and boards.

Tack is built for founders, designers, marketers, and creative teams who need faster ways to turn visual taste into usable product imagery.

### Keywords

product photography, ai images, creative tools, moodboard, visual references, design, marketing

### Support URL

https://www.tack.design/contact

### Marketing URL

https://www.tack.design

### Category

Primary: Graphics & Design

## Privacy notes to verify before submission

Tack Browser appears to collect or process:

- Email address when users create or sign in to a Tack account.
- User ID / anonymous ID for account and usage limits.
- Selected image URLs and user-written prompts for generation.
- Generated images saved to the user's Tack account.
- Board names and saved board items.

Tack Browser does not appear to request camera, microphone, location, contacts, calendars, or photos-library access.

## Simple kid-clear checklist

1. Open Xcode.
2. Sign in with the Apple Developer account.
3. Add the Apple Distribution certificate.
4. Add the Mac Installer Distribution certificate.
5. Tell Codex when that is done.
6. Codex builds the App Store package.
7. Upload the package with Transporter.
8. Wait for Apple to process it.
9. Fill screenshots, privacy, age rating, pricing, and review notes.
10. Only when everything looks right, click Submit for Review.
