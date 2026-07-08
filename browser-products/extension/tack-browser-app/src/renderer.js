const DEFAULT_URL = 'https://www.pinterest.com/search/pins/?q=editorial%20product%20photography';
const API_URL = 'https://www.tack.design/api/analyze';
const SUPABASE_URL = 'https://sbdowcielgtcfholfyry.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZG93Y2llbGd0Y2Zob2xmeXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjkwNzMsImV4cCI6MjA5MDI0NTA3M30.3dUuwXB8kcAbKvEWWMpvyrXhcdLx1x8x4wKxp3UY4Kk';
const MIN_SIZE = 200;
const FREE_MONTHLY_LIMIT = 3;
const PRO_MONTHLY_LIMIT = 120;
const STUDIO_MONTHLY_LIMIT = 600;
const DEFAULT_ASPECT_RATIO = '1:1';
const OUTPUT_DIMENSIONS = Object.freeze({
  '16:9': { width: 1600, height: 896 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 896, height: 1600 },
});

const refs = new Map();
const anonymousId = getAnonymousId();

const webview = document.querySelector('#browser-view');
const tabs = document.querySelector('#tabs');
const addressInput = document.querySelector('#address-input');
const addressForm = document.querySelector('#address-form');
const backBtn = document.querySelector('#back-btn');
const forwardBtn = document.querySelector('#forward-btn');
const reloadBtn = document.querySelector('#reload-btn');
const scanBtn = document.querySelector('#scan-btn');
const selectBtn = document.querySelector('#select-btn');
const captureBtn = document.querySelector('#capture-btn');
const openExternalBtn = document.querySelector('#open-external');
const loadingOverlay = document.querySelector('#loading-overlay');
const scanCount = document.querySelector('#scan-count');
const scanNote = document.querySelector('#scan-note');
const referenceList = document.querySelector('#reference-list');
const clearBtn = document.querySelector('#clear-btn');
const subjectInput = document.querySelector('#subject-input');
const generateBtn = document.querySelector('#generate-btn');
const results = document.querySelector('#results');
const resultGrid = document.querySelector('#result-grid');
const captureLayer = document.querySelector('#capture-layer');
const captureRect = document.querySelector('#capture-rect');
const captureInstructions = document.querySelector('#capture-instructions');
const tackPanel = document.querySelector('.tack-panel');
const accountAvatar = document.querySelector('#account-avatar');
const accountEmail = document.querySelector('#account-email');
const accountPlan = document.querySelector('#account-plan');
const accountSigninBtn = document.querySelector('#account-signin-btn');
const accountSignupBtn = document.querySelector('#account-signup-btn');
const accountManageBtn = document.querySelector('#account-manage-btn');
const accountSignoutBtn = document.querySelector('#account-signout-btn');
const accountPlanStat = document.querySelector('#account-plan-stat');
const accountUsageStat = document.querySelector('#account-usage-stat');
const accountSyncStat = document.querySelector('#account-sync-stat');
const accountBrowseShortcut = document.querySelector('#account-browse-shortcut');
const accountLibraryShortcut = document.querySelector('#account-library-shortcut');
const accountWebsiteShortcut = document.querySelector('#account-website-shortcut');
const authBackdrop = document.querySelector('#auth-backdrop');
const authModal = document.querySelector('#auth-modal');
const authClose = document.querySelector('#auth-close');
const authTitle = document.querySelector('#auth-title');
const authSubtitle = document.querySelector('#auth-subtitle');
const authEmailInput = document.querySelector('#auth-email-input');
const authPasswordInput = document.querySelector('#auth-password-input');
const authSubmit = document.querySelector('#auth-submit');
const authMessage = document.querySelector('#auth-message');
const forgotPasswordBtn = document.querySelector('#forgot-password-btn');
const googleAuthBtn = document.querySelector('#google-auth-btn');
const googleAuthCopy = document.querySelector('#google-auth-copy');
const browserShell = document.querySelector('.browser-shell');
const browseView = document.querySelector('#browse-view');
const libraryView = document.querySelector('#library-view');
const accountView = document.querySelector('#account-view');
const accountViewTitle = document.querySelector('#account-view-title');
const accountViewCopy = document.querySelector('#account-view-copy');
const accountSignedOut = document.querySelector('#account-signed-out');
const accountSignedoutSignin = document.querySelector('#account-signedout-signin');
const accountSignedoutSignup = document.querySelector('#account-signedout-signup');
const accountCard = document.querySelector('.account-card');
const accountStats = document.querySelector('.account-stats');
const accountSyncGrid = document.querySelector('.account-sync-grid');
const libraryList = document.querySelector('#library-list');
const libraryRefreshBtn = document.querySelector('#library-refresh-btn');
const libraryOpenWebBtn = document.querySelector('#library-open-web-btn');
const libraryAllTab = document.querySelector('#library-all-tab');
const libraryBoardsTab = document.querySelector('#library-boards-tab');
const libraryCreateBoardBtn = document.querySelector('#library-create-board-btn');
const librarySelectBtn = document.querySelector('#library-select-btn');
const librarySaveBoardBtn = document.querySelector('#library-save-board-btn');
const libraryDeleteBtn = document.querySelector('#library-delete-btn');
const libraryCancelSelectBtn = document.querySelector('#library-cancel-select-btn');
const libraryBoardContext = document.querySelector('#library-board-context');
const libraryBoardBackBtn = document.querySelector('#library-board-back-btn');
const libraryBoardRenameBtn = document.querySelector('#library-board-rename-btn');
const libraryBoardTitle = document.querySelector('#library-board-title');
const libraryBoardSubtitle = document.querySelector('#library-board-subtitle');
const lightbox = document.querySelector('#library-lightbox');
const lightboxImg = document.querySelector('#lightbox-img');
const lightboxClose = document.querySelector('#lightbox-close');
const lightboxPrev = document.querySelector('#lightbox-prev');
const lightboxNext = document.querySelector('#lightbox-next');
const lightboxDownload = document.querySelector('#lightbox-download');
const lightboxMeta = document.querySelector('#lightbox-meta');
const boardModal = document.querySelector('#board-modal');
const boardModalTitle = document.querySelector('#board-modal-title');
const boardModalSub = document.querySelector('#board-modal-sub');
const boardModalList = document.querySelector('#board-modal-list');
const boardModalDivider = document.querySelector('#board-modal-divider');
const boardNameInput = document.querySelector('#board-name-input');
const boardModalError = document.querySelector('#board-modal-error');
const boardModalCancel = document.querySelector('#board-modal-cancel');
const boardModalConfirm = document.querySelector('#board-modal-confirm');
const confirmModal = document.querySelector('#confirm-modal');
const confirmModalEyebrow = document.querySelector('#confirm-modal-eyebrow');
const confirmModalTitle = document.querySelector('#confirm-modal-title');
const confirmModalCopy = document.querySelector('#confirm-modal-copy');
const confirmModalCancel = document.querySelector('#confirm-modal-cancel');
const confirmModalConfirm = document.querySelector('#confirm-modal-confirm');
const railBrowserBtn = document.querySelector('#rail-browser-btn');
const railLibraryBtn = document.querySelector('#rail-library-btn');
const railAccountBtn = document.querySelector('#rail-account-btn');
const railAccountLabel = document.querySelector('#rail-account-label');
const railAccountAvatar = document.querySelector('#rail-account-avatar');
const brandButton = document.querySelector('#brand-button');
const appShell = document.querySelector('.app-shell');
const railCollapseToggle = document.querySelector('#rail-collapse-toggle');
const bookmarksToggle = document.querySelector('#bookmarks-toggle');

const BOOKMARKS_STORAGE_KEY = 'tack-browser-bookmarks';
const RAIL_COLLAPSED_STORAGE_KEY = 'tack-browser-rail-collapsed';
const BOOKMARKS_COLLAPSED_STORAGE_KEY = 'tack-browser-bookmarks-collapsed';
const REFERENCE_IDENTITY_INSTRUCTION = [
  'Reference identity constraint:',
  'Do not reproduce, preserve, or closely imitate any identifiable person from the reference images.',
  'Use people in references only as non-identifying cues for lighting, composition, styling, pose, and era.',
  'Do not add a person unless the user subject explicitly asks for one; if a person is requested, create a new generic, non-identifiable person with a different face and likeness.',
].join(' ');
const DEFAULT_BOOKMARKS = Object.freeze([
  { title: 'Pinterest ideas', url: 'https://www.pinterest.com/search/pins/?q=editorial%20product%20photography' },
  { title: 'Instagram', url: 'https://www.instagram.com/' },
  { title: 'Behance', url: 'https://www.behance.net/search/projects/product%20photography' },
  { title: 'Product site', url: 'https://www.apple.com/shop/' },
]);

let selectionMode = true;
let captureMode = false;
let captureStart = null;
let lastDetected = [];
let aspectRatio = DEFAULT_ASPECT_RATIO;
let activeGenerationController = null;
let generationProgressTimer = null;
let authMode = 'login';
let authToken = null;
let authRefreshToken = null;
let authUserId = null;
let authEmail = '';
let plan = 'free';
let generationsUsed = 0;
let monthlyUsed = 0;
let monthlyResetAt = null;
let libraryGenerations = [];
let libraryImages = [];
let libraryBoards = [];
let libraryBoardItems = [];
let libraryMode = 'all';
let activeBoardId = '';
let librarySelecting = false;
let selectedLibraryKeys = new Set();
let boardModalMode = 'create';
let boardModalSelectedId = '';
let boardModalBoardId = '';
let activeTileSaveKey = '';
let lightboxItems = [];
let lightboxIndex = -1;
let pendingConfirm = null;
let pinterestAuthOpening = false;
let masonryResizeObserver = null;
let masonryResizeTimer = null;
let platformInfo = { platform: 'unknown', isMac: false, isWindows: false, systemName: 'desktop' };

function initPlatform() {
  platformInfo = window.tackDesktop.getPlatform();
  document.body.classList.toggle('platform-mac', Boolean(platformInfo.isMac));
  document.body.classList.toggle('platform-windows', Boolean(platformInfo.isWindows));
  document.body.dataset.platform = platformInfo.platform || 'unknown';
  openExternalBtn.title = 'Open in default browser';
  openExternalBtn.setAttribute('aria-label', 'Open in default browser');
}

function normalizeUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return DEFAULT_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function loadUrl(value) {
  const nextUrl = normalizeUrl(value);
  loadingOverlay.classList.remove('hidden');
  addressInput.value = nextUrl;
  webview.src = nextUrl;
}

function currentUrl() {
  return webview.getURL?.() || addressInput.value;
}

function safeUrl(value) {
  try {
    return new URL(normalizeUrl(value)).href;
  } catch {
    return '';
  }
}

