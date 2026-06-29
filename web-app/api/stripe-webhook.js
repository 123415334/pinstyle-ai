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
const { isEntitledSubscriptionStatus, planFromPriceId } = require('./_billing');

// Tell Vercel NOT to parse the body — Stripe needs the raw bytes for signature verification
module.exports.config = { api: { bodyParser: false } };

// Read the raw request body as a Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > 1024 * 1024) {
        tooLarge = true;
        reject(new Error('Webhook body is too large'));
        req.pause();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Update the user's plan in Supabase ('pro' or 'studio')
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
async function storeBillingIds(email, subscriptionId, customerId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      stripe_subscription_id: subscriptionId,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    }),
  });
  if (!resp.ok) throw new Error(`Could not store Stripe billing identifiers (${resp.status})`);
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

async function downgradeToFreeByEmail(email) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}`;
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
    return res.status(400).json({ error: 'Invalid webhook signature' });
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
        if (!session.subscription) throw new Error('Completed subscription checkout has no subscription ID');
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const plan = planFromPriceId(priceId);
        if (!plan) throw new Error(`Unknown Stripe price on subscription ${subscription.id}`);
        await upgradePlan(email, plan);
        await storeBillingIds(email, subscription.id, session.customer || subscription.customer);
        console.log(`Upgraded to ${plan}: ${email}`);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object;
        const priceId = sub.items?.data?.[0]?.price?.id;

        // Try metadata first, then fall back to looking up the Stripe customer
        let email = sub.metadata?.email || null;
        if (!email && sub.customer) {
          const customer = await stripe.customers.retrieve(sub.customer);
          email = customer?.email || null;
        }
        if (!email) {
          console.warn(`subscription.updated: no email for sub ${sub.id}, skipping`);
          break;
        }

        if (isEntitledSubscriptionStatus(sub.status)) {
          const plan = planFromPriceId(priceId);
          if (!plan) throw new Error(`Unknown Stripe price on subscription ${sub.id}`);
          await upgradePlan(email, plan);
          await storeBillingIds(email, sub.id, sub.customer);
          console.log(`Synced subscription ${sub.id} (${sub.status}) → ${plan} for ${email}`);
        } else {
          await downgradeToFreeByEmail(email);
          console.log(`Downgraded to free from subscription ${sub.id} (${sub.status}) for ${email}`);
        }
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
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  return res.status(200).json({ received: true });
};
