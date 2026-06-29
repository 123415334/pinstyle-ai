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
- The Mac App Distribution and Mac Installer Distribution certificates exist.
- A dedicated signing keychain exists at `~/Library/Keychains/tack-appstore.keychain-db`.
- A signed Mac App Store package has been built and verified at `dist-mas/Tack-Browser-0.1.1-mas.pkg`.
- The app bundle metadata has been cleaned for review:
  - App icon points at `tack.icns`.
  - Category is `Graphics & Design`.
  - Unused camera, microphone, Bluetooth, and audio privacy strings are removed.
  - App Transport Security is limited to web content instead of blanket arbitrary loads.
- The Mac App Store build uses a minimal sandbox entitlement set:
  - App Sandbox
  - Network Client
  - Tack application group

## Build the App Store package

Use the dedicated Tack signing keychain:

```sh
cd extension/tack-browser-app
SIGNING_KEYCHAIN="$HOME/Library/Keychains/tack-appstore.keychain-db" \
SIGNING_KEYCHAIN_PASSWORD_FILE="/tmp/tack-signing/keychain-password.txt" \
npm run dist:mas
```

The App Store package will be created at:

```sh
dist-mas/Tack-Browser-0.1.1-mas.pkg
```

Upload that package with Apple's Transporter app, or with `xcrun altool`.

Do not click Submit for Review in App Store Connect until the listing, screenshots, privacy answers, and final QA are complete.

## Local Finder app

For a local Finder-launchable build, use the public-download wrapper rather than the raw package command:

```sh
cd extension/tack-browser-app
npm run dist:mac
```

The raw `npm run package:mac` command creates a development bundle in `out/`; it does not do the final metadata/signing/package steps by itself.

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

## App Review notes to prepare

- Provide a demo account that can sign in without Google-only authentication.
- Explain that the app is a visual reference browser for selecting web images and generating new product imagery.
- Mention that selected references and prompts are sent to Tack's generation backend.
- Mention that the app intentionally avoids copying identifiable people from references; references are used for direction, composition, material, color, and style.
- Include any paid-plan behavior Apple should know during review, especially usage limits and whether the demo account has enough generation credits.

## Final production QA pass

Run this on the installed app before submitting:

1. Quit all old Tack Browser instances.
2. Open `~/Applications/Tack Browser.app` from Finder or Spotlight.
3. Sign in with the App Review demo account.
4. Browse Pinterest, Behance, and the Product site tab.
5. Select references, generate a square image, and confirm it appears in Library.
6. Create a board, save a generation to it, and reopen the board.
7. Collapse and expand the sidebar and bookmarks bar in Browse and Library.
8. Sleep/wake or close/reopen the Mac, then confirm Library generations reload.
9. Open Account and confirm plan, usage, sync, avatar, and tile typography.
10. Confirm the extension account state still matches the app account state.

## Simple kid-clear checklist

1. Codex builds the app package.
2. Upload the package to App Store Connect.
3. Wait for Apple to process it.
4. Add the app screenshots.
5. Fill in privacy, age rating, price, and review notes.
6. Check that every field looks right.
7. Test the app one more time.
8. Only when everything looks right, click Submit for Review.
