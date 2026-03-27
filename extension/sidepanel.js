'use strict';

const API_URL  = 'https://pinstyle.co/api/analyze';
const MIN_SIZE = 200; // px — filter out nav icons / UI chrome

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

  // Auto-scroll to load more images before scanning
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return new Promise(resolve => {
          let scrolls = 0;
          const maxScrolls = 3;
          const interval = setInterval(() => {
            window.scrollBy(0, window.innerHeight);
            scrolls++;
            if (scrolls >= maxScrolls) {
              clearInterval(interval);
              setTimeout(resolve, 800);
            }
          }, 400);
        });
      },
    });
  } catch (_) {}

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

    // Strategy A: Parse __PWS_DATA__ JSON data island.
    // Pinterest embeds its initial server-side data here. Pins that haven't
    // scrolled into view yet won't be in the DOM but ARE in this JSON.
    try {
      const scriptEl = document.getElementById('__PWS_DATA__');
      if (scriptEl) {
        const raw = scriptEl.textContent.trim()
          .replace(/^[^\[{]*/, '')   // strip any "window.__PWS_DATA__ = " prefix
          .replace(/[;\s]*$/, '');   // strip trailing semicolon

        const pws = JSON.parse(raw);

        // Walk the entire JSON tree looking for pin image objects.
        // A pin has an `images` field whose values have a `.url` on i.pinimg.com.
        function walk(obj, depth) {
          if (!obj || typeof obj !== 'object' || depth > 25) return;

          if (obj.images && typeof obj.images === 'object') {
            const validKey = Object.keys(obj.images).find(k =>
              obj.images[k] &&
              typeof obj.images[k].url === 'string' &&
              obj.images[k].url.includes('i.pinimg.com')
            );
            if (validKey) {
              // Prefer highest quality: 736x > 474x > originals > orig > 236x
              const best = (
                obj.images['736x']      ||
                obj.images['474x']      ||
                obj.images['originals'] ||
                obj.images['orig']      ||
                obj.images['236x']      ||
                obj.images[validKey]
              );
              // Normalise to 736x URL regardless of which size we found
              const url = best.url.replace(/\/\d+x\//, '/736x/');
              add(url, best.width || 736, best.height || 736, '');
              return; // don't recurse further into this pin's subtree
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
    } catch (_) {
      // PWS_DATA unavailable or unparseable — fall through to DOM scan
    }

    // Strategy B: Scan rendered <img> tags for i.pinimg.com URLs.
    // Catches any pins that loaded after the initial page render
    // (i.e. pins the user has already scrolled to).
    document.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src;
      if (!src || !src.includes('i.pinimg.com')) return;

      const w = img.naturalWidth  || img.getBoundingClientRect().width;
      const h = img.naturalHeight || img.getBoundingClientRect().height;
      if (w < minSize || h < minSize) return;

      // Normalise to 736x for best quality
      const upgraded = src.replace(/\/\d+x\//, '/736x/');
      add(upgraded, Math.max(w, 736), Math.max(h, 736), img.alt || '');
    });

    return results;
  }

  // ── Generic path (non-Pinterest pages) ────────────────────────────────────
  document.querySelectorAll('img').forEach(img => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) return;

    const w = img.naturalWidth  || img.getBoundingClientRect().width;
    const h = img.naturalHeight || img.getBoundingClientRect().height;
    if (w < minSize || h < minSize) return;

    add(src, w, h, img.alt || '');
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

  let pageUrl = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    pageUrl = tab.url || '';
  } catch { /* optional */ }

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrls: [...selectedUrls], subject, pageUrl }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `API returned ${resp.status}`);
    }

    const data = await resp.json();
    renderResults(data);
    if (data.images && data.images.length > 0) {
      await saveToHistory(subject, data.images, data.prompt || subject);
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
              <a class="download-btn" href="${escAttr(url)}" download="pinstyle-${i+1}.png" target="_blank" onclick="event.stopPropagation()">
                ↓ Download
              </a>
            </div>`).join('')}
        </div>
      </div>`;
  }

  if (!html) {
    resultsEl.innerHTML = '<p class="error-msg">No results returned — please try again.</p>';
    return;
  }

  resultsEl.innerHTML = html;

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

// ── History Archive ───────────────────────────────────────────────────────────
const HISTORY_KEY = 'pinstyle_history';
const MAX_HISTORY = 50;

async function saveToHistory(subject, images, prompt) {
  const entry = {
    id: Date.now(),
    subject,
    prompt,
    images,
    date: new Date().toLocaleDateString(),
  };
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const history = result[HISTORY_KEY] || [];
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.pop();
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

async function loadHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] || [];
}

async function renderHistory() {
  const history = await loadHistory();
  const listEl = document.getElementById('history-list');

  if (history.length === 0) {
    listEl.innerHTML = '<p class="history-empty">No generations yet.<br>Your images will appear here.</p>';
    return;
  }

  listEl.innerHTML = history.map(entry => `
    <div class="history-entry" data-id="${entry.id}">
      <div class="history-thumbs">
        ${entry.images.map(url => `<img src="${escAttr(url)}" alt="">`).join('')}
      </div>
      <div class="history-meta">
        <span class="history-subject">${escHtml(entry.subject)}</span>
        <span class="history-date">${entry.date}</span>
      </div>
    </div>
  `).join('');

  // Click entry to restore results
  listEl.querySelectorAll('.history-entry').forEach(el => {
    el.addEventListener('click', () => {
      const entry = history.find(h => h.id === parseInt(el.dataset.id));
      if (!entry) return;
      document.getElementById('history-panel').classList.add('hidden');
      resultsEl.className = '';
      resultsEl.style.display = 'block';
      renderResults({ images: entry.images, prompt: entry.prompt });
      setTimeout(() => resultsEl.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  });
}

// Hook up history button
document.addEventListener('DOMContentLoaded', () => {
  const historyBtn = document.getElementById('history-btn');
  const historyPanel = document.getElementById('history-panel');
  const historyClose = document.getElementById('history-close');

  historyBtn.addEventListener('click', () => {
    historyPanel.classList.toggle('hidden');
    if (!historyPanel.classList.contains('hidden')) renderHistory();
  });

  historyClose.addEventListener('click', () => {
    historyPanel.classList.add('hidden');
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
