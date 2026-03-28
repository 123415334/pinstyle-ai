// api/create-checkout.js
// Creates a Stripe Checkout session and returns the hosted URL.
// POST /api/create-checkout  { email: "user@example.com" }

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

  const { email } = req.body || {};

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',

      // Pre-fill the email if passed from the extension
      ...(email ? { customer_email: email } : {}),

      line_items: [{
        // Set STRIPE_PRICE_ID in Vercel env vars after creating a product in Stripe
        price:    process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],

      // After payment: redirect back to the upgrade page with ?success=true
      success_url: 'https://pinstyle.co/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://pinstyle.co/upgrade',

      // Pass email in metadata so the webhook can find the Supabase user
      metadata: { email: email || '' },

      // Allow promo codes
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe create-checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
