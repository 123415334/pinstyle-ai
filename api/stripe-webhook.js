// api/stripe-webhook.js
// Listens for Stripe events and upgrades users to Pro in Supabase.
// Vercel endpoint: POST /api/stripe-webhook
//
// Required env vars:
//   STRIPE_SECRET_KEY      — your Stripe secret key
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret
//   SUPABASE_URL           — https://your-ref.supabase.co
//   SUPABASE_SERVICE_KEY   — service role key (bypasses RLS)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Tell Vercel NOT to parse the body — Stripe needs the raw bytes for signature verification
export const config = { api: { bodyParser: false } };

// Read the raw request body as a Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Update the user's plan in Supabase ('pro' or 'unlimited')
async function upgradePlan(email, plan) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ plan }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase PATCH failed (${resp.status}): ${text}`);
  }
}

// Store the Stripe subscription ID on the profile for future cancellation handling
async function storeSubscriptionId(email, subscriptionId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ stripe_subscription_id: subscriptionId }),
  });
}

// Downgrade to free (called on subscription cancellation)
async function downgradeToFree(subscriptionId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/user_profiles?stripe_subscription_id=eq.${subscriptionId}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ plan: 'free' }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase PATCH failed (${resp.status}): ${text}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Read raw body and verify Stripe signature
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Failed to read body:', err);
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // 2. Handle events
  try {
    switch (event.type) {

      // Payment succeeded → upgrade user to correct plan
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Prefer customer_details.email, fall back to metadata
        const email = session.customer_details?.email || session.metadata?.email;
        if (!email) {
          console.warn('checkout.session.completed: no email found, skipping upgrade');
          break;
        }
        // Determine plan from metadata (set by create-checkout.js)
        const plan = session.metadata?.plan === 'unlimited' ? 'unlimited' : 'pro';
        await upgradePlan(email, plan);
        if (session.subscription) {
          await storeSubscriptionId(email, session.subscription);
        }
        console.log(`Upgraded to ${plan}: ${email}`);
        break;
      }

      // Subscription cancelled / lapsed → downgrade user
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await downgradeToFree(sub.id);
        console.log(`Downgraded to Free: subscription ${sub.id}`);
        break;
      }

      default:
        // Ignore other events
        break;
    }
  } catch (err) {
    console.error(`Error handling event ${event.type}:`, err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};
