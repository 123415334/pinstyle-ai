'use strict';

const API_URL  = 'https://tack.design/api/analyze';
const MIN_SIZE = 200;

const SUPABASE_URL      = 'https://sbdowcielgtcfholfyry.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG93Y2llbGd0Y2Zob2xmeXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjkwNzMsImV4cCI6MjA5MDI0NTA3M30.3dUuwXB8kcAbKvEWWMpvyrXhcdLx1x8x4wKxp3UY4Kk';
const FREE_TRIAL_LIMIT  = 3;
const PRO_MONTHLY_LIMIT = 120;
const SCAN_CACHE_KEY    = 'ps_scan_cache';
const WORKSPACE_KEY     = 'ps_workspace_store';
const EVENT_LOG_KEY     = 'ps_event_log';
const ONBOARDING_KEY    = 'ps_onboarding_dismissed';
const SCAN_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKSPACE_TTL_MS  = 24 * 60 * 60 * 1000;

const selectedUrls = new Set();

// ── Auth state ────────────────────────────────────────────────────────────────
let _authToken        = null;
let _authEmail        = null;
let _generationsUsed  = 0;
let _monthlyUsed      = 0;
let _monthlyResetAt   = null;
let _plan             = 'free';
let _anonUsed         = false;  // has the guest used their one free preview generation?

// ── DOM refs ──────────────────────────────────────────────────────────────────
const imageGrid    = document.getElementById('image-grid');
const statusEl     = document.getElementById('status');
const refreshBtn   = document.getElementById('refresh-btn');
const generateBtn  = document.getElementById('generate-btn');
const subjectInput = document.getElementById('subject-input');
const resultsEl    = document.getElementById('results');
const trialBadge   = document.getElementById('trial-badge');
const authModal    = document.getElementById('auth-modal');
const authBackdrop = document.getElementById('auth-modal-backdrop');
const verifyScreen = document.getElementById('verify-screen');
const planScreen   = document.getElementById('plan-screen');
const upgradeMoment = document.getElementById('upgrade-moment');
const onboardingCard = document.getElementById('onboarding-card');
const styleMemoryBanner = document.getElementById('style-memory-banner');

let _currentPageUrl        = '';
let _pendingWorkspace      = null;
let _savedStyleMemory      = null;
let _lastResultData        = null;
let _generationProgressTimer = null;
let _telemetryFlushTimer   = null;
let _telemetryQueue        = [];

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  refreshBtn.addEventListener('click', () => loadImages({ forceRefresh: true }));
  generateBtn.addEventListener('click', generate);
  subjectInput.addEventListener('input', () => {
    updateGenerateBtn();
    saveWorkspaceState().catch(() => {});
  });

  // Header sign-in button (shown in guest mode)
  document.getElementById('header-signin-btn').addEventListener('click', () => {
    switchAuthTab('login');
    showAuthModal();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Auth modal controls
  document.getElementById('auth-modal-close').addEventListener('click', hideAuthModal);
  authBackdrop.addEventListener('click', hideAuthModal);
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });
  document.getElementById('auth-submit').addEventListener('click', handleAuthSubmit);
  document.getElementById('auth-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-password').focus();
  });
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAuthSubmit();
  });

  // Show/hide password toggle
  document.getElementById('auth-pw-toggle').addEventListener('click', () => {
    const pwField  = document.getElementById('auth-password');
    const eyeShow  = document.getElementById('pw-eye-show');
    const eyeHide  = document.getElementById('pw-eye-hide');
    const isHidden = pwField.type === 'password';
    pwField.type       = isHidden ? 'text' : 'password';
    eyeShow.style.display = isHidden ? 'none'  : '';
    eyeHide.style.display = isHidden ? ''      : 'none';
  });

  // Forgot password
  document.getElementById('auth-forgot').addEventListener('click', async (e) => {
    e.preventDefault();
    const email   = document.getElementById('auth-email').value.trim();
    const errorEl = document.getElementById('auth-error');
    if (!email) {
      errorEl.textContent = 'Enter your email address above first.';
      return;
    }
    try {
      await supabaseResetPassword(email);
      errorEl.style.color = 'var(--gold)';
      errorEl.textContent = `Password reset link sent to ${email}`;
    } catch (err) {
      errorEl.style.color = '';
      errorEl.textContent = err.message;
    }
  });

  // Resend confirmation from verify screen
  document.getElementById('verify-resend-btn').addEventListener('click', async () => {
    const resendBtn = document.getElementById('verify-resend-btn');
    const resendMsg = document.getElementById('verify-resend-msg');
    resendBtn.disabled   = true;
    resendBtn.textContent = 'Sending…';
    await supabaseResendConfirmation(_verifyEmail);
    resendBtn.textContent = 'Sent!';
    resendMsg.textContent = 'Check your inbox (and spam folder).';
    resendMsg.classList.remove('hidden');
    setTimeout(() => {
      resendBtn.disabled    = false;
      resendBtn.textContent = 'Resend confirmation email';
    }, 30000); // allow resend again after 30s
  });

  // Email verify screen — "Use a different email" dismisses and restarts signup
  document.getElementById('verify-back-btn').addEventListener('click', () => {
    stopVerifyPolling();
    _verifyEmail    = null;  // safe to clear now — user is starting over
    _verifyPassword = null;
    verifyScreen.classList.add('hidden');
    switchAuthTab('signup');
    showAuthModal();
  });

  // Plan selection
  document.getElementById('choose-free-btn').addEventListener('click', () => {
    hidePlanScreen();
    showMainUI();
  });
  document.getElementById('choose-pro-btn').addEventListener('click', () => openUpgradeFlow('pro'));
  document.getElementById('choose-unlimited-btn').addEventListener('click', () => openUpgradeFlow('unlimited'));
  document.getElementById('plan-done-btn').addEventListener('click', async () => {
    const btn        = document.getElementById('plan-done-btn');
    const waitingEl  = document.getElementById('plan-waiting');
    // Clear any previous "not updated" error before re-checking
    waitingEl.querySelectorAll('.plan-not-updated-msg').forEach(el => el.remove());
    btn.disabled    = true;
    btn.textContent = 'Checking…';
    await fetchPlan();
    if (_plan === 'free') {
      btn.disabled    = false;
      btn.textContent = "I've upgraded — continue →";
      const msg = document.createElement('p');
      msg.className  = 'plan-not-updated-msg';
      msg.style.cssText = 'font-size:11px;color:var(--red);margin-top:-4px;';
      msg.textContent   = 'Plan not updated yet — complete checkout first.';
      waitingEl.appendChild(msg);
    } else {
      hidePlanScreen();
      showMainUI();
    }
  });
  document.getElementById('plan-skip-btn').addEventListener('click', () => {
    hidePlanScreen();
    showMainUI();
  });

  // Upgrade moment dismiss
  document.getElementById('upgrade-dismiss').addEventListener('click', hideUpgradeMoment);

  if (onboardingCard) {
    onboardingCard.addEventListener('click', async e => {
      if (e.target.closest('[data-onboarding-dismiss]')) {
        onboardingCard.classList.add('hidden');
        await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
      }
    });
  }

  if (styleMemoryBanner) {
    styleMemoryBanner.addEventListener('click', e => {
      if (e.target.closest('[data-clear-style-memory]')) clearSavedStyleMemory();
    });
  }

  // Boot
  await initAuth();
});

// ── Auth modal ────────────────────────────────────────────────────────────────

function showAuthModal() {
  authBackdrop.classList.remove('hidden');
  authModal.classList.remove('hidden');
}

function hideAuthModal() {
  authBackdrop.classList.add('hidden');
  authModal.classList.add('hidden');
  document.getElementById('auth-error').textContent = '';
}

