const { applyCors } = require('./_security');

const ALLOWED_EVENTS = new Set([
  'extension_opened',
  'images_scanned',
  'image_selected',
  'prompt_entered',
  'generate_clicked',
  'generate_succeeded',
  'generate_failed',
  'anon_limit_reached',
  'auth_modal_opened',
  'signup_started',
  'signup_completed',
  'login_completed',
  'upgrade_flow_opened',
  'billing_manage_opened',
  'google_auth_success',
  'google_auth_failed',
  'history_style_restored',
  'site_page_view',
  'site_primary_cta_clicked',
  'site_store_link_clicked',
]);

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

function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function pageDomain(pageUrl) {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, '').slice(0, 120);
  } catch {
    return null;
  }
}

async function insertEvent(event) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/analytics_events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(event),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase analytics insert failed (${resp.status}): ${text}`);
  }
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Analytics not configured' });
  }

  const body = req.body || {};
  const eventName = cleanText(body.event_name || body.name, 80);
  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Invalid event name' });
  }

  const user = await validateSupabaseUser(req);
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 4096) {
    return res.status(400).json({ error: 'Analytics metadata is too large' });
  }

  try {
    await insertEvent({
      anonymous_id: cleanText(body.anonymous_id, 120),
      user_id: user?.id || null,
      event_name: eventName,
      plan: cleanText(body.plan, 40),
      page_domain: pageDomain(body.page_url),
      selected_image_count: cleanInt(body.selected_image_count),
      output_count: cleanInt(body.output_count),
      anon_count: cleanInt(body.anon_count),
      error_code: cleanText(body.error_code, 120),
      metadata,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[tack] track-event failed:', err.message);
    return res.status(500).json({ error: 'Could not record event' });
  }
};
