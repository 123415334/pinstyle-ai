'use strict';

const API_URL  = 'https://pinstyle-ai.vercel.app/api/analyze';
const MIN_SIZE = 200; // px — filter out icons / UI elements

const selectedUrls = new Set();

// ── DOM refs ─────────────────────────────────────────────────────────────────
const imageGrid    = document.getElementById('image-grid');
const statusEl     = document.getElementById('status');
const refreshBtn   = document.getElementById('refresh-btn');
const generateBtn  = document.getElementById('generate-btn');
const subjectInput = document.getElementById('subject-input');
const resultsEl    = document.getElementById('results');

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  refreshBtn.addEventListener('click', loadImages);
  generateBtn.addEventListener('click', generate);
  subjectInput.addEventListener('input', updateGenerateBtn);
  loadImages();
});

// ── Scan current tab for large images ────────────────────────────────────────
async function loadImages() {
  imageGrid.innerHTML = '';
  statusEl.textContent = 'Scanning page…';
  selectedUrls.clear();
  updateGenerateBtn();

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    setStatus('Could not access the current tab.');
    return;
  }

  // chrome.scripting.executeScript runs the function in the page context.
  // Must be self-contained — no references to outer scope.
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
    imageGrid.innerHTML = `
      <div class="empty-state">
        <strong>No large images found</strong>
        Try scrolling down so images load, then rescan.
      </div>`;
    setStatus('');
    return;
  }

  setStatus(`${images.length} image${images.length !== 1 ? 's' : ''} found — tap to select`);

  images.forEach(img => {
    const item = document.createElement('div');
    item.className = 'img-item';

    const thumb = document.createElement('img');
    thumb.src = img.src;
    thumb.loading = 'lazy';
    thumb.alt = img.alt || '';
    // Prevent broken-image icons from cluttering the grid
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

// Runs inside the page context — must be a pure function with no outer deps.
function collectImages(minSize) {
  const seen    = new Set();
  const results = [];

  document.querySelectorAll('img').forEach(img => {
    const src = img.src;
    if (!src || src.startsWith('data:') || seen.has(src)) return;

    // Prefer naturalWidth/Height (actual image dimensions) over layout size
    const w = img.naturalWidth  || img.getBoundingClientRect().width;
    const h = img.naturalHeight || img.getBoundingClientRect().height;
    if (w < minSize || h < minSize) return;

    seen.add(src);
    results.push({ src, width: w, height: h, alt: img.alt || '' });
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
  generateBtn.disabled =
    selectedUrls.size === 0 || subjectInput.value.trim().length === 0;
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const subject = subjectInput.value.trim();
  if (!subject || selectedUrls.size === 0) return;

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  resultsEl.className = '';
  resultsEl.innerHTML = `
    <div class="loading-msg">
      <div class="spinner"></div><br>
      Analyzing style and generating images…<br>
      <small style="color:var(--ink-muted);margin-top:6px;display:block">This takes about 30–60 seconds</small>
    </div>`;

  // Get the current tab URL for context
  let pageUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageUrl = tab.url || '';
  } catch { /* optional */ }

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls: [...selectedUrls],
        subject,
        pageUrl,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `API returned ${resp.status}`);
    }

    const data = await resp.json();
    renderResults(data);

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

  // ── Style analysis ──
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

  // ── Image prompt ──
  if (prompt) {
    html += `
      <div class="result-block">
        <h3>Image Prompt</h3>
        <p class="prompt-text">${escHtml(prompt)}</p>
        <button class="btn-copy" data-prompt="${escAttr(prompt)}">Copy prompt</button>
      </div>`;
  }

  // ── Generated images ──
  if (images && images.length > 0) {
    const imgTags = images
      .map(url => `<img src="${escAttr(url)}" alt="Generated image" loading="lazy">`)
      .join('');
    html += `
      <div class="result-block">
        <h3>Generated Images</h3>
        <div class="gen-images">${imgTags}</div>
      </div>`;
  }

  if (!html) {
    resultsEl.innerHTML = '<p class="error-msg">No results returned — please try again.</p>';
    return;
  }

  resultsEl.innerHTML = html;

  // Wire copy buttons
  resultsEl.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.prompt || '').then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy prompt'; }, 2000);
      });
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg) { statusEl.textContent = msg; }

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escAttr(str) {
  return str.replace(/"/g, '&quot;');
}
