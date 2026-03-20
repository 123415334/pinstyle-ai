// Unescape JSON-encoded forward slashes: https:\/\/... -> https://...
function unpinUrl(url) {
  return url.replace(/\\\//g, '/');
}

// Call Pinterest's internal BoardFeedResource API to get up to 25 pin images
async function fetchBoardFeed(boardPath, boardId) {
  try {
    const options = {
      board_id: boardId,
      board_url: boardPath,
      currentFilter: -1,
      field_set_key: 'react_grid_pin',
      filter_section_pins: true,
      sort: 'default',
      layout: 'default',
      page_size: 25,
      redux_normalize_feed: true,
    };
    const dataParam = encodeURIComponent(JSON.stringify({ options, context: {} }));
    const srcParam = encodeURIComponent(boardPath);
    const apiUrl = `https://www.pinterest.com/resource/BoardFeedResource/get/?source_url=${srcParam}&data=${dataParam}&_=${Date.now()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `https://www.pinterest.com${boardPath}`,
        'X-Requested-With': 'XMLHttpRequest',
        'X-APP-VERSION': 'dae4f32',
        'X-Pinterest-AppState': 'active',
      },
    });
    clearTimeout(timer);

    console.log(`[scraper] BoardFeedResource status: ${resp.status}`);
    if (!resp.ok) return [];

    const json = await resp.json();
    const pins = json?.resource_response?.data || [];
    const urls = [];
    for (const pin of pins) {
      const url = pin?.images?.['736x']?.url
        || pin?.images?.['474x']?.url
        || pin?.images?.orig?.url
        || pin?.images?.['236x']?.url;
      if (url && url.includes('pinimg.com')) urls.push(url);
    }
    console.log(`[scraper] BoardFeedResource: ${urls.length} images from ${pins.length} pins`);
    return urls;
  } catch (e) {
    console.log(`[scraper] BoardFeedResource error: ${e.message}`);
    return [];
  }
}

// Fetch real pin image URLs from a public Pinterest board
async function scrapePinterestImages(boardUrl) {
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 10000);

  try {
    const parsed = new URL(boardUrl);
    const parts = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length < 2) return [];
    const [username, boardSlug] = parts;
    const boardPath = `/${username}/${boardSlug}/`;

    const resp = await fetch(boardUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    clearTimeout(abortTimer);

    console.log(`[scraper] Board page status: ${resp.status}`);
    if (!resp.ok) {
      console.log(`[scraper] Aborting — non-OK status ${resp.status}`);
      return [];
    }

    const finalUrl = resp.url || '';
    if (finalUrl.includes('/login') || finalUrl.includes('/auth')) {
      console.log(`[scraper] Redirected to login: ${finalUrl}`);
      return [];
    }

    const html = await resp.text();
    console.log(`[scraper] HTML length: ${html.length} chars`);

    const seen = new Set();
    const images = [];

    function addImage(rawUrl) {
      const url = unpinUrl(rawUrl || '');
      if (!url || seen.has(url) || !url.includes('pinimg.com')) return;
      seen.add(url);
      images.push(url);
    }

    // Extract board_id — needed for the BoardFeedResource API call
    let boardId = null;
    for (const pat of [
      /"board_id"\s*:\s*"(\d+)"/,
      /"boardId"\s*:\s*"(\d+)"/,
      /"id"\s*:\s*"(\d+)"\s*,\s*"type"\s*:\s*"board"/,
      /,"id":"(\d+)","name":"[^"]+","type":"board"/,
    ]) {
      const m = html.match(pat);
      if (m) { boardId = m[1]; break; }
    }
    console.log(`[scraper] board_id: ${boardId}`);

    // Strategy 1: regex over raw HTML
    // Matches both plain URLs (in meta tags) and JSON-escaped URLs (in script tags):
    //   plain:   https://i.pinimg.com/736x/ab/cd/ef.jpg
    //   escaped: https:\/\/i.pinimg.com\/736x\/ab\/cd\/ef.jpg
    // (?:\\\/|\/) matches either \/ or / so one pattern covers both forms.
    const sep = '(?:\\\\\/|\/)';  // matches \/ or /
    const size = '(?:736x|474x|236x|originals|orig)';
    const segment = '[a-zA-Z0-9_\\-]+';
    const ext = '(?:jpg|jpeg|png|webp)';
    const urlPattern = new RegExp(
      `https:${sep}{2}i\\.pinimg\\.com${sep}${size}(?:${sep}${segment})+\\.${ext}`,
      'g'
    );
    for (const m of html.matchAll(urlPattern)) {
      addImage(m[0]);
    }
    console.log(`[scraper] After HTML regex: ${images.length} images`);

    // Strategy 2: Pinterest's internal JSON API (returns structured pin data)
    if (boardId) {
      const apiImages = await fetchBoardFeed(boardPath, boardId);
      for (const url of apiImages) {
        addImage(url);
        if (images.length >= 20) break;
      }
      console.log(`[scraper] After BoardFeedResource API: ${images.length} images`);
    } else {
      console.log(`[scraper] No board_id found — skipping API call`);
    }

    console.log(`[scraper] Returning ${Math.min(images.length, 20)} images`);
    return images.slice(0, 20);

  } catch (e) {
    clearTimeout(abortTimer);
    console.log(`[scraper] Exception: ${e.message}`);
    return [];
  }
}

