'use strict';

const API_URL  = 'https://pinstyle.co/api/analyze';
const MIN_SIZE = 200; // px — filter out nav icons / UI chrome

// ── Supabase config (replace with your project values) ───────────────────────
// Find these in your Supabase dashboard → Project Settings → API
const SUPABASE_URL      = 'https://sbdowcielgtcfholfyry.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG93Y2llbGd0Y2Zob2xmeXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjkwNzMsImV4cCI6MjA5MDI0NTA3M30.3dUuwXB8kcAbKvEWWMpvyrXhcdLx1x8x4wKxp3UY4Kk';
const FREE_TRIAL_LIMIT  = 3;

const selectedUrls = new Set();

// ── Auth state ────────────────────────────────────────────────────────────────
let _authToken        = null;
let _authEmail        = null;
let _generationsUsed  = 0;
let _monthlyUsed      = 0;
let _monthlyResetAt   = null;
let _plan             = 'free'; // 'free' | 'pro' | 'unlimited'

// ── DOM refs ─────────────────────────────────────────────────────────────────
const imageGrid    = document.getElementById('image-grid');
const statusEl     = document.getElementById('status');
const refreshBtn   = document.getElementById('refresh-btn');
const generateBtn  = document.getElementById('generate-btn');
const subjectInput = document.getElementById('subject-input');
const resultsEl    = document.getElementById('results');
const trialBadge   = document.getElementById('trial-badge');
const authScreen   = document.getElementById('auth-screen');

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  refreshBtn.addEventListener('click', loadImages);
  generateBtn.addEventListener('click', generate);
  subjectInput.addEventListener('input', updateGenerateBtn);

  // Auth form wiring
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
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Check for existing session
  await initAuth();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

