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
// Used only for Claude's visual analysis — not passed to the generation model.

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

// ── Replicate: FLUX 1.1 Pro (text-to-image, no image conditioning) ────────────
// Why text-only: image conditioning models (Redux, Kontext) absorb the CONTENT
// of reference images as well as the style — causing content bleed (e.g. a
// person from a reference appearing in the output instead of the requested
// subject). Claude extracts the style as text; FLUX generates from that.
// FLUX 1.1 Pro is excellent at graphic, 3D, chrome, and illustrative styles
// from text prompts and has no content-bleed problem.

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
            aspect_ratio:       '1:1',
            output_format:      'webp',
            output_quality:     90,
            safety_tolerance:   5,
            prompt_upsampling:  false, // we craft the prompt ourselves
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

    // ── Step 2: Claude extracts the visual style as a generation prompt ───
    // Claude's ONE job: look at all selected images and describe their shared
    // visual production style in terms a text-to-image model understands.
    // It outputs a ready-to-use style block — not a description of the images'
    // subjects, but precisely how they were made: render technique, surface
    // quality, color treatment, texture, lighting, aesthetic movement.
    // This style block slots directly into the FLUX prompt.
    let styleBlock = '';
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
          max_tokens: 200,
          system: `You are an expert image generation prompt engineer specializing in graphic design and digital art aesthetics. Your only job: analyze reference images and output style descriptors that a text-to-image model can use to reproduce their exact visual production style — NOT their subjects.

## CRITICAL: IDENTIFY THE MEDIUM FIRST
Before anything else, determine: is this a photograph of reality, or was it made digitally/by hand?
- Graphic design, digital illustration, 3D render, motion graphics, poster art → NOT a photograph → MUST include "not photorealistic" and "stylized digital render" or equivalent
- Only describe as "photography" if the image is literally a photo of a real scene

## LOOK SPECIFICALLY FOR THESE VISUAL SIGNATURES:
- **Grain/noise**: Heavy noise grain overlay? Film grain? Risograph-style grain? — name it explicitly: "heavy noise grain overlay", "risograph texture", "analog grain"
- **Gradient behavior**: Does color transition through black/dark? Duotone? Rainbow spectrum? Name the exact colors: "cyan-to-black gradient", "magenta-to-deep-black fade", "hot pink and electric yellow"
- **Surface quality**: Chrome? Holographic? Matte? Inflated/puffy? Liquid? Clay? Metallic?
- **Background**: Is it a flat single color? What color? "flat vivid orange background", "solid black bg", "white void"
- **Typography or graphic elements**: Bold display type? Poster layout? Grid?
- **Aesthetic era**: Y2K? 90s rave? Neo-brutalist? Retrofuturist? Swiss design?

Output a single comma-separated list of 10-16 specific style descriptors. No sentences. No explanation. No subject matter. ONLY the descriptors.`,
          messages: [{
            role:    'user',
            content: [
              ...validImages.map(img => ({
                type:   'image',
                source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
              })),
              {
                type: 'text',
                text: 'Analyze the visual production style of these reference images. Focus on grain/texture, color treatment, render technique, and surface quality. Output ONLY comma-separated style descriptors — no sentences, no subjects.',
              },
            ],
          }],
        }),
      });

      if (claudeResp.ok) {
        const d = await claudeResp.json();
        styleBlock = d.content?.[0]?.text?.trim() || '';
      }
    } catch (err) {
      console.warn('[tack] Claude style analysis failed (non-fatal):', err.message);
      // Fall back to a sensible generic style — still better than no style
      styleBlock = '3D CGI render, holographic iridescent surface, bold saturated neon gradient, chrome metallic finish, graphic design poster style, not photorealistic, Y2K digital aesthetic';
    }

    // ── Step 3: Build two generation prompts ─────────────────────────────
    // Structure: [STYLE] + [SUBJECT] + [render anchor]
    // Style leads so FLUX locks in the aesthetic before reading the subject.
    // "not photorealistic" at the end reinforces the graphic/illustrative bias.
    // Two prompts vary composition so outputs feel like distinct creative options.
    const renderAnchor = 'bold stylized render, not photorealistic, graphic design quality';

    const prompt1 = `${styleBlock}. ${subject.trim()}. ${renderAnchor}.`;
    const prompt2 = `${styleBlock}. ${subject.trim()}, different angle and composition. ${renderAnchor}.`;

    // ── Step 4: Launch both predictions with a short stagger ─────────────
    // Stagger 3s between starts to respect Replicate's burst limit.
    // Both run in parallel on Replicate's end once started.
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1);
      await new Promise(r => setTimeout(r, 3000));
      id2 = await startFluxPrediction(prompt2);
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
