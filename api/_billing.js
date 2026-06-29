function normalizePlan(value) {
  const plan = String(value || '').toLowerCase();
  if (plan === 'unlimited') return 'studio';
  return ['free', 'pro', 'studio'].includes(plan) ? plan : null;
}

function planFromPriceId(priceId, env = process.env) {
  if (priceId && priceId === env.STRIPE_PRICE_ID_PRO) return 'pro';
  if (priceId && (priceId === env.STRIPE_PRICE_ID_STUDIO || priceId === env.STRIPE_PRICE_ID_UNLIMITED)) {
    return 'studio';
  }
  return null;
}

function isEntitledSubscriptionStatus(status) {
  return status === 'active' || status === 'trialing';
}

module.exports = { isEntitledSubscriptionStatus, normalizePlan, planFromPriceId };
