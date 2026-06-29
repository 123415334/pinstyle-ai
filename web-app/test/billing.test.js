const test = require('node:test');
const assert = require('node:assert/strict');
const { isEntitledSubscriptionStatus, normalizePlan, planFromPriceId } = require('../api/_billing');

const prices = {
  STRIPE_PRICE_ID_PRO: 'price_pro',
  STRIPE_PRICE_ID_STUDIO: 'price_studio',
};

test('Stripe prices map only to their configured entitlement', () => {
  assert.equal(planFromPriceId('price_pro', prices), 'pro');
  assert.equal(planFromPriceId('price_studio', prices), 'studio');
  assert.equal(planFromPriceId('price_unknown', prices), null);
  assert.equal(planFromPriceId(null, prices), null);
});

test('only active and trialing subscriptions receive paid access', () => {
  assert.equal(isEntitledSubscriptionStatus('active'), true);
  assert.equal(isEntitledSubscriptionStatus('trialing'), true);
  for (const status of ['past_due', 'unpaid', 'canceled', 'incomplete', 'paused']) {
    assert.equal(isEntitledSubscriptionStatus(status), false, status);
  }
});

test('plan normalization rejects unknown values', () => {
  assert.equal(normalizePlan('pro'), 'pro');
  assert.equal(normalizePlan('unlimited'), 'studio');
  assert.equal(normalizePlan('enterprise'), null);
});