function bookmarkId(url) {
  return `${safeUrl(url)}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function faviconUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function fallbackFaviconUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return '';
  }
}

function loadBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) {
      return saved
        .filter(item => item?.url && item?.title)
        .map(item => ({ id: item.id || bookmarkId(item.url), title: item.title, url: safeUrl(item.url), favicon: item.favicon || faviconUrl(item.url) }))
        .filter(item => item.url);
    }
  } catch {}
  return DEFAULT_BOOKMARKS.map(item => ({ ...item, id: bookmarkId(item.url), favicon: faviconUrl(item.url) }));
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
}

function storageFlag(key, fallback = false) {
  const value = localStorage.getItem(key);
  if (value === null) return fallback;
  return value === 'true';
}

function setRailCollapsed(collapsed) {
  appShell?.classList.toggle('rail-collapsed', collapsed);
  localStorage.setItem(RAIL_COLLAPSED_STORAGE_KEY, String(collapsed));
  railCollapseToggle?.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
  railCollapseToggle?.setAttribute('title', collapsed ? 'Expand navigation' : 'Collapse navigation');
  resizeVisibleMasonryTiles();
}

function setBookmarksCollapsed(collapsed) {
  browserShell?.classList.toggle('bookmarks-collapsed', collapsed);
  localStorage.setItem(BOOKMARKS_COLLAPSED_STORAGE_KEY, String(collapsed));
  bookmarksToggle?.setAttribute('aria-label', collapsed ? 'Show bookmarks' : 'Hide bookmarks');
  bookmarksToggle?.setAttribute('title', collapsed ? 'Show bookmarks' : 'Hide bookmarks');
  resizeVisibleMasonryTiles();
}

function generationSubjectWithIdentitySafety(subject) {
  const cleanSubject = String(subject || '').trim();
  return `${cleanSubject}\n\n${REFERENCE_IDENTITY_INSTRUCTION}`;
}

function bookmarkTitleFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0].replace(/^\w/, letter => letter.toUpperCase());
  } catch {
    return 'New bookmark';
  }
}

function setActiveBookmark(url = currentUrl()) {
  const next = safeUrl(url);
  if (!next || !tabs) return;
  const nextOrigin = (() => {
    try { return new URL(next).origin; } catch { return ''; }
  })();
  tabs.querySelectorAll('.tab').forEach(tab => {
    const tabUrl = safeUrl(tab.dataset.url);
    let isActive = tabUrl === next;
    if (!isActive && tabUrl && nextOrigin) {
      try { isActive = new URL(tabUrl).origin === nextOrigin; } catch {}
    }
    tab.classList.toggle('active', isActive);
  });
}

function renderBookmarks() {
  if (!tabs) return;
  const bookmarks = loadBookmarks();
  tabs.innerHTML = '';

  bookmarks.forEach(bookmark => {
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.dataset.id = bookmark.id;
    tab.dataset.url = bookmark.url;
    tab.draggable = true;
    tab.innerHTML = `
      <img class="tab-favicon" src="${escapeAttr(bookmark.favicon || faviconUrl(bookmark.url))}" alt="">
      <span class="tab-title">${escapeHtml(bookmark.title)}</span>
    `;
    tab.querySelector('.tab-favicon')?.addEventListener('error', event => {
      const img = event.currentTarget;
      const fallback = fallbackFaviconUrl(bookmark.url);
      if (fallback && !img.dataset.usedFallback) {
        img.dataset.usedFallback = 'true';
        img.src = fallback;
        return;
      }
      img.classList.add('is-missing');
    });
    tab.addEventListener('click', () => {
      setActiveBookmark(bookmark.url);
      loadUrl(bookmark.url);
    });
    tab.addEventListener('dblclick', event => {
      event.preventDefault();
      startBookmarkRename(tab);
    });
    tab.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', bookmark.url);
      event.dataTransfer.effectAllowed = 'copy';
    });
    tabs.appendChild(tab);
  });

  const add = document.createElement('button');
  add.className = 'bookmark-add';
  add.type = 'button';
  add.setAttribute('aria-label', 'Add bookmark');
  add.textContent = '+';
  add.addEventListener('click', () => addBookmarkFromUrl(currentUrl(), webview.getTitle?.() || ''));
  tabs.appendChild(add);
  setActiveBookmark();
}

function startBookmarkRename(tab) {
  const title = tab.querySelector('.tab-title');
  if (!title || tab.querySelector('input')) return;
  const prior = title.textContent.trim();
  const input = document.createElement('input');
  input.className = 'tab-title-input';
  input.value = prior;
  title.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const nextTitle = input.value.trim() || prior || 'Bookmark';
    const bookmarks = loadBookmarks().map(item => (
      item.id === tab.dataset.id ? { ...item, title: nextTitle } : item
    ));
    saveBookmarks(bookmarks);
    renderBookmarks();
  };

  input.addEventListener('blur', commit, { once: true });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') input.blur();
    if (event.key === 'Escape') {
      input.value = prior;
      input.blur();
    }
  });
}

function addBookmarkFromUrl(rawUrl, title = '') {
  const url = safeUrl(rawUrl);
  if (!url) return;
  const bookmarks = loadBookmarks();
  const existing = bookmarks.find(item => item.url === url);
  if (existing) {
    renderBookmarks();
    const tab = tabs?.querySelector(`[data-id="${CSS.escape(existing.id)}"]`);
    if (tab) startBookmarkRename(tab);
    return;
  }
  const bookmark = {
    id: bookmarkId(url),
    title: title || bookmarkTitleFromUrl(url),
    url,
    favicon: faviconUrl(url),
  };
  bookmarks.push(bookmark);
  saveBookmarks(bookmarks);
  renderBookmarks();
  const tab = tabs?.querySelector(`[data-id="${CSS.escape(bookmark.id)}"]`);
  if (tab) startBookmarkRename(tab);
}

function getDroppedUrl(event) {
  const uri = event.dataTransfer?.getData('text/uri-list') || '';
  const plain = event.dataTransfer?.getData('text/plain') || '';
  return (uri || plain).split(/\n/).find(line => /^https?:\/\//i.test(line.trim()))?.trim() || '';
}

function setSelectionMode(enabled) {
  selectionMode = enabled;
  selectBtn.classList.toggle('active', enabled && !captureMode);
  syncPageSelectionMode(enabled && !captureMode);
  if (enabled && !captureMode) scanPage();
  else if (lastDetected.length) scanNote.textContent = 'Browsing normally. Turn Select on to add images as references.';
}

function setCaptureMode(enabled) {
  captureMode = enabled;
  captureLayer.classList.toggle('hidden', !enabled);
  captureInstructions.classList.toggle('hidden', !enabled);
  captureBtn.classList.toggle('active', enabled);
  selectBtn.classList.toggle('active', !enabled && selectionMode);
  syncPageSelectionMode(!enabled && selectionMode);
}

async function scanPage({ manual = false } = {}) {
  if (!webview.executeJavaScript) return;
  const priorScanCopy = scanBtn?.textContent || '';
  if (manual && scanBtn) {
    scanBtn.textContent = 'Scanning...';
    scanBtn.disabled = true;
  }
  scanCount.textContent = 'Finding selectable images...';
  scanNote.textContent = manual ? 'Refreshing visible images...' : '';

  try {
    const result = await webview.executeJavaScript(`(${installTackSelector.toString()})(${MIN_SIZE}, ${selectionMode && !captureMode}, ${Boolean(manual)})`, true);
    lastDetected = Array.isArray(result) ? result : [];
    const isPinterest = /(^|\.)pinterest\.com$/i.test(new URL(currentUrl()).hostname);
    scanCount.textContent = `${lastDetected.length} image${lastDetected.length === 1 ? '' : 's'} from ${isPinterest ? 'Pinterest data' : 'this page'}`;
    scanNote.textContent = lastDetected.length
      ? (manual
          ? `Refreshed ${lastDetected.length} selectable image${lastDetected.length === 1 ? '' : 's'}.`
          : selectionMode
            ? 'Click any image to add it. Turn Select off to browse normally.'
            : 'Turn Select on to add images as references.')
      : selectionMode
        ? 'Click any image to add it. Use Capture if a site blocks image URLs.'
        : 'Turn Select on to add images as references.';
  } catch (error) {
    lastDetected = [];
    scanCount.textContent = 'Page blocked scanning';
    scanNote.textContent = 'Use Capture for visible pixels.';
  } finally {
    if (manual && scanBtn) {
      scanBtn.textContent = priorScanCopy;
      scanBtn.disabled = false;
      if (lastDetected.length && selectionMode && !captureMode) {
        setTimeout(() => {
          scanNote.textContent = 'Click any image to add it. Turn Select off to browse normally.';
        }, 1500);
      }
    }
  }
}

async function syncPageSelectionMode(enabled) {
  if (!webview.executeJavaScript) return;
  try {
    await webview.executeJavaScript(`
      window.__tackSelectionEnabled = ${Boolean(enabled)};
      document.documentElement.toggleAttribute('data-tack-selection-active', ${Boolean(enabled)});
    `, true);
  } catch {}
}

function installTackSelector(minSize, selectionEnabled = true, pulse = false) {
  const STYLE_ID = 'tack-selector-style';
  const ATTR = 'data-tack-selectable';
  const HOVER_ATTR = 'data-tack-hover-target';
  const SELECT_CURSOR = `url("data:image/svg+xml,%3Csvg width='34' height='34' viewBox='0 0 34 34' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 3l19 19-9 1.5L11.5 32 6 3Z' fill='white' stroke='%23141612' stroke-width='2'/%3E%3Ccircle cx='23' cy='11' r='9' fill='%2322c55e' stroke='white' stroke-width='2'/%3E%3Cpath d='M23 6.5v9M18.5 11h9' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E") 6 3, copy`;

  document.querySelectorAll(`[${ATTR}]`).forEach(el => {
    el.removeAttribute(ATTR);
    el.removeAttribute('data-tack-src');
    el.removeAttribute('data-tack-title');
    el.removeAttribute(HOVER_ATTR);
  });

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html[data-tack-selection-active] [data-tack-selectable],
      html[data-tack-selection-active] [data-tack-selectable] * {
        cursor: ${SELECT_CURSOR} !important;
      }
      [data-tack-selectable] {
        outline: 3px solid rgba(143, 190, 247, 0) !important;
        outline-offset: 3px !important;
        transition: outline-color .14s, filter .14s !important;
      }
      html[data-tack-selection-active] [data-tack-hover-target] {
        outline-color: rgba(34, 197, 94, .96) !important;
        box-shadow: 0 0 0 4px rgba(255, 255, 255, .92), 0 12px 34px rgba(23, 26, 23, .24) !important;
      }
      html[data-tack-selection-active] [data-tack-selectable]:hover {
        outline-color: rgba(34, 197, 94, .96) !important;
        filter: saturate(1.05) contrast(1.02) !important;
      }
      [data-tack-selected] {
        outline-color: rgba(143, 190, 247, .95) !important;
        box-shadow: 0 0 0 4px rgba(255, 255, 255, .95), 0 12px 34px rgba(23, 26, 23, .24) !important;
      }
      html[data-tack-scan-pulse] [data-tack-selectable] {
        animation: tackScanPulse .9s ease-out 1 !important;
      }
      @keyframes tackScanPulse {
        0% {
          outline-color: rgba(143, 190, 247, 0) !important;
          filter: none !important;
        }
        28% {
          outline-color: rgba(143, 190, 247, .95) !important;
          filter: saturate(1.08) contrast(1.03) !important;
        }
        100% {
          outline-color: rgba(143, 190, 247, 0) !important;
          filter: none !important;
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function absoluteUrl(src) {
    try {
      return new URL(src, window.location.href).href;
    } catch {
      return '';
    }
  }

  function upgradePinterestUrl(src) {
    return src && src.includes('i.pinimg.com') ? src.replace(/\/\d+x\//, '/736x/') : src;
  }

  function sourceFromSrcset(srcset) {
    const candidates = String(srcset || '')
      .split(',')
      .map(item => {
        const [url, descriptor = ''] = item.trim().split(/\s+/);
        const score = descriptor.endsWith('w')
          ? Number.parseFloat(descriptor)
          : descriptor.endsWith('x')
            ? Number.parseFloat(descriptor) * 1000
            : 1;
        return { url, score: Number.isFinite(score) ? score : 1 };
      })
      .filter(item => item.url);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || '';
  }

  function bestImageSrc(img) {
    const candidates = [
      img?.currentSrc,
      sourceFromSrcset(img?.getAttribute?.('srcset')),
      sourceFromSrcset(img?.closest?.('picture')?.querySelector?.('source[srcset]')?.getAttribute('srcset')),
      img?.src,
      img?.getAttribute?.('data-src'),
      img?.getAttribute?.('data-lazy-src'),
      img?.getAttribute?.('data-original'),
    ];
    return candidates.find(src => src && !String(src).startsWith('data:') && !String(src).startsWith('blob:')) || candidates.find(Boolean) || '';
  }

  function imageUrlFromElement(el) {
    if (!el || !el.getBoundingClientRect) return '';
    if (el.matches?.('img')) return isReferenceSizedImage(el) ? bestImageSrc(el) : '';
    const img = bestDescendantImage(el);
    if (img) return bestImageSrc(img);
    const href = el.closest?.('a')?.getAttribute('href') || el.getAttribute?.('href') || '';
    if (/\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(href)) return href;
    const style = window.getComputedStyle(el);
    const bg = style.backgroundImage || '';
    const matches = Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g));
    return matches.find(match => !match[1].startsWith('data:'))?.[1] || '';
  }

  function isClickableImageCandidate(el) {
    if (!el || !el.isConnected || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function isInteractiveChrome(el) {
    const interactive = el?.closest?.('button, [role="button"], input, textarea, select, option, [contenteditable="true"], form, a');
    if (interactive) {
      const label = [
        interactive.getAttribute?.('aria-label'),
        interactive.getAttribute?.('title'),
        interactive.getAttribute?.('data-test-id'),
        interactive.getAttribute?.('data-test-selector'),
        interactive.textContent,
      ].filter(Boolean).join(' ').toLowerCase();
      const isAuthControl = /\b(log ?in|sign ?in|sign ?up|continue with google|google|qr code|password|email|forgot)\b/i.test(label);
      const isSiteChrome = /\b(save|bookmark|follow|more|menu|close|dismiss|share|like|comment)\b/i.test(label);
      if (isAuthControl || isSiteChrome) return true;
      if (interactive.matches?.('button, [role="button"], input, textarea, select, option, [contenteditable="true"], form')) {
        return !bestDescendantImage(interactive);
      }
    }

    return Boolean(el?.closest?.([
      'input',
      'textarea',
      'select',
      'option',
      '[contenteditable="true"]',
      'form',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-test-id*="login" i]',
      '[data-test-id*="signup" i]',
      '[aria-label*="log in" i]',
      '[aria-label*="login" i]',
      '[aria-label*="sign in" i]',
      '[aria-label*="save" i]',
      '[aria-label*="bookmark" i]',
      '[aria-label*="follow" i]',
    ].join(',')));
  }

  function isPinterestGoogleAuthControl(el) {
    if (!/(^|\.)pinterest\.com$/i.test(window.location.hostname)) return false;
    const control = el?.closest?.('button, [role="button"], a');
    if (!control) return false;
    const label = [
      control.getAttribute?.('aria-label'),
      control.getAttribute?.('title'),
      control.getAttribute?.('data-test-id'),
      control.textContent,
    ].filter(Boolean).join(' ').toLowerCase();
    const hasGoogleIcon = Boolean(control.querySelector?.('svg[aria-label*="google" i], img[alt*="google" i], [aria-label*="google" i]'));
    return label.includes('continue with google') || (label.includes('google') && (hasGoogleIcon || /log ?in|sign ?in|continue/.test(label)));
  }

  function handlePinterestAuthClick(event) {
    if (!isPinterestGoogleAuthControl(event.target)) return;
    // Let Pinterest own its Google OAuth click. The Electron popup handler now
    // allows OAuth starter windows, so blocking the native click makes sign-in fail.
  }

  function isReferenceSizedImage(img) {
    if (!img || !img.getBoundingClientRect) return false;
    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || rect.width;
    const height = img.naturalHeight || rect.height;
    const visibleArea = rect.width * rect.height;
    return rect.width >= 96 && rect.height >= 96 && visibleArea >= 16000 && width >= 96 && height >= 96;
  }

  function bestDescendantImage(el) {
    const images = Array.from(el?.querySelectorAll?.('img') || [])
      .filter(img => isReferenceSizedImage(img))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (br.width * br.height) - (ar.width * ar.height);
      });
    return images[0] || null;
  }

  function positionFor(el) {
    const rect = el.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  }

  function isRendered(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    if (rect.bottom < -window.innerHeight || rect.top > window.innerHeight * 4) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function collectImages() {
    const seen = new Set();
    const results = [];
    const posMap = {};
    const isPinterest = window.location.hostname.includes('pinterest.com');
    const isTackSite = /(^|\.)tack\.design$/i.test(window.location.hostname);
    const maxGenericImages = 160;

    function add(src, width, height, alt, el) {
      const normalized = absoluteUrl(src);
      if (!normalized || normalized.startsWith('data:') || normalized.startsWith('blob:')) return;
      if (seen.has(normalized)) {
        if (el && !posMap[normalized]) posMap[normalized] = positionFor(el);
        return;
      }
      seen.add(normalized);
      results.push({ src: normalized, width: width || 0, height: height || 0, title: alt || document.title || 'Web reference' });
      if (el && !posMap[normalized]) posMap[normalized] = positionFor(el);
    }

    if (isPinterest) {
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
              const validKey = Object.keys(obj.images).find(key =>
                obj.images[key] &&
                typeof obj.images[key].url === 'string' &&
                obj.images[key].url.includes('i.pinimg.com')
              );
              if (validKey) {
                const best = (
                  obj.images['736x'] ||
                  obj.images['474x'] ||
                  obj.images['originals'] ||
                  obj.images['orig'] ||
                  obj.images['236x'] ||
                  obj.images[validKey]
                );
                add(upgradePinterestUrl(best.url), best.width || 736, best.height || 736, '');
                return;
              }
            }
            if (Array.isArray(obj)) {
              for (const value of obj) walk(value, depth + 1);
            } else {
              for (const value of Object.values(obj)) {
                if (value && typeof value === 'object') walk(value, depth + 1);
              }
            }
          }

          walk(pws, 0);
        }
      } catch {}

      document.querySelectorAll('img').forEach(img => {
        const rawSrc = bestImageSrc(img);
        if (!rawSrc || !rawSrc.includes('i.pinimg.com')) return;
        const width = img.naturalWidth || img.offsetWidth;
        const height = img.naturalHeight || img.offsetHeight;
        if (width < minSize || height < minSize) return;
        add(upgradePinterestUrl(rawSrc), Math.max(width, 736), Math.max(height, 736), img.alt || '', img);
      });
    } else if (isTackSite) {
      const candidates = Array.from(document.querySelectorAll([
        '.masonry-item img',
        '.board-card-preview img',
        '#gallery-wrap img',
      ].join(',')));
      candidates.forEach(img => {
        const src = bestImageSrc(img);
        const width = img.naturalWidth || img.offsetWidth;
        const height = img.naturalHeight || img.offsetHeight;
        if (!src || src.startsWith('data:') || width < 120 || height < 120) return;
        add(src, width, height, img.alt || '', img);
      });
    } else {
      document.querySelectorAll('img').forEach(img => {
        if (!isRendered(img)) return;
        const src = bestImageSrc(img);
        const width = img.naturalWidth || img.offsetWidth;
        const height = img.naturalHeight || img.offsetHeight;
        if (!src || src.startsWith('data:') || width < minSize || height < minSize) return;
        add(src, width, height, img.alt || '', img);
      });

      document.querySelectorAll('[style], article, figure, a, div, section').forEach(el => {
        if (!isRendered(el)) return;
        const bg = window.getComputedStyle(el).backgroundImage || '';
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (!match) return;
        const rect = el.getBoundingClientRect();
        add(match[1], rect.width, rect.height, el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 120) || '', el);
      });
    }

    results.sort((a, b) => {
      const pa = posMap[a.src] || { top: 9999, left: 9999 };
      const pb = posMap[b.src] || { top: 9999, left: 9999 };
      return pa.top !== pb.top ? pa.top - pb.top : pa.left - pb.left;
    });

    return isPinterest ? results : results.slice(0, maxGenericImages);
  }

  function mark(el, rawSrc, title) {
    const src = absoluteUrl(upgradePinterestUrl(rawSrc));
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
    const rect = el.getBoundingClientRect();
    const host = el.closest('a, button, [role="button"], [tabindex]') || el;
    host.setAttribute(ATTR, 'true');
    host.setAttribute('data-tack-src', src);
    host.setAttribute('data-tack-title', title || document.title || 'Web reference');
    return {
      id: `${src}:${Math.round(rect.top + window.scrollY)}:${Math.round(rect.left + window.scrollX)}`,
      src,
      title: title || document.title || 'Web reference',
      sourceUrl: window.location.href,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function referenceFromTarget(target, event) {
    if (isInteractiveChrome(target)) return null;

    const markedTarget = target?.closest?.(`[${ATTR}]`);
    if (markedTarget) {
      return {
        target: markedTarget,
        ref: {
          id: markedTarget.getAttribute('data-tack-src'),
          src: markedTarget.getAttribute('data-tack-src'),
          title: markedTarget.getAttribute('data-tack-title') || document.title || 'Web reference',
          sourceUrl: window.location.href,
        },
      };
    }

    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    const candidates = [
      target?.closest?.(`[${ATTR}]`),
      target?.closest?.('img, picture, figure, a, [style], article, div, section'),
      target,
      ...path,
    ].filter(Boolean);

    let sourceEl = null;
    let rawSrc = '';
    for (const candidate of candidates) {
      if (!candidate?.getBoundingClientRect || !isClickableImageCandidate(candidate)) continue;
      rawSrc = imageUrlFromElement(candidate);
      if (rawSrc) {
        sourceEl = candidate.matches?.('img') ? candidate : (bestDescendantImage(candidate) || candidate);
        break;
      }
    }

    if (!rawSrc || !sourceEl) return null;
    const src = absoluteUrl(upgradePinterestUrl(rawSrc));
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return null;
    if (window.location.hostname.includes('pinterest.com') && !src.includes('i.pinimg.com')) return null;
    const host = sourceEl.closest?.('a, button, [role="button"], [tabindex], figure, article') || sourceEl;
    const title = sourceEl.alt || sourceEl.getAttribute?.('aria-label') || host.getAttribute?.('aria-label') || document.title || 'Web reference';
    host.setAttribute(ATTR, 'true');
    host.setAttribute('data-tack-src', src);
    host.setAttribute('data-tack-title', title);
    return {
      target: host,
      ref: {
        id: src,
        src,
        title,
        sourceUrl: window.location.href,
      },
    };
  }

  let hoverTarget = null;

  function setHoverTarget(target) {
    if (hoverTarget === target) return;
    hoverTarget?.removeAttribute(HOVER_ATTR);
    hoverTarget = target || null;
    hoverTarget?.setAttribute(HOVER_ATTR, 'true');
  }

  function handleSelectionHover(event) {
    if (!window.__tackSelectionEnabled) {
      setHoverTarget(null);
      return;
    }
    const hit = referenceFromTarget(event.target, event);
    setHoverTarget(hit?.target || null);
  }

  function handleSelectionClick(event) {
    if (!window.__tackSelectionEnabled) return false;
    const hit = referenceFromTarget(event.target, event);
    if (!hit?.ref?.src) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (hit.target.hasAttribute('data-tack-selected')) {
      hit.target.removeAttribute('data-tack-selected');
      hit.ref.action = 'remove';
    } else {
      hit.target.setAttribute('data-tack-selected', 'true');
      hit.ref.action = 'add';
    }
    console.log(`__TACK_REFERENCE__${JSON.stringify(hit.ref)}`);
    return true;
  }

  const collected = collectImages();
  const collectedBySrc = new Map(collected.map(item => [item.src, item]));
  const marked = new Map();

  document.querySelectorAll('img').forEach(img => {
    if (!isRendered(img)) return;
    const rawSrc = bestImageSrc(img);
    const src = absoluteUrl(upgradePinterestUrl(rawSrc));
    if (!src || !collectedBySrc.has(src)) return;
    const item = collectedBySrc.get(src);
    const ref = mark(img, src, img.alt || img.getAttribute('aria-label') || item.title || document.title);
    if (ref && !marked.has(src)) marked.set(src, { ...item, ...ref });
  });

  if (!window.location.hostname.includes('pinterest.com')) {
    document.querySelectorAll('[style], article, figure, a, div, section').forEach(el => {
      if (!isRendered(el)) return;
      const bg = window.getComputedStyle(el).backgroundImage || '';
      const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (!match) return;
      const src = absoluteUrl(match[1]);
      if (!src || !collectedBySrc.has(src)) return;
      const item = collectedBySrc.get(src);
      const ref = mark(el, src, el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 90) || item.title || document.title);
      if (ref && !marked.has(src)) marked.set(src, { ...item, ...ref });
    });
  }

  if (!window.__tackSelectorInstalled) {
    window.__tackSelectorInstalled = true;
    document.addEventListener('click', handlePinterestAuthClick, true);
    ['pointerdown', 'mousedown', 'click'].forEach(type => {
      document.addEventListener(type, event => {
        if (type === 'click') handleSelectionClick(event);
        else if (window.__tackSelectionEnabled && referenceFromTarget(event.target, event)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        }
      }, true);
    });
    document.addEventListener('pointermove', handleSelectionHover, true);
    document.addEventListener('mouseout', event => {
      if (!event.relatedTarget) setHoverTarget(null);
    }, true);
  }

  window.__tackSelectionEnabled = Boolean(selectionEnabled);
  document.documentElement.toggleAttribute('data-tack-selection-active', Boolean(selectionEnabled));
  if (pulse) {
    document.documentElement.removeAttribute('data-tack-scan-pulse');
    window.requestAnimationFrame(() => {
      document.documentElement.setAttribute('data-tack-scan-pulse', '');
      window.setTimeout(() => document.documentElement.removeAttribute('data-tack-scan-pulse'), 950);
    });
  }

  return Array.from(marked.values());
}

function upsertReference(ref) {
  if (!ref?.src && !ref?.captureDataUrl) return;
  const id = ref.id || ref.src || `capture-${Date.now()}`;
  if (ref.action === 'remove') {
    refs.delete(id);
  } else {
    refs.set(id, {
      id,
      title: ref.title || 'Web reference',
      sourceUrl: ref.sourceUrl || currentUrl(),
      src: ref.src || ref.captureDataUrl,
      kind: ref.kind || 'url',
    });
  }
  renderReferences();
}

function renderReferences() {
  const values = Array.from(refs.values());
  referenceList.innerHTML = '';

  if (!values.length) {
    referenceList.innerHTML = `
      <div class="empty-state">
        <strong>No references yet</strong>
        <span>Click images in the browser to add them here.</span>
      </div>
    `;
  } else {
    values.forEach(ref => {
      const item = document.createElement('article');
      item.className = 'reference-item';
      item.title = `${ref.title}\n${ref.sourceUrl}`;
      item.innerHTML = `
        <img src="${escapeAttr(ref.src)}" alt="${escapeAttr(ref.title)}">
        <div class="reference-copy">
          <strong>${escapeHtml(ref.title)}</strong>
          <span>${escapeHtml(ref.kind === 'capture' ? `${ref.sourceUrl} · captured region` : ref.sourceUrl)}</span>
        </div>
        <button class="remove-ref" type="button" aria-label="Remove reference">×</button>
      `;
      item.querySelector('.remove-ref').addEventListener('click', () => {
        refs.delete(ref.id);
        renderReferences();
      });
      referenceList.appendChild(item);
    });
  }

  const count = values.length;
  generateBtn.disabled = count === 0 || !subjectInput.value.trim();
  generateBtn.textContent = count ? `Generate with ${count} reference${count === 1 ? '' : 's'}` : 'Generate Images';
}

function normalizePlan(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'unlimited') return 'studio';
  return ['free', 'pro', 'studio'].includes(normalized) ? normalized : 'free';
}

function planLimit(value = plan) {
  const normalized = normalizePlan(value);
  if (normalized === 'studio') return STUDIO_MONTHLY_LIMIT;
  if (normalized === 'pro') return PRO_MONTHLY_LIMIT;
  return FREE_MONTHLY_LIMIT;
}

function effectiveMonthlyUsed() {
  if (!monthlyResetAt || new Date(monthlyResetAt) <= new Date()) return 0;
  return monthlyUsed;
}

function getUserIdFromToken(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).sub || null;
  } catch {
    return null;
  }
}

function currentSessionPayload() {
  return {
    token: authToken,
    refreshToken: authRefreshToken,
    email: authEmail,
    userId: authUserId,
    plan,
    used: generationsUsed,
    monthly: monthlyUsed,
    resetAt: monthlyResetAt,
  };
}

async function persistSession() {
  if (!authToken) return window.tackDesktop.clearSession();
  return window.tackDesktop.setSession(currentSessionPayload());
}

function applySession(session = {}) {
  authToken = session.token || session.access_token || null;
  authRefreshToken = session.refreshToken || session.refresh_token || null;
  authEmail = session.email || '';
  authUserId = session.userId || (authToken ? getUserIdFromToken(authToken) : null);
  plan = normalizePlan(session.plan || 'free');
  generationsUsed = session.used ?? session.generationsUsed ?? 0;
  monthlyUsed = session.monthly ?? session.monthlyUsed ?? 0;
  monthlyResetAt = session.resetAt || session.monthlyResetAt || null;
}

function resetAuthState() {
  authToken = null;
  authRefreshToken = null;
  authEmail = '';
  authUserId = null;
  plan = 'free';
  generationsUsed = 0;
  monthlyUsed = 0;
  monthlyResetAt = null;
}

function updateAccountUI() {
  const signedIn = Boolean(authToken && authEmail);
  const initial = authEmail.trim().charAt(0).toUpperCase();
  accountAvatar.textContent = signedIn ? (initial || 'T') : '';
  accountAvatar.dataset.state = signedIn ? 'user' : 'guest';
  railAccountAvatar.textContent = signedIn ? (initial || 'T') : '';
  railAccountAvatar.dataset.state = signedIn ? 'user' : 'guest';
  railAccountBtn.classList.toggle('is-signed-out', !signedIn);
  railAccountBtn.setAttribute('aria-label', signedIn ? 'Account' : 'Sign in');
  railAccountLabel.textContent = signedIn ? 'Account' : 'Sign in';
  accountEmail.textContent = signedIn ? authEmail : 'Not signed in';
  accountPlan.textContent = signedIn ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan` : 'Guest';
  accountSigninBtn.classList.toggle('hidden', signedIn);
  accountSignupBtn.classList.toggle('hidden', signedIn);
  accountManageBtn.classList.toggle('hidden', !signedIn);
  accountSignoutBtn.classList.toggle('hidden', !signedIn);
  accountViewTitle.textContent = signedIn ? 'Workspace' : 'Sign in to Tack';
  accountViewCopy.textContent = signedIn
    ? `Plan, sync, and account settings for this ${platformInfo.systemName}.`
    : 'Use one account for generations, boards, and monthly usage across Tack.';
  accountSignedOut?.classList.toggle('hidden', signedIn);
  accountCard?.classList.toggle('hidden', !signedIn);
  accountStats?.classList.toggle('hidden', !signedIn);
  accountSyncGrid?.classList.toggle('hidden', !signedIn);
  accountPlanStat.textContent = signedIn ? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}` : 'Guest';
  accountSyncStat.textContent = signedIn ? 'Synced' : 'Local only';

  if (signedIn) {
    const limit = planLimit();
    const used = effectiveMonthlyUsed();
    const remaining = Math.max(0, limit - used);
    accountUsageStat.textContent = `${remaining} / ${limit} left`;
  } else {
    accountUsageStat.textContent = 'Sign in';
  }
}

function showAuth(mode = 'login') {
  setAuthMode(mode);
  authBackdrop.classList.remove('hidden');
  authModal.classList.remove('hidden');
  authMessage.textContent = '';
  authEmailInput.focus();
}

function hideAuth() {
  authBackdrop.classList.add('hidden');
  authModal.classList.add('hidden');
}

function setAuthMode(mode) {
  authMode = mode === 'signup' ? 'signup' : 'login';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.authMode === authMode);
  });
  authTitle.innerHTML = authMode === 'signup' ? 'Create your <em>account</em>' : 'Welcome <em>back</em>';
  authSubtitle.textContent = authMode === 'signup'
    ? 'Create a Tack account to sync generations across the desktop app, website, and browser extension.'
    : 'Sign in to sync generations, plan usage, and your Tack library.';
  authSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  googleAuthCopy.textContent = authMode === 'signup' ? 'Sign up with Google' : 'Continue with Google';
  authPasswordInput.setAttribute('autocomplete', authMode === 'signup' ? 'new-password' : 'current-password');
}

async function validateToken(token) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return { __networkError: true };
  }
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.access_token ? data : null;
  } catch {
    return null;
  }
}

async function refreshStoredAuthSession() {
  const refreshed = await refreshAccessToken(authRefreshToken);
  if (!refreshed?.access_token) return false;
  const refreshedUser = await validateToken(refreshed.access_token);
  applySession({
    ...currentSessionPayload(),
    token: refreshed.access_token,
    refreshToken: refreshed.refresh_token || authRefreshToken,
    email: refreshedUser?.email || authEmail,
    userId: refreshedUser?.id || getUserIdFromToken(refreshed.access_token) || authUserId,
  });
  await persistSession();
  updateAccountUI();
  return true;
}

async function ensureFreshAuthSession() {
  if (!authToken) return false;
  const user = await validateToken(authToken);
  if (user?.__networkError) return true;
  if (user) {
    if (user.email !== authEmail || user.id !== authUserId) {
      applySession({
        ...currentSessionPayload(),
        email: user.email || authEmail,
        userId: user.id || authUserId,
      });
      await persistSession();
      updateAccountUI();
    }
    return true;
  }
  return refreshStoredAuthSession();
}

async function fetchPlan() {
  if (!authToken) return null;
  const userId = authUserId || getUserIdFromToken(authToken);
  if (!userId) return null;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}&select=plan,generations_used,monthly_generations,monthly_reset_at`,
    { headers: { Authorization: `Bearer ${authToken}`, apikey: SUPABASE_ANON_KEY } }
  );
  if (!response.ok) return null;
  const rows = await response.json();
  if (!rows?.[0]) return null;
  plan = normalizePlan(rows[0].plan || 'free');
  generationsUsed = rows[0].generations_used ?? generationsUsed;
  monthlyUsed = rows[0].monthly_generations ?? 0;
  monthlyResetAt = rows[0].monthly_reset_at || null;
  await persistSession();
  updateAccountUI();
  return rows[0];
}

