# PinStyle AI — Vercel Deployment Guide

## What's in this folder

- `index.html` — the clean frontend (no API keys visible to users)
- `api/analyze.js` — the server-side function that calls Claude + OpenAI
- `vercel.json` — tells Vercel how to run everything
- `README.md` — this guide

---

## How to deploy (10 minutes, no coding)

### Step 1 — Create a free Vercel account
Go to vercel.com and sign up with your GitHub, Google, or email.

### Step 2 — Upload your project
1. On your Vercel dashboard, click **"Add New Project"**
2. Click **"Upload"** (you don't need GitHub)
3. Drag and drop the entire `pinstyle-ai` folder onto the upload area
4. Click **Deploy**

Vercel will build and deploy automatically. You'll get a live URL like:
`https://pinstyle-ai.vercel.app`

### Step 3 — Add your API keys (secret, server-side)
This is the important step. Your keys live on Vercel's servers — users never see them.

1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add these two variables:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | your key from console.anthropic.com/keys |
| `OPENAI_API_KEY` | your key from platform.openai.com/api-keys |

3. Click **Save** for each one
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

### Step 4 — Test it
Open your live URL. Paste a Pinterest board URL, describe what you want, click generate.
Images will generate and display directly in the app — no CORS errors, no key fields.

---

## Your live URL
Once deployed, your site URL is shareable with anyone. This is your product.
You can connect a custom domain (like pinstyleai.com) in Vercel → Settings → Domains.

---

## Costs to run
- Vercel hosting: **Free** (hobby tier covers this easily)
- Anthropic (Claude): ~$0.003 per analysis
- OpenAI (DALL-E): ~$0.04 per image, $0.08 for two images
- Total per user run: **~$0.08–0.10**

At $29/month per customer, your margin is extremely healthy.
