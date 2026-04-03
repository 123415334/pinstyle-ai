const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

function resolveSafeReturnUrl(req, requestedUrl) {
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  if (!requestedUrl) return `${origin}/account`;

  try {
    const parsed = new URL(requestedUrl, origin);
    if (parsed.origin !== origin) return `${origin}/account`;
    return parsed.toString();
  } catch {
    return `${origin}/account`;
  }
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await validateSupabaseUser(req);
  if (!user?.email) return res.status(401).json({ error: 'Authentication required' });

  const { returnUrl } = req.body || {};
  const email = user.email;

  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];
    if (!customer) {
      return res.status(404).json({ error: 'No billing account found for this email yet.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: resolveSafeReturnUrl(req, returnUrl),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe create-portal-session error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