// Override the modal headline + sub-text (e.g. after anon generation)
function setAuthModalCopy(titleHTML, subText) {
  const titleEl = document.querySelector('.auth-modal-title');
  const subEl   = document.querySelector('.auth-modal-sub');
  if (titleEl) titleEl.innerHTML = titleHTML;
  if (subEl)   subEl.textContent = subText;
}

// ── Upgrade moment ────────────────────────────────────────────────────────────

function showUpgradeMoment(type) {
  const titleEl      = document.getElementById('upgrade-title');
  const subEl        = document.getElementById('upgrade-sub');
  const primaryBtn   = document.getElementById('upgrade-primary-btn');
  const secondaryBtn = document.getElementById('upgrade-secondary-btn');
  const email        = _authEmail ? `?email=${encodeURIComponent(_authEmail)}` : '';

  titleEl.textContent = "You're on a roll.";

  if (type === 'pro_limit') {
    subEl.textContent          = "You've hit your 120 monthly generations. Keep creating with Unlimited — no limits, ever.";
    primaryBtn.textContent     = 'Go Unlimited → $35/month';
    primaryBtn.href            = `https://tack.design/upgrade${email}&current=pro`;
    secondaryBtn.style.display = 'none';
  } else {
    subEl.textContent          = "Your 3 free generations are up. Keep going with Pro — 120 images/month for $12.";
    primaryBtn.textContent     = 'Get Pro → $12/month';
    primaryBtn.href            = `https://tack.design/upgrade${email}`;
    secondaryBtn.textContent   = 'Or go Unlimited → $35/month';
    secondaryBtn.href          = `https://tack.design/upgrade${email}`;
    secondaryBtn.style.display = '';
  }

  upgradeMoment.classList.remove('hidden');
}

function hideUpgradeMoment() {
  upgradeMoment.classList.add('hidden');
}

// ── Anonymous CTA — injected below results after the preview generation ───────

function injectAnonCTA() {
  // Remove any existing CTA first
  document.getElementById('anon-cta')?.remove();

  const cta = document.createElement('div');
  cta.id        = 'anon-cta';
  cta.className = 'anon-cta';
  cta.innerHTML = `
    <p class="anon-cta-eyebrow">✦ Like what you see?</p>
    <p class="anon-cta-text">Create a free account to get 3 more generations and save your results.</p>
    <button class="anon-cta-btn" id="anon-cta-signup">Create free account →</button>
    <button class="anon-cta-skip" id="anon-cta-login">Already have an account? Sign in</button>
  `;
  resultsEl.appendChild(cta);

  document.getElementById('anon-cta-signup').addEventListener('click', () => {
    switchAuthTab('signup');
    setAuthModalCopy(
      'Save this &amp; keep <em>creating</em>',
      '3 free images with every new account — no card required.',
    );
    showAuthModal();
  });

  document.getElementById('anon-cta-login').addEventListener('click', () => {
    switchAuthTab('login');
    showAuthModal();
  });
}

// ── Verify screen — auto-polls until email is confirmed ───────────────────────

let _verifyEmail    = null;
let _verifyPassword = null;
let _verifyTimer    = null;
let _verifyResendTimer = null;
let _verifyTimeoutId   = null;

function showVerifyScreen(email, password) {
  hideAuthModal();
  _verifyEmail    = email;
  _verifyPassword = password;
  document.getElementById('verify-email-display').textContent = email;
  document.getElementById('verify-status-text').textContent   = 'Waiting for confirmation…';
  verifyScreen.classList.remove('hidden');
  startVerifyPolling();
}

function startVerifyPolling() {
  stopVerifyPolling();

  // Show "Resend" button after 30 seconds
  const resendBtn = document.getElementById('verify-resend-btn');
  if (resendBtn) {
    resendBtn.classList.add('hidden');
    _verifyResendTimer = setTimeout(() => {
      if (_verifyEmail) resendBtn.classList.remove('hidden');
    }, 30000);
  }

  // After 3 minutes with no confirmation, show a timeout message
  _verifyTimeoutId = setTimeout(() => {
    if (_verifyEmail) {
      document.getElementById('verify-status-text').textContent = 'Link expired or not received.';
      if (resendBtn) resendBtn.classList.remove('hidden');
    }
  }, 180000);

  // Poll every 4 seconds — try signing in; succeeds once email is confirmed
  _verifyTimer = setInterval(async () => {
    if (!_verifyEmail || !_verifyPassword) return;
    try {
      const data = await supabaseLogin(_verifyEmail, _verifyPassword);
      if (data?.access_token) {
        stopVerifyPolling();
        document.getElementById('verify-status-text').textContent = 'Confirmed! Signing you in…';

        _authToken       = data.access_token;
        _authEmail       = _verifyEmail;
        _generationsUsed = 0;
        _monthlyUsed     = 0;
        _monthlyResetAt  = null;
        _plan            = 'free';
        _verifyEmail     = null;
        _verifyPassword  = null;

        await chrome.storage.local.set({
          ps_token:   _authToken,
          ps_refresh: data.refresh_token || null,
          ps_email:   _authEmail,
          ps_used:    0,
          ps_plan:    'free',
          ps_monthly: 0,
          ps_reset:   null,
        });

        await fetchPlan();
        await saveWorkspaceState();
        verifyScreen.classList.add('hidden');
        // New signup → plan selection
        showPlanScreen();
      }
    } catch { /* not confirmed yet — keep polling */ }
  }, 4000);
}

function stopVerifyPolling() {
  if (_verifyTimer) {
    clearInterval(_verifyTimer);
    _verifyTimer = null;
  }
  if (_verifyResendTimer) {
    clearTimeout(_verifyResendTimer);
    _verifyResendTimer = null;
  }
  if (_verifyTimeoutId) {
    clearTimeout(_verifyTimeoutId);
    _verifyTimeoutId = null;
  }
  // _verifyEmail / _verifyPassword are NOT cleared here — startVerifyPolling()
  // calls this before starting a new interval, so clearing them here would
  // wipe credentials before the interval ever fires.
  // They're cleared explicitly on success or when user picks a different email.
}

// ── Plan selection screen ─────────────────────────────────────────────────────

function showPlanScreen() {
  hideAuthModal();
  const cards = document.getElementById('plan-cards');
  const waiting = document.getElementById('plan-waiting');
  const doneBtn = document.getElementById('plan-done-btn');
  if (cards) cards.classList.remove('hidden');
  if (waiting) {
    waiting.classList.add('hidden');
    waiting.querySelectorAll('.plan-not-updated-msg').forEach(el => el.remove());
  }
  if (doneBtn) {
    doneBtn.disabled = false;
    doneBtn.textContent = "I've upgraded — continue →";
  }
  planScreen.classList.remove('hidden');
}

function hidePlanScreen() {
  planScreen.classList.add('hidden');
}

function openUpgradeFlow(plan) {
  const upgradeUrl = `https://tack.design/upgrade?email=${encodeURIComponent(_authEmail)}&plan=${plan}`;
  chrome.tabs.create({ url: upgradeUrl });
  document.getElementById('plan-cards').classList.add('hidden');
  document.getElementById('plan-waiting').classList.remove('hidden');
}

// ── Auth init ─────────────────────────────────────────────────────────────────

