# Tack Browser for Windows

The Windows app shares the same renderer, API, authentication, Library, boards, and generation code as macOS. Platform-specific code is limited to native window chrome, platform labeling, icons, and packaging.

## Supported first release

- Windows 11 on x64 hardware.
- A per-user NSIS installer with Start menu and optional desktop shortcuts.
- Native Windows title bar and window controls.
- Windows Credential Protection through Electron `safeStorage` when available.

Windows ARM64 should be added only after the x64 installer passes production QA on physical Windows hardware.

## Internal cross-build from macOS

```sh
cd browser-products/extension/tack-browser-app
npm ci --cache .npm-cache
npm test
npm run package:win
```

This creates `out-win/Tack Browser-win32-x64/`. It proves that the Windows executable and resources can be assembled, but it is not a substitute for running the application on Windows.

## Windows installer build

Run on a clean Windows 11 x64 machine or Windows CI runner:

```powershell
npm ci
npm test
npm run dist:win
```

The installer is written to `dist-windows/`.

For public distribution, configure Authenticode signing through electron-builder using `CSC_LINK` and `CSC_KEY_PASSWORD`, or use Azure Trusted Signing. Never publish an unsigned installer: Windows SmartScreen will identify it as an unknown publisher.

For a deliberately unsigned internal installer, set `TACK_ALLOW_UNSIGNED_WINDOWS=1`. The release script otherwise refuses to produce an unsigned installer.

## Release gate

Before publishing, verify all of the following on physical Windows 11 hardware at 100%, 125%, and 150% display scaling:

1. Install, upgrade over the previous version, launch from Start, and uninstall.
2. Resize, maximize, minimize, restore, and use multiple monitors.
3. Sign in with email/password and Google; close and reopen the app.
4. Sign in to Pinterest inside Tack and confirm that the session is shared with browsing popups.
5. Select direct images and CSS background images on all supported reference sites.
6. Capture a region and confirm pixel alignment under every display scale.
7. Generate each aspect ratio, download every result, and open its containing folder.
8. Confirm usage limits, subscription state, synced Library, boards, rename, delete, and sign-out.
9. Disconnect the network during authentication and generation and verify recoverable error states.
10. Confirm that macOS still passes its existing release checklist from the same commit.
