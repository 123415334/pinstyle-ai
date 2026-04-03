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
| `STRIPE_PRICE_ID_UNLIMITED` | Stripe Dashboard → Product catalog → Tack Unlimited |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → service_role |

After adding or changing env vars, redeploy: Vercel → Deployments → ⋯ → Redeploy.

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