async function initAuth() {
  const stored = await chrome.storage.local.get(['ps_token', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
  if (stored.ps_token) {
    // Validate the stored token is still good
    const ok = await validateToken(stored.ps_token);
    if (ok) {
      _authToken       = stored.ps_token;
      _authEmail       = stored.ps_email   || '';
      _generationsUsed = stored.ps_used    || 0;
      _monthlyUsed     = stored.ps_monthly || 0;
      _monthlyResetAt  = stored.ps_reset   || null;
      _plan            = stored.ps_plan    || 'free';
      // Always fetch latest plan from Supabase in case they upgraded
      await fetchPlan();
      showMainUI();
      return;
    }
    // Token expired — clear it
    await chrome.storage.local.remove(['ps_token', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
  }
  showAuthScreen();
}

// Fetch current plan + usage from Supabase and update local state
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

function showAuthScreen() {
  authScreen.classList.remove('hidden');
}

function showMainUI() {
  authScreen.classList.add('hidden');
  updateTrialBadge();
  loadImages();
}

const PRO_MONTHLY_LIMIT = 120;

function updateTrialBadge() {
  const upgradeBase = `https://pinstyle.co/upgrade${_authEmail ? '?email=' + encodeURIComponent(_authEmail) : ''}`;
  const btnHtml = `<button id="already-upgraded-btn" style="font-size:10px;color:var(--ink-muted);background:none;border:1px solid var(--border);border-radius:10px;padding:2px 7px;cursor:pointer;margin-left:4px;">Already upgraded?</button>`;

  // ── Unlimited plan ──
  if (_plan === 'unlimited') {
    trialBadge.className = 'trial-badge';
    trialBadge.innerHTML = `✦ <strong>Unlimited</strong> — no monthly limit`;
    generateBtn.disabled = false;
    generateBtn.title    = '';
    return;
  }

  // ── Pro plan ──
  if (_plan === 'pro') {
    const remaining = PRO_MONTHLY_LIMIT - _monthlyUsed;
    if (remaining <= 0) {
      trialBadge.className = 'trial-badge exhausted';
      const resetDate = _monthlyResetAt
        ? new Date(_monthlyResetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'next month';
      const unlimitedUrl = upgradeBase + (_authEmail ? '&current=pro' : '?current=pro');
      trialBadge.innerHTML = `Monthly limit reached — <a href="${unlimitedUrl}" target="_blank" rel="noopener" style="color:var(--red);font-weight:500;text-decoration:underline;cursor:pointer;">upgrade to Unlimited</a> or resets ${resetDate} ${btnHtml}`;
      document.getElementById('already-upgraded-btn')?.addEventListener('click', refreshPlanStatus);
      generateBtn.disabled = true;
      generateBtn.title    = 'Monthly limit reached. Upgrade to Unlimited for no limits.';
    } else {
      trialBadge.className = 'trial-badge';
      trialBadge.innerHTML = `<strong>${_monthlyUsed}</strong> / ${PRO_MONTHLY_LIMIT} generations this month`;
      generateBtn.title    = '';
    }
    return;
  }

  // ── Free plan ──
  const remaining = FREE_TRIAL_LIMIT - _generationsUsed;
  if (remaining <= 0) {
    trialBadge.className = 'trial-badge exhausted';
    trialBadge.innerHTML = `Trial complete — <a href="${upgradeBase}" target="_blank" rel="noopener" style="color:var(--red);font-weight:500;text-decoration:underline;cursor:pointer;">upgrade to Pro</a> to keep generating ${btnHtml}`;
    document.getElementById('already-upgraded-btn')?.addEventListener('click', refreshPlanStatus);
    generateBtn.disabled = true;
    generateBtn.title    = 'Upgrade to Pro to generate more images';
  } else {
    trialBadge.className = 'trial-badge';
    trialBadge.innerHTML = `<strong>${remaining}</strong> free generation${remaining !== 1 ? 's' : ''} remaining`;
  }
}

// Called by the "Already upgraded?" button — re-checks Supabase
async function refreshPlanStatus() {
  const btn = document.getElementById('already-upgraded-btn');
  if (btn) { btn.textContent = 'Checking…'; btn.disabled = true; }
  await fetchPlan();
  updateTrialBadge();
  updateGenerateBtn();
}

async function logout() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${_authToken}`, 'apikey': SUPABASE_ANON_KEY },
    });
  } catch { /* best-effort */ }
  _authToken = _authEmail = null;
  _generationsUsed = 0;
  _monthlyUsed = 0;
  _monthlyResetAt = null;
  _plan = 'free';
  await chrome.storage.local.remove(['ps_token', 'ps_email', 'ps_used', 'ps_plan', 'ps_monthly', 'ps_reset']);
  showAuthScreen();
}

// ── Auth form ─────────────────────────────────────────────────────────────────

let _authMode = 'login'; // 'login' | 'signup'

function switchAuthTab(tab) {
  _authMode = tab;
  document.querySelectorAll('.auth-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('auth-submit').textContent =
    tab === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').textContent = '';
}

async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl  = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit');

  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
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

    _authToken       = data.access_token;
    _authEmail       = email;
    _generationsUsed = 0;
    _monthlyUsed     = 0;
    _monthlyResetAt  = null;
    _plan            = 'free';

    await chrome.storage.local.set({
      ps_token:   _authToken,
      ps_email:   _authEmail,
      ps_used:    0,
      ps_plan:    'free',
      ps_monthly: 0,
      ps_reset:   null,
    });

    // Fetch real plan + usage from Supabase before showing UI
    await fetchPlan();

    showMainUI();

  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong. Please try again.';
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
  if (!resp.ok) throw new Error(data.error_description || data.msg || 'Login failed');
  return data;
}

async function supabaseSignup(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.msg || 'Sign up failed');
  // Supabase returns the session directly on signup if email confirmation is off
  if (!data.access_token) {
    throw new Error('Check your email to confirm your account, then sign in.');
  }
  return data;
}

// ── Scan current tab for images ───────────────────────────────────────────────
async function loadImages() {
  imageGrid.innerHTML = '';
  setStatus('Scanning page…');
  setHint('');
  selectedUrls.clear();
  updateGenerateBtn();

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    setStatus('Could not access the current tab.');
    return;
  }

  const isPinterest = tab.url && tab.url.includes('pinterest.com');

  // Auto-scroll to load more images before scanning (non-Pinterest only)
  if (!isPinterest) {
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
    console.warn('[PinStyle] executeScript failed:', err);
    return;
  }

  const images = results?.[0]?.result ?? [];

  if (images.length === 0) {
    imageGrid.innerHTML = isPinterest
      ? `<div class="empty-state">
           <strong>No pins found yet</strong>
           Scroll down the board so pins load, then tap Rescan.
         </div>`
      : `<div class="empty-state">
           <strong>No large images found</strong>
           Try scrolling so images load, then tap Rescan.
         </div>`;
    setStatus('');
    return;
  }

  const src = isPinterest ? 'Pinterest data' : 'page';
  setStatus(`${images.length} image${images.length !== 1 ? 's' : ''} from ${src} — tap to select`);

  if (isPinterest) {
    setHint('Scroll down to load more pins, then tap ↻ Rescan');
  }

  images.forEach(img => {
    const item = document.createElement('div');
    item.className = 'img-item';

    const thumb = document.createElement('img');
    thumb.src = img.src;
    thumb.loading = 'lazy';
    thumb.alt = img.alt || '';
    thumb.onerror = () => { item.style.display = 'none'; };

    const check = document.createElement('div');
    check.className = 'img-check';
    check.textContent = '✓';

    item.appendChild(thumb);
    item.appendChild(check);
    item.addEventListener('click', () => toggleSelect(item, img.src));
    imageGrid.appendChild(item);
  });
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

// ── Select / deselect ────────────────────────────────────────────────────────
function toggleSelect(item, src) {
  if (selectedUrls.has(src)) {
    selectedUrls.delete(src);
    item.classList.remove('selected');
  } else {
    selectedUrls.add(src);
    item.classList.add('selected');
  }
  updateGenerateBtn();
}

function updateGenerateBtn() {
  const trialExhausted   = _plan === 'free'      && _generationsUsed >= FREE_TRIAL_LIMIT;
  const monthlyExhausted = _plan === 'pro'        && _monthlyUsed     >= PRO_MONTHLY_LIMIT;
  generateBtn.disabled =
    trialExhausted ||
    monthlyExhausted ||
    selectedUrls.size === 0 ||
    subjectInput.value.trim().length === 0;
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const subject = subjectInput.value.trim();
  if (!subject || selectedUrls.size === 0) return;

  // Guard: if any limit is exhausted, show badge and bail
  const upgradeBase = `https://pinstyle.co/upgrade${_authEmail ? '?email=' + encodeURIComponent(_authEmail) : ''}`;
  if (_plan === 'free' && _generationsUsed >= FREE_TRIAL_LIMIT) {
    updateTrialBadge();
    return;
  }
  if (_plan === 'pro' && _monthlyUsed >= PRO_MONTHLY_LIMIT) {
    updateTrialBadge();
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  resultsEl.className = '';
  resultsEl.innerHTML = `
    <div class="loading-msg">
      <div class="spinner"></div><br>
      Analyzing style and generating images…<br>
      <small style="color:var(--ink-muted);margin-top:6px;display:block">This takes about 30–60 seconds</small>
    </div>`;

  let pageUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageUrl = tab.url || '';
  } catch { /* optional */ }

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${_authToken}`,
      },
      body: JSON.stringify({ imageUrls: [...selectedUrls], subject, pageUrl }),
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 401) {
      // Session expired — force re-login
      _authToken = null;
      await chrome.storage.local.remove(['ps_token', 'ps_email', 'ps_used']);
      showAuthScreen();
      return;
    }

    if (resp.status === 402) {
      // Limit exhausted (free trial or pro monthly)
      const errData = data || {};
      if (errData.error === 'pro_limit_reached') {
        _monthlyUsed = PRO_MONTHLY_LIMIT;
        await chrome.storage.local.set({ ps_monthly: PRO_MONTHLY_LIMIT });
        updateTrialBadge();
        const unlimitedUrl = `https://pinstyle.co/upgrade?email=${encodeURIComponent(_authEmail)}&current=pro`;
        resultsEl.className = '';
        resultsEl.innerHTML = `
          <div class="result-block" style="text-align:center;padding:24px">
            <p style="font-size:13px;color:var(--ink);margin-bottom:12px">
              You've reached your 120 generation monthly limit.
            </p>
            <a href="${unlimitedUrl}" target="_blank" rel="noopener"
               style="display:inline-block;background:var(--red);color:#fff;font-size:13px;font-weight:500;
                      padding:10px 24px;border-radius:var(--radius);text-decoration:none;
                      box-shadow:0 4px 16px rgba(224,61,47,0.3)">
              Upgrade to Unlimited →
            </a>
          </div>`;
      } else {
        _generationsUsed = FREE_TRIAL_LIMIT;
        await chrome.storage.local.set({ ps_used: FREE_TRIAL_LIMIT });
        updateTrialBadge();
        const upgradeUrl = `https://pinstyle.co/upgrade${_authEmail ? '?email=' + encodeURIComponent(_authEmail) : ''}`;
        resultsEl.className = '';
        resultsEl.innerHTML = `
          <div class="result-block" style="text-align:center;padding:24px">
            <p style="font-size:13px;color:var(--ink);margin-bottom:12px">
              You've used all ${FREE_TRIAL_LIMIT} free generations.
            </p>
            <a href="${upgradeUrl}" target="_blank" rel="noopener"
               style="display:inline-block;background:var(--red);color:#fff;font-size:13px;font-weight:500;
                      padding:10px 24px;border-radius:var(--radius);text-decoration:none;
                      box-shadow:0 4px 16px rgba(224,61,47,0.3)">
              Upgrade to Pro →
            </a>
          </div>`;
      }
      return;
    }

    if (!resp.ok) {
      throw new Error(data.error || `API returned ${resp.status}`);
    }

    renderResults(data);

    // Update usage count from API response
    if (data.usage) {
      _generationsUsed = data.usage.used;
      if (data.usage.monthly_used !== undefined) _monthlyUsed = data.usage.monthly_used;
      await chrome.storage.local.set({ ps_used: _generationsUsed, ps_monthly: _monthlyUsed });
      updateTrialBadge();
    }

    // Save images to history (fetch blobs while URLs are still valid)
    if (data.images && data.images.length > 0) {
      saveToHistory(data.images).catch(e => console.warn('[PinStyle] history save failed:', e));
    }

  } catch (err) {
    resultsEl.innerHTML = `<p class="error-msg">⚠ ${err.message}</p>`;
  } finally {
    generateBtn.textContent = 'Generate Images';
    updateGenerateBtn();
  }
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(data) {
  const { style, prompt, images } = data;
  let html = '';

  if (style) {
    const swatches = (style.colors || [])
      .map((hex, i) => `<div class="swatch" style="background:${hex}" title="${style.colorNames?.[i] || hex}"></div>`)
      .join('');
    const tags = [...(style.mood || []), ...(style.styleKeywords || [])]
      .slice(0, 8)
      .map(t => `<span class="tag">${t}</span>`)
      .join('');

    html += `
      <div class="result-block">
        <h3>Style Analysis</h3>
        ${swatches ? `<div class="swatches">${swatches}</div>` : ''}
        ${style.aesthetic ? `<p>${style.aesthetic}</p>` : ''}
        ${tags ? `<div class="tags" style="margin-top:8px">${tags}</div>` : ''}
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
            <div class="gen-img-wrap" onclick="showPreview('${escAttr(url)}')">
              <img src="${escAttr(url)}" alt="Generated image" loading="lazy">
              <div class="img-actions" onclick="event.stopPropagation()">
                <button class="download-btn" data-url="${escAttr(url)}" data-filename="pinstyle-${i+1}.png">
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

  // Download as PNG buttons
  resultsEl.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadAsPng(btn.dataset.url, btn.dataset.filename));
  });

  // Copy prompt button
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
    const resp = await fetch(url);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(pngBlob => {
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(pngBlob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objUrl);
      }, 'image/png');
    };
    img.src = objUrl;
  } catch (err) {
    console.error('[PinStyle] download error:', err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg) {
  statusEl.textContent = msg;
}

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

// ── History Archive (IndexedDB) ───────────────────────────────────────────────
// Images are fetched and stored as binary blobs so they persist indefinitely
// even after the original API URLs expire. Capped at MAX_HISTORY sessions.

const DB_NAME     = 'pinstyle_db';
const DB_VERSION  = 1;
const STORE_NAME  = 'history';
const MAX_HISTORY = 100; // maximum number of generation sessions to keep

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // autoIncrement key: lower = older, higher = newer
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function saveToHistory(imageUrls) {
  // Download all images as ArrayBuffers while the (temporary) URLs are still valid
  const buffers = await Promise.all(imageUrls.map(async url => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.arrayBuffer();
    } catch { return null; }
  }));

  const validBuffers = buffers.filter(Boolean);
  if (validBuffers.length === 0) return;

  const db = await openDB();

  // Add new entry
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    tx.objectStore(STORE_NAME).add({ timestamp: Date.now(), buffers: validBuffers });
  });

  // Trim oldest entries to stay within MAX_HISTORY
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);

    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count <= MAX_HISTORY) return;

      let toDelete = count - MAX_HISTORY;
      const cursorReq = store.openCursor(); // ascending = oldest first
      cursorReq.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor && toDelete > 0) {
          cursor.delete();
          toDelete--;
          cursor.continue();
        }
      };
    };
  });
}

async function loadHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result.reverse()); // newest first
    req.onerror   = () => reject(req.error);
  });
}

// Object URLs created for history images (revoked when panel closes)
let _historyObjectUrls = [];

async function renderHistory() {
  const listEl = document.getElementById('history-list');

  // Revoke any previous object URLs to free memory
  _historyObjectUrls.forEach(u => URL.revokeObjectURL(u));
  _historyObjectUrls = [];

  listEl.innerHTML = '<p class="history-empty" style="padding:16px;text-align:center;color:var(--ink-muted)">Loading…</p>';

  let history;
  try {
    history = await loadHistory();
  } catch (e) {
    listEl.innerHTML = '<p class="history-empty">Could not load history.</p>';
    return;
  }

  if (history.length === 0) {
    listEl.innerHTML = '<p class="history-empty">No generations yet.<br>Your images will appear here.</p>';
    return;
  }

  // Build a flat grid of every generated image, newest session first
  listEl.innerHTML = '';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:10px';

  history.forEach(entry => {
    (entry.buffers || []).forEach(buf => {
      const blob = new Blob([buf], { type: 'image/png' });
      const url  = URL.createObjectURL(blob);
      _historyObjectUrls.push(url);

      const wrap = document.createElement('div');
      wrap.style.cssText = 'border-radius:8px;overflow:hidden;cursor:pointer;aspect-ratio:1;background:#f0ebe8';

      const img = document.createElement('img');
      img.src   = url;
      img.alt   = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      img.addEventListener('click', () => showPreview(url));

      wrap.appendChild(img);
      grid.appendChild(wrap);
    });
  });

  listEl.appendChild(grid);
}

// ── History panel wiring ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const historyBtn   = document.getElementById('history-btn');
  const historyPanel = document.getElementById('history-panel');
  const historyClose = document.getElementById('history-close');

  historyBtn.addEventListener('click', () => {
    historyPanel.classList.toggle('hidden');
    if (!historyPanel.classList.contains('hidden')) renderHistory();
  });

  historyClose.addEventListener('click', () => {
    historyPanel.classList.add('hidden');
    // Free object URLs when panel is closed
    _historyObjectUrls.forEach(u => URL.revokeObjectURL(u));
    _historyObjectUrls = [];
  });
});

// ── Image Preview ─────────────────────────────────────────────────────────────
function showPreview(url) {
  const overlay = document.getElementById('preview-overlay');
  const img = document.getElementById('preview-img');
  if (!overlay || !img) return;
  img.src = url;
  overlay.style.display = 'flex';
}
