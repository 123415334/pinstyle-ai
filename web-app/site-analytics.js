(function () {
  if (location.pathname === '/digital-home' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname)) return;
  const key = 'tack_site_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  const params = new URLSearchParams(location.search);
  const referrerDomain = (() => { try { return document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })();
  function send(eventName, extra) {
    let accessToken = '';
    try { accessToken = JSON.parse(localStorage.getItem('tack_session') || 'null')?.access_token || ''; } catch {}
    const payload = {
      event_name: eventName,
      anonymous_id: id,
      page_url: location.href,
      metadata: {
        path: location.pathname,
        referrer_domain: referrerDomain || null,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        ...extra,
      },
    };
    fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  }
  send('site_page_view');
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const href = link.href || '';
    if (/chromewebstore\.google\.com/.test(href)) send('site_store_link_clicked', { destination: 'chrome_web_store' });
    else if (link.matches('.cta-primary, [data-analytics="primary-cta"]')) send('site_primary_cta_clicked', { destination: href.slice(0, 300) });
  }, { capture: true });
})();