async function initAuth() {
  const stored = await window.tackDesktop.getSession();
  if (stored?.token) {
    const user = await validateToken(stored.token);
    if (user?.__networkError) {
      applySession(stored);
      updateAccountUI();
      return;
    }
    if (user) {
      applySession({
        ...stored,
        email: user.email || stored.email,
        userId: user.id || stored.userId,
      });
      await fetchPlan();
      updateAccountUI();
      return;
    }
    const refreshed = await refreshAccessToken(stored.refreshToken);
    if (refreshed?.access_token) {
      const refreshedUser = await validateToken(refreshed.access_token);
      applySession({
        ...stored,
        token: refreshed.access_token,
        refreshToken: refreshed.refresh_token || stored.refreshToken,
        email: refreshedUser?.email || stored.email,
        userId: refreshedUser?.id || stored.userId,
      });
      await persistSession();
      await fetchPlan();
      updateAccountUI();
      return;
    }
    await window.tackDesktop.clearSession();
  }
  resetAuthState();
  updateAccountUI();
}

async function supabaseLogin(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || 'Login failed. Check your email and password.');
  return data;
}

async function supabaseSignup(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup?redirect_to=https://tack.design/confirmed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || 'Sign up failed. Please try again.');
  if (data.identities && data.identities.length === 0) throw new Error('An account with that email already exists.');
  return data;
}

