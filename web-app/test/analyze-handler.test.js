const test = require('node:test');
const assert = require('node:assert/strict');
const analyze = require('../api/analyze');

function responseRecorder() {
  const record = { headers: {}, statusCode: 200, body: undefined };
  return {
    record,
    response: {
      setHeader(name, value) { record.headers[name] = value; },
      status(code) { record.statusCode = code; return this; },
      json(body) { record.body = body; return this; },
      end() { return this; },
    },
  };
}

async function invoke(body) {
  const { record, response } = responseRecorder();
  await analyze({
    method: 'POST',
    body,
    headers: { origin: 'https://www.tack.design', 'x-forwarded-for': '203.0.113.4' },
    socket: {},
  }, response);
  return record;
}

test('generation API rejects malformed and oversized bodies before provider work', async () => {
  assert.equal((await invoke(null)).statusCode, 400);
  assert.equal((await invoke({ subject: 'x'.repeat(33 * 1024), imageUrls: ['https://example.com/a.jpg'] })).statusCode, 413);
});

test('generation API enforces prompt and reference-list bounds', async () => {
  const longPrompt = await invoke({ subject: 'x'.repeat(1001), imageUrls: ['https://example.com/a.jpg'] });
  assert.equal(longPrompt.statusCode, 400);
  assert.equal(longPrompt.body.error, 'Prompt is too long.');

  const tooManyReferences = await invoke({
    subject: 'A product photo',
    imageUrls: Array.from({ length: 13 }, (_, index) => `https://example.com/${index}.jpg`),
  });
  assert.equal(tooManyReferences.statusCode, 400);
  assert.equal(tooManyReferences.body.error, 'Invalid reference image list.');
});
