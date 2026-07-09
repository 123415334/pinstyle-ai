# Tack

Production repository for the Tack website, browser extension, and macOS/Windows desktop application.

Agency and contributor onboarding starts with [`AGENCY_HANDOFF.md`](AGENCY_HANDOFF.md).

## Repository map

- `web-app/` — Vercel deployment root: website, API, tests, dependencies, and public assets
- `browser-products/extension/` — Chrome and Edge extension source
- `browser-products/extension/tack-browser-app/` — Electron desktop app for macOS and Windows
- `documentation/` — architecture, release context, and agency onboarding
- `release-assets/` — organized browser and desktop store-submission media
- `marketing/` — reusable marketing source material
- `_hold/` — local-only preserved material pending review; never production source

The repository root intentionally contains folders only. In Vercel, set **Root Directory** to `web-app`.

## Local development

```bash
cd web-app && npm ci && npm test

cd ../browser-products/extension/tack-browser-app
npm ci
npm test
```

---

## How to deploy

### Standard commands

Run these from `web-app/`:

```sh
npm run env:pull:prod
npm run db:migrate:v10
npm run deploy:prod
```

The Vercel project is `tack`. The local `web-app/.vercel/` directory is created by `npm run env:pull:prod` or `vercel link --yes --project tack` and is intentionally gitignored.

For Supabase migrations, `npm run db:query -- path/to/file.sql` uses `SUPABASE_DB_URL` when present. Otherwise it uses the Supabase CLI against the linked project derived from `SUPABASE_URL`. One-time setup is either:

```sh
npx --yes supabase@2.109.1 login
```

or putting `SUPABASE_ACCESS_TOKEN` in `web-app/.env.local`. Local env files are gitignored.

If this Mac's certificate chain prevents Vercel CLI access, prefer setting `NODE_EXTRA_CA_CERTS`. As a temporary local workaround only:

```sh
ALLOW_INSECURE_VERCEL_TLS=1 npm run env:pull:prod
ALLOW_INSECURE_VERCEL_TLS=1 npm run deploy:prod
```

### GitHub auto-deploy
The project is connected to GitHub. Push changes and Vercel auto-deploys.

### Step 2 — Environment Variables
In Vercel → your project → Settings → Environment Variables, ensure these are set:

| Name | Where to find it |
|------|-----------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com/keys |
| `OPENAI_API_KEY` | platform.openai.com/api-keys |
| `REPLICATE_API_KEY` | replicate.com/account/api-tokens |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks |
| `STRIPE_PRICE_ID_PRO` | Stripe Dashboard → Product catalog → Tack Pro |
| `STRIPE_PRICE_ID_STUDIO` | Stripe Dashboard → Product catalog → Tack Studio |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → service_role |
| `APP_ORIGIN` | Canonical production origin, normally `https://www.tack.design` |
| `ALLOWED_ORIGINS` | Comma-separated additional trusted origins, including the production Edge extension origin after assignment |
| `RATE_LIMIT_SECRET` | A random 32+ byte secret used to pseudonymize anonymous rate-limit keys |
| `ADMIN_EMAILS` | Comma-separated Supabase account emails allowed to open `/digital-home` |
| `ADMIN_TEST_EMAILS` | Optional comma-separated test-account emails excluded from Digital Home analytics |
| `ADMIN_TEST_ANONYMOUS_IDS` | Optional comma-separated browser IDs excluded from Digital Home analytics |

After adding or changing env vars, redeploy: Vercel → Deployments → ⋯ → Redeploy.

## Required database migrations

Apply the SQL migrations in numerical order before deploying API code that depends on them. In particular, v6 installs atomic generation reservations and anonymous abuse protection, v7 stores stable Stripe customer IDs, and v8 hardens ownership policies and privileged functions.

Never deploy matching `web-app/api/analyze.js` changes before migration v6 has succeeded. The API intentionally fails closed when the generation guard is unavailable.

Migration v9 adds the private Chrome Web Store metric-import table used by `/digital-home`. The page itself is protected by Supabase authentication plus the server-side `ADMIN_EMAILS` allowlist; its privileged data never comes directly from the browser.

Migration v10 updates the anonymous generation guard from 1 signed-out generation per month to 3. Apply it before or alongside the matching client/API deployment so the server-side quota matches the extension copy.

---

## Stripe webhook
The webhook endpoint is: `https://www.tack.design/api/stripe-webhook`

Listens for:
- `checkout.session.completed` — upgrades user plan in Supabase after payment
- `customer.subscription.created` — syncs new subscription to Supabase
- `customer.subscription.updated` — syncs plan changes (including portal switches)
- `customer.subscription.deleted` — downgrades user to free on cancellation

---

## Live URL
`https://www.tack.design`
