# Tack — Vercel Deployment Guide

## What's in this folder

- `index.html` — the marketing site frontend
- `upgrade.html` — plans & pricing / billing page
- `api/analyze.js` — server-side function that calls Claude + Replicate
- `api/create-checkout.js` — Stripe Checkout session creation
- `api/create-portal-session.js` — Stripe Customer Portal session
- `api/stripe-webhook.js` — Stripe webhook handler (updates Supabase on payment events)
- `vercel.json` — tells Vercel how to run everything
- `README.md` — this guide

---

## How to deploy

### Step 1 — Push to GitHub
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

After adding or changing env vars, redeploy: Vercel → Deployments → ⋯ → Redeploy.

## Required database migrations

Apply the SQL migrations in numerical order before deploying API code that depends on them. In particular, v6 installs atomic generation reservations and anonymous abuse protection, v7 stores stable Stripe customer IDs, and v8 hardens ownership policies and privileged functions.

Never deploy the matching `api/analyze.js` changes before migration v6 has succeeded. The API intentionally fails closed when the generation guard is unavailable.

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