// Download a single image and return {base64, mediaType} for Claude vision
async function fetchImageAsBase64(url) {
  try {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Referer': 'https://www.pinterest.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(abortTimer);

    if (!resp.ok) return null;

    const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(ct)) return null;

    const buf = await resp.arrayBuffer();
    return { base64: Buffer.from(buf).toString('base64'), mediaType: ct };
  } catch (_) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { boardUrl, subject, intensity, format } = req.body;

  if (!boardUrl || !subject) {
    return res.status(400).json({ error: 'Missing boardUrl or subject' });
  }

  function parseBoardContext(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return { username: parts[0], board: parts[1].replace(/-/g, ' ') };
    } catch (_) {}
    return { username: 'user', board: 'inspiration board' };
  }

  const { username, board } = parseBoardContext(boardUrl);
  const boardCtx = `Pinterest board "${board}" curated by @${username}`;

  const intensityMap = {
    subtle: 'subtly inspired by',
    balanced: 'clearly styled in the aesthetic of',
    strong: 'faithfully replicating the exact visual style of',
  };
  const formatMap = {
    square: 'square 1:1 composition',
    portrait: 'portrait 4:5 vertical composition',
    landscape: 'landscape 16:9 cinematic composition',
  };

  try {
    // ── Step 0: Scrape real pin images from the Pinterest board ──────────────
    console.log(`[analyze] Scraping board: ${boardUrl}`);
    const pinImageUrls = await scrapePinterestImages(boardUrl);
    console.log(`[analyze] Scraper returned ${pinImageUrls.length} image URL(s)`);

    // Download images in parallel for Claude vision
    let visionImages = [];
    if (pinImageUrls.length > 0) {
      const downloaded = await Promise.all(pinImageUrls.map(fetchImageAsBase64));
      visionImages = downloaded.filter(Boolean);
      console.log(`[analyze] Downloaded ${visionImages.length}/${pinImageUrls.length} images as base64`);
    }

    const hasVision = visionImages.length > 0;
    console.log(`[analyze] Mode: ${hasVision ? `VISION (${visionImages.length} real pin images)` : 'TEXT-ONLY FALLBACK'}`);

    // ── Step 1: Extract style profile with Claude (vision if we have images) ─
    let styleUserContent;

    if (hasVision) {
      styleUserContent = [
        {
          type: 'text',
          text: `I'm showing you ${visionImages.length} actual pin images from the ${boardCtx}. Analyze the real visual style you can see across these images — the true colors, mood, lighting, composition, and aesthetic.`,
        },
        ...visionImages.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
        })),
        {
          type: 'text',
          text: `The user wants to create: "${subject}"

Based on what you actually see in these pin images, return exactly this JSON structure:
{
  "colors": ["#hex1","#hex2","#hex3","#hex4","#hex5"],
  "colorNames": ["name1","name2","name3","name4","name5"],
  "mood": ["adjective1","adjective2","adjective3","adjective4"],
  "aesthetic": "2-3 sentence description of the overall aesthetic based on the actual images",
  "composition": "description of typical composition style seen across the images",
  "lighting": "description of the lighting style visible in the images",
  "styleKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"]
}
Be specific and accurate — describe what you actually see, not what you imagine for this board name. No markdown, no explanation, valid JSON only.`,
        },
      ];
    } else {
      styleUserContent = `Analyze the visual aesthetic of the ${boardCtx}.
The user wants to create: "${subject}"

Return exactly this JSON structure:
{
  "colors": ["#hex1","#hex2","#hex3","#hex4","#hex5"],
  "colorNames": ["name1","name2","name3","name4","name5"],
  "mood": ["adjective1","adjective2","adjective3","adjective4"],
  "aesthetic": "2-3 sentence description of the overall aesthetic",
  "composition": "description of typical composition style",
  "lighting": "description of lighting",
  "styleKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5"]
}
Be specific, evocative, and professional. Make color choices realistic and cohesive for this board type.`;
    }

    const styleResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are an expert visual style analyst and art director. Analyze visual content and extract rich, specific visual style profiles. Respond only with valid JSON — no markdown, no explanation, no code fences.',
        messages: [{ role: 'user', content: styleUserContent }],
      }),
    });

    if (!styleResp.ok) {
      const err = await styleResp.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || 'Claude API error — check your Anthropic key in Vercel environment variables' });
    }

    const styleData = await styleResp.json();
    const styleRaw = styleData.content[0].text;

    let style;
    try { style = JSON.parse(styleRaw); }
    catch (_) {
      const m = styleRaw.match(/\{[\s\S]*\}/);
      style = m ? JSON.parse(m[0]) : null;
    }
    if (!style) return res.status(500).json({ error: 'Could not parse style analysis — please try again.' });

    // ── Step 2: Generate image prompt with Claude ────────────────────────────
    const promptResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: 'You are a world-class AI image prompt engineer specializing in DALL-E and Midjourney. Write highly specific, detailed prompts that produce stunning professional results. Return only the prompt text — no quotes, no explanation.',
        messages: [{
          role: 'user',
          content: `Write a detailed AI image generation prompt for:
Subject: ${subject}
Style reference: ${boardCtx}
Color palette: ${(style.colors || []).join(', ')}
Aesthetic: ${style.aesthetic}
Composition: ${style.composition}
Lighting: ${style.lighting}
Style keywords: ${(style.styleKeywords || []).join(', ')}
Mood: ${(style.mood || []).join(', ')}
Style intensity: ${intensityMap[intensity] || intensityMap.balanced}
Format: ${formatMap[format] || formatMap.square}

Write one cohesive, detailed prompt (150-200 words). Be specific about lighting, color grading, texture, composition, and mood. End with: professional photography, highly detailed, 8k resolution.`,
        }],
      }),
    });

    if (!promptResp.ok) {
      return res.status(500).json({ error: 'Failed to generate style prompt' });
    }

    const promptData = await promptResp.json();
    const imagePrompt = promptData.content[0].text.trim();

    // ── Step 3: Generate images with DALL-E 3 ───────────────────────────────
    const [imageResp, imageResp2] = await Promise.all([
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      }),
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: imagePrompt + ', slightly different angle, same aesthetic style and color palette',
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      }),
    ]);

    if (!imageResp.ok) {
      const err = await imageResp.json().catch(() => ({}));
      return res.status(500).json({ error: err.error?.message || 'OpenAI image generation failed — check your OpenAI key in Vercel environment variables' });
    }

    const imageData = await imageResp.json();
    const imageUrl = imageData.data[0].url;

    let imageUrl2 = null;
    if (imageResp2.ok) {
      const imageData2 = await imageResp2.json();
      imageUrl2 = imageData2.data[0].url;
    }

    return res.status(200).json({
      style,
      prompt: imagePrompt,
      images: [imageUrl, imageUrl2].filter(Boolean),
      scrapedPins: pinImageUrls.length,
    });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong — please try again.' });
  }
};