async function initAuth() {
  const tab = await getActiveTab().catch(() => null);
  _currentPageUrl = tab?.url || '';

  const stored = await chrome.storage.local.get(['ps_token', 'ps_refresh', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);

  if (stored.ps_token) {
    const ok = await validateToken(stored.ps_token);
    if (ok) {
      _authToken       = stored.ps_token;
      _authEmail       = stored.ps_email   || '';
      _generationsUsed = stored.ps_used    || 0;
      _monthlyUsed     = stored.ps_monthly || 0;
      _monthlyResetAt  = stored.ps_reset   || null;
      _plan            = stored.ps_plan    || 'free';
      _pendingWorkspace = await loadPendingWorkspaceState();
      await fetchPlan();
      showMainUI();
      return;
    }

    // Try refresh token
    if (stored.ps_refresh) {
      const refreshed = await refreshAccessToken(stored.ps_refresh);
      if (refreshed) {
        _authToken       = refreshed.access_token;
        _authEmail       = stored.ps_email   || '';
        _generationsUsed = stored.ps_used    || 0;
        _monthlyUsed     = stored.ps_monthly || 0;
        _monthlyResetAt  = stored.ps_reset   || null;
        _plan            = stored.ps_plan    || 'free';
        _pendingWorkspace = await loadPendingWorkspaceState();
        await chrome.storage.local.set({
          ps_token:   refreshed.access_token,
          ps_refresh: refreshed.refresh_token,
        });
        await fetchPlan();
        showMainUI();
        return;
      }
    }

    // Tokens invalid — clear and boot as guest
    await chrome.storage.local.remove(['ps_token', 'ps_refresh', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
  }

  // Guest mode — show UI immediately, no auth wall
  const anonData = await chrome.storage.local.get(['ps_anon_used']);
  _anonUsed = !!anonData.ps_anon_used;
  _pendingWorkspace = await loadPendingWorkspaceState();
  showGuestUI();
}

function showGuestUI() {
  // Show header sign-in button
  document.getElementById('header-account').classList.add('hidden');
  document.getElementById('header-signin-btn').classList.remove('hidden');
  // Hide counter (no account yet)
  trialBadge.classList.add('hidden');
  restoreWorkspaceUI();
  renderOnboardingCard();
  // Load images right away so they can explore
  loadImages();
}

function showMainUI() {
  hideAuthModal();
  hidePlanScreen();
  // Show account area in header
  document.getElementById('header-signin-btn').classList.add('hidden');
  document.getElementById('header-account').classList.remove('hidden');
  document.getElementById('header-email').textContent = _authEmail;
  updateHeaderPlanBadge();
  updateTrialBadge();
  restoreWorkspaceUI();
  onboardingCard?.classList.add('hidden');
  loadImages();
}

function updateHeaderPlanBadge() {
  const badge = document.getElementById('header-plan-badge');
  if (!badge) return;
  if (_plan === 'pro') {
    badge.textContent  = 'Pro';
    badge.className    = 'header-plan-badge plan-pro';
  } else if (_plan === 'unlimited') {
    badge.textContent  = 'Unlimited';
    badge.className    = 'header-plan-badge plan-unlimited';
  } else {
    badge.textContent  = 'Free';
    badge.className    = 'header-plan-badge plan-free';
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token ? data : null;
  } catch { return null; }
}

// ── Fetch plan from Supabase ──────────────────────────────────────────────────

async function fetchPlan() {
  if (!_authToken) return;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(_authEmail)}&select=plan,generations_used,monthly_generations,monthly_reset_at`,
      { headers: { 'Authorization': `Bearer ${_authToken}`, 'apikey': SUPABASE_ANON_KEY } }
    );
    if (!resp.ok) return;
    const rows = await resp.json();
    if (rows?.[0]) {
      _plan            = rows[0].plan               || 'free';
      _generationsUsed = rows[0].generations_used   ?? _generationsUsed;
      _monthlyUsed     = rows[0].monthly_generations ?? 0;
      _monthlyResetAt  = rows[0].monthly_reset_at   || null;
      await chrome.storage.local.set({
        ps_plan:    _plan,
        ps_used:    _generationsUsed,
        ps_monthly: _monthlyUsed,
        ps_reset:   _monthlyResetAt,
      });
      // Keep header badge in sync whenever plan data refreshes
      updateHeaderPlanBadge();
    }
  } catch { /* best-effort */ }
}

async function validateToken(token) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    });
    return resp.ok;
  } catch { return false; }
}

// ── Trial / counter badge ─────────────────────────────────────────────────────

function updateTrialBadge() {
  // Guest mode: no badge
  if (!_authToken) {
    trialBadge.classList.add('hidden');
    return;
  }

  const upgradeBase = `https://tack.design/upgrade${_authEmail ? '?email=' + encodeURIComponent(_authEmail) : ''}`;
  trialBadge.classList.remove('hidden');

  // ── Unlimited ──
  if (_plan === 'unlimited') {
    trialBadge.className = 'trial-badge';
    trialBadge.innerHTML = `<span class="counter-star">✦</span> Unlimited plan · no monthly limit`;
    generateBtn.disabled = subjectInput.value.trim().length === 0 || selectedUrls.size === 0;
    return;
  }

  // ── Pro ──
  if (_plan === 'pro') {
    const used      = _monthlyUsed;
    const remaining = PRO_MONTHLY_LIMIT - used;
    const pct       = Math.min(100, Math.round((used / PRO_MONTHLY_LIMIT) * 100));

    if (remaining <= 0) {
      trialBadge.className = 'trial-badge counter-exhausted';
      const unlimitedUrl = upgradeBase + (_authEmail ? '&current=pro' : '?current=pro');
      trialBadge.innerHTML = `Monthly limit reached · <a href="${unlimitedUrl}" target="_blank" rel="noopener" class="counter-upgrade-link">Go Unlimited →</a>`;
      generateBtn.disabled = true;
    } else {
      const resetDate = _monthlyResetAt
        ? new Date(_monthlyResetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'next month';
      trialBadge.className = 'trial-badge';
      trialBadge.innerHTML = `
        <div class="counter-row">
          <span class="counter-label"><strong style="color:var(--ink)">${remaining}</strong> of ${PRO_MONTHLY_LIMIT} left this month &middot; resets ${resetDate}</span>
        </div>
        <div class="counter-bar" style="margin-top:6px">
          <div class="counter-fill" style="width:${pct}%"></div>
        </div>`;
    }
    return;
  }

  // ── Free ──
  const used      = _generationsUsed;
  const remaining = FREE_TRIAL_LIMIT - used;

  if (remaining <= 0) {
    trialBadge.className = 'trial-badge counter-exhausted';
    trialBadge.innerHTML = `3 free generations used &middot; <a href="${upgradeBase}" target="_blank" rel="noopener" class="counter-upgrade-link">Upgrade to keep creating →</a>`;
    generateBtn.disabled = true;
    return;
  }

  // Dot indicators: ● ● ○
  const dots = Array.from({ length: FREE_TRIAL_LIMIT }, (_, i) =>
    `<span class="counter-dot ${i < used ? 'used' : 'open'}"></span>`
  ).join('');

  trialBadge.className = 'trial-badge';
  trialBadge.innerHTML = `
    <div class="counter-row">
      <span class="counter-dots">${dots}</span>
      <span class="counter-label">${remaining} free generation${remaining !== 1 ? 's' : ''} left</span>
    </div>`;
}

// ── Logout ────────────────────────────────────────────────────────────────────

async function logout() {
  const priorScope = getAccountScope();
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_authToken}`, 'apikey': SUPABASE_ANON_KEY },
    });
  } catch { /* best-effort */ }

  _authToken       = null;
  _authEmail       = null;
  _generationsUsed = 0;
  _monthlyUsed     = 0;
  _monthlyResetAt  = null;
  _plan            = 'free';
  _lastResultData  = null;
  _savedStyleMemory = null;
  await chrome.storage.local.remove(['ps_token', 'ps_refresh', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
  await clearWorkspaceState(priorScope);
  stopVerifyPolling();
  stopGenerationProgress();
  verifyScreen.classList.add('hidden');

  // ── Clean slate — don't leak current user's data to the next person ──────
  // Clear results
  resultsEl.innerHTML = '';
  resultsEl.className = 'hidden';
  // Clear subject input
  subjectInput.value = '';
  selectedUrls.clear();
  // Close & reset history panel
  const historyPanel = document.getElementById('history-panel');
  if (historyPanel) {
    historyPanel.classList.add('hidden');
    document.getElementById('history-list').innerHTML = '';
    _historyObjectUrls.forEach(u => URL.revokeObjectURL(u));
    _historyObjectUrls = [];
  }
  // Hide upgrade moment if showing
  hideUpgradeMoment();
  // Remove any anon CTA
  document.getElementById('anon-cta')?.remove();

  // Return to guest mode
  document.getElementById('header-account').classList.add('hidden');
  document.getElementById('header-signin-btn').classList.remove('hidden');
  trialBadge.classList.add('hidden');
  renderStyleMemoryBanner();
  renderOnboardingCard();
  loadImages();
  updateGenerateBtn();
}

// ── Auth form ─────────────────────────────────────────────────────────────────

let _authMode = 'signup'; // 'login' | 'signup'

function switchAuthTab(tab) {
  _authMode = tab;
  document.querySelectorAll('.auth-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  const submitBtn  = document.getElementById('auth-submit');
  const forgotLink = document.getElementById('auth-forgot');
  const pwHint     = document.getElementById('auth-pw-hint');
  const pwField    = document.getElementById('auth-password');

  if (tab === 'login') {
    submitBtn.textContent = 'Sign In';
    if (forgotLink) forgotLink.classList.remove('hidden');
    if (pwHint)     pwHint.classList.add('hidden');
    if (pwField)    pwField.setAttribute('autocomplete', 'current-password');
    const titleEl = document.querySelector('.auth-modal-title');
    const subEl   = document.querySelector('.auth-modal-sub');
    if (titleEl) titleEl.innerHTML = 'Welcome <em>back</em>';
    if (subEl)   subEl.textContent = 'Sign in to continue generating.';
  } else {
    submitBtn.textContent = 'Create Account';
    if (forgotLink) forgotLink.classList.add('hidden');
    if (pwHint)     pwHint.classList.remove('hidden');
    if (pwField)    pwField.setAttribute('autocomplete', 'new-password');
    const titleEl = document.querySelector('.auth-modal-title');
    const subEl   = document.querySelector('.auth-modal-sub');
    if (titleEl) titleEl.innerHTML = 'Sign up to <em>generate</em>';
    if (subEl)   subEl.textContent = '3 free images included with every new account';
  }
  document.getElementById('auth-error').textContent = '';
}

async function handleAuthSubmit() {
  const email     = document.getElementById('auth-email').value.trim().toLowerCase();
  const password  = document.getElementById('auth-password').value;
  const errorEl   = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');

  errorEl.textContent  = '';
  errorEl.style.color  = ''; // reset any custom colour from forgot-password

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errorEl.textContent = 'Please enter your email address.';
    return;
  }
  if (!emailRegex.test(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    return;
  }
  if (!password) {
    errorEl.textContent = 'Please enter a password.';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = _authMode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    let data;
    if (_authMode === 'login') {
      data = await supabaseLogin(email, password);
    } else {
      data = await supabaseSignup(email, password);
    }

    // Email verification pending — show verify screen with auto-polling
    if (!data.access_token) {
      showVerifyScreen(email, password);
      return;
    }

    _authToken       = data.access_token;
    _authEmail       = email;
    _generationsUsed = 0;
    _monthlyUsed     = 0;
    _monthlyResetAt  = null;
    _plan            = 'free';

    await chrome.storage.local.set({
      ps_token:   _authToken,
      ps_refresh: data.refresh_token || null,
      ps_email:   _authEmail,
      ps_used:    0,
      ps_plan:    'free',
      ps_monthly: 0,
      ps_reset:   null,
    });

    await fetchPlan();
    await saveWorkspaceState();

    // New signup → plan selection screen
    // Login → straight to main UI
    if (_authMode === 'signup') {
      showPlanScreen();
    } else {
      showMainUI();
    }

  } catch (err) {
    const msg = err.message || '';
    const lower = msg.toLowerCase();

    if (_authMode === 'signup' && (lower.includes('already registered') || lower.includes('already exists'))) {
      // Duplicate email caught as an error
      errorEl.innerHTML = 'An account with that email already exists. <button class="link-btn" id="switch-to-login-btn">Sign in instead →</button>';
      document.getElementById('switch-to-login-btn')?.addEventListener('click', () => {
        switchAuthTab('login');
        errorEl.textContent = '';
      });
    } else if (_authMode === 'login' && lower.includes('email not confirmed')) {
      // They signed up but never confirmed — offer to resend
      const emailVal = document.getElementById('auth-email').value.trim();
      errorEl.innerHTML = 'Please confirm your email first. <button class="link-btn" id="resend-from-login-btn">Resend confirmation →</button>';
      document.getElementById('resend-from-login-btn')?.addEventListener('click', async () => {
        errorEl.textContent = 'Sending…';
        await supabaseResendConfirmation(emailVal);
        showVerifyScreen(emailVal, password);
      });
    } else if (_authMode === 'login' && (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('wrong password'))) {
      errorEl.textContent = 'Incorrect email or password. Please try again.';
    } else {
      errorEl.textContent = msg || 'Something went wrong. Please try again.';
    }
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = _authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

async function supabaseLogin(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.msg || 'Login failed. Check your email and password.');
  return data;
}

async function supabaseSignup(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/signup?redirect_to=https://tack.design/confirmed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.msg || 'Sign up failed. Please try again.');
  // Supabase returns 200 with empty identities[] when the email is already registered
  // (security measure — doesn't reveal whether account exists via error code)
  if (data.identities && data.identities.length === 0) {
    throw new Error('User already registered');
  }
  // No access_token means email confirmation is required
  if (!data.access_token) return { __verifyPending: true };
  return data;
}

async function supabaseResendConfirmation(email) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'signup', email }),
    });
  } catch { /* best-effort */ }
}

async function supabaseResetPassword(email) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, gotrue_meta_security: {} }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error_description || data.msg || 'Could not send reset email.');
  }
}

// ── Image scanning ────────────────────────────────────────────────────────────

async function loadImages(options = {}) {
  const { forceRefresh = false } = options;
  imageGrid.innerHTML = '';
  setStatus('Scanning page…');
  setHint('');
  const memoryUrls = _savedStyleMemory?.referenceUrls || [];
  selectedUrls.clear();
  memoryUrls.forEach(url => selectedUrls.add(url));
  applyPendingPageSelection();
  updateGenerateBtn();

  const tab = await getActiveTab().catch(() => null);
  if (!tab) {
    setStatus('Could not access the current tab.');
    return;
  }
  _currentPageUrl = tab.url || '';

  const isPinterest = tab.url && tab.url.includes('pinterest.com');
  const canAutoScroll = /^https?:\/\//i.test(tab.url || '');
  const cachedImages = !forceRefresh ? await getCachedScan(tab.url) : null;
  if (cachedImages?.length) {
    renderScannedImages(cachedImages, { isPinterest, fromCache: true });
  }

  if (!isPinterest && canAutoScroll) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return new Promise(resolve => {
            const startY = window.scrollY;
            let scrolls = 0;
            const maxScrolls = 3;
            const interval = setInterval(() => {
              window.scrollBy(0, window.innerHeight);
              scrolls++;
              if (scrolls >= maxScrolls) {
                clearInterval(interval);
                setTimeout(() => {
                  window.scrollTo({ top: startY, behavior: 'instant' });
                  setTimeout(resolve, 100);
                }, 800);
              }
            }, 400);
          });
        },
      });
    } catch (_) {}
  }

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectImages,
      args: [MIN_SIZE],
    });
  } catch (err) {
    setStatus('Cannot scan this page (try a regular http/https page).');
    return;
  }

  const images = results?.[0]?.result ?? [];
  await setCachedScan(tab.url, images);

  if (images.length === 0) {
    imageGrid.innerHTML = isPinterest
      ? `<div class="empty-state"><strong>No pins found yet</strong>Scroll down the board so pins load, then tap Rescan.</div>`
      : `<div class="empty-state"><strong>No large images found</strong>Try scrolling so images load, then tap Rescan.</div>`;
    setStatus('');
    return;
  }

  const src = isPinterest ? 'Pinterest data' : 'page';
  setStatus(`${images.length} image${images.length !== 1 ? 's' : ''} from ${src} — tap to select`);
  if (isPinterest) setHint('Scroll down to load more pins, then tap ↻ Rescan');
  renderScannedImages(images, { isPinterest, fromCache: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// collectImages — runs INSIDE the page context via executeScript.
// Must be completely self-contained: no closures, no imports, no outer vars.
// ─────────────────────────────────────────────────────────────────────────────
function collectImages(minSize) {
  const seen    = new Set();
  const results = [];

  function add(src, width, height, alt) {
    if (!src || seen.has(src)) return;
    seen.add(src);
    results.push({ src, width: width || 0, height: height || 0, alt: alt || '' });
  }

  // ── Pinterest-specific path ────────────────────────────────────────────────
  if (window.location.hostname.includes('pinterest.com')) {

    try {
      const scriptEl = document.getElementById('__PWS_DATA__');
      if (scriptEl) {
        const raw = scriptEl.textContent.trim()
          .replace(/^[^\[{]*/, '')
          .replace(/[;\s]*$/, '');

        const pws = JSON.parse(raw);

        function walk(obj, depth) {
          if (!obj || typeof obj !== 'object' || depth > 25) return;

          if (obj.images && typeof obj.images === 'object') {
            const validKey = Object.keys(obj.images).find(k =>
              obj.images[k] &&
              typeof obj.images[k].url === 'string' &&
              obj.images[k].url.includes('i.pinimg.com')
            );
            if (validKey) {
              const best = (
                obj.images['736x']      ||
                obj.images['474x']      ||
                obj.images['originals'] ||
                obj.images['orig']      ||
                obj.images['236x']      ||
                obj.images[validKey]
              );
              const url = best.url.replace(/\/\d+x\//, '/736x/');
              add(url, best.width || 736, best.height || 736, '');
              return;
            }
          }

          if (Array.isArray(obj)) {
            for (const v of obj) walk(v, depth + 1);
          } else {
            for (const v of Object.values(obj)) {
              if (v && typeof v === 'object') walk(v, depth + 1);
            }
          }
        }

        walk(pws, 0);
      }
    } catch (_) {}

    document.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src;
      if (!src || !src.includes('i.pinimg.com')) return;
      const w = img.naturalWidth  || img.offsetWidth;
      const h = img.naturalHeight || img.offsetHeight;
      if (w < minSize || h < minSize) return;
      const upgraded = src.replace(/\/\d+x\//, '/736x/');
      add(upgraded, Math.max(w, 736), Math.max(h, 736), img.alt || '');
    });

    const posMap = {};
    document.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src;
      if (!src || !src.includes('i.pinimg.com')) return;
      const upgraded = src.replace(/\/\d+x\//, '/736x/');
      if (posMap[upgraded]) return;
      const rect = img.getBoundingClientRect();
      posMap[upgraded] = { top: rect.top + window.scrollY, left: rect.left };
    });

    results.sort((a, b) => {
      const pa = posMap[a.src] || { top: 9999, left: 9999 };
      const pb = posMap[b.src] || { top: 9999, left: 9999 };
      return pa.top !== pb.top ? pa.top - pb.top : pa.left - pb.left;
    });

    return results;
  }

  // ── Generic path (non-Pinterest pages) ────────────────────────────────────
  document.querySelectorAll('img').forEach(img => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) return;
    const w = img.naturalWidth  || img.offsetWidth;
    const h = img.naturalHeight || img.offsetHeight;
    if (w < minSize || h < minSize) return;
    add(src, w, h, img.alt || '');
  });

  const posMap = {};
  document.querySelectorAll('img').forEach(img => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:') || posMap[src]) return;
    const rect = img.getBoundingClientRect();
    posMap[src] = { top: rect.top + window.scrollY, left: rect.left };
  });

  results.sort((a, b) => {
    const pa = posMap[a.src] || { top: 9999, left: 9999 };
    const pb = posMap[b.src] || { top: 9999, left: 9999 };
    return pa.top !== pb.top ? pa.top - pb.top : pa.left - pb.left;
  });

  return results;
}

// ── Select / deselect ─────────────────────────────────────────────────────────
function toggleSelect(item, src) {
  if (selectedUrls.has(src)) {
    selectedUrls.delete(src);
    item.classList.remove('selected');
  } else {
    selectedUrls.add(src);
    item.classList.add('selected');
  }
  updateGenerateBtn();
  saveWorkspaceState().catch(() => {});
}

function updateGenerateBtn() {
  const hasImages  = selectedUrls.size > 0;
  const hasSubject = subjectInput.value.trim().length > 0;

  // Guest: enable when they have images + subject (auth intercepts on click)
  if (!_authToken) {
    generateBtn.disabled = !(hasImages && hasSubject);
    return;
  }

  // Logged in: also check plan limits
  const trialExhausted   = _plan === 'free' && _generationsUsed >= FREE_TRIAL_LIMIT;
  const monthlyExhausted = _plan === 'pro'  && _monthlyUsed     >= PRO_MONTHLY_LIMIT;
  generateBtn.disabled = trialExhausted || monthlyExhausted || !hasImages || !hasSubject;
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function generate() {
  const subject = subjectInput.value.trim();
  if (!subject || selectedUrls.size === 0) return;
  trackEvent('generate_started', { count: selectedUrls.size, source: _savedStyleMemory ? 'history_memory' : 'page' });

  // Guest → allow first generation as anonymous preview; gate the second one
  if (!_authToken) {
    if (_anonUsed) {
      // They've seen the magic — now invite them to create an account
      switchAuthTab('signup');
      setAuthModalCopy(
        'Keep <em>creating</em>',
        'Create a free account to keep going — 3 more generations included.',
      );
      showAuthModal();
      return;
    }
    // First time: fall through and generate (API accepts no-token as anon preview)
  }

  // Limit guards
  if (_plan === 'free' && _generationsUsed >= FREE_TRIAL_LIMIT) {
    showUpgradeMoment('trial');
    return;
  }
  if (_plan === 'pro' && _monthlyUsed >= PRO_MONTHLY_LIMIT) {
    showUpgradeMoment('pro_limit');
    return;
  }

  generateBtn.disabled    = true;
  generateBtn.textContent = 'Generating…';
  renderGeneratingState();

  let pageUrl = '';
  const activeTab = await getActiveTab().catch(() => null);
  pageUrl = activeTab?.url || _currentPageUrl || '';
  _currentPageUrl = pageUrl;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (_authToken) headers.Authorization = `Bearer ${_authToken}`;

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageUrls: [...selectedUrls], subject, pageUrl }),
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 401) {
      // Session expired
      _authToken = null;
      _authEmail = null;
      _generationsUsed = 0;
      _monthlyUsed = 0;
      _monthlyResetAt = null;
      _plan = 'free';
      await chrome.storage.local.remove(['ps_token', 'ps_refresh', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
      document.getElementById('header-account').classList.add('hidden');
      document.getElementById('header-signin-btn').classList.remove('hidden');
      trialBadge.classList.add('hidden');
      resultsEl.className = 'hidden';
      switchAuthTab('login');
      updateGenerateBtn();
      showAuthModal();
      return;
    }

    if (resp.status === 402) {
      const errData = data || {};
      if (errData.error === 'pro_limit_reached') {
        _monthlyUsed = PRO_MONTHLY_LIMIT;
        await chrome.storage.local.set({ ps_monthly: PRO_MONTHLY_LIMIT });
        updateTrialBadge();
        showUpgradeMoment('pro_limit');
      } else {
        _generationsUsed = FREE_TRIAL_LIMIT;
        await chrome.storage.local.set({ ps_used: FREE_TRIAL_LIMIT });
        updateTrialBadge();
        showUpgradeMoment('trial');
      }
      resultsEl.className = 'hidden';
      return;
    }

    if (!resp.ok) throw new Error(data.error || `API returned ${resp.status}`);

    stopGenerationProgress();
    _lastResultData = {
      styleDescriptors: data.styleDescriptors || '',
      prompt: data.prompt || '',
      images: Array.isArray(data.images) ? data.images : [],
    };
    renderResults(data);

    if (!_authToken) {
      // Anonymous preview just completed — mark it used and invite sign-up
      _anonUsed = true;
      await chrome.storage.local.set({ ps_anon_used: true });
      injectAnonCTA();
    } else {
      if (data.usage) {
        _generationsUsed = data.usage.used;
        if (data.usage.monthly_used !== undefined) _monthlyUsed = data.usage.monthly_used;
        await chrome.storage.local.set({ ps_used: _generationsUsed, ps_monthly: _monthlyUsed });
        updateTrialBadge();
      }

      if (data.images && data.images.length > 0) {
        saveToHistory(data.images, {
          subject,
          pageUrl,
          styleDescriptors: data.styleDescriptors || '',
          prompt: data.prompt || '',
          referenceUrls: [...selectedUrls],
        }).catch(e => console.warn('[tack] history save failed:', e));
      }
    }
    await saveWorkspaceState();
    trackEvent('generate_succeeded', { count: data.images?.length || 0 });

  } catch (err) {
    stopGenerationProgress();
    const msg = err.message || '';
    const friendly = msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')
      ? 'Connection error — check your internet and try again.'
      : msg || 'Something went wrong. Please try again.';
    resultsEl.innerHTML = `<p class="error-msg">⚠ ${friendly}</p>`;
    resultsEl.className = '';
    trackEvent('generate_failed', { message: friendly });
  } finally {
    stopGenerationProgress();
    generateBtn.textContent = 'Generate Images';
    updateGenerateBtn();
  }
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(data) {
  const { styleDescriptors, prompt, images } = data;
  let html = '';

  if (styleDescriptors) {
    html += `
      <div class="result-block">
        <h3>Style Analysis</h3>
        <p class="style-descriptors">${escHtml(styleDescriptors)}</p>
      </div>`;
  }

  if (prompt) {
    html += `
      <div class="result-block">
        <h3>Image Prompt</h3>
        <p class="prompt-text">${escHtml(prompt)}</p>
        <button class="btn-copy" data-prompt="${escAttr(prompt)}">Copy prompt</button>
      </div>`;
  }

  if (images && images.length > 0) {
    html += `
      <div class="result-block">
        <h3>Generated Images</h3>
        <div class="gen-images">
          ${images.map((url, i) => `
            <div class="gen-img-wrap" data-preview-url="${escAttr(url)}" data-preview-filename="tack-${i+1}.png">
              <img src="${escAttr(url)}" alt="Generated image" loading="lazy">
              <div class="img-actions">
                <button class="download-btn" data-url="${escAttr(url)}" data-filename="tack-${i+1}.png">
                  ↓ Download
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  if (!html) {
    resultsEl.innerHTML = '<p class="error-msg">No results returned — please try again.</p>';
    return;
  }

  resultsEl.innerHTML = html;
  saveWorkspaceState().catch(() => {});

  // Wire up generated image clicks via data attribute (safe, no inline JS)
  resultsEl.querySelectorAll('.gen-img-wrap').forEach(wrap => {
    wrap.addEventListener('click', e => {
      if (!e.target.closest('.img-actions')) {
        showPreview(wrap.dataset.previewUrl, wrap.dataset.previewFilename);
      }
    });
  });

  resultsEl.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      downloadAsPng(btn.dataset.url, btn.dataset.filename);
    });
  });
  resultsEl.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.prompt || '').then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy prompt'; }, 2000);
      });
    });
  });
}

// ── Download as PNG ───────────────────────────────────────────────────────────
async function downloadAsPng(url, filename) {
  try {
    const safeName = sanitizeFilename(filename);
    const directDownload = () => chrome.downloads.download({
      url,
      filename: safeName,
      conflictAction: 'uniquify',
      saveAs: false,
    });

    let resp;
    try {
      resp = await fetch(url, { credentials: 'omit' });
    } catch {
      await directDownload();
      return;
    }

    if (!resp.ok) {
      await directDownload();
      return;
    }

    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) {
      await directDownload();
      return;
    }

    const resolvedName = normalizeImageFilename(safeName, blob.type);
    const objectUrl = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({
        url: objectUrl,
        filename: resolvedName,
        conflictAction: 'uniquify',
        saveAs: false,
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
  } catch (err) {
    console.error('[tack] download error:', err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg) { statusEl.textContent = msg; }

function setHint(msg) {
  let hint = document.getElementById('scan-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'scan-hint';
    hint.style.cssText = 'font-size:11px;color:var(--ink-muted);margin-top:5px;line-height:1.5';
    statusEl.insertAdjacentElement('afterend', hint);
  }
  hint.textContent = msg;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(str) {
  return str.replace(/"/g, '&quot;');
}

function sanitizeFilename(name) {
  const safe = (name || 'tack-image.png')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'tack-image.png';
}

function normalizeImageFilename(filename, mimeType) {
  const extension = mimeTypeToExtension(mimeType);
  if (!extension) return filename;
  return filename.replace(/\.[a-z0-9]+$/i, '') + extension;
}

function mimeTypeToExtension(mimeType) {
  const normalized = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  return '';
}

// ── Supabase cloud history sync ───────────────────────────────────────────────
function getUserIdFromToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).sub || null;
  } catch { return null; }
}

async function saveToSupabase(buffers, subject) {
  if (!_authToken) return;
  const userId = getUserIdFromToken(_authToken);
  if (!userId) return;

  const timestamp = Date.now();
  const uploadedUrls = [];

  for (let i = 0; i < buffers.length; i++) {
    try {
      const path = `${userId}/${timestamp}_${i}.webp`;
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/generated-images/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${_authToken}`,
          'Content-Type':  'image/webp',
          'x-upsert':      'false',
        },
        body: buffers[i],
      });
      if (resp.ok) {
        uploadedUrls.push(`${SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`);
      }
    } catch { /* non-fatal */ }
  }

  if (uploadedUrls.length === 0) return;

  await fetch(`${SUPABASE_URL}/rest/v1/generations`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${_authToken}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ user_id: userId, prompt: subject || '', image_urls: uploadedUrls }),
  }).catch(() => { /* non-fatal */ });
}

