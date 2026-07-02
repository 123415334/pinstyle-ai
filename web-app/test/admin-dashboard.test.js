const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../api/admin-dashboard');

test('Digital Home excludes admin-linked anonymous activity and preserves authentic funnels', () => {
  const profiles = [
    { id: 'owner', email: 'owner@example.com', plan: 'pro', created_at: '2026-06-01T00:00:00Z' },
    { id: 'real', email: 'real@example.com', plan: 'free', created_at: '2026-06-02T00:00:00Z' },
  ];
  const events = [
    { id: '1', created_at: '2026-06-03T00:00:00Z', anonymous_id: 'owner-browser', user_id: 'owner', event_name: 'extension_opened', page_domain: 'pinterest.com' },
    { id: '2', created_at: '2026-06-03T00:01:00Z', anonymous_id: 'owner-browser', user_id: null, event_name: 'generate_succeeded', page_domain: 'pinterest.com' },
    { id: '3', created_at: '2026-06-04T00:00:00Z', anonymous_id: 'real-browser', user_id: null, event_name: 'extension_opened', page_domain: 'behance.net' },
    { id: '4', created_at: '2026-06-04T00:01:00Z', anonymous_id: 'real-browser', user_id: null, event_name: 'generate_succeeded', page_domain: 'behance.net' },
  ];
  const result = _test.buildDashboard({
    profiles, events, generations: [], chromeMetrics: [], user: { id: 'owner', email: 'owner@example.com' },
    days: 0, extraTestEmails: [], extraTestIds: [],
  });
  assert.equal(result.summary.authenticPeople, 1);
  assert.equal(result.summary.successfulPeople, 1);
  assert.equal(result.summary.paidSubscribers, 0);
  assert.equal(result.summary.testEventsExcluded, 2);
  assert.equal(result.domains[0].domain, 'behance.net');
});
