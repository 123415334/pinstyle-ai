const FREE_TRIAL_LIMIT  = 3;
const PRO_MONTHLY_LIMIT = 120;

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function validateToken(token) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': process.env.SUPABASE_ANON_KEY,
    },
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function getUsage(userId) {
  const resp = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=generations_used,plan,monthly_generations,monthly_reset_at`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'apikey':        process.env.SUPABASE_SERVICE_KEY,
      },
    }
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows[0] || null;
}

async function incrementUsage(userId) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/increment_generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });
}

// ── Image fetching ────────────────────────────────────────────────────────────
// Images are fetched once, used for both Claude analysis AND composite building.
// The composite is uploaded to Recraft to create a custom style fingerprint.

async function fetchImageData(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const isPinterest = url.includes('pinimg.com') || url.includes('pinterest.com');
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...(isPinterest ? { 'Referer': 'https://www.pinterest.com/' } : {}),
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const mediaType  = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const arrayBuf   = await resp.arrayBuffer();
    const buffer     = Buffer.from(arrayBuf);
    const base64     = buffer.toString('base64');
    return { buffer, base64, mediaType };
  } catch {
    return null;
  }
}

// ── Composite grid builder ────────────────────────────────────────────────────
// Stitches all selected images into a single grid image used as the style
// reference for Recraft's fingerprint API. The grid preserves each image's
// individual aesthetic so the fingerprint captures the shared style across all.
//   2 images  → 2×1 (1024×512, 512px tiles)
//   3-4 images → 2×2 (1024×1024, 512px tiles, empty slots filled with dark bg)

async function buildComposite(imageDataList) {
  const valid = imageDataList.filter(Boolean);
  if (valid.length === 0) return null;

  let sharp;
  try { sharp = require('sharp'); } catch {
    console.warn('[tack] sharp not available, using first image for style fingerprint');
    return { buffer: valid[0].buffer, mediaType: valid[0].mediaType };
  }

  try {
    if (valid.length === 1) {
      const buf = await sharp(valid[0].buffer)
        .resize(1024, 1024, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { buffer: buf, mediaType: 'image/jpeg' };
    }

    const tileSize = 512;
    const cols     = 2;
    const rows     = valid.length <= 2 ? 1 : 2;
    const width    = cols * tileSize;
    const height   = rows * tileSize;

    const tiles = await Promise.all(
      valid.map(img =>
        sharp(img.buffer)
          .resize(tileSize, tileSize, { fit: 'cover', position: 'centre' })
          .jpeg({ quality: 85 })
          .toBuffer()
      )
    );

    const compositeOps = tiles.map((tile, i) => ({
      input: tile,
      top:   Math.floor(i / cols) * tileSize,
      left:  (i % cols) * tileSize,
    }));

    const buf = await sharp({
      create: { width, height, channels: 3, background: { r: 18, g: 18, b: 18 } },
    })
      .composite(compositeOps)
      .jpeg({ quality: 90 })
      .toBuffer();

    return { buffer: buf, mediaType: 'image/jpeg' };

  } catch (err) {
    console.error('[tack] composite build failed, using first image:', err.message);
    return { buffer: valid[0].buffer, mediaType: valid[0].mediaType };
  }
}

// ── Recraft style fingerprint ─────────────────────────────────────────────────
// Uploads the composite grid to Recraft's style API and returns a style_id.
// The style_id encodes the visual fingerprint of all selected images and is
// passed directly to Recraft V3 at generation time — this is more precise than
// any text description because it captures the actual pixel-level aesthetic.
// Gracefully returns null if the API key is missing or the upload fails.

async function createRecraftStyleFingerprint(buffer, mediaType) {
  if (!process.env.RECRAFT_API_KEY) {
    console.warn('[tack] RECRAFT_API_KEY not set — skipping style fingerprint');
    return null;
  }
  try {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mediaType }), 'style-reference.jpg');

    const resp = await fetch('https://external.api.recraft.ai/v1/images/styles', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}` },
      body:    formData,
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.warn('[tack] Recraft style upload failed:', resp.status, err);
      return null;
    }
    const data = await resp.json();
    console.log('[tack] style fingerprint id:', data.id);
    return data.id || null;
  } catch (err) {
    console.warn('[tack] Recraft style upload error:', err.message);
    return null;
  }
}

