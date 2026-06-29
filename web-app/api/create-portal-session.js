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

function resolveSafeReturnUrl(req, requestedUrl) {
  const origin = configuredAppOrigin();
  if (!requestedUrl) return `${origin}/account`;

  try {
    const parsed = new URL(requestedUrl, origin);
    if (parsed.origin !== origin) return `${origin}/account`;
    return parsed.toString();
  } catch {
    return `${origin}/account`;
  }
}

async function getBillingCustomerId(user) {
  if (process.env.SUPABASE_SERVICE_KEY) {
    const profileResp = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_KEY,
        },
      },
    );
    if (profileResp.ok) {
      const rows = await profileResp.json();
      if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id;
    }
  }

  const customers = await stripe.customers.list({ email: user.email, limit: 1 });
  return customers.data[0]?.id || null;
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await validateSupabaseUser(req);
  if (!user?.email) return res.status(401).json({ error: 'Authentication required' });

  const { returnUrl } = req.body || {};
  try {
    const customerId = await getBillingCustomerId(user);
    if (!customerId) {
      return res.status(404).json({ error: 'No billing account found for this email yet.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: resolveSafeReturnUrl(req, returnUrl),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe create-portal-session error:', err.message);
    return res.status(500).json({ error: 'Could not open billing management. Please try again.' });
  }
};
