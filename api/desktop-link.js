const INSTALL_URL = 'https://tack.design/chrome';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function saveLead({ email, source, path, referrer, userAgent }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return false;
  }

  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/desktop_install_leads?on_conflict=email`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      email,
      source: source || 'homepage_mobile',
      path: path || '/',
      referrer: referrer || '',
      user_agent: userAgent || '',
      install_url: INSTALL_URL,
      updated_at: new Date().toISOString()
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || 'Could not save install lead.');
  }

  return true;
}

async function sendInstallEmail(email) {
  if (!process.env.RESEND_API_KEY) return false;

  const from = process.env.DESKTOP_LINK_FROM_EMAIL || 'tack <hello@tack.design>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Install tack on desktop Chrome',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#15120f;line-height:1.55;padding:28px;">
          <h1 style="font-size:24px;line-height:1.15;margin:0 0 12px;">Install tack when you are back at your computer</h1>
          <p style="margin:0 0 22px;color:#5f574d;">Tack is a Chrome extension, so it installs from desktop Chrome.</p>
          <p style="margin:0 0 28px;">
            <a href="${INSTALL_URL}" style="display:inline-block;background:#013FF4;color:#fff;text-decoration:none;border-radius:999px;padding:13px 22px;font-weight:600;">Install for Chrome</a>
          </p>
          <p style="margin:0;color:#8a8070;font-size:13px;">If the button does not open, paste this into desktop Chrome:<br>${INSTALL_URL}</p>
        </div>
      `,
      text: `Install tack on desktop Chrome: ${INSTALL_URL}`
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || 'Could not send install email.');
  }

  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return json(res, 400, { error: 'Invalid JSON body.' });
    }
  }
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) {
    return json(res, 400, { error: 'Enter a valid email address.' });
  }

  const lead = {
    email,
    source: String(body.source || '').slice(0, 80),
    path: String(body.path || '').slice(0, 160),
    referrer: String(body.referrer || '').slice(0, 500),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500)
  };

  try {
    const saved = await saveLead(lead);
    const emailed = await sendInstallEmail(email);
    if (!saved && !emailed) {
      throw new Error('Desktop link capture is not configured.');
    }
    return json(res, 200, { ok: true, saved, emailed });
  } catch (err) {
    console.error('desktop-link error', err);
    return json(res, 500, { error: 'Could not save your email. Try again in a moment.' });
  }
};