async function completeAuth(data, fallbackEmail = '') {
  if (!data?.access_token) {
    authMessage.textContent = 'Check your email to confirm your account, then sign in.';
    return;
  }
  const user = await validateToken(data.access_token);
  applySession({
    token: data.access_token,
    refreshToken: data.refresh_token || data.refreshToken || '',
    email: user?.email || fallbackEmail,
    userId: user?.id || getUserIdFromToken(data.access_token),
    plan: 'free',
  });
  await persistSession();
  await fetchPlan();
  hideAuth();
  updateAccountUI();
}

async function handleEmailAuth() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  authMessage.textContent = '';
  if (!email || !password) {
    authMessage.textContent = 'Enter your email and password.';
    return;
  }
  if (password.length < 8) {
    authMessage.textContent = 'Password must be at least 8 characters.';
    return;
  }
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === 'signup' ? 'Creating account...' : 'Signing in...';
  try {
    const data = authMode === 'signup'
      ? await supabaseSignup(email, password)
      : await supabaseLogin(email, password);
    await completeAuth(data, email);
  } catch (error) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (authMode === 'login' && message.toLowerCase().includes('email not confirmed')) {
      authMessage.textContent = 'Please confirm your email first, then sign in.';
    } else {
      authMessage.textContent = message;
    }
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  }
}

async function handleGoogleAuth() {
  googleAuthBtn.disabled = true;
  googleAuthCopy.textContent = 'Opening Google...';
  authMessage.textContent = '';
  try {
    const data = await window.tackDesktop.signInWithGoogle(authMode);
    await completeAuth(data);
  } catch (error) {
    authMessage.textContent = error?.message || 'Google sign-in failed.';
  } finally {
    googleAuthBtn.disabled = false;
    googleAuthCopy.textContent = authMode === 'signup' ? 'Sign up with Google' : 'Continue with Google';
  }
}

async function sendPasswordReset() {
  const email = authEmailInput.value.trim();
  if (!email) {
    authMessage.textContent = 'Enter your email first.';
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, redirect_to: 'https://tack.design/account', gotrue_meta_security: {} }),
  });
  authMessage.textContent = response.ok
    ? 'Password reset email sent. Check your inbox and spam folder.'
    : 'Could not send reset email. Try again.';
}

async function signOut() {
  if (authToken) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, apikey: SUPABASE_ANON_KEY },
    }).catch(() => {});
  }
  resetAuthState();
  await window.tackDesktop.clearSession();
  libraryGenerations = [];
  libraryImages = [];
  libraryBoards = [];
  libraryBoardItems = [];
  activeBoardId = '';
  libraryMode = 'all';
  librarySelecting = false;
  selectedLibraryKeys.clear();
  updateAccountUI();
  if (!libraryView.classList.contains('hidden')) renderLibrarySignedOut();
  renderReferences();
}

