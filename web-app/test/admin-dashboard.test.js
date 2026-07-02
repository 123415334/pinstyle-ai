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

test('Digital Home separates website traffic, confirmed accounts, and test generations', () => {
  const profiles = [
    { id: 'real', email: 'real@example.com', plan: 'free', created_at: '2026-06-02T00:00:00Z' },
    { id: 'pending', email: 'pending@example.com', plan: 'free', created_at: '2026-06-03T00:00:00Z' },
    { id: 'test', email: 'patrick+test900@tricksf.com', plan: 'free', created_at: '2026-06-04T00:00:00Z' },
  ];
  const authUsers = [
    { id: 'real', email_confirmed_at: '2026-06-02T00:01:00Z' },
    { id: 'pending', email_confirmed_at: null, last_sign_in_at: null },
    { id: 'test', email_confirmed_at: '2026-06-04T00:01:00Z' },
  ];
  const events = [
    { id: '1', created_at: '2026-06-05T00:00:00Z', anonymous_id: 'site-browser', user_id: null, event_name: 'site_page_view', page_domain: 'tack.design', metadata: { path: '/', referrer_domain: 'google.com' } },
    { id: '2', created_at: '2026-06-05T00:01:00Z', anonymous_id: 'real-browser', user_id: 'real', event_name: 'extension_opened', page_domain: 'pinterest.com', metadata: {} },
  ];
  const generations = [
    { id: 'g1', user_id: 'real', prompt: 'real', image_urls: [], created_at: '2026-06-05T00:02:00Z' },
    { id: 'g2', user_id: 'test', prompt: 'test', image_urls: [], created_at: '2026-06-05T00:03:00Z' },
  ];
  const result = _test.buildDashboard({ profiles, authUsers, events, generations, chromeMetrics: [], user: { id: 'owner', email: 'owner@example.com' }, days: 0, extraTestEmails: [], extraTestIds: [] });
  assert.equal(result.summary.websiteVisitors, 1);
  assert.equal(result.summary.authenticPeople, 1);
  assert.equal(result.summary.accounts, 1);
  assert.deepEqual(result.recentGenerations.map(row => row.id), ['g1']);
  assert.equal(result.acquisition.pages[0].path, '/');
});
