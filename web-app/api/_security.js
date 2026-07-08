const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const net = require('node:net');

const DEFAULT_APP_ORIGIN = 'https://www.tack.design';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://tack.design',
  'https://www.tack.design',
  'chrome-extension://immnogdobhdocmmfceoeofjcmbohaobi',
  // Electron's packaged file:// renderer serializes its Origin header as null.
  // Anonymous generation remains protected by the server-side reservation limit.
  'null',
];

function configuredAppOrigin() {
  try {
    return new URL(process.env.APP_ORIGIN || DEFAULT_APP_ORIGIN).origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

function allowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function hashRateLimitKey(req, anonymousId = '') {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error('Rate limiting is not configured');
  const identity = `${getClientIp(req)}:${String(anonymousId).slice(0, 120)}`;
  return crypto.createHmac('sha256', secret).update(identity).digest('hex');
}

function isPrivateIp(address) {
  if (!net.isIP(address)) return true;
  if (address === '::' || address === '::1' || address === '0.0.0.0') return true;

  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10
      || a === 127
      || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0)
      || a >= 224;
  }

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:') && normalized.slice(7).includes('.')) {
    return isPrivateIp(normalized.slice(7));
  }
  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
    || normalized.startsWith('::ffff:169.254.')
    || normalized.startsWith('2001:db8:')
    || normalized.startsWith('2001:10:')
    || normalized.startsWith('2001:20:')
    || normalized.startsWith('2002:');
}

async function validatePublicHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid image URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported image URL protocol');
  if (parsed.username || parsed.password) throw new Error('Image URLs cannot contain credentials');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private image hosts are not allowed');
  }

  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Private image hosts are not allowed');
  }
  return parsed;
}

async function fetchPublicUrl(value, options = {}, maxRedirects = 3) {
  let parsed = await validatePublicHttpUrl(value);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(parsed, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) throw new Error('Too many image redirects');
    parsed = await validatePublicHttpUrl(new URL(location, parsed).toString());
  }
  throw new Error('Too many image redirects');
}

async function readResponseBuffer(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('Remote image is too large');
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error('Remote image is too large');
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Remote image is too large');
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (size > maxBytes) await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks, size);
}

function safeErrorMessage(status) {
  if (status >= 500) return 'Something went wrong. Please try again.';
  return 'The request could not be completed.';
}

module.exports = {
  allowedOrigins,
  applyCors,
  configuredAppOrigin,
  fetchPublicUrl,
  getClientIp,
  hashRateLimitKey,
  isPrivateIp,
  readResponseBuffer,
  safeErrorMessage,
  validatePublicHttpUrl,
};