function scrollPanelToResults() {
  if (!tackPanel || results.classList.contains('hidden')) return;

  requestAnimationFrame(() => {
    const top = Math.max(0, results.offsetTop - tackPanel.offsetTop - 8);
    tackPanel.scrollTo({ top, behavior: 'smooth' });
  });
}

async function captureRegion(rect) {
  let dataUrl = '';
  try {
    const image = await webview.capturePage({
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    dataUrl = image.toDataURL();
  } catch {
    dataUrl = makeCaptureFallback(rect);
  }

  upsertReference({
    id: `capture-${Date.now()}`,
    title: `Captured region ${Math.round(rect.width)}×${Math.round(rect.height)}`,
    sourceUrl: currentUrl(),
    captureDataUrl: dataUrl,
    kind: 'capture',
  });
}

function makeCaptureFallback(rect) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#dceee8"/>
          <stop offset="1" stop-color="#ffd6e0"/>
        </linearGradient>
      </defs>
      <rect width="480" height="360" rx="24" fill="url(#g)"/>
      <circle cx="370" cy="82" r="56" fill="rgba(255,255,255,.48)"/>
      <rect x="68" y="78" width="210" height="32" rx="16" fill="rgba(255,255,255,.76)"/>
      <rect x="68" y="130" width="332" height="22" rx="11" fill="rgba(255,255,255,.55)"/>
      <rect x="68" y="170" width="270" height="22" rx="11" fill="rgba(255,255,255,.55)"/>
      <text x="68" y="270" font-family="Arial" font-size="22" font-weight="700" fill="#171a17">Captured reference</text>
      <text x="68" y="302" font-family="Arial" font-size="15" fill="#68716b">${Math.round(rect.width)} by ${Math.round(rect.height)} pixels</text>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

async function generateWithTack() {
  const subject = subjectInput.value.trim();
  const values = Array.from(refs.values());
  const urlRefs = values.filter(ref => ref.kind !== 'capture' && /^https?:\/\//i.test(ref.src));
  if (!subject || !values.length) return;

  if (!urlRefs.length) {
    renderError('Captured regions are saved in the tray, but this MVP needs source image URLs for the live Tack generation backend.');
    return;
  }

  const hasFreshAuth = await ensureFreshAuthSession();
  if (!hasFreshAuth) {
    renderError('Your Tack session expired. Sign in to Tack again to generate.');
    showAuth('login');
    return;
  }

  activeGenerationController?.abort();
  const controller = new AbortController();
  activeGenerationController = controller;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';
  renderGeneratingState(urlRefs.length);

  try {
    const outputDimensions = OUTPUT_DIMENSIONS[aspectRatio] || OUTPUT_DIMENSIONS[DEFAULT_ASPECT_RATIO];
    const payload = {
      imageUrls: urlRefs.map(ref => ref.src),
      subject: generationSubjectWithIdentitySafety(subject),
      displaySubject: subject,
      userSubject: subject,
      referenceIdentityInstruction: REFERENCE_IDENTITY_INSTRUCTION,
      negativePrompt: 'same identifiable person from reference, copied face, copied likeness, recognizable private person, celebrity likeness',
      anonymousId,
      aspectRatio,
      aspect_ratio: aspectRatio,
      outputDimensions,
      width: outputDimensions.width,
      height: outputDimensions.height,
    };
    const sendGenerationRequest = () => fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    let response = await sendGenerationRequest();
    if (response.status === 401 && await refreshStoredAuthSession()) {
      response = await sendGenerationRequest();
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        showAuth('login');
        throw new Error('Your Tack session expired. Sign in to Tack again to generate.');
      }
      if (response.status === 402) throw new Error(data?.message || 'This account has reached its generation limit.');
      throw new Error(data?.message || data?.error || `Tack returned ${response.status}.`);
    }

    renderResults(data);
    if (data?.usage) {
      generationsUsed = data.usage.used ?? generationsUsed;
      if (data.usage.monthly_used !== undefined) monthlyUsed = data.usage.monthly_used;
      await persistSession();
      updateAccountUI();
    } else if (authToken) {
      await fetchPlan();
    }
    if (authToken && imagesFromResult(data).length) {
      saveGenerationToAccount(imagesFromResult(data), {
        subject,
        prompt: data.prompt || '',
        styleDescriptors: data.styleDescriptors || '',
        aspectRatio: data.aspectRatio || aspectRatio,
        outputDimensions: data.outputDimensions || outputDimensions,
        referenceUrls: urlRefs.map(ref => ref.src),
        sourcePageUrl: currentUrl(),
      }).catch(() => {});
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = error?.message || 'Something went wrong. Please try again.';
    renderError(message.includes('Failed to fetch') ? 'Connection error. Check your internet and try again.' : message);
  } finally {
    if (activeGenerationController === controller) activeGenerationController = null;
    renderReferences();
  }
}

function imagesFromResult(data) {
  return Array.isArray(data?.images) ? data.images.filter(Boolean) : [];
}

function normalizeImageUrls(value) {
  let images = value;
  if (typeof images === 'string') {
    try {
      images = JSON.parse(images);
    } catch {
      images = images.split(',').map(item => item.trim());
    }
  }
  if (!Array.isArray(images)) return [];
  return images
    .flat(Infinity)
    .map(item => {
      if (typeof item === 'string') return item;
      return item?.url || item?.src || item?.image_url || '';
    })
    .filter(url => /^https?:\/\//i.test(url));
}

async function saveGenerationToAccount(imageUrls, meta = {}) {
  if (!authToken || !authUserId || !imageUrls.length) return;
  const timestamp = Date.now();
  const uploadedUrls = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    try {
      const imageResponse = await fetch(imageUrls[index]);
      if (!imageResponse.ok) continue;
      const buffer = await imageResponse.arrayBuffer();
      const path = `${authUserId}/${timestamp}_${index}.png`;
      const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/generated-images/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'image/png',
          'x-upsert': 'false',
        },
        body: buffer,
      });
      if (uploadResponse.ok) {
        uploadedUrls.push(`${SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`);
      }
    } catch {}
  }

  if (!uploadedUrls.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/generations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      user_id: authUserId,
      prompt: meta.subject || '',
      image_urls: uploadedUrls,
    }),
  });
}

async function loadAccountGenerations() {
  if (!authToken || !authUserId) {
    renderLibrarySignedOut();
    return;
  }
  const hasFreshAuth = await ensureFreshAuthSession();
  if (!hasFreshAuth) {
    renderLibrarySignedOut();
    return;
  }
  libraryList.innerHTML = '<p class="library-empty">Loading generations...</p>';
  try {
    const [generations, boards, boardItems] = await Promise.all([
      fetchGenerations(),
      fetchBoards().catch(() => []),
      fetchBoardItems().catch(() => []),
    ]);
    libraryGenerations = generations;
    libraryImages = flattenGenerations(generations);
    libraryBoards = boards;
    libraryBoardItems = boardItems;
    renderLibrary();
  } catch (error) {
    libraryList.innerHTML = `
      <div class="library-empty library-empty-action">
        <strong>${escapeHtml(error?.message || 'Could not load generations.')}</strong>
        <span>Check your connection, then retry. Tack will also retry when the app comes back into focus.</span>
        <button id="library-retry-btn" type="button">Retry</button>
      </div>
    `;
    document.querySelector('#library-retry-btn')?.addEventListener('click', loadAccountGenerations);
  }
}

async function fetchGenerations() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/generations?user_id=eq.${encodeURIComponent(authUserId)}&select=id,prompt,image_urls,created_at&order=created_at.desc,id.desc&limit=120`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}`, Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error('Could not load generations.');
  return response.json();
}

async function fetchBoards() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/boards?user_id=eq.${encodeURIComponent(authUserId)}&select=id,user_id,name,created_at,updated_at&order=updated_at.desc`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}`, Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error('Could not load boards.');
  return response.json();
}

async function fetchBoardItems() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/board_items?user_id=eq.${encodeURIComponent(authUserId)}&select=id,board_id,user_id,image_url,prompt,source_created_at,position,created_at&order=position.asc,created_at.desc`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}`, Accept: 'application/json' } }
  );
  if (!response.ok) throw new Error('Could not load board items.');
  return response.json();
}

function flattenGenerations(rows) {
  return [...(rows || [])]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .flatMap(row => normalizeImageUrls(row.image_urls).map((url, index) => ({
      key: `${row.id}:${index}`,
      generationId: row.id,
      url,
      prompt: row.prompt || '',
      createdAt: row.created_at || '',
      index,
    })));
}

function getBoardItems(boardId) {
  return libraryBoardItems
    .filter(item => item.board_id === boardId)
    .map((item, index) => ({
      key: item.id || `${boardId}:${index}`,
      boardItemId: item.id,
      generationId: item.id,
      url: item.image_url,
      prompt: item.prompt || '',
      createdAt: item.source_created_at || item.created_at || '',
      index,
    }));
}

function getBoardsForImage(url) {
  return libraryBoards.filter(board => libraryBoardItems.some(item => item.board_id === board.id && item.image_url === url));
}

function visibleLibraryImages() {
  if (libraryMode === 'boards' && activeBoardId) return getBoardItems(activeBoardId);
  return libraryImages;
}

function masonryMetrics() {
  if (!libraryList) return null;
  const gridStyles = window.getComputedStyle(libraryList);
  const gap = parseFloat(gridStyles.getPropertyValue('--masonry-gap')) || 16;
  const minColumn = parseFloat(gridStyles.getPropertyValue('--masonry-min-column')) || 260;
  const paddingLeft = parseFloat(gridStyles.paddingLeft) || 0;
  const paddingRight = parseFloat(gridStyles.paddingRight) || 0;
  const paddingTop = parseFloat(gridStyles.paddingTop) || 0;
  const paddingBottom = parseFloat(gridStyles.paddingBottom) || 0;
  const contentWidth = Math.max(0, libraryList.clientWidth - paddingLeft - paddingRight);
  const columns = Math.max(1, Math.floor((contentWidth + gap) / (minColumn + gap)));
  const columnWidth = Math.max(1, (contentWidth - (gap * (columns - 1))) / columns);
  return { gap, paddingLeft, paddingTop, paddingBottom, columns, columnWidth };
}

function masonryTileHeight(tile, columnWidth) {
  const measuredTile = tile.getBoundingClientRect().height || 0;
  if (measuredTile > 20) return measuredTile;

  const img = tile.querySelector('img');
  if (img?.naturalWidth && img?.naturalHeight) {
    const styles = window.getComputedStyle(tile);
    const borderTop = parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
    return columnWidth * (img.naturalHeight / img.naturalWidth) + borderTop + borderBottom;
  }
  const measured = img?.getBoundingClientRect().height || 0;
  return measured > 20 ? measured : columnWidth;
}

function resizeMasonryTile() {
  layoutMasonry();
}

function layoutMasonry() {
  if (!libraryList?.classList.contains('masonry-library')) return;
  const metrics = masonryMetrics();
  if (!metrics) return;
  const { gap, paddingLeft, paddingTop, columns, columnWidth } = metrics;
  const columnHeights = Array(columns).fill(0);
  const tiles = Array.from(libraryList.querySelectorAll('.masonry-library-item'));

  tiles.forEach(tile => {
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    const left = paddingLeft + column * (columnWidth + gap);
    const top = paddingTop + columnHeights[column];

    tile.style.width = `${columnWidth}px`;
    tile.style.left = `${Math.round(left)}px`;
    tile.style.top = `${Math.round(top)}px`;
    const height = masonryTileHeight(tile, columnWidth);
    columnHeights[column] += height + gap;
  });

  const contentHeight = Math.max(0, ...columnHeights) ? Math.max(0, ...columnHeights) - gap : 0;
  const spacer = libraryList.querySelector('.masonry-spacer');
  if (spacer) spacer.style.height = `${Math.ceil(contentHeight)}px`;
}

function resizeVisibleMasonryTiles() {
  if (masonryResizeTimer) cancelAnimationFrame(masonryResizeTimer);
  masonryResizeTimer = requestAnimationFrame(() => {
    layoutMasonry();
    requestAnimationFrame(layoutMasonry);
  });
}

function observeMasonryLibrary() {
  masonryResizeObserver?.disconnect();
  if (!libraryList || typeof ResizeObserver === 'undefined') return;
  masonryResizeObserver = new ResizeObserver(() => resizeVisibleMasonryTiles());
  masonryResizeObserver.observe(libraryList);
}