// ── Replicate: Recraft V3 ─────────────────────────────────────────────────────
// Why Recraft V3: purpose-built for graphic design aesthetics with explicit
// style categories (grain, graphic_art, 2d_art_poster, etc.). Unlike FLUX,
// which defaults to photorealism, Recraft's style parameter locks the render
// engine into a specific visual production mode — grain gives the heavy noise
// texture, graphic_art gives bold illustrative output, etc.
// Claude picks the best matching category from the images; Recraft executes it.

async function startRecraftPrediction(prompt, { styleId = null, styleCategory = 'digital_illustration/graphic_art', retries = 3, backoffMs = 12000 } = {}) {
  // styleId (from Recraft's fingerprint API) takes priority over styleCategory.
  // When styleId is present, Recraft uses the actual pixel-level aesthetic from
  // the composite reference image. styleCategory is the text-based fallback.
  const validStyles = new Set([
    'digital_illustration', 'digital_illustration/grain', 'digital_illustration/graphic_art',
    'digital_illustration/2d_art_poster', 'digital_illustration/2d_art_poster_2',
    'digital_illustration/hand_drawn', 'digital_illustration/engraving_color',
    'digital_illustration/pixel_art', 'digital_illustration/antiquity',
    'vector_illustration', 'vector_illustration/bold_stroke', 'vector_illustration/pop_art',
    'vector_illustration/vivid_shapes', 'vector_illustration/neon_lines',
    'realistic_image',
  ]);
  const safeCategory = validStyles.has(styleCategory) ? styleCategory : 'digital_illustration/graphic_art';

  // Build the input: prefer style_id, fall back to style category
  const modelInput = styleId
    ? { prompt, style_id: styleId,      size: '1024x1024' }
    : { prompt, style:    safeCategory, size: '1024x1024' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(
      'https://api.replicate.com/v1/models/recraft-ai/recraft-v3/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ input: modelInput }),
      }
    );

    if (resp.status === 429) {
      if (attempt === retries) throw new Error('Replicate rate limit reached — please try again in a moment.');
      const wait = backoffMs * (attempt + 1);
      console.warn(`[tack] throttled, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
    return data.id;
  }
}

async function waitForResult(predictionId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}` } }
    );
    const data = await resp.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed')    throw new Error(data.error || 'Generation failed');
  }
  throw new Error('Generation timed out — please try again');
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const rawToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAnon     = !rawToken || rawToken === 'null';
  const token      = isAnon ? null : rawToken;

  let user = null;
  if (!isAnon) {
    user = await validateToken(token);
    if (!user) {
      return res.status(401).json({
        error:   'auth_invalid',
        message: 'Your session has expired. Please sign in again.',
      });
    }
  }

  // ── Usage check ───────────────────────────────────────────────────────────
  let profile, generationsUsed, monthlyUsed, monthlyResetAt, plan;

  if (isAnon) {
    profile = null; generationsUsed = 0; monthlyUsed = 0; monthlyResetAt = null; plan = 'anon';
  } else {
    profile         = await getUsage(user.id);
    generationsUsed = profile?.generations_used   ?? 0;
    monthlyUsed     = profile?.monthly_generations ?? 0;
    monthlyResetAt  = profile?.monthly_reset_at   ?? null;
    plan            = profile?.plan               ?? 'free';

    if (plan === 'free' && generationsUsed >= FREE_TRIAL_LIMIT) {
      return res.status(402).json({
        error:   'trial_exhausted',
        message: `You've used all ${FREE_TRIAL_LIMIT} free generations. Upgrade to Pro to keep creating.`,
        used:    generationsUsed,
        limit:   FREE_TRIAL_LIMIT,
      });
    }

    if (plan === 'pro') {
      const periodExpired    = !monthlyResetAt || new Date(monthlyResetAt) <= new Date();
      const effectiveMonthly = periodExpired ? 0 : monthlyUsed;
      if (effectiveMonthly >= PRO_MONTHLY_LIMIT) {
        return res.status(402).json({
          error:        'pro_limit_reached',
          message:      `You've reached your ${PRO_MONTHLY_LIMIT} generation monthly limit. Upgrade to Unlimited for no caps.`,
          monthly_used: effectiveMonthly,
          limit:        PRO_MONTHLY_LIMIT,
          resets_at:    monthlyResetAt,
        });
      }
    }
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { imageUrls, subject } = req.body;
  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: 'Missing subject — please describe what you want to create.' });
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: 'No reference images provided — please select at least one.' });
  }

  try {
    // ── Step 1: Fetch reference images for Claude's analysis ──────────────
    // Images go to Claude only — not to the generation model.
    const selectedUrls  = imageUrls.slice(0, 4);
    const imageDataList = await Promise.all(selectedUrls.map(fetchImageData));
    const validImages   = imageDataList.filter(Boolean);

    if (validImages.length === 0) {
      return res.status(422).json({
        error: 'Could not load any of the selected images. They may have expired. Please rescan and try again.',
      });
    }

    // ── Step 2: Claude analysis + composite build (parallel) ─────────────
    // Both need the image data — run simultaneously to save time.
    //   Claude → STYLE keywords + RECRAFT category
    //   Sharp  → composite grid → uploaded to Recraft for style fingerprint
    let styleBlock   = '';
    let recraftStyle = 'digital_illustration/graphic_art';
    let styleId      = null; // from Recraft's fingerprint API — trumps recraftStyle

    const [claudeSettled, compositeSettled] = await Promise.allSettled([

      // 2a: Claude extracts style keywords + identifies best Recraft category
      (async () => {
        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-6',
          max_tokens: 350,
          system: `You are an expert image generation prompt engineer specializing in graphic design and digital art. Analyze the reference images and output EXACTLY two lines — nothing else.

Line 1 — STYLE: a comma-separated list of 10-16 specific style descriptors covering:
- Rendering technique: be precise ("3D CGI render", "flat vector", "risograph print", "digital collage"). If NOT a photo, say "not photorealistic"
- Surface & material: "chrome metallic", "holographic iridescent", "matte clay", "glossy inflated"
- Texture & grain: be specific — "heavy noise grain overlay", "smooth gradient", "halftone dots", "clean vector"
- Color treatment: name actual colors — "cyan and magenta duotone", "hot pink on electric yellow", "deep black gradient fade"
- Background: "flat vivid orange background", "solid black", "white void", "high-contrast flat bg"
- Aesthetic: "Y2K chrome", "neo-brutalist poster", "retrofuturist", "90s rave graphic", "Swiss design grid"

Line 2 — RECRAFT: choose EXACTLY ONE from this list that best matches the images:
- digital_illustration/grain  → grainy/noisy texture, risograph feel, gradient fading to black, analog print aesthetic
- digital_illustration/graphic_art  → bold graphic design, poster art, strong shapes, editorial illustration
- digital_illustration/2d_art_poster  → flat poster design, bold type, vivid color fields
- digital_illustration/hand_drawn  → hand-crafted, sketchy, organic mark-making
- vector_illustration/bold_stroke  → clean bold vector shapes, strong outlines
- digital_illustration  → general digital illustration (use only if none above fits)

Output format (EXACTLY):
STYLE: [descriptors]
RECRAFT: [one category from the list above]`,
          messages: [{
            role:    'user',
            content: [
              ...validImages.map(img => ({
                type:   'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
              })),
              {
                type: 'text',
                text: 'Analyze these reference images. Output the two lines: STYLE and RECRAFT.',
              },
            ],
          }],
        }),
      });

      if (claudeResp.ok) {
          const d    = await claudeResp.json();
          const text = d.content?.[0]?.text?.trim() || '';
          const styleMatch   = text.match(/^STYLE:\s*(.+)$/m);
          const recraftMatch = text.match(/^RECRAFT:\s*(.+)$/m);
          return {
            styleBlock:   styleMatch   ? styleMatch[1].trim()   : '',
            recraftStyle: recraftMatch ? recraftMatch[1].trim() : '',
          };
        }
        return { styleBlock: '', recraftStyle: '' };
      })(),

      // 2b: Build composite grid of all selected images for style fingerprint
      buildComposite(validImages),
    ]);

    // Apply Claude results
    if (claudeSettled.status === 'fulfilled') {
      const { styleBlock: sb, recraftStyle: rs } = claudeSettled.value;
      if (sb) styleBlock   = sb;
      if (rs) recraftStyle = rs;
    } else {
      console.warn('[tack] Claude failed (non-fatal):', claudeSettled.reason?.message);
    }
    if (!styleBlock)   styleBlock   = '3D CGI render, heavy noise grain overlay, bold saturated gradient, holographic iridescent, flat vivid background, graphic design poster, not photorealistic';
    if (!recraftStyle) recraftStyle = 'digital_illustration/graphic_art';

    console.log('[tack] style:', styleBlock);
    console.log('[tack] recraft category:', recraftStyle);

    // ── Step 3: Upload composite to Recraft → style fingerprint ──────────
    // The style fingerprint encodes the actual pixel-level aesthetic of the
    // selected images. When available it overrides the text-based category,
    // giving Recraft a precise visual reference rather than a named bucket.
    if (compositeSettled.status === 'fulfilled' && compositeSettled.value) {
      const { buffer, mediaType } = compositeSettled.value;
      styleId = await createRecraftStyleFingerprint(buffer, mediaType);
      if (styleId) {
        console.log('[tack] using style fingerprint:', styleId);
      } else {
        console.log('[tack] no fingerprint — using category:', recraftStyle);
      }
    }

    // ── Step 4: Build prompts and launch both Recraft predictions ─────────
    // Style keywords still reinforce the aesthetic in the prompt text.
    // styleId (fingerprint) takes priority over recraftStyle (category) in
    // startRecraftPrediction — the function handles the selection.
    const prompt1 = `${styleBlock}. ${subject.trim()}.`;
    const prompt2 = `${styleBlock}. ${subject.trim()}, different angle and composition.`;

    console.log('[tack] prompt1:', prompt1);

    let id1, id2;
    try {
      id1 = await startRecraftPrediction(prompt1, { styleId, styleCategory: recraftStyle });
      await new Promise(r => setTimeout(r, 3000));
      id2 = await startRecraftPrediction(prompt2, { styleId, styleCategory: recraftStyle });
    } catch (err) {
      console.error('[tack] prediction start failed:', err.message);
      throw new Error(`Could not start generation: ${err.message}`);
    }

    // ── Step 5: Wait for both — allSettled so one failure ≠ total loss ───
    const [result1, result2] = await Promise.allSettled([
      waitForResult(id1),
      waitForResult(id2),
    ]);

    if (result1.status === 'rejected') console.error('[tack] prediction 1 failed:', result1.reason?.message);
    if (result2.status === 'rejected') console.error('[tack] prediction 2 failed:', result2.reason?.message);

    const images = [
      result1.status === 'fulfilled' ? (Array.isArray(result1.value) ? result1.value[0] : result1.value) : null,
      result2.status === 'fulfilled' ? (Array.isArray(result2.value) ? result2.value[0] : result2.value) : null,
    ].filter(Boolean);

    if (images.length === 0) {
      throw new Error('Both generations failed. Please try again.');
    }

    // ── Step 6: Increment usage ───────────────────────────────────────────
    if (!isAnon) {
      await incrementUsage(user.id).catch(e =>
        console.error('[tack] usage increment failed (non-fatal):', e.message)
      );
    }

    const newUsed        = generationsUsed + 1;
    const newMonthlyUsed = monthlyUsed + 1;

    return res.status(200).json({
      images,
      prompt:           prompt1,
      styleDescriptors: styleBlock,
      ...(isAnon ? {} : {
        usage: {
          used:         newUsed,
          monthly_used: plan === 'pro' ? newMonthlyUsed : null,
          limit:        plan === 'free' ? FREE_TRIAL_LIMIT : plan === 'pro' ? PRO_MONTHLY_LIMIT : null,
          remaining:    plan === 'free' ? FREE_TRIAL_LIMIT - newUsed
                      : plan === 'pro'  ? PRO_MONTHLY_LIMIT - newMonthlyUsed
                      : null,
          plan,
        },
      }),
    });

  } catch (err) {
    console.error('[tack] API error:', err);
    const msg = err.message || 'Something went wrong — please try again.';
    return res.status(500).json({ error: msg });
  }
};