// ── History Archive (IndexedDB) ───────────────────────────────────────────────
const DB_NAME     = 'tack_db';
const DB_VERSION  = 1;
const STORE_NAME  = 'history';
const MAX_HISTORY = 500;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function saveToHistory(imageUrls, subject = '') {
  const meta = typeof subject === 'string' ? { subject } : (subject || {});
  if (!_authEmail) return; // never save for guests
  const assets = await Promise.all(imageUrls.map(async url => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return {
        buffer: await resp.arrayBuffer(),
        type: resp.headers.get('content-type') || 'image/png',
      };
    } catch { return null; }
  }));

  const validAssets = assets.filter(Boolean);
  if (validAssets.length === 0) return;

  // Save to IndexedDB for offline/extension history
  const db = await openDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    // Tag each entry with the user's email so history is user-specific
    tx.objectStore(STORE_NAME).add({
      timestamp: Date.now(),
      email: _authEmail,
      subject: meta.subject || '',
      prompt: meta.prompt || '',
      styleDescriptors: meta.styleDescriptors || '',
      sourcePageUrl: meta.pageUrl || '',
      referenceUrls: Array.isArray(meta.referenceUrls) ? meta.referenceUrls : [],
      sourceUrls: imageUrls,
      assets: validAssets,
    });
  });

  // Also sync to Supabase for web dashboard access
  saveToSupabase(validAssets.map(asset => asset.buffer), meta.subject || '').catch(() => { /* non-fatal */ });

  // Prune oldest entries for THIS user only — never touch other users' history
  await new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    const store  = tx.objectStore(STORE_NAME);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const userEntries = allReq.result
        .filter(e => e.email === _authEmail)
        .sort((a, b) => a.timestamp - b.timestamp); // oldest first
      const excess = userEntries.length - MAX_HISTORY;
      if (excess <= 0) return;
      // Delete the oldest `excess` entries for this user
      userEntries.slice(0, excess).forEach(entry => store.delete(entry.id));
    };
  });
}