function renderLibrary() {
  libraryAllTab.classList.toggle('active', libraryMode === 'all');
  libraryBoardsTab.classList.toggle('active', libraryMode === 'boards');
  updateLibraryActions();

  if (libraryMode === 'boards' && !activeBoardId) {
    renderBoardsGrid();
    return;
  }

  const items = visibleLibraryImages();
  if (!items.length) {
    const board = libraryBoards.find(entry => entry.id === activeBoardId);
    libraryList.className = 'library-list library-empty-wrap';
    libraryList.innerHTML = `
      <div class="library-empty library-empty-action">
        <strong>${board ? 'This board is empty.' : 'No generations yet.'}</strong>
        <span>${board ? 'Add images from All generations to start using this board as a visual source.' : 'Your generated images from the app, extension, and website will appear here.'}</span>
      </div>
    `;
    return;
  }

  libraryList.className = 'library-list masonry-library';
  libraryList.innerHTML = '';
  lightboxItems = items;
  observeMasonryLibrary();

  items.forEach((entry, index) => {
    const tile = document.createElement('article');
    tile.className = 'masonry-library-item';
    tile.dataset.key = entry.key;
    if (librarySelecting) tile.classList.add('selecting');
    if (selectedLibraryKeys.has(entry.key)) tile.classList.add('selected');

    const img = document.createElement('img');
    img.src = entry.url;
    img.alt = entry.prompt || 'Tack generation';
    img.loading = 'lazy';
    img.addEventListener('load', () => {
      tile.classList.add('loaded');
      resizeMasonryTile(tile);
    });

    const check = document.createElement('span');
    check.className = 'tile-check';
    check.textContent = '✓';

    const label = document.createElement('div');
    label.className = 'tile-label';
    const boards = getBoardsForImage(entry.url);
    label.innerHTML = `
      <strong>${escapeHtml(entry.prompt || 'Untitled generation')}</strong>
      <span>${formatLibraryDate(entry.createdAt)}${boards.length ? ` · ${boards.length} board${boards.length === 1 ? '' : 's'}` : ''}</span>
    `;

    const save = document.createElement('button');
    save.className = 'tile-save-btn';
    save.type = 'button';
    save.textContent = boards.length ? (boards.length === 1 ? boards[0].name : `${boards.length} boards`) : 'Save to board';
    save.addEventListener('click', event => {
      event.stopPropagation();
      toggleTileSavePopover(tile, entry);
    });

    tile.append(img, check, label, save);
    tile.addEventListener('click', event => {
      if (librarySelecting) {
        if (selectedLibraryKeys.has(entry.key)) selectedLibraryKeys.delete(entry.key);
        else selectedLibraryKeys.add(entry.key);
        updateLibraryActions();
        tile.classList.toggle('selected', selectedLibraryKeys.has(entry.key));
        return;
      }
      if (!event.target.closest('.tile-save-popover, .tile-save-btn')) closeTileSavePopovers();
      openLightbox(items, index);
    });

    libraryList.appendChild(tile);
    if (img.complete) resizeMasonryTile(tile);
  });
  const spacer = document.createElement('div');
  spacer.className = 'masonry-spacer';
  libraryList.appendChild(spacer);
  resizeVisibleMasonryTiles();
}

function closeTileSavePopovers() {
  activeTileSaveKey = '';
  document.querySelectorAll('.tile-save-popover').forEach(node => node.remove());
  document.querySelectorAll('.masonry-library-item.save-open').forEach(node => node.classList.remove('save-open'));
}

function positionTileSavePopover(tile, popover) {
  const rect = tile.getBoundingClientRect();
  const width = Math.min(390, Math.max(320, rect.width * 0.92));
  const margin = 18;
  const left = Math.min(
    Math.max(rect.left + 18, margin),
    window.innerWidth - width - margin
  );
  const preferredTop = rect.top + 52;
  const maxTop = window.innerHeight - Math.min(560, popover.offsetHeight || 460) - margin;
  const top = Math.max(margin, Math.min(preferredTop, maxTop));

  popover.style.width = `${width}px`;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function toggleTileSavePopover(tile, entry) {
  if (activeTileSaveKey === entry.key && tile.classList.contains('save-open')) {
    closeTileSavePopovers();
    return;
  }
  openTileSavePopover(tile, entry);
}

function openTileSavePopover(tile, entry) {
  closeTileSavePopovers();
  activeTileSaveKey = entry.key;
  tile.classList.add('save-open');

  const popover = document.createElement('section');
  popover.className = 'tile-save-popover';
  popover.addEventListener('click', event => event.stopPropagation());

  const existingBoards = getBoardsForImage(entry.url);
  const existingIds = new Set(existingBoards.map(board => board.id));
  const options = libraryBoards.map(board => {
    const itemCount = getBoardItems(board.id).length;
    const saved = existingIds.has(board.id);
    return `
      <button class="tile-board-option${saved ? ' saved' : ''}" type="button" data-board-id="${escapeAttr(board.id)}" ${saved ? 'disabled' : ''}>
        <span>${escapeHtml(board.name)}</span>
        <small>${saved ? 'Saved' : `${itemCount} image${itemCount === 1 ? '' : 's'}`}</small>
      </button>
    `;
  }).join('');

  popover.innerHTML = `
    <div class="tile-save-popover-head">
      <strong>Save to <em>board</em></strong>
      <button type="button" class="tile-save-close" aria-label="Close">×</button>
    </div>
    <div class="tile-board-options">
      ${options || '<p class="tile-save-empty">Create a board to save this image.</p>'}
    </div>
    <div class="tile-save-new">
      <input type="text" placeholder="Create new board" aria-label="Create new board">
      <button type="button">Save</button>
    </div>
    <p class="tile-save-error"></p>
  `;

  popover.querySelector('.tile-save-close')?.addEventListener('click', closeTileSavePopovers);
  popover.querySelectorAll('.tile-board-option:not(:disabled)').forEach(button => {
    button.addEventListener('click', async () => {
      await saveTileToBoard(entry, button.dataset.boardId, popover);
    });
  });

  const input = popover.querySelector('.tile-save-new input');
  const createButton = popover.querySelector('.tile-save-new button');
  createButton.addEventListener('click', async () => {
    await saveTileToNewBoard(entry, input.value, popover);
  });
  input.addEventListener('keydown', async event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await saveTileToNewBoard(entry, input.value, popover);
    }
    if (event.key === 'Escape') closeTileSavePopovers();
  });

  document.body.appendChild(popover);
  positionTileSavePopover(tile, popover);
  input.focus();
}

async function saveTileToBoard(entry, boardId, popover) {
  if (!boardId) return;
  await performTileSave(entry, async () => {
    await addImagesToBoard(boardId, [entry]);
  }, popover);
}

async function saveTileToNewBoard(entry, name, popover) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    const error = popover.querySelector('.tile-save-error');
    if (error) error.textContent = 'Name the board first.';
    return;
  }
  await performTileSave(entry, async () => {
    const board = await createBoard(trimmed);
    await addImagesToBoard(board.id, [entry]);
  }, popover);
}

async function performTileSave(entry, action, popover) {
  const error = popover.querySelector('.tile-save-error');
  const controls = popover.querySelectorAll('button, input');
  if (error) error.textContent = '';
  controls.forEach(control => { control.disabled = true; });
  try {
    await action();
    libraryBoards = await fetchBoards().catch(() => libraryBoards);
    libraryBoardItems = await fetchBoardItems().catch(() => libraryBoardItems);
    closeTileSavePopovers();
    renderLibrary();
  } catch (err) {
    if (error) error.textContent = err?.message || 'Could not save to board.';
    controls.forEach(control => { control.disabled = false; });
  }
}

function renderBoardsGrid() {
  libraryBoardContext.classList.add('hidden');
  if (!libraryBoards.length) {
    libraryList.className = 'library-list library-empty-wrap';
    libraryList.innerHTML = `
      <div class="library-empty library-empty-action">
        <strong>No boards yet.</strong>
        <span>Create a board to group generations you want to reuse as future style references.</span>
        <button id="empty-create-board" type="button">Create board</button>
      </div>
    `;
    document.querySelector('#empty-create-board')?.addEventListener('click', () => openBoardModal('create'));
    return;
  }

  libraryList.className = 'library-list boards-grid';
  libraryList.innerHTML = '';
  libraryBoards.forEach(board => {
    const items = getBoardItems(board.id);
    const previewItems = items.slice(0, 4).filter(item => item?.url);
    const card = document.createElement('article');
    card.className = 'board-card';
    card.innerHTML = `
      <div class="board-card-preview${previewItems.length ? '' : ' is-empty'}">
        ${previewItems.map(item => `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(board.name || 'Board preview')}" loading="lazy">`).join('')}
        ${previewItems.length ? '' : '<div class="board-card-placeholder"><span>No preview yet</span></div>'}
      </div>
      <div class="board-card-meta">
        <strong>${escapeHtml(board.name || 'Untitled board')}</strong>
        <span>${items.length} image${items.length === 1 ? '' : 's'}</span>
      </div>
    `;
    card.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => {
        img.classList.add('is-broken');
        img.removeAttribute('src');
        img.setAttribute('aria-label', 'Image unavailable');
      });
    });
    card.addEventListener('click', () => {
      activeBoardId = board.id;
      selectedLibraryKeys.clear();
      librarySelecting = false;
      renderLibrary();
    });
    libraryList.appendChild(card);
  });
}

function updateLibraryActions() {
  const inBoard = libraryMode === 'boards' && Boolean(activeBoardId);
  const showGallery = libraryMode === 'all' || inBoard;
  const selectedCount = selectedLibraryKeys.size;
  libraryBoardContext.classList.toggle('hidden', !inBoard);
  if (inBoard) {
    const board = libraryBoards.find(entry => entry.id === activeBoardId);
    const count = getBoardItems(activeBoardId).length;
    libraryBoardTitle.textContent = board?.name || 'Board';
    libraryBoardSubtitle.textContent = `${count} image${count === 1 ? '' : 's'} in this board`;
  }
  libraryCreateBoardBtn.classList.toggle('hidden', librarySelecting);
  librarySelectBtn.classList.toggle('hidden', librarySelecting || !showGallery);
  librarySaveBoardBtn.classList.toggle('hidden', !librarySelecting || inBoard);
  libraryDeleteBtn.classList.toggle('hidden', !librarySelecting);
  libraryCancelSelectBtn.classList.toggle('hidden', !librarySelecting);
  librarySaveBoardBtn.disabled = selectedCount === 0;
  libraryDeleteBtn.disabled = selectedCount === 0;
  librarySaveBoardBtn.textContent = selectedCount ? `Save ${selectedCount} to board` : 'Save to board';
  libraryDeleteBtn.textContent = inBoard
    ? (selectedCount ? `Remove ${selectedCount}` : 'Remove')
    : (selectedCount ? `Delete ${selectedCount}` : 'Delete');
}

function formatLibraryDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function selectedLibraryItems() {
  const byKey = new Map(visibleLibraryImages().map(item => [item.key, item]));
  return Array.from(selectedLibraryKeys).map(key => byKey.get(key)).filter(Boolean);
}

async function createBoard(name) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/boards`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ user_id: authUserId, name: name.trim() || 'Untitled board' }),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.message || 'Could not create board.');
  return Array.isArray(data) ? data[0] : data;
}

async function renameBoard(boardId, name) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/boards?id=eq.${encodeURIComponent(boardId)}&user_id=eq.${encodeURIComponent(authUserId)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name: name.trim() || 'Untitled board', updated_at: new Date().toISOString() }),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.message || 'Could not rename board.');
  return Array.isArray(data) ? data[0] : data;
}

