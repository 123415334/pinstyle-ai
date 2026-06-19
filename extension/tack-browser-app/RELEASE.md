# Tack Browser Release Checklist

This app can be distributed today as a downloadable Mac build from GitHub Releases. The current local build produces:

- `dist/Tack-Browser-<version>-mac-arm64.zip`
- `dist/Tack-Browser-<version>-mac-arm64.dmg`
- `dist/SHA256SUMS.txt`

## Local Release Build

```sh
cd extension/tack-browser-app
npm ci
npm run dist:mac
```

By default the script uses the best local signing identity it can find: `Developer ID Application` first, `Apple Development` second, then ad-hoc signing as a fallback. Apple Development and ad-hoc builds are useful for internal testing and GitHub artifacts, but Gatekeeper will still reject them for normal public installs until they are Developer ID signed and notarized.

If a Developer ID Application certificate is installed, force that public signing identity like this:

```sh
CODESIGN_IDENTITY="Developer ID Application: Your Company (TEAMID)" npm run dist:mac
```

## GitHub Release

1. Commit and push the app source.
2. If your GitHub token has the `workflow` scope, copy `RELEASE_WORKFLOW_TEMPLATE.yml` to `.github/workflows/release-mac.yml` from the repository root and commit it. Without that scope, GitHub rejects workflow changes over HTTPS.
3. Create and push a tag:

```sh
git tag tack-browser-v0.1.1
git push origin tack-browser-v0.1.1
```

4. If the workflow is installed, GitHub Actions will build the Mac ZIP and DMG and create a draft release.
5. Review the draft release, attach notarized artifacts if available, then publish it.

## Apple Production Distribution

For the smoothest public download experience, the app still needs Apple Developer ID signing and notarization. Without it, users can still download the ZIP/DMG, but macOS Gatekeeper will warn or block normal opening.

Required Apple-side items:

- Apple Developer Program membership.
- `Developer ID Application` certificate installed in Keychain.
- App-specific password or App Store Connect API key for notarization.

Once those are available, notarize the DMG/ZIP before publishing the GitHub release.
