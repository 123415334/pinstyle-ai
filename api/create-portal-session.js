const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, returnUrl } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) {
      return res.status(404).json({ error: 'No billing account found for this email yet.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: returnUrl || `https://${req.headers.host}/account`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe create-portal-session error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
