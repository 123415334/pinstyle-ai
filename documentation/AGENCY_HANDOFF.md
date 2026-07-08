# Tack Agency Handoff

## Product surfaces

- `web-app/`: Vercel deployment root containing the production website, serverless API, migrations, assets, and backend tests.
- `browser-products/extension/`: Chrome and Edge extension source.
- `browser-products/extension/tack-browser-app/`: Electron desktop application for macOS and Windows.
- `documentation/`: product architecture, release notes, and historical design context.
- `.github/workflows/`: continuous integration and Windows validation.

## Start here

1. Read `documentation/PROJECT_OVERVIEW.md` for architecture, setup, and deployment.
2. Run `npm ci && npm test` in `web-app/`.
3. Run `npm ci && npm test` in `browser-products/extension/tack-browser-app/`.
4. Review `browser-products/extension/EDGE_RELEASE.md` and the desktop release guides before publishing.
5. Treat production credentials as dashboard-managed secrets; never add them to this repository.

## Supporting assets

- `web-app/branding/`: approved Tack identity assets used by the live site.
- `web-app/images/`: live website imagery.
- `web-app/web_logos/`: website integration/service logos.
- `release-assets/store-screenshots/`: store-submission screenshots and working exports.
- `marketing/email-templates/`: reusable marketing email source.
- `documentation/brand-explorations/`: historical design explorations retained for context.

## Local-only material

`_hold/` contains preserved material that is not part of the product source. It is intentionally ignored by Git. Review it before permanent deletion; do not use its files as production inputs unless they are deliberately restored and documented.

Generated dependencies and packages (`node_modules/`, `.npm-cache/`, `out*/`, `dist*/`, ZIP, DMG, PKG, and installer files) are reproducible and intentionally ignored by Git.

## Naming standard

The product name is **Tack**. Use `tack` for package and file identifiers and `Tack` in customer-facing text. “Pinstyle” is a retired name and must not be introduced in source, documentation, metadata, or repository URLs.
