// api/create-checkout.js
// Creates a Stripe Checkout session for either Pro or Studio plan.
// POST /api/create-checkout  { plan: "pro" | "studio" }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { applyCors, configuredAppOrigin } = require('./_security');

async function validateSupabaseUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;

  try {
    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function getStoredCustomerId(userId) {
  if (!process.env.SUPABASE_SERVICE_KEY) return null;
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_KEY,
      },
    },
  );
  if (!resp.ok) throw new Error(`Could not read billing profile (${resp.status})`);
  const rows = await resp.json();
  return rows[0]?.stripe_customer_id || null;
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const requestedPlan = (req.body?.plan || 'pro').toLowerCase();
  const plan = requestedPlan === 'unlimited' ? 'studio' : requestedPlan;
  if (!['pro', 'studio'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  const origin = configuredAppOrigin();
  const user = await validateSupabaseUser(req);
  if (!user?.email) return res.status(401).json({ error: 'Authentication required' });
  const email = user.email;

  // Route to the correct Stripe price ID based on plan
  const priceId = plan === 'studio'
    ? (process.env.STRIPE_PRICE_ID_STUDIO || process.env.STRIPE_PRICE_ID_UNLIMITED)
    : process.env.STRIPE_PRICE_ID_PRO;

  if (!priceId) {
    console.error(`Missing Stripe price ID for plan: ${plan}`);
    return res.status(500).json({ error: `Stripe price not configured for plan: ${plan}` });
  }

  try {
    let customerId = await getStoredCustomerId(user.id);
    if (!customerId && email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      }
    }

    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
      const existingSubscription = subscriptions.data.find(subscription =>
        ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(subscription.status)
      );
      if (existingSubscription) {
        return res.status(409).json({
          error: 'You already have a subscription. Use Manage billing to change plans.',
          code: 'subscription_exists',
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // If a promotion code makes today's total $0, let Stripe skip card entry.
      payment_method_collection: 'if_required',

      // Pre-fill the email if passed from the extension
      ...(customerId ? { customer: customerId } : {}),
      ...(!customerId && email ? { customer_email: email } : {}),

      line_items: [{ price: priceId, quantity: 1 }],

      // After payment: redirect back to the upgrade page with success state
      success_url: `${origin}/upgrade?success=true&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/upgrade?canceled=true&plan=${plan}`,

      // Pass email + plan in metadata so the webhook can upgrade the right user
      metadata: { email: email || '', plan },
      subscription_data: {
        metadata: { email: email || '', plan },
      },

      // Allow promo codes
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe create-checkout error:', err.message);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
};