async function loadHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();
    req.onsuccess = () => {
      const all = req.result;
      // Filter strictly to this user's entries so a shared browser profile
      // never shows generations created under a different account.
      const mine = _authEmail
        ? all.filter(e => e.email === _authEmail)
        : [];
      resolve(mine.reverse());
    };
    req.onerror = () => reject(req.error);
  });
}

let _historyObjectUrls = [];

async function renderHistory() {
  const listEl = document.getElementById('history-list');
  _historyObjectUrls.forEach(u => URL.revokeObjectURL(u));
  _historyObjectUrls = [];
  listEl.innerHTML = '<p class="history-empty" style="padding:16px;text-align:center;color:var(--ink-muted)">Loading…</p>';

  let history;
  try {
    history = await loadHistory();
  } catch {
    listEl.innerHTML = '<p class="history-empty">Could not load history.</p>';
    return;
  }

  if (history.length === 0) {
    listEl.innerHTML = '<p class="history-empty">No generations yet.<br>Your images will appear here.</p>';
    return;
  }

  listEl.innerHTML = '';

  history.forEach(entry => {
    const assets = Array.isArray(entry.assets)
      ? entry.assets
      : Array.isArray(entry.buffers)
        ? entry.buffers.map(buf => ({ buffer: buf, type: 'image/png' }))
        : [];

    if (assets.length === 0) return;

    const coverBlob = new Blob([assets[0].buffer], { type: assets[0].type || 'image/png' });
    const coverUrl  = URL.createObjectURL(coverBlob);
    _historyObjectUrls.push(coverUrl);

    const card = document.createElement('article');
    card.className = 'history-entry';
    card.innerHTML = `
      <div class="history-entry-media" data-history-preview="${escAttr(coverUrl)}">
        <img src="${escAttr(coverUrl)}" alt="">
        <div class="history-count">${assets.length} image${assets.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="history-entry-body">
        <p class="history-entry-title">${escHtml(entry.subject || 'Untitled generation')}</p>
        <p class="history-entry-meta">${formatHistoryDate(entry.timestamp)}</p>
        <div class="history-entry-actions">
          <button class="history-entry-btn primary" type="button">Generate More in This Style</button>
          <button class="history-entry-btn secondary" type="button">Preview</button>
        </div>
      </div>
    `;

    card.querySelector('.history-entry-media')?.addEventListener('click', () => showPreview(coverUrl));
    card.querySelector('.history-entry-btn.secondary')?.addEventListener('click', () => showPreview(coverUrl));
    card.querySelector('.history-entry-btn.primary')?.addEventListener('click', async () => {
      await restoreHistoryStyle(entry);
    });

    listEl.appendChild(card);
  });
}

