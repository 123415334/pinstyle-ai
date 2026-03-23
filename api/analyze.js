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
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.log(`[scraper] BoardFeedResource error body (first 300): ${errText.slice(0, 300)}`);
      return [];
    }

    const rawText = await resp.text();
    console.log(`[scraper] BoardFeedResource response (first 500): ${rawText.slice(0, 500)}`);

    let json;
    try { json = JSON.parse(rawText); } catch (e) {
      console.log(`[scraper] BoardFeedResource JSON parse error: ${e.message}`);
      return [];
    }

    const pins = json?.resource_response?.data || [];
    console.log(`[scraper] BoardFeedResource pin count: ${pins.length}`);
    const urls = [];
    for (const pin of pins) {
      const url = pin?.images?.['736x']?.url
        || pin?.images?.['474x']?.url
        || pin?.images?.orig?.url
        || pin?.images?.['236x']?.url;
      if (url && url.includes('pinimg.com')) urls.push(url);
    }
    console.log(`[scraper] BoardFeedResource: ${urls.length} image URLs extracted`);
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

    function addImage(url) {
      if (!url || typeof url !== 'string') return;
      if (seen.has(url) || !url.includes('i.pinimg.com')) return;
      seen.add(url);
      images.push(url);
    }

    // ── Parse __PWS_DATA__ as JSON and walk the object tree ──────────────────
    const pwsMatch = html.match(/id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!pwsMatch) {
      console.log(`[scraper] __PWS_DATA__ script tag NOT found`);
    } else {
      // Strip any JS wrapper (e.g. "window.__PWS_DATA__ = ") to get raw JSON
      let jsonStr = pwsMatch[1].trim().replace(/^[^\[{]*/, '').replace(/[;\s]*$/, '');
      console.log(`[scraper] __PWS_DATA__ raw length: ${pwsMatch[1].length}, JSON start: ${JSON.stringify(jsonStr.slice(0, 80))}`);

      let pws = null;
      try {
        pws = JSON.parse(jsonStr);
      } catch (e) {
        console.log(`[scraper] JSON.parse failed: ${e.message} — falling back to regex`);
      }

      if (pws) {
        // Log top-level structure so we can see where Pinterest puts the data
        const topKeys = Object.keys(pws);
        console.log(`[scraper] PWS top-level keys: ${topKeys.join(', ')}`);

        // Log resourceDataCache structure if present (where pin feed usually lives)
        const cache = pws.resourceDataCache || pws.resource_data_cache;
        if (cache) {
          console.log(`[scraper] resourceDataCache entries: ${cache.length}`);
          cache.slice(0, 5).forEach((entry, i) => {
            const name = entry.name || entry.request?.resourceName || '(unnamed)';
            const dataKeys = entry.data ? Object.keys(entry.data).join(', ') : 'no data';
            const results = entry.data?.results || entry.data?.data || [];
            console.log(`[scraper]   cache[${i}] name="${name}" dataKeys=[${dataKeys}] results.length=${Array.isArray(results) ? results.length : 'not array'}`);
          });
        } else {
          console.log(`[scraper] No resourceDataCache found. Top-level values types: ${topKeys.map(k => `${k}:${typeof pws[k]}`).join(', ')}`);
        }

        // Walk the entire parsed JSON object to find pin image objects
        // A pin has an `images` field containing size keys like '736x', '474x', 'orig'
        let boardId = null;

        function walk(obj, depth) {
          if (!obj || typeof obj !== 'object' || depth > 20) return;

          // Detect board id
          if (!boardId) {
            if (obj.type === 'board' && obj.id) boardId = String(obj.id);
            else if (obj.board && obj.board.id) boardId = String(obj.board.id);
          }

          // Detect pin: has an images object with at least one size key containing a url
          if (obj.images && typeof obj.images === 'object') {
            const sizeKey = Object.keys(obj.images).find(k =>
              obj.images[k] && typeof obj.images[k].url === 'string' && obj.images[k].url.includes('i.pinimg.com')
            );
            if (sizeKey) {
              // Prefer 736x > 474x > originals > 236x > whatever we found
              const url = (obj.images['736x'] || obj.images['474x'] || obj.images['originals'] ||
                           obj.images['orig'] || obj.images['236x'] || obj.images[sizeKey]).url;
              addImage(url);
              return; // don't recurse into this pin's children
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
        console.log(`[scraper] Images found by JSON walk: ${images.length}`);
        if (images.length > 0) console.log(`[scraper] Sample URLs: ${images.slice(0, 3).join(' | ')}`);
        console.log(`[scraper] board_id from JSON walk: ${boardId}`);

        // ── Strategy 2: BoardFeedResource API if we have board_id ────────────
        if (boardId && images.length < 20) {
          const apiImages = await fetchBoardFeed(boardPath, boardId);
          for (const url of apiImages) {
            addImage(url);
            if (images.length >= 20) break;
          }
          console.log(`[scraper] After BoardFeedResource API: ${images.length} images`);
        }
      }
    }

    // ── Fallback: og:image only if JSON walk found nothing ───────────────────
    if (images.length === 0) {
      const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
      if (ogMatch) { addImage(ogMatch[1]); console.log(`[scraper] Fallback og:image: ${ogMatch[1]}`); }
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

    // Use a Pinterest referer for pinimg.com URLs, generic headers otherwise
    const isPinterest = url.includes('pinimg.com') || url.includes('pinterest.com');
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        ...(isPinterest ? { 'Referer': 'https://www.pinterest.com/' } : {}),
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

  const { boardUrl, imageUrls, subject, intensity, format, pageUrl } = req.body;

  // Accept either a Pinterest boardUrl (web app) or direct imageUrls (extension)
  const useDirectImages = Array.isArray(imageUrls) && imageUrls.length > 0;

  if (!subject) {
    return res.status(400).json({ error: 'Missing subject' });
  }
  if (!useDirectImages && !boardUrl) {
    return res.status(400).json({ error: 'Missing boardUrl or imageUrls' });
  }

  function parseBoardContext(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return { username: parts[0], board: parts[1].replace(/-/g, ' ') };
    } catch (_) {}
    return { username: 'user', board: 'inspiration board' };
  }

  let boardCtx;
  if (useDirectImages) {
    // Build context from the page URL the extension is viewing
    try {
      const origin = pageUrl ? new URL(pageUrl).hostname.replace(/^www\./, '') : 'the web';
      boardCtx = `${imageUrls.length} selected image${imageUrls.length !== 1 ? 's' : ''} from ${origin}`;
    } catch {
      boardCtx = `${imageUrls.length} selected image${imageUrls.length !== 1 ? 's' : ''}`;
    }
  } else {
    const { username, board } = parseBoardContext(boardUrl);
    boardCtx = `Pinterest board "${board}" curated by @${username}`;
  }

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
    // ── Step 0: Obtain pin images (scrape or use provided URLs) ─────────────
    let pinImageUrls;
    if (useDirectImages) {
      // Extension mode — images were selected directly by the user
      pinImageUrls = imageUrls.slice(0, 20);
      console.log(`[analyze] Extension mode: using ${pinImageUrls.length} provided image URLs`);
    } else {
      console.log(`[analyze] Scraping board: ${boardUrl}`);
      pinImageUrls = await scrapePinterestImages(boardUrl);
      console.log(`[analyze] Scraper returned ${pinImageUrls.length} image URL(s)`);
    }

    // Download images in parallel for Claude vision
    let visionImages = [];
    if (pinImageUrls.length > 0) {
      const downloaded = await Promise.all(pinImageUrls.map(fetchImageAsBase64));
      visionImages = downloaded.filter(Boolean);
      console.log(`[analyze] Downloaded ${visionImages.length}/${pinImageUrls.length} images as base64`);
    }

    const hasVision = visionImages.length > 0;
    console.log(`[analyze] Mode: ${hasVision ? `VISION (${visionImages.length} images)` : 'TEXT-ONLY FALLBACK'}`);

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
          content: `Create a DALL-E 3 prompt that will generate an image of "${subject}" that looks like it belongs in this exact Pinterest board.

STYLE EXTRACTED FROM THE ACTUAL BOARD IMAGES:
- Photography style: ${style.lighting}
- Composition: ${style.composition}  
- Color grading: ${(style.colors || []).join(', ')} — ${(style.colorNames || []).join(', ')}
- Mood/atmosphere: ${(style.mood || []).join(', ')}
- Aesthetic: ${style.aesthetic}
- Visual keywords: ${(style.styleKeywords || []).join(', ')}

RULES:
1. The subject is "${subject}" — make this the clear focus
2. Match the EXACT photographic/artistic style of the board, not just the colors
3. If the board has film grain, add it. If flat lay, make it flat lay. If moody shadows, add them.
4. Color grade to match — desaturated, warm, cool, high contrast, muted, etc.
5. Match the shooting distance and angle typical of these images
6. ${intensityMap[intensity] || intensityMap.balanced} the board's visual style
7. ${formatMap[format] || formatMap.square}

Write a single prompt of 150-200 words. Be hyper-specific about photographic technique, color grading, grain, lighting direction, and atmosphere. The result must feel like it was pulled from this exact board.`,
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
          model: 'gpt-image-1',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'high',
        }),
      }),
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: imagePrompt + ', slightly different angle, same aesthetic style and color palette',
          n: 1,
          size: '1024x1024',
          quality: 'high',
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
      scrapedPins: useDirectImages ? 0 : pinImageUrls.length,
    });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong — please try again.' });
  }
};