async function addImagesToBoard(boardId, items) {
  const existing = new Set(libraryBoardItems.filter(item => item.board_id === boardId).map(item => item.image_url));
  const payload = items
    .filter(item => item?.url && !existing.has(item.url))
    .map((item, index) => ({
      board_id: boardId,
      user_id: authUserId,
      image_url: item.url,
      prompt: item.prompt || '',
      source_created_at: item.createdAt || null,
      position: index,
    }));
  if (!payload.length) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/board_items`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.message || 'Could not save to board.');
  return data;
}

async function deleteBoardItemsByIds(ids) {
  for (const id of ids.filter(Boolean)) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/board_items?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new Error('Could not remove image from board.');
  }
}

function openLightbox(items, index = 0) {
  lightboxItems = items.filter(item => item?.url);
  lightboxIndex = Math.max(0, Math.min(index, lightboxItems.length - 1));
  renderLightbox();
  lightbox.classList.remove('hidden');
}

function renderLightbox() {
  const item = lightboxItems[lightboxIndex];
  if (!item) return;
  lightboxImg.src = item.url;
  lightboxImg.alt = item.prompt || 'Tack generation';
  lightboxDownload.href = item.url;
  lightboxMeta.textContent = `${item.prompt || 'Untitled generation'}${item.createdAt ? ` · ${formatLibraryDate(item.createdAt)}` : ''}`;
  lightboxPrev.classList.toggle('hidden', lightboxItems.length < 2);
  lightboxNext.classList.toggle('hidden', lightboxItems.length < 2);
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  lightboxItems = [];
  lightboxIndex = -1;
}

function stepLightbox(delta) {
  if (lightboxItems.length < 2) return;
  lightboxIndex = (lightboxIndex + delta + lightboxItems.length) % lightboxItems.length;
  renderLightbox();
}

function openBoardModal(mode, board = null) {
  boardModalMode = mode;
  boardModalBoardId = board?.id || '';
  boardModalSelectedId = '';
  boardModalError.textContent = '';
  boardNameInput.value = mode === 'rename' ? board?.name || '' : '';
  boardModalList.innerHTML = '';
  boardModalList.classList.add('hidden');
  boardModalDivider.classList.add('hidden');

  if (mode === 'create') {
    boardModalTitle.innerHTML = 'Create <em>board</em>';
    boardModalSub.textContent = 'Create a board to group generations you want to reuse as future style references.';
    boardModalConfirm.textContent = 'Create board';
    boardNameInput.placeholder = 'Board name';
  } else if (mode === 'rename') {
    boardModalTitle.innerHTML = 'Rename <em>board</em>';
    boardModalSub.textContent = 'Update this board name. The images inside it will stay where they are.';
    boardModalConfirm.textContent = 'Rename board';
    boardNameInput.placeholder = 'Board name';
  } else {
    boardModalTitle.innerHTML = 'Save to <em>board</em>';
    boardModalSub.textContent = 'Choose an existing board, or create a new one for the selected images.';
    boardModalConfirm.textContent = 'Save';
    boardNameInput.placeholder = 'Or create a new board';
    if (libraryBoards.length) {
      boardModalList.classList.remove('hidden');
      boardModalDivider.classList.remove('hidden');
      libraryBoards.forEach(option => {
        const itemCount = getBoardItems(option.id).length;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'board-option';
        button.innerHTML = `${escapeHtml(option.name)}<span>${itemCount} image${itemCount === 1 ? '' : 's'}</span>`;
        button.addEventListener('click', () => {
          boardModalSelectedId = option.id;
          boardModalList.querySelectorAll('.board-option').forEach(node => node.classList.remove('selected'));
          button.classList.add('selected');
        });
        boardModalList.appendChild(button);
      });
    }
  }

  boardModal.classList.remove('hidden');
  boardNameInput.focus();
}

function closeBoardModal() {
  boardModal.classList.add('hidden');
  boardModalError.textContent = '';
}

async function confirmBoardModal() {
  const name = boardNameInput.value.trim();
  boardModalError.textContent = '';
  boardModalConfirm.disabled = true;
  try {
    let targetBoardId = boardModalSelectedId;
    if (boardModalMode === 'rename') {
      if (!boardModalBoardId) throw new Error('Choose a board to rename.');
      if (!name) throw new Error('Give this board a name.');
      const board = await renameBoard(boardModalBoardId, name);
      targetBoardId = board.id;
    } else if (boardModalMode === 'create' || name) {
      const board = await createBoard(name || 'Untitled board');
      targetBoardId = board.id;
      if (boardModalMode === 'create') {
        libraryMode = 'boards';
        activeBoardId = board.id;
      }
    }

    if (boardModalMode === 'save') {
      if (!targetBoardId) throw new Error('Choose a board or create one.');
      await addImagesToBoard(targetBoardId, selectedLibraryItems());
      libraryMode = 'boards';
      activeBoardId = targetBoardId;
      librarySelecting = false;
      selectedLibraryKeys.clear();
    }

    closeBoardModal();
    libraryBoards = await fetchBoards().catch(() => libraryBoards);
    libraryBoardItems = await fetchBoardItems().catch(() => libraryBoardItems);
    renderLibrary();
  } catch (error) {
    boardModalError.textContent = error?.message || 'Could not update board.';
  } finally {
    boardModalConfirm.disabled = false;
  }
}

function askForConfirmation(options = {}) {
  if (!confirmModal) return Promise.resolve(false);
  if (pendingConfirm) {
    pendingConfirm(false);
    pendingConfirm = null;
  }

  confirmModalEyebrow.textContent = options.eyebrow || 'Confirm';
  confirmModalTitle.textContent = options.title || 'Are you sure?';
  confirmModalCopy.textContent = options.copy || '';
  confirmModalConfirm.textContent = options.confirmLabel || 'Confirm';
  confirmModalConfirm.classList.toggle('danger', Boolean(options.destructive));
  confirmModal.classList.remove('hidden');
  confirmModalCancel.focus();

  return new Promise(resolve => {
    pendingConfirm = value => {
      confirmModal.classList.add('hidden');
      confirmModalConfirm.classList.remove('danger');
      pendingConfirm = null;
      resolve(value);
    };
  });
}

function resolveConfirmation(value) {
  if (pendingConfirm) pendingConfirm(value);
}

async function removeSelectedFromBoard() {
  const items = selectedLibraryItems();
  if (!items.length) return;
  const ok = await askForConfirmation({
    eyebrow: 'Remove from board',
    title: `Remove ${items.length} image${items.length === 1 ? '' : 's'}?`,
    copy: 'This only removes the selection from this board. The original generation will stay in your library.',
    confirmLabel: items.length === 1 ? 'Remove image' : 'Remove images',
    destructive: true,
  });
  if (!ok) return;
  await deleteBoardItemsByIds(items.map(item => item.boardItemId));
  libraryBoardItems = await fetchBoardItems().catch(() => libraryBoardItems);
  selectedLibraryKeys.clear();
  librarySelecting = false;
  renderLibrary();
}

async function updateGenerationImages(generationId, imageUrls) {
  if (!imageUrls.length) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/generations?id=eq.${encodeURIComponent(generationId)}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new Error('Could not delete generation.');
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/generations?id=eq.${encodeURIComponent(generationId)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image_urls: imageUrls }),
  });
  if (!response.ok) throw new Error('Could not update generation.');
}

async function deleteBoardItemsForUrls(urls) {
  const matches = libraryBoardItems.filter(item => urls.has(item.image_url));
  await deleteBoardItemsByIds(matches.map(item => item.id));
}

async function deleteSelectedGenerations() {
  const selected = selectedLibraryItems();
  if (!selected.length) return;
  const ok = await askForConfirmation({
    eyebrow: 'Delete from library',
    title: `Delete ${selected.length} image${selected.length === 1 ? '' : 's'}?`,
    copy: 'This removes the selection from your saved generations and any boards that use it. This cannot be undone.',
    confirmLabel: selected.length === 1 ? 'Delete image' : 'Delete images',
    destructive: true,
  });
  if (!ok) return;
  const selectedUrls = new Set(selected.map(item => item.url));
  const plans = libraryGenerations.map(generation => {
    const urls = normalizeImageUrls(generation.image_urls);
    const remaining = urls.filter(url => !selectedUrls.has(url));
    return remaining.length === urls.length ? null : { id: generation.id, remaining };
  }).filter(Boolean);
  await Promise.all(plans.map(plan => updateGenerationImages(plan.id, plan.remaining)));
  await deleteBoardItemsForUrls(selectedUrls);
  selectedLibraryKeys.clear();
  librarySelecting = false;
  const [generations, boards, boardItems] = await Promise.all([
    fetchGenerations(),
    fetchBoards().catch(() => libraryBoards),
    fetchBoardItems().catch(() => libraryBoardItems),
  ]);
  libraryGenerations = generations;
  libraryImages = flattenGenerations(generations);
  libraryBoards = boards;
  libraryBoardItems = boardItems;
  renderLibrary();
}

function renderLibrarySignedOut() {
  libraryMode = 'all';
  activeBoardId = '';
  librarySelecting = false;
  selectedLibraryKeys.clear();
  libraryAllTab.classList.add('active');
  libraryBoardsTab.classList.remove('active');
  libraryBoardContext.classList.add('hidden');
  libraryList.className = 'library-list library-empty-wrap';
  updateLibraryActions();
  libraryList.innerHTML = `
    <div class="library-empty library-empty-action">
      <strong>Sign in to sync your Tack Library.</strong>
      <span>Your saved generations from the website, browser extension, and desktop app will appear here.</span>
      <button id="library-signin-btn" type="button">Sign in</button>
    </div>
  `;
  document.querySelector('#library-signin-btn')?.addEventListener('click', () => showAuth('login'));
}

function showAppView(view) {
  const isLibrary = view === 'library';
  const isAccount = view === 'account';
  browseView.classList.toggle('hidden', isLibrary || isAccount);
  libraryView.classList.toggle('hidden', !isLibrary);
  accountView.classList.toggle('hidden', !isAccount);
  browserShell.classList.toggle('library-mode', isLibrary || isAccount);
  setActiveRail(isLibrary ? railLibraryBtn : isAccount ? railAccountBtn : railBrowserBtn);
  if (isLibrary) loadAccountGenerations();
  if (isAccount) updateAccountUI();
}

async function refreshVisibleAccountData() {
  if (!authToken || !authUserId) return;
  if (document.visibilityState && document.visibilityState !== 'visible') return;
  const hasFreshAuth = await ensureFreshAuthSession();
  if (!hasFreshAuth) return;
  if (!libraryView.classList.contains('hidden')) {
    loadAccountGenerations();
  } else if (!accountView.classList.contains('hidden')) {
    fetchPlan().catch(() => {});
  }
}

function openLibraryView() {
  showAppView('library');
}

function openAccountView() {
  showAppView('account');
}

function setActiveRail(activeButton) {
  document.querySelectorAll('.rail-btn').forEach(button => {
    button.classList.toggle('active', button === activeButton);
  });
}

function renderGeneratingState(count) {
  stopGenerationProgress();
  const steps = [
    'Reading the visual language of your selections...',
    'Blending those references into one shared style direction...',
    'Writing prompts and generating images...',
    'Finishing the final images...',
  ];
  let index = 0;

  results.classList.remove('hidden');
  results.classList.add('is-generating');
  results.innerHTML = `
    <div class="loading-msg" role="status" aria-live="polite">
      <div class="brand-loader" aria-hidden="true">
        <span class="brand-loader-dot"></span>
        <span class="brand-loader-dot"></span>
        <span class="brand-loader-dot"></span>
        <span class="brand-loader-dot"></span>
      </div>
      <span id="generation-progress-copy">${steps[0]}</span>
    </div>
  `;
  generationProgressTimer = setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    const copy = document.getElementById('generation-progress-copy');
    if (copy) copy.textContent = steps[index];
  }, 9000);
  scrollPanelToResults();
}

function stopGenerationProgress() {
  if (!generationProgressTimer) return;
  clearInterval(generationProgressTimer);
  generationProgressTimer = null;
}

function renderError(message) {
  stopGenerationProgress();
  results.classList.remove('hidden');
  results.classList.remove('is-generating');
  results.innerHTML = `
    <div class="result-head">
      <strong>Generation</strong>
    </div>
    <p class="error-msg">${escapeHtml(message)}</p>
  `;
  scrollPanelToResults();
}

function createCompactTextBlock(title, text, options = {}) {
  const { copyValue = '' } = options;
  const block = document.createElement('div');
  block.className = 'compact-block compact-copy-block';

  const heading = document.createElement('strong');
  heading.textContent = title;

  const content = document.createElement('div');
  content.className = 'compact-copy-content is-collapsed';

  const paragraph = document.createElement('p');
  paragraph.className = title === 'Image Prompt'
    ? 'prompt-text compact-copy-text'
    : 'style-descriptors compact-copy-text';
  paragraph.textContent = text;
  content.appendChild(paragraph);

  const actions = document.createElement('div');
  actions.className = 'compact-copy-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'compact-copy-toggle';
  toggleBtn.type = 'button';
  toggleBtn.textContent = 'Show full text';
  toggleBtn.addEventListener('click', () => {
    const expanded = content.classList.toggle('is-expanded');
    content.classList.toggle('is-collapsed', !expanded);
    toggleBtn.textContent = expanded ? 'Show less' : 'Show full text';
  });
  actions.appendChild(toggleBtn);

  if (copyValue) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-prompt-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy prompt';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyValue);
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy prompt';
        }, 1600);
      } catch {
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => {
          copyBtn.textContent = 'Copy prompt';
        }, 1600);
      }
    });
    actions.appendChild(copyBtn);
  }

  block.append(heading, content, actions);
  return block;
}

function createGenerationDetails(styleDescriptors, prompt) {
  const details = document.createElement('details');
  details.className = 'generation-details';

  const summary = document.createElement('summary');
  summary.textContent = 'Generation details';
  details.appendChild(summary);

  if (styleDescriptors) {
    details.appendChild(createCompactTextBlock('Style Analysis', styleDescriptors));
  }

  if (prompt) {
    details.appendChild(createCompactTextBlock('Image Prompt', prompt, { copyValue: prompt }));
  }

  return details;
}

function renderResults(data) {
  stopGenerationProgress();
  const styleDescriptors = data?.styleDescriptors || '';
  const prompt = data?.prompt || '';
  const images = Array.isArray(data?.images) ? data.images : [];

  results.classList.remove('hidden');
  results.classList.remove('is-generating');
  results.innerHTML = '';

  const sections = document.createElement('div');
  sections.className = 'result-section is-generated';

  if (images.length) {
    const imageBlock = document.createElement('div');
    imageBlock.className = 'generated-block';
    imageBlock.innerHTML = `
      <div class="result-head">
        <strong>Generated Images</strong>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'result-grid';
    grid.innerHTML = images.map((image, index) => `
      <button class="result-card" type="button" data-result-index="${index}">
        <img src="${escapeAttr(image)}" alt="Generated image ${index + 1}">
        <span>Generated ${index + 1}</span>
      </button>
    `).join('');
    grid.querySelectorAll('.result-card').forEach(card => {
      card.addEventListener('click', () => {
        const index = Number(card.dataset.resultIndex || 0);
        openLightbox(images.map((url, itemIndex) => ({
          key: `generated:${itemIndex}`,
          url,
          prompt: prompt || `Generated image ${itemIndex + 1}`,
          createdAt: '',
        })), index);
      });
    });
    imageBlock.appendChild(grid);
    sections.appendChild(imageBlock);
  }

  if (styleDescriptors || prompt) {
    sections.appendChild(createGenerationDetails(styleDescriptors, prompt));
  }

  if (!sections.children.length) {
    const block = document.createElement('div');
    block.className = 'compact-block';
    block.innerHTML = '<p>No results returned. Try another reference set.</p>';
    sections.appendChild(block);
  }

  results.appendChild(sections);
  scrollPanelToResults();
}