// ── History panel wiring ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const historyBtn   = document.getElementById('history-btn');
  const historyPanel = document.getElementById('history-panel');
  const historyClose = document.getElementById('history-close');

  historyBtn.addEventListener('click', () => {
    if (!_authToken) {
      // Guest — nudge them to sign in rather than showing someone else's history
      historyPanel.classList.remove('hidden');
      document.getElementById('history-list').innerHTML =
        '<p class="history-empty">Sign in to see your generation history.</p>';
      return;
    }
    historyPanel.classList.toggle('hidden');
    if (!historyPanel.classList.contains('hidden')) renderHistory();
  });
  historyClose.addEventListener('click', () => {
    historyPanel.classList.add('hidden');
    _historyObjectUrls.forEach(u => URL.revokeObjectURL(u));
    _historyObjectUrls = [];
  });
});

// ── Image Preview ─────────────────────────────────────────────────────────────
function showPreview(url, filename = 'tack-image.png') {
  const overlay = document.getElementById('preview-overlay');
  const img     = document.getElementById('preview-img');
  const dlButton = document.getElementById('preview-download');
  if (!overlay || !img) return;
  img.src = url;
  if (dlButton) {
    dlButton.dataset.url = url;
    dlButton.dataset.filename = sanitizeFilename(filename);
  }
  overlay.style.display = 'flex';
}

