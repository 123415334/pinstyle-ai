# Tack for Microsoft Edge

Tack uses one Manifest V3 Chromium codebase for Chrome and Microsoft Edge. This prevents browser-specific feature drift while giving Edge users a first-party Microsoft Edge Add-ons listing.

## Build the store package

From `extension/`:

```sh
bash scripts/package-extension.sh edge
```

The validated upload package is written to `dist-extensions/tack-edge-<version>.zip`.

## Required pre-submission checks

Test the unpacked `dist-extensions/edge/` directory in the current stable Microsoft Edge on Windows 11:

1. Clicking the Tack toolbar icon opens the side panel.
2. Email/password and Google authentication complete successfully.
3. Scanning and selecting work on Pinterest, Instagram, Behance, Dribbble, and a normal ecommerce page.
4. Protected Edge pages fail with the existing helpful message rather than an uncaught error.
5. Generation, limits, downloads, account sync, Library, and boards match Chrome behavior.
6. Closing and reopening Edge preserves the signed-in session and workspace.

Google authentication has one store-specific prerequisite: after Partner Center assigns the production Edge extension ID, add the exact URL returned by `chrome.identity.getRedirectURL('supabase-google')` to the Supabase Auth redirect allowlist. Repeat this check whenever the store identity or authentication project changes. An unpacked development extension can have a different ID from the store build.

Submit the ZIP through Microsoft Partner Center to Microsoft Edge Add-ons. Use the same privacy disclosures and permission explanations as Chrome, adjusted only for the Edge store wording.
