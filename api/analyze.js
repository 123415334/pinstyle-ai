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

// ── FLUX 1.1 Pro ──────────────────────────────────────────────────────────────
// Single generation model for all board types. FLUX handles both photorealistic
// and graphic/illustrative styles well when given precise style descriptors from
// Claude. Photo boards stay photorealistic naturally; graphic boards get an
// explicit anti-photorealism anchor to keep FLUX in the right lane.

async function startFluxPrediction(prompt, { retries = 3, backoffMs = 12000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            aspect_ratio:      '1:1',
            output_format:     'webp',
            output_quality:    90,
            safety_tolerance:  5,
            prompt_upsampling: false,
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

    // ── Step 2: Claude identifies board type and extracts style ───────────
    // Claude makes two decisions:
    //   1. Is this a PHOTO board or a GRAPHIC/DIGITAL board?
    //   2. What are the precise style descriptors?
    //
    // This drives the prompt anchor at generation time:
    //   Photo boards  → descriptors feed FLUX naturally (it defaults to realism)
    //   Graphic boards → descriptors + explicit "not photorealistic" anchor
    let styleBlock = '';
    let isPhotoBoard = false;

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
          max_tokens: 400,
          system: `You are an expert image generation prompt engineer. Analyze the reference images and output EXACTLY two lines.

## STEP 1 — MEDIUM
Decide: are these primarily PHOTOGRAPHS of real scenes, or GRAPHIC/DIGITAL ART?
- PHOTO: editorial photography, fashion, lifestyle, film, analogue, documentary, product shots of real objects
- GRAPHIC: illustration, 3D render, poster design, vector art, digital collage, graphic design, CGI, mixed media

Line 1 — MEDIUM: output exactly one word: photo OR graphic

## STEP 2 — STYLE DESCRIPTORS
Line 2 — STYLE: comma-separated list of 10-16 descriptors capturing the exact visual production style (NOT the subjects).

For PHOTO boards describe:
- Film stock / sensor quality: "35mm film", "medium format", "analog grain", "digital clean"
- Color grading: name actual tones — "warm golden hour", "faded cool blues", "high contrast B&W", "overexposed pastels"
- Lighting: "soft natural window light", "harsh midday sun", "dramatic studio strobe", "golden hour backlit"
- Era / aesthetic: "90s editorial", "70s film photography", "contemporary fashion editorial"
- Texture: "heavy film grain", "light noise", "smooth digital"

For GRAPHIC boards describe:
- Render type: "3D CGI render", "flat vector illustration", "risograph print", "digital collage", "hand-drawn"
- Surface & material: "chrome metallic", "holographic iridescent", "matte clay", "glossy plastic"
- Texture: "heavy grain noise overlay", "smooth clean vector", "halftone dots", "airbrush gradient"
- Colors — be specific: "electric cyan and hot magenta", "bold neon on black", "warm orange-to-red gradient"
- Lighting: "dramatic rim light", "flat graphic lit", "studio three-point"
- Aesthetic: "Y2K chrome", "neo-brutalist", "retrofuturist", "90s rave graphic", "contemporary graphic design"

Output format (EXACTLY two lines, nothing else):
MEDIUM: [photo or graphic]
STYLE: [descriptors]`,
          messages: [{
            role:    'user',
            content: [
              ...validImages.map(img => ({
                type:   'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
              })),
              {
                type: 'text',
                text: 'Analyze these reference images. Output MEDIUM and STYLE.',
              },
            ],
          }],
        }),
      });

      if (claudeResp.ok) {
        const d      = await claudeResp.json();
        const text   = d.content?.[0]?.text?.trim() || '';
        const medMatch   = text.match(/^MEDIUM:\s*(.+)$/mi);
        const styleMatch = text.match(/^STYLE:\s*(.+)$/mi);
        if (medMatch)   isPhotoBoard = medMatch[1].trim().toLowerCase() === 'photo';
        if (styleMatch) styleBlock   = styleMatch[1].trim();
        console.log('[tack] medium:', isPhotoBoard ? 'photo' : 'graphic');
        console.log('[tack] style:', styleBlock);
      }
    } catch (err) {
      console.warn('[tack] Claude failed (non-fatal):', err.message);
    }

    // Fallbacks
    if (!styleBlock) {
      styleBlock = isPhotoBoard
        ? 'analog film photography, natural light, warm color grading, editorial quality'
        : '3D CGI render, bold saturated colors, graphic design poster, not photorealistic';
    }

    // ── Step 3: Build prompts ─────────────────────────────────────────────
    // Photo boards: style descriptors + subject (FLUX stays naturally realistic)
    // Graphic boards: style descriptors + subject + explicit style anchor
    //   to prevent FLUX drifting into photorealism
    const anchor = isPhotoBoard ? '' : ' Bold stylized render, not photorealistic.';

    const prompt1 = `${styleBlock}. ${subject.trim()}.${anchor}`;
    const prompt2 = `${styleBlock}. ${subject.trim()}, different angle and composition.${anchor}`;

    console.log('[tack] prompt1:', prompt1);

    // ── Step 4: Launch both FLUX predictions with a stagger ───────────────
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1);
      await new Promise(r => setTimeout(r, 3000));
      id2 = await startFluxPrediction(prompt2);
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