function renderScannedImages(images, { isPinterest = false, fromCache = false } = {}) {
  if (!Array.isArray(images) || images.length === 0) return;
  imageGrid.innerHTML = '';
  const src = isPinterest ? 'Pinterest data' : 'page';
  setStatus(fromCache
    ? `Showing your last scan from this ${src === 'page' ? 'page' : 'board'} while we refresh…`
    : `${images.length} image${images.length !== 1 ? 's' : ''} from ${src} — tap to select`);
  if (isPinterest) setHint('Scroll down to load more pins, then tap ↻ Rescan');

  images.forEach(img => {
    const item  = document.createElement('div');
    item.className = 'img-item';
    if (selectedUrls.has(img.src)) item.classList.add('selected');
    const thumb = document.createElement('img');
    thumb.src     = img.src;
    thumb.loading = 'lazy';
    thumb.alt     = img.alt || '';
    thumb.onerror = () => { item.style.display = 'none'; };
    const check   = document.createElement('div');
    check.className  = 'img-check';
    check.textContent = '✓';
    item.appendChild(thumb);
    item.appendChild(check);
    item.addEventListener('click', () => toggleSelect(item, img.src));
    imageGrid.appendChild(item);
  });
}

function renderOnboardingCard() {
  if (!onboardingCard) return;
  if (_authToken || _anonUsed) {
    onboardingCard.classList.add('hidden');
    return;
  }
  chrome.storage.local.get([ONBOARDING_KEY]).then(data => {
    if (data[ONBOARDING_KEY]) {
      onboardingCard.classList.add('hidden');
      return;
    }
    onboardingCard.innerHTML = `
      <h3>Your selected images blend together automatically</h3>
      <p>Pick any references you like. Tack combines them equally to build one shared style direction.</p>
      <div class="onboarding-steps">
        <div class="onboarding-step"><strong>1</strong><span>Select the images that feel right.</span></div>
        <div class="onboarding-step"><strong>2</strong><span>Describe what you want to make.</span></div>
        <div class="onboarding-step"><strong>3</strong><span>Generate and refine from there.</span></div>
      </div>
      <div class="onboarding-actions">
        <p>Tip: if a page looks sparse, tap <strong>Rescan</strong> after scrolling.</p>
        <button type="button" class="onboarding-dismiss" data-onboarding-dismiss>Hide</button>
      </div>
    `;
    onboardingCard.classList.remove('hidden');
  }).catch(() => {});
}

function renderStyleMemoryBanner() {
  if (!styleMemoryBanner) return;
  if (!_savedStyleMemory?.referenceUrls?.length) {
    styleMemoryBanner.classList.add('hidden');
    styleMemoryBanner.innerHTML = '';
    return;
  }

  styleMemoryBanner.innerHTML = `
    <div class="style-memory-copy">
      <strong>Using a saved style from History</strong>
      ${_savedStyleMemory.referenceUrls.length} reference image${_savedStyleMemory.referenceUrls.length !== 1 ? 's' : ''} restored.
      ${_savedStyleMemory.subject ? `Originally: “${escHtml(_savedStyleMemory.subject)}”.` : ''}
    </div>
    <button type="button" class="style-memory-clear" data-clear-style-memory>Clear</button>
  `;
  styleMemoryBanner.classList.remove('hidden');
}

