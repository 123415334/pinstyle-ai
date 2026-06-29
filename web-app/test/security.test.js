const test = require('node:test');
const assert = require('node:assert/strict');
const {
  allowedOrigins,
  applyCors,
  configuredAppOrigin,
  isPrivateIp,
  readResponseBuffer,
  validatePublicHttpUrl,
} = require('../api/_security');

function responseHeaders() {
  const headers = new Map();
  return {
    headers,
    response: { setHeader: (name, value) => headers.set(name, value) },
  };
}

test('default production and Chrome extension origins are explicitly allowed', () => {
  const origins = allowedOrigins();
  assert.equal(origins.has('https://www.tack.design'), true);
  assert.equal(origins.has('chrome-extension://immnogdobhdocmmfceoeofjcmbohaobi'), true);
  assert.equal(origins.has('null'), true);
  assert.equal(origins.has('https://attacker.example'), false);
});

test('CORS reflects trusted origins and withholds access from unknown origins', () => {
  const trusted = responseHeaders();
  applyCors({ headers: { origin: 'https://www.tack.design' } }, trusted.response);
  assert.equal(trusted.headers.get('Access-Control-Allow-Origin'), 'https://www.tack.design');

  const unknown = responseHeaders();
  applyCors({ headers: { origin: 'https://attacker.example' } }, unknown.response);
  assert.equal(unknown.headers.has('Access-Control-Allow-Origin'), false);
});

test('billing redirects use the configured application origin', () => {
  const original = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://www.tack.design/some/path';
  assert.equal(configuredAppOrigin(), 'https://www.tack.design');
  if (original === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = original;
});

test('private and metadata IP ranges are rejected', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.2.4', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1']) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
});

test('remote response reads are capped without trusting Content-Length', async () => {
  const response = new Response(Buffer.alloc(12));
  await assert.rejects(readResponseBuffer(response, 8), /too large/);
});

test('image URL validation rejects dangerous protocols and local hosts', async () => {
  await assert.rejects(validatePublicHttpUrl('file:///etc/passwd'));
  await assert.rejects(validatePublicHttpUrl('http://localhost/image.png'));
  await assert.rejects(validatePublicHttpUrl('http://127.0.0.1/image.png'));
  await assert.rejects(validatePublicHttpUrl('http://169.254.169.254/latest/meta-data'));
});
