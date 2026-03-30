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
// Fetches reference images so Claude can analyze their visual style.

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

// ── FLUX 2 Pro ────────────────────────────────────────────────────────────────
// Accepts reference image URLs alongside the text prompt for conditioning.
// Combined with Claude's rich paragraph-style description this produced the
// best style-accurate results in testing.

async function startFluxPrediction(prompt, imageUrls = [], { retries = 3, backoffMs = 12000 } = {}) {
  // Build image conditioning inputs from reference URLs
  const imageInputs = {};
  imageUrls.slice(0, 4).forEach((url, i) => {
    if (i === 0) imageInputs.image_prompt  = url;
    else         imageInputs[`image_prompt_${i + 1}`] = url;
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            ...imageInputs,
            aspect_ratio:      '1:1',
            output_format:     'webp',
            output_quality:    90,
            safety_tolerance:  5,
          },
        }),
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
    // ── Step 1: Fetch reference images ────────────────────────────────────
    const selectedUrls  = imageUrls.slice(0, 4);
    const imageDataList = await Promise.all(selectedUrls.map(fetchImageData));
    const validImages   = imageDataList.filter(Boolean);

    if (validImages.length === 0) {
      return res.status(422).json({
        error: 'Could not load any of the selected images. They may have expired. Please rescan and try again.',
      });
    }

    // ── Step 2: Claude deep style analysis ───────────────────────────────
    // Claude acts as an art director: identifies the single most dominant
    // visual element across the selected images, then writes a rich 140-180
    // word paragraph description of the full style. This paragraph-form output
    // (vs. keyword lists) gives FLUX 2 Pro more nuanced style information to
    // work with and produced the most accurate results in testing.
    let styleDescriptors = 'professional photography, natural lighting, high quality';

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
          max_tokens: 600,
          system: 'You are an expert art director and image generation prompt engineer. Your job is to deeply analyze reference images, identify the single most distinctive visual element that defines their style, and write a prompt that leads with that element so an AI image generator reproduces the exact same style for any new subject.',
          messages: [{
            role:    'user',
            content: [
              ...validImages.map(img => ({
                type:   'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
              })),
              {
                type: 'text',
                text: `Analyze these reference images and extract their shared artistic style DNA.

FIRST: If there are multiple images, identify which single image (by index, starting at 0) best represents the dominant shared style. Output this on the very first line as: BEST_IMAGE_INDEX: <number>

THEN on the next line, write the style prompt:

STEP 1 — Identify the DOMINANT STYLE ELEMENT: Look at these images and decide which single visual property is most distinctive and defining. Choose ONE:
- TEXTURE/SURFACE PATTERN (e.g. topographic lines, marbling, weaving, engraving, dots) — if the surface detail is what makes these images unique
- RENDERING TECHNIQUE (e.g. hand-drawn illustration, 3D render, collage, painting) — if the medium itself is the signature
- COLOR & LIGHT (e.g. neon gradients, flat bold primaries, moody shadows) — if color treatment is the dominant signature
- FORM & SHAPE LANGUAGE (e.g. inflated organic blobs, geometric precision, fluid curves) — if the silhouette and form is what's most distinctive
- ARTISTIC MOVEMENT (e.g. Y2K, folk art, brutalism, surrealism) — if a specific aesthetic movement defines the look

STEP 2 — Write the prompt: Start with the dominant element (2-3 sentences describing it in extreme detail), then cover the remaining style properties: rendering technique, color palette, lighting, composition, mood, and what makes this artist's visual voice unique.

Rules:
- Lead with the dominant element — describe it with maximum specificity
- Be concrete, not vague ("lime green topographic contour lines carved into a matte clay surface" not "interesting texture")
- Output ONLY the final image generation prompt — no headers, no labels, no "DOMINANT STYLE ELEMENT:" prefix, no markdown, no explanation whatsoever
- Start the output directly with descriptive words about the style
- 140-180 words total`,
              },
            ],
          }],
        }),
      });

      if (claudeResp.ok) {
        const d       = await claudeResp.json();
        const rawText = d.content?.[0]?.text?.trim() || '';
        // Strip the BEST_IMAGE_INDEX line if present — we don't need it for text-only generation
        styleDescriptors = rawText.replace(/BEST_IMAGE_INDEX:\s*\d+\s*\n?/, '').trim() || styleDescriptors;
        console.log('[tack] style descriptors:', styleDescriptors.slice(0, 120) + '...');
      }
    } catch (err) {
      console.warn('[tack] Claude failed (non-fatal):', err.message);
    }

    // ── Step 3: Build prompts ─────────────────────────────────────────────
    // "Subject: ... Style: ..." format gives FLUX 2 Pro a clear separation
    // between what to generate and how it should look.
    const prompt1 = `Subject: ${subject.trim()}. Style: ${styleDescriptors}`;
    const prompt2 = `Subject: ${subject.trim()}, different angle and composition. Style: ${styleDescriptors}`;

    console.log('[tack] prompt1:', prompt1.slice(0, 120) + '...');

    // ── Step 4: Launch both predictions with a stagger ────────────────────
    // Pass the reference image URLs so FLUX 2 Pro can use them for conditioning.
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1, selectedUrls);
      await new Promise(r => setTimeout(r, 3000));
      id2 = await startFluxPrediction(prompt2, selectedUrls);
    } catch (err) {
      console.error('[tack] prediction start failed:', err.message);
      throw new Error(`Could not start generation: ${err.message}`);
    }

    // ── Step 5: Wait for results ──────────────────────────────────────────
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
      styleDescriptors: styleDescriptors,
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
