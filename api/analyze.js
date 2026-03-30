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
  return await resp.json(); // { id, email, ... }
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
// Returns { buffer, base64, mediaType } or null. Fetches once, derives both.

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
    const mediaType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const arrayBuf  = await resp.arrayBuffer();
    const buffer    = Buffer.from(arrayBuf);
    const base64    = buffer.toString('base64');
    return { buffer, base64, mediaType };
  } catch {
    return null;
  }
}

// ── Composite grid builder ────────────────────────────────────────────────────
// Stitches up to 4 reference images into a single grid image so FLUX Kontext
// can see ALL selected references at once — not just the "best" one.
// Falls back gracefully: if sharp isn't available or images fail, uses raw
// buffer of the first valid image.

async function buildComposite(imageDataList) {
  const valid = imageDataList.filter(Boolean);
  if (valid.length === 0) return null;

  // Try to load sharp (Vercel installs it from package.json)
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    // sharp not yet installed — return first image raw
    console.warn('[tack] sharp not available, using first image directly');
    return { buffer: valid[0].buffer, mediaType: valid[0].mediaType };
  }

  try {
    if (valid.length === 1) {
      // Single reference: just normalise to a square
      const buf = await sharp(valid[0].buffer)
        .resize(1024, 1024, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { buffer: buf, mediaType: 'image/jpeg' };
    }

    // Grid layout:
    //   2 images  →  2×1  (1024 × 512,  512px tiles)
    //   3–4 images →  2×2  (1024 × 1024, 512px tiles, empty slots = bg colour)
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
      create: {
        width,
        height,
        channels: 3,
        background: { r: 20, g: 18, b: 16 }, // tack dark bg so empty slots aren't jarring
      },
    })
      .composite(compositeOps)
      .jpeg({ quality: 90 })
      .toBuffer();

    return { buffer: buf, mediaType: 'image/jpeg' };

  } catch (err) {
    console.error('[tack] composite build failed, falling back to first image:', err.message);
    return { buffer: valid[0].buffer, mediaType: valid[0].mediaType };
  }
}

// ── Replicate helpers ─────────────────────────────────────────────────────────

async function startKontextPrediction(prompt, imageRef) {
  // imageRef is either a data URI (base64) or a public URL (fallback)
  const resp = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        input: {
          prompt,
          image:          imageRef,
          aspect_ratio:   '1:1',
          output_format:  'webp',
          output_quality: 90,
          safety_tolerance: 5,
        },
      }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
  return data.id;
}

async function waitForResult(predictionId) {
  // Poll up to 90 × 2s = 3 minutes max per prediction
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
    // Unlimited — no checks needed
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
    // ── Step 1: Fetch all selected reference images in parallel ───────────
    const selectedUrls  = imageUrls.slice(0, 4); // cap at 4
    const imageDataList = await Promise.all(selectedUrls.map(fetchImageData));
    const validImages   = imageDataList.filter(Boolean);

    if (validImages.length === 0) {
      return res.status(422).json({
        error: 'Could not load any of the selected images. They may have expired or blocked access. Please rescan and try again.',
      });
    }

    // ── Step 2: Build composite grid + run Claude analysis in parallel ─────
    // Both operations need the image data — run them simultaneously.
    const [compositeResult, styleNote] = await Promise.all([

      // 2a: Stitch all references into one grid image for Kontext
      buildComposite(validImages),

      // 2b: Claude writes a SHORT 1–2 sentence style note (supplements the image)
      (async () => {
        try {
          const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type':      'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key':         process.env.ANTHROPIC_API_KEY,
            },
            body: JSON.stringify({
              model:      'claude-sonnet-4-6',
              max_tokens: 100,
              system:     'You are a visual art director. In exactly 1 sentence, identify the single most distinctive shared quality across these reference images — be specific about rendering technique, surface quality, or color mood. No fluff, no headers.',
              messages: [{
                role:    'user',
                content: [
                  ...validImages.map(img => ({
                    type:   'image',
                    source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
                  })),
                  { type: 'text', text: 'One sentence: what is the single most distinctive shared visual quality?' },
                ],
              }],
            }),
          });
          if (!claudeResp.ok) return '';
          const d = await claudeResp.json();
          return d.content?.[0]?.text?.trim() || '';
        } catch {
          return ''; // style note is supplementary — never block generation
        }
      })(),
    ]);

    // ── Step 3: Resolve the image reference for Kontext ───────────────────
    // Prefer the composite buffer as a data URI; fall back to first image URL.
    let imageRef;
    if (compositeResult?.buffer) {
      imageRef = `data:${compositeResult.mediaType};base64,${compositeResult.buffer.toString('base64')}`;
    } else {
      // Last resort: pass the first selected URL directly
      imageRef = selectedUrls[0];
    }

    // ── Step 4: Build two prompts — same style, different compositions ─────
    const styleHint = styleNote ? ` ${styleNote}` : '';
    const baseInstruction = 'Preserve the exact visual style of the reference image — same rendering technique, color palette, lighting, and mood.';

    const prompt1 = `${subject.trim()}. ${baseInstruction}${styleHint}`;
    const prompt2 = `${subject.trim()}, different angle and composition. ${baseInstruction}${styleHint}`;

    // ── Step 5: Launch both predictions simultaneously ────────────────────
    let id1, id2;
    try {
      [id1, id2] = await Promise.all([
        startKontextPrediction(prompt1, imageRef),
        startKontextPrediction(prompt2, imageRef),
      ]);
    } catch (err) {
      // If prediction launch fails, surface a clear message
      console.error('[tack] prediction start failed:', err.message);
      throw new Error(`Could not start generation: ${err.message}`);
    }

    // ── Step 6: Wait for both — use allSettled so one failure ≠ total loss ─
    const [result1, result2] = await Promise.allSettled([
      waitForResult(id1),
      waitForResult(id2),
    ]);

    if (result1.status === 'rejected') {
      console.error('[tack] prediction 1 failed:', result1.reason?.message);
    }
    if (result2.status === 'rejected') {
      console.error('[tack] prediction 2 failed:', result2.reason?.message);
    }

    const images = [
      result1.status === 'fulfilled' ? (Array.isArray(result1.value) ? result1.value[0] : result1.value) : null,
      result2.status === 'fulfilled' ? (Array.isArray(result2.value) ? result2.value[0] : result2.value) : null,
    ].filter(Boolean);

    if (images.length === 0) {
      throw new Error('Both generations failed. Please try again — this can happen when reference images have unusual content.');
    }

    // ── Step 7: Increment usage ───────────────────────────────────────────
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
      styleDescriptors: styleNote,
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
    // Never expose stack traces — surface a clean, actionable message
    const msg = err.message || 'Something went wrong — please try again.';
    return res.status(500).json({ error: msg });
  }
};