function clearSavedStyleMemory() {
  const memoryUrls = new Set(_savedStyleMemory?.referenceUrls || []);
  memoryUrls.forEach(url => selectedUrls.delete(url));
  _savedStyleMemory = null;
  renderStyleMemoryBanner();
  updateGenerateBtn();
  saveWorkspaceState().catch(() => {});
}

async function restoreHistoryStyle(entry) {
  const referenceUrls = Array.isArray(entry.referenceUrls) && entry.referenceUrls.length
    ? entry.referenceUrls
    : Array.isArray(entry.sourceUrls)
      ? entry.sourceUrls
      : [];

  if (referenceUrls.length === 0) return;

  selectedUrls.clear();
  referenceUrls.forEach(url => selectedUrls.add(url));
  _savedStyleMemory = {
    referenceUrls,
    subject: entry.subject || '',
    prompt: entry.prompt || '',
    styleDescriptors: entry.styleDescriptors || '',
  };
  if (entry.subject && !subjectInput.value.trim()) subjectInput.value = entry.subject;
  document.getElementById('history-panel')?.classList.add('hidden');
  renderStyleMemoryBanner();
  updateGenerateBtn();
  await saveWorkspaceState();
  trackEvent('history_style_restored', { count: referenceUrls.length });
}

function restoreWorkspaceUI() {
  if (!_pendingWorkspace) return;
  if (_pendingWorkspace.subject) subjectInput.value = _pendingWorkspace.subject;
  _savedStyleMemory = _pendingWorkspace.savedStyleMemory || null;
  renderStyleMemoryBanner();
  if (_pendingWorkspace.resultData?.images?.length) {
    _lastResultData = _pendingWorkspace.resultData;
    renderResults(_pendingWorkspace.resultData);
  }
}

function applyPendingPageSelection() {
  if (!_pendingWorkspace?.pageUrl || _pendingWorkspace.pageUrl !== _currentPageUrl) return;
  (_pendingWorkspace.selectedUrls || []).forEach(url => selectedUrls.add(url));
}

function extractWorkspaceState(store, pageUrl) {
  const scoped = store?.[getAccountScope()];
  if (!scoped) return null;
  if (Date.now() - (scoped.savedAt || 0) > WORKSPACE_TTL_MS) return null;
  if (scoped.pageUrl && pageUrl && scoped.pageUrl !== pageUrl && !scoped.savedStyleMemory) {
    return { ...scoped, selectedUrls: [] };
  }
  return scoped;
}

async function saveWorkspaceState() {
  const storeResp = await chrome.storage.local.get([WORKSPACE_KEY]);
  const store = storeResp[WORKSPACE_KEY] || {};
  const scope = getAccountScope();
  const shouldClear = !subjectInput.value.trim()
    && !_lastResultData?.images?.length
    && !_savedStyleMemory?.referenceUrls?.length
    && selectedUrls.size === 0;

  if (shouldClear) {
    delete store[scope];
    await chrome.storage.local.set({ [WORKSPACE_KEY]: store });
    return;
  }

  store[scope] = {
    savedAt: Date.now(),
    pageUrl: _currentPageUrl || '',
    subject: subjectInput.value.trim(),
    selectedUrls: [...selectedUrls],
    savedStyleMemory: _savedStyleMemory,
    resultData: _lastResultData,
  };
  await chrome.storage.local.set({ [WORKSPACE_KEY]: store });
}

async function clearWorkspaceState(scope = getAccountScope()) {
  const storeResp = await chrome.storage.local.get([WORKSPACE_KEY]);
  const store = storeResp[WORKSPACE_KEY] || {};
  delete store[scope];
  await chrome.storage.local.set({ [WORKSPACE_KEY]: store });
}

async function loadPendingWorkspaceState() {
  const storedWorkspace = await chrome.storage.local.get([WORKSPACE_KEY]);
  return extractWorkspaceState(storedWorkspace[WORKSPACE_KEY], _currentPageUrl);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getCachedScan(url) {
  if (!url) return null;
  const data = await chrome.storage.local.get([SCAN_CACHE_KEY]);
  const cache = data[SCAN_CACHE_KEY];
  if (!cache || cache.url !== url) return null;
  if (Date.now() - (cache.savedAt || 0) > SCAN_CACHE_TTL_MS) return null;
  return Array.isArray(cache.images) ? cache.images : null;
}

async function setCachedScan(url, images) {
  if (!url || !Array.isArray(images)) return;
  await chrome.storage.local.set({
    [SCAN_CACHE_KEY]: {
      url,
      images: images.slice(0, 120),
      savedAt: Date.now(),
    },
  });
}

function renderGeneratingState() {
  stopGenerationProgress();
  const steps = [
    'Reading the visual language of your selections…',
    'Blending those references into one shared style direction…',
    'Writing prompts and generating images…',
    'Finishing the final images…',
  ];
  let index = 0;
  resultsEl.className = '';
  resultsEl.innerHTML = `
    <div class="loading-msg">
      <div class="spinner"></div><br>
      <span id="generation-progress-copy">${steps[0]}</span><br>
      <small style="color:var(--ink-muted);margin-top:6px;display:block">Usually ready in 30–60 seconds</small>
    </div>`;
  _generationProgressTimer = setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    const copy = document.getElementById('generation-progress-copy');
    if (copy) copy.textContent = steps[index];
  }, 9000);
}

function stopGenerationProgress() {
  if (_generationProgressTimer) {
    clearInterval(_generationProgressTimer);
    _generationProgressTimer = null;
  }
}

function getAccountScope() {
  return _authEmail ? `user:${_authEmail}` : 'guest';
}

function formatHistoryDate(timestamp) {
  if (!timestamp) return 'Saved';
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function trackEvent(name, payload = {}) {
  _telemetryQueue.push({
    name,
    payload,
    scope: getAccountScope(),
    pageUrl: _currentPageUrl || '',
    timestamp: Date.now(),
  });
  if (_telemetryFlushTimer) return;
  _telemetryFlushTimer = setTimeout(flushTelemetryQueue, 1200);
}

async function flushTelemetryQueue() {
  _telemetryFlushTimer = null;
  if (_telemetryQueue.length === 0) return;
  const batch = _telemetryQueue.splice(0, _telemetryQueue.length);
  try {
    const current = await chrome.storage.local.get([EVENT_LOG_KEY]);
    const merged = [...(current[EVENT_LOG_KEY] || []), ...batch].slice(-100);
    await chrome.storage.local.set({ [EVENT_LOG_KEY]: merged });
  } catch {
    console.info('[tack] telemetry queue dropped', batch);
  }
}

function hidePreview() {
  const overlay = document.getElementById('preview-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Wire up preview close — X button, clicking the image, and Escape key
document.addEventListener('DOMContentLoaded', () => {
  const overlay      = document.getElementById('preview-overlay');
  const previewImg   = document.getElementById('preview-img');
  const previewClose = document.getElementById('preview-close');
  const previewDownload = document.getElementById('preview-download');

  if (previewClose) previewClose.addEventListener('click', hidePreview);
  if (previewImg)   previewImg.addEventListener('click', hidePreview);
  if (previewDownload) {
    previewDownload.addEventListener('click', e => {
      e.stopPropagation();
      downloadAsPng(previewDownload.dataset.url, previewDownload.dataset.filename);
    });
  }
  if (overlay) {
    overlay.addEventListener('click', e => {
      // Close if clicking the backdrop (not the image or buttons)
      if (e.target === overlay) hidePreview();
    });
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hidePreview();
});
