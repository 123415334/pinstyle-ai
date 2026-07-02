const { applyCors } = require('./_security');

const MAX_ROWS = 10000;

function listEnv(name) {
  return String(process.env[name] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

async function validateAdmin(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { error: 'Sign in to open the Digital Home.', status: 401 };
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!response.ok) return { error: 'Your session has expired.', status: 401 };
  const user = await response.json();
  const admins = listEnv('ADMIN_EMAILS');
  if (!admins.length) return { error: 'Digital Home access is not configured. Add ADMIN_EMAILS in Vercel.', status: 503 };
  if (!admins.includes(String(user.email || '').toLowerCase())) return { error: 'This account does not have Digital Home access.', status: 403 };
  return { user };
}

async function table(path, optional = false) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Accept: 'application/json',
      Range: `0-${MAX_ROWS - 1}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) {
    if (optional && response.status === 404) return [];
    throw new Error(`Supabase query failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function dayKey(value) {
  return String(value || '').slice(0, 10);
}

function identity(event) {
  if (event.user_id) return `user:${event.user_id}`;
  if (event.anonymous_id) return `anon:${event.anonymous_id}`;
  return `event:${event.id}`;
}

function percent(value, total) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function buildDashboard({ profiles, events, generations, chromeMetrics, user, days, extraTestEmails, extraTestIds }) {
  const adminEmail = String(user.email || '').toLowerCase();
  const excludedEmails = new Set([adminEmail, ...listEnv('ADMIN_TEST_EMAILS'), ...extraTestEmails.map(String).map(v => v.toLowerCase())]);
  const excludedAnonIds = new Set([...listEnv('ADMIN_TEST_ANONYMOUS_IDS'), ...extraTestIds.map(String)]);
  const profilesById = new Map(profiles.map(profile => [profile.id, profile]));
  const excludedUserIds = new Set(profiles.filter(profile => excludedEmails.has(String(profile.email || '').toLowerCase())).map(profile => profile.id));
  events.forEach(event => {
    if (event.user_id && excludedUserIds.has(event.user_id) && event.anonymous_id) excludedAnonIds.add(event.anonymous_id);
  });
  const isTest = event => excludedUserIds.has(event.user_id) || excludedAnonIds.has(event.anonymous_id);
  const cutoff = days === 0 ? 0 : Date.now() - days * 86400000;
  const inRange = value => !cutoff || new Date(value).getTime() >= cutoff;
  const rangeEvents = events.filter(event => inRange(event.created_at));
  const authenticEvents = rangeEvents.filter(event => !isTest(event));
  const testEvents = rangeEvents.filter(isTest);
  const anonToUser = new Map(authenticEvents.filter(event => event.anonymous_id && event.user_id).map(event => [event.anonymous_id, event.user_id]));
  const eventIdentity = event => event.user_id
    ? `user:${event.user_id}`
    : (anonToUser.has(event.anonymous_id) ? `user:${anonToUser.get(event.anonymous_id)}` : identity(event));
  const authenticProfiles = profiles.filter(profile => !excludedUserIds.has(profile.id));
  const paidProfiles = authenticProfiles.filter(profile => ['pro', 'studio'].includes(profile.plan));

  const identities = new Set(authenticEvents.map(eventIdentity));
  const anonymousIdentities = new Set(authenticEvents.filter(event => eventIdentity(event).startsWith('anon:')).map(eventIdentity));
  const signedIdentities = new Set(authenticEvents.filter(event => eventIdentity(event).startsWith('user:')).map(eventIdentity));
  const successfulIdentities = new Set(authenticEvents.filter(event => event.event_name === 'generate_succeeded').map(eventIdentity));
  const signupIdentities = new Set(authenticEvents.filter(event => event.event_name === 'signup_completed').map(eventIdentity));

  const funnelNames = [
    ['Opened', 'extension_opened'], ['Scanned', 'images_scanned'], ['Selected', 'image_selected'],
    ['Prompted', 'prompt_entered'], ['Tried generation', 'generate_clicked'], ['Generated', 'generate_succeeded'],
    ['Saw signup', 'auth_modal_opened'], ['Signed up', 'signup_completed'],
  ];
  const funnel = funnelNames.map(([label, name]) => {
    const count = new Set(authenticEvents.filter(event => event.event_name === name).map(eventIdentity)).size;
    return { label, event: name, people: count };
  });
  const opened = funnel[0].people;
  funnel.forEach(step => { step.fromOpen = percent(step.people, opened); });

  const dailyMap = new Map();
  authenticEvents.forEach(event => {
    const day = dayKey(event.created_at);
    if (!dailyMap.has(day)) dailyMap.set(day, { day, events: 0, people: new Set(), generations: 0, signups: 0 });
    const row = dailyMap.get(day);
    row.events += 1;
    row.people.add(eventIdentity(event));
    if (event.event_name === 'generate_succeeded') row.generations += 1;
    if (event.event_name === 'signup_completed') row.signups += 1;
  });
  const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day)).map(row => ({ ...row, people: row.people.size }));

  const domainMap = new Map();
  authenticEvents.filter(event => event.page_domain).forEach(event => {
    const domain = event.page_domain;
    if (!domainMap.has(domain)) domainMap.set(domain, { domain, events: 0, people: new Set(), generations: 0 });
    const row = domainMap.get(domain);
    row.events += 1;
    row.people.add(eventIdentity(event));
    if (event.event_name === 'generate_succeeded') row.generations += 1;
  });
  const domains = [...domainMap.values()].map(row => ({ ...row, people: row.people.size })).sort((a, b) => b.people - a.people || b.events - a.events).slice(0, 12);

  const peopleMap = new Map();
  authenticEvents.forEach(event => {
    const key = eventIdentity(event);
    const canonicalUserId = key.startsWith('user:') ? key.slice(5) : null;
    const profile = profilesById.get(canonicalUserId);
    if (!peopleMap.has(key)) peopleMap.set(key, {
      id: key, email: profile?.email || null, plan: profile?.plan || event.plan || 'anonymous', firstSeen: event.created_at,
      lastSeen: event.created_at, events: 0, generations: 0, domains: new Set(), signedIn: Boolean(canonicalUserId),
    });
    const row = peopleMap.get(key);
    row.events += 1;
    if (event.created_at < row.firstSeen) row.firstSeen = event.created_at;
    if (event.created_at > row.lastSeen) row.lastSeen = event.created_at;
    if (event.event_name === 'generate_succeeded') row.generations += 1;
    if (event.page_domain) row.domains.add(event.page_domain);
  });
  const people = [...peopleMap.values()].map(row => ({ ...row, domains: [...row.domains] })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  const recentGenerations = generations.filter(row => !excludedUserIds.has(row.user_id) && inRange(row.created_at)).map(row => ({
    id: row.id, createdAt: row.created_at, email: profilesById.get(row.user_id)?.email || null,
    prompt: row.prompt || '', images: Array.isArray(row.image_urls) ? row.image_urls : [],
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 18);

  const chromeLatest = chromeMetrics.length ? chromeMetrics.reduce((latest, row) => row.imported_at > latest ? row.imported_at : latest, '') : null;
  const chrome = chromeMetrics.filter(row => !cutoff || new Date(`${row.metric_date}T23:59:59Z`).getTime() >= cutoff).map(row => ({
    type: row.metric_type, date: row.metric_date, dimension: row.dimension || 'total', value: Number(row.value || 0), importedAt: row.imported_at,
  }));

  const signals = [];
  if (opened && successfulIdentities.size / opened >= 0.5) signals.push({ tone: 'good', title: 'People who engage tend to generate', body: `${successfulIdentities.size} of ${opened} authentic openers reached a successful generation.` });
  const selected = funnel.find(step => step.event === 'image_selected')?.people || 0;
  const prompted = funnel.find(step => step.event === 'prompt_entered')?.people || 0;
  if (selected > prompted) signals.push({ tone: 'watch', title: 'The prompt is a friction point', body: `${selected - prompted} people selected imagery but did not reach a prompt.` });
  if (!paidProfiles.length) signals.push({ tone: 'quiet', title: 'Activation before monetization', body: 'No authentic paid profiles are visible. Focus on first generation and return usage before pricing optimization.' });
  if (testEvents.length > authenticEvents.length) signals.push({ tone: 'info', title: 'Testing dominates raw event volume', body: `${testEvents.length} test events are excluded so the dashboard reflects authentic behavior.` });

  return {
    generatedAt: new Date().toISOString(), rangeDays: days, exclusions: { emails: [...excludedEmails], anonymousIds: [...excludedAnonIds], testEvents: testEvents.length },
    summary: {
      authenticPeople: identities.size, anonymousPeople: anonymousIdentities.size, signedInPeople: signedIdentities.size,
      successfulPeople: successfulIdentities.size, successfulGenerations: authenticEvents.filter(e => e.event_name === 'generate_succeeded').length,
      signups: signupIdentities.size, accounts: authenticProfiles.length, paidSubscribers: paidProfiles.length,
      generationRate: percent(successfulIdentities.size, identities.size), testEventsExcluded: testEvents.length,
    },
    funnel, daily, domains, people, recentGenerations, signals,
    plans: ['free', 'pro', 'studio'].map(plan => ({ plan, people: authenticProfiles.filter(profile => profile.plan === plan).length })),
    chrome: { rows: chrome, latestImport: chromeLatest, connected: chromeMetrics.length > 0 },
    sources: {
      supabase: { status: 'live', detail: `${events.length} product events available` },
      chrome: { status: chromeMetrics.length ? 'imported' : 'needs_import', detail: chromeLatest ? `Last imported ${chromeLatest}` : 'Upload Chrome Store CSV exports' },
      vercel: { status: 'external', detail: 'Open Vercel Analytics for site traffic and referrers' },
    },
  };
}

async function importChrome(rows, user) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000) throw new Error('Chrome import must contain 1–5,000 rows.');
  const clean = rows.map(row => ({
    metric_type: String(row.type || '').slice(0, 80), metric_date: String(row.date || '').slice(0, 10),
    dimension: String(row.dimension || 'total').slice(0, 120), value: Math.max(0, Number(row.value) || 0), imported_by: user.id,
  })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.metric_date) && row.metric_type);
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_chrome_metrics?on_conflict=metric_type,metric_date,dimension`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, apikey: process.env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(clean),
  });
  if (!response.ok) throw new Error('Chrome import table is unavailable. Run migration v9 first.');
  return clean.length;
}

module.exports = async function handler(req, res) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Supabase is not configured.' });
  try {
    const auth = await validateAdmin(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    if (req.body?.action === 'import_chrome') {
      const imported = await importChrome(req.body.rows, auth.user);
      return res.status(200).json({ ok: true, imported });
    }
    const days = [0, 7, 30, 90].includes(Number(req.body?.days)) ? Number(req.body.days) : 30;
    const [profiles, events, generations, chromeMetrics] = await Promise.all([
      table('user_profiles?select=id,email,plan,generations_used,monthly_generations,created_at&order=created_at.asc'),
      table('analytics_events?select=id,created_at,anonymous_id,user_id,event_name,plan,page_domain,selected_image_count,output_count,anon_count,error_code,metadata&order=created_at.asc'),
      table('generations?select=id,user_id,prompt,image_urls,created_at&order=created_at.desc'),
      table('admin_chrome_metrics?select=metric_type,metric_date,dimension,value,imported_at&order=metric_date.asc', true),
    ]);
    return res.status(200).json(buildDashboard({
      profiles, events, generations, chromeMetrics, user: auth.user, days,
      extraTestEmails: Array.isArray(req.body?.excludeEmails) ? req.body.excludeEmails.slice(0, 20) : [],
      extraTestIds: Array.isArray(req.body?.excludeAnonymousIds) ? req.body.excludeAnonymousIds.slice(0, 50) : [],
    }));
  } catch (error) {
    console.error('[tack] admin dashboard failed:', error.message);
    return res.status(500).json({ error: error.message || 'Could not load Digital Home.' });
  }
};

module.exports._test = { buildDashboard, identity, percent };