function getAnonymousId() {
  const key = 'tack-browser-anonymous-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

addressForm.addEventListener('submit', event => {
  event.preventDefault();
  loadUrl(addressInput.value);
});

backBtn.addEventListener('click', () => {
  if (webview.canGoBack()) webview.goBack();
});

forwardBtn.addEventListener('click', () => {
  if (webview.canGoForward()) webview.goForward();
});

reloadBtn.addEventListener('click', () => webview.reload());
scanBtn?.addEventListener('click', () => scanPage({ manual: true }));
selectBtn.addEventListener('click', () => setSelectionMode(!selectionMode));
captureBtn.addEventListener('click', () => setCaptureMode(!captureMode));
clearBtn.addEventListener('click', () => {
  refs.clear();
  results.classList.add('hidden');
  renderReferences();
});
subjectInput.addEventListener('input', renderReferences);
generateBtn.addEventListener('click', generateWithTack);
authSubmit.addEventListener('click', handleEmailAuth);
googleAuthBtn.addEventListener('click', handleGoogleAuth);
forgotPasswordBtn.addEventListener('click', sendPasswordReset);
authClose.addEventListener('click', hideAuth);
authBackdrop.addEventListener('click', hideAuth);
authEmailInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') authPasswordInput.focus();
});
authPasswordInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') handleEmailAuth();
});
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode));
});

accountSigninBtn.addEventListener('click', () => {
  showAuth('login');
});
accountSignupBtn.addEventListener('click', () => showAuth('signup'));
accountSignedoutSignin?.addEventListener('click', () => showAuth('login'));
accountSignedoutSignup?.addEventListener('click', () => showAuth('signup'));
accountManageBtn.addEventListener('click', () => {
  const params = new URLSearchParams();
  if (authEmail) params.set('email', authEmail);
  if (plan) params.set('current', plan);
  params.set('source', 'desktop');
  window.tackDesktop.openExternal(`https://tack.design/upgrade?${params.toString()}`);
});
accountSignoutBtn.addEventListener('click', signOut);
accountBrowseShortcut?.addEventListener('click', () => showAppView('browse'));
accountLibraryShortcut?.addEventListener('click', openLibraryView);
accountWebsiteShortcut?.addEventListener('click', () => window.tackDesktop.openExternal('https://tack.design/account?view=generations'));
railCollapseToggle?.addEventListener('click', () => {
  setRailCollapsed(!appShell?.classList.contains('rail-collapsed'));
});
bookmarksToggle?.addEventListener('click', () => {
  setBookmarksCollapsed(!browserShell?.classList.contains('bookmarks-collapsed'));
});
libraryRefreshBtn?.addEventListener('click', loadAccountGenerations);
libraryOpenWebBtn?.addEventListener('click', () => window.tackDesktop.openExternal('https://tack.design/account?view=generations'));
libraryAllTab.addEventListener('click', () => {
  libraryMode = 'all';
  activeBoardId = '';
  librarySelecting = false;
  selectedLibraryKeys.clear();
  renderLibrary();
});
libraryBoardsTab.addEventListener('click', () => {
  libraryMode = 'boards';
  activeBoardId = '';
  librarySelecting = false;
  selectedLibraryKeys.clear();
  renderLibrary();
});
libraryCreateBoardBtn.addEventListener('click', () => openBoardModal('create'));
librarySelectBtn.addEventListener('click', () => {
  librarySelecting = true;
  selectedLibraryKeys.clear();
  renderLibrary();
});
libraryCancelSelectBtn.addEventListener('click', () => {
  librarySelecting = false;
  selectedLibraryKeys.clear();
  renderLibrary();
});
librarySaveBoardBtn.addEventListener('click', () => openBoardModal('save'));
libraryDeleteBtn.addEventListener('click', () => {
  if (libraryMode === 'boards' && activeBoardId) removeSelectedFromBoard();
  else deleteSelectedGenerations();
});
libraryBoardBackBtn.addEventListener('click', () => {
  activeBoardId = '';
  librarySelecting = false;
  selectedLibraryKeys.clear();
  renderLibrary();
});
libraryBoardRenameBtn.addEventListener('click', () => {
  const board = libraryBoards.find(entry => entry.id === activeBoardId);
  if (board) openBoardModal('rename', board);
});
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', event => {
  if (event.target === lightbox) closeLightbox();
});
lightboxPrev.addEventListener('click', () => stepLightbox(-1));
lightboxNext.addEventListener('click', () => stepLightbox(1));
boardModalCancel.addEventListener('click', closeBoardModal);
boardModalConfirm.addEventListener('click', confirmBoardModal);
boardModal.addEventListener('click', event => {
  if (event.target === boardModal) closeBoardModal();
});
boardNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') confirmBoardModal();
});
confirmModalCancel?.addEventListener('click', () => resolveConfirmation(false));
confirmModalConfirm?.addEventListener('click', () => resolveConfirmation(true));
confirmModal?.addEventListener('click', event => {
  if (event.target === confirmModal) resolveConfirmation(false);
});
railBrowserBtn.addEventListener('click', () => {
  showAppView('browse');
});
brandButton?.addEventListener('click', openLibraryView);
railLibraryBtn.addEventListener('click', openLibraryView);
railAccountBtn.addEventListener('click', openAccountView);
document.addEventListener('keydown', event => {
  if (!lightbox.classList.contains('hidden')) {
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') stepLightbox(-1);
    if (event.key === 'ArrowRight') stepLightbox(1);
  }
  if (!boardModal.classList.contains('hidden') && event.key === 'Escape') closeBoardModal();
  if (!confirmModal?.classList.contains('hidden') && event.key === 'Escape') resolveConfirmation(false);
  if (event.key === 'Escape') closeTileSavePopovers();
});

document.addEventListener('click', event => {
  if (event.target.closest('.tile-save-popover, .tile-save-btn')) return;
  closeTileSavePopovers();
});

window.addEventListener('resize', () => {
  closeTileSavePopovers();
  resizeVisibleMasonryTiles();
});
window.addEventListener('focus', refreshVisibleAccountData);
window.addEventListener('online', refreshVisibleAccountData);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshVisibleAccountData();
});
libraryList?.addEventListener('scroll', closeTileSavePopovers, { passive: true });

if (tackPanel) {
  tackPanel.addEventListener('wheel', event => {
    event.stopPropagation();
  }, { passive: true });
}

openExternalBtn.addEventListener('click', () => {
  window.tackDesktop.openExternal(currentUrl());
});

if (tabs) {
  setRailCollapsed(storageFlag(RAIL_COLLAPSED_STORAGE_KEY));
  setBookmarksCollapsed(storageFlag(BOOKMARKS_COLLAPSED_STORAGE_KEY));
  renderBookmarks();
  tabs.addEventListener('dragover', event => {
    if (!getDroppedUrl(event)) return;
    event.preventDefault();
    tabs.classList.add('is-drop-target');
    event.dataTransfer.dropEffect = 'copy';
  });
  tabs.addEventListener('dragleave', event => {
    if (!tabs.contains(event.relatedTarget)) tabs.classList.remove('is-drop-target');
  });
  tabs.addEventListener('drop', event => {
    const url = getDroppedUrl(event);
    if (!url) return;
    event.preventDefault();
    tabs.classList.remove('is-drop-target');
    addBookmarkFromUrl(url);
  });
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(item => item.classList.remove('active'));
    chip.classList.add('active');
    aspectRatio = chip.dataset.aspectRatio || DEFAULT_ASPECT_RATIO;
  });
});

webview.addEventListener('did-start-loading', () => {
  loadingOverlay.classList.remove('hidden');
  scanCount.textContent = 'Loading page...';
  scanNote.textContent = '';
});

webview.addEventListener('did-stop-loading', () => {
  loadingOverlay.classList.add('hidden');
  addressInput.value = currentUrl();
  setActiveBookmark();
  setTimeout(scanPage, 600);
});

webview.addEventListener('did-navigate', event => {
  addressInput.value = event.url;
  setActiveBookmark(event.url);
});

webview.addEventListener('did-navigate-in-page', event => {
  addressInput.value = event.url;
  setActiveBookmark(event.url);
});

webview.addEventListener('page-title-updated', event => {
  document.querySelector('#page-title').textContent = event.title || 'Browse visually. Select references in context.';
});

webview.addEventListener('console-message', event => {
  const message = event.message || '';
  if (message.startsWith('__TACK_PINTEREST_AUTH__')) {
    if (pinterestAuthOpening) return;
    pinterestAuthOpening = true;
    let url = currentUrl();
    try {
      url = JSON.parse(message.replace('__TACK_PINTEREST_AUTH__', '')).url || url;
    } catch {}
    window.tackDesktop.openPinterestAuthWindow(url)
      .finally(() => {
        pinterestAuthOpening = false;
        webview.reload();
      });
    return;
  }
  if (!message.startsWith('__TACK_REFERENCE__')) return;
  try {
    upsertReference(JSON.parse(message.replace('__TACK_REFERENCE__', '')));
  } catch {}
});

captureLayer.addEventListener('mousedown', event => {
  captureStart = { x: event.offsetX, y: event.offsetY };
  captureRect.classList.remove('hidden');
  captureRect.style.left = `${captureStart.x}px`;
  captureRect.style.top = `${captureStart.y}px`;
  captureRect.style.width = '0px';
  captureRect.style.height = '0px';
});

captureLayer.addEventListener('mousemove', event => {
  if (!captureStart) return;
  const left = Math.min(captureStart.x, event.offsetX);
  const top = Math.min(captureStart.y, event.offsetY);
  const width = Math.abs(event.offsetX - captureStart.x);
  const height = Math.abs(event.offsetY - captureStart.y);
  captureRect.style.left = `${left}px`;
  captureRect.style.top = `${top}px`;
  captureRect.style.width = `${width}px`;
  captureRect.style.height = `${height}px`;
});

window.addEventListener('mouseup', async () => {
  if (!captureStart) return;
  const rect = {
    x: parseFloat(captureRect.style.left) || 0,
    y: parseFloat(captureRect.style.top) || 0,
    width: parseFloat(captureRect.style.width) || 0,
    height: parseFloat(captureRect.style.height) || 0,
  };
  captureStart = null;
  captureRect.classList.add('hidden');
  setCaptureMode(false);
  if (rect.width > 60 && rect.height > 60) await captureRegion(rect);
});

renderReferences();
initPlatform();
initAuth();
