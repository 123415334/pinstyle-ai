# Tack Browser Release Checklist

This app can produce downloadable Mac builds today, but public downloads should stay hidden until the official Mac App Store listing is ready. The current local build produces:

- `dist/Tack-Browser-<version>-mac-arm64.zip`
- `dist/Tack-Browser-<version>-mac-arm64.dmg`
- `dist/SHA256SUMS.txt`

## Local Release Build

```sh
cd browser-products/extension/tack-browser-app
npm ci
npm run dist:mac
```

By default the script uses the best local signing identity it can find: `Developer ID Application` first, `Apple Development` second, then ad-hoc signing as a fallback. Apple Development and ad-hoc builds are useful for internal testing and GitHub artifacts, but Gatekeeper will still reject them for normal public installs until they are Developer ID signed and notarized.

If a Developer ID Application certificate is installed, force that public signing identity like this:

```sh
CODESIGN_IDENTITY="Developer ID Application: Your Company (TEAMID)" npm run dist:mac
```

## Mac App Store Release

Use this as the public path when Tack Browser is ready for customers:

1. Create the macOS app listing in App Store Connect.
2. Create Apple Distribution and Mac Installer Distribution certificates in Xcode.
3. Build the Mac App Store package:

```sh
cd browser-products/extension/tack-browser-app
npm run dist:mas
```

4. Upload `dist-mas/Tack-Browser-<version>-mas.pkg` with Transporter, Xcode, or `xcrun altool`.
5. Attach the processed build to the App Store Connect version and submit for review when ready.
6. Wait for Apple approval.
7. Copy the App Store URL from App Store Connect.
8. Update `download.html` so its main button links to that App Store URL.
9. Add the homepage "Mac app" link back only after the App Store URL works.

See `APP_STORE_SUBMISSION.md` for the listing draft, privacy notes, and the simple owner checklist.

## App Store Connect Upload Notes

Apple's Mac App Store path is separate from the direct-download DMG/ZIP path:

- Direct-download builds use `npm run dist:mac`, Developer ID signing, and notarization.
- Mac App Store builds use `npm run dist:mas`, the MAS Electron build, App Sandbox entitlements, Apple Distribution signing, and a signed installer package.

The App Store package script intentionally stops if the required Apple certificates are missing, so it is safe to run before the machine is fully configured.

## GitHub Release

GitHub Releases are useful for private/internal testing, but they should not be the customer-facing Mac download page.

1. Commit and push the app source.
2. If your GitHub token has the `workflow` scope, copy `RELEASE_WORKFLOW_TEMPLATE.yml` to `.github/workflows/release-mac.yml` from the repository root and commit it. Without that scope, GitHub rejects workflow changes over HTTPS.
3. Create and push a tag:

```sh
git tag tack-browser-v0.1.1
git push origin tack-browser-v0.1.1
```

4. If the workflow is installed, GitHub Actions will build the Mac ZIP and DMG and create a draft release.
5. Keep the release as a draft unless you explicitly want a public direct-download build.

## Apple Production Distribution

For the smoothest public download experience, the app still needs Apple Developer ID signing and notarization. Without it, users can still download the ZIP/DMG, but macOS Gatekeeper will warn or block normal opening.

Required Apple-side items:

- Apple Developer Program membership.
- `Developer ID Application` certificate installed in Keychain.
- App-specific password or App Store Connect API key for notarization.

Once those are available, notarize the DMG/ZIP before publishing the GitHub release.
