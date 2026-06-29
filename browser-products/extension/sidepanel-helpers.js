'use strict';

(function attachTackHelpers(global) {
  function clearElement(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function createEl(tag, options = {}) {
    const { className, textContent, attrs = {}, dataset = {} } = options;
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) el.setAttribute(key, value);
    });
    Object.entries(dataset).forEach(([key, value]) => {
      if (value !== undefined && value !== null) el.dataset[key] = value;
    });
    return el;
  }

  function createResultBlock(title) {
    const block = createEl('div', { className: 'result-block' });
    block.appendChild(createEl('h3', { textContent: title }));
    return block;
  }

  function renderInlineActionMessage(container, message, actionLabel, action) {
    clearElement(container);
    container.appendChild(document.createTextNode(`${message} `));
    const button = createEl('button', {
      className: 'link-btn',
      textContent: actionLabel,
      attrs: { type: 'button' },
    });
    button.addEventListener('click', action);
    container.appendChild(button);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  function sanitizeFilename(name) {
    const safe = (name || 'tack-image.png')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return safe || 'tack-image.png';
  }

  function mimeTypeToExtension(mimeType) {
    const normalized = (mimeType || '').split(';')[0].trim().toLowerCase();
    if (normalized === 'image/jpeg') return '.jpg';
    if (normalized === 'image/png') return '.png';
    if (normalized === 'image/webp') return '.webp';
    if (normalized === 'image/gif') return '.gif';
    return '';
  }

  function normalizeImageFilename(filename, mimeType) {
    const extension = mimeTypeToExtension(mimeType);
    if (!extension) return filename;
    return filename.replace(/\.[a-z0-9]+$/i, '') + extension;
  }

  function getUserIdFromToken(token) {
    try {
      return JSON.parse(atob(token.split('.')[1])).sub || null;
    } catch {
      return null;
    }
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

  global.TackHelpers = {
    clearElement,
    createEl,
    createResultBlock,
    renderInlineActionMessage,
    escHtml,
    escAttr,
    sanitizeFilename,
    normalizeImageFilename,
    mimeTypeToExtension,
    getUserIdFromToken,
    formatHistoryDate,
  };
})(window);
