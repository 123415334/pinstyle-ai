// api/create-checkout.js
// Creates a Stripe Checkout session for either Pro or Unlimited plan.
// POST /api/create-checkout  { email: "user@example.com", plan: "pro" | "unlimited" }

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { email, plan = 'pro' } = req.body || {};

  // Route to the correct Stripe price ID based on plan
  const priceId = plan === 'unlimited'
    ? process.env.STRIPE_PRICE_ID_UNLIMITED
    : process.env.STRIPE_PRICE_ID_PRO;

  if (!priceId) {
    console.error(`Missing Stripe price ID for plan: ${plan}`);
    return res.status(500).json({ error: `Stripe price not configured for plan: ${plan}` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      // Pre-fill the email if passed from the extension
      ...(email ? { customer_email: email } : {}),

      line_items: [{ price: priceId, quantity: 1 }],

      // After payment: redirect back to the upgrade page with success state
      success_url: `https://pinstyle.co/upgrade?success=true&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  'https://pinstyle.co/upgrade',

      // Pass email + plan in metadata so the webhook can upgrade the right user
      metadata: { email: email || '', plan },

      // Allow promo codes
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe create-checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
