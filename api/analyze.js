const FREE_TRIAL_LIMIT  = 3;
const PRO_MONTHLY_LIMIT = 120;
const MAX_REFERENCE_IMAGES = 8;
const DEFAULT_STYLE_PROMPT = 'professional photography, natural lighting, refined composition, high quality';
const DEFAULT_STYLE_SCHEMA = Object.freeze({
  best_image_index: 0,
  consistency_score: 0.75,
  outlier_indices: [],
  style_family: 'refined commercial photography',
  rendering_medium: 'high-quality image making',
  palette: 'balanced, cohesive color palette',
  lighting: 'natural, polished lighting',
  texture_materials: 'considered materials and tactile surface detail',
  composition: 'clean, deliberate framing',
  shape_language: 'cohesive forms and silhouettes',
  mood: 'elevated and art directed',
  must_preserve: ['shared aesthetic family', 'overall art direction'],
  avoid: [],
  style_prompt: DEFAULT_STYLE_PROMPT,
});
const ANTHROPIC_STYLE_MODEL = process.env.ANTHROPIC_STYLE_MODEL || 'claude-sonnet-4-20250514';
const REPLICATE_FLUX_MODEL  = process.env.REPLICATE_FLUX_MODEL || 'black-forest-labs/flux-2-pro';
const EXPOSE_STYLE_DEBUG     = process.env.EXPOSE_STYLE_DEBUG === '1';

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

async function ensureProfile(userId, email) {
  // Insert a default profile row only if one doesn't already exist.
  // Uses "ignore-duplicates" so existing rows are never overwritten.
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_profiles`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=ignore-duplicates',
    },
    body: JSON.stringify({ id: userId, email: email || '', generations_used: 0, plan: 'free' }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[tack] ensureProfile failed:', resp.status, body);
  }
}

async function incrementUsage(userId, email, currentUsed) {
  // Ensure the profile row exists first (handles new Google / OAuth sign-ups
  // that don't yet have a row in user_profiles).
  await ensureProfile(userId, email);
  // Direct PATCH increment — avoids relying on a stored procedure.
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ generations_used: currentUsed + 1 }),
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractClaudeText(respJson) {
  const blocks = Array.isArray(respJson?.content) ? respJson.content : [];
  return blocks
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim();
}

function extractJsonObject(rawText) {
  if (!rawText) return null;
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return rawText.slice(start, end + 1);
}

function clampIndex(index, max) {
  if (!Number.isInteger(index)) return 0;
  if (max <= 0) return 0;
  return Math.min(Math.max(index, 0), max - 1);
}

function cleanString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned || fallback;
}

function cleanList(value, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanNumericList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => Number(item))
    .filter(Number.isInteger)
    .slice(0, limit);
}

function normalizeStyleSchema(rawSchema, referenceCount) {
  const parsed = rawSchema && typeof rawSchema === 'object' ? rawSchema : {};
  const normalized = {
    best_image_index: clampIndex(parsed.best_image_index, referenceCount),
    consistency_score: Math.max(0, Math.min(1, Number(parsed.consistency_score) || DEFAULT_STYLE_SCHEMA.consistency_score)),
    outlier_indices: cleanNumericList(parsed.outlier_indices, MAX_REFERENCE_IMAGES)
      .map(v => clampIndex(v, referenceCount))
      .filter((value, index, arr) => arr.indexOf(value) === index),
    style_family: cleanString(parsed.style_family, DEFAULT_STYLE_SCHEMA.style_family),
    rendering_medium: cleanString(parsed.rendering_medium, DEFAULT_STYLE_SCHEMA.rendering_medium),
    palette: cleanString(parsed.palette, DEFAULT_STYLE_SCHEMA.palette),
    lighting: cleanString(parsed.lighting, DEFAULT_STYLE_SCHEMA.lighting),
    texture_materials: cleanString(parsed.texture_materials, DEFAULT_STYLE_SCHEMA.texture_materials),
    composition: cleanString(parsed.composition, DEFAULT_STYLE_SCHEMA.composition),
    shape_language: cleanString(parsed.shape_language, DEFAULT_STYLE_SCHEMA.shape_language),
    mood: cleanString(parsed.mood, DEFAULT_STYLE_SCHEMA.mood),
    must_preserve: cleanList(parsed.must_preserve, 5),
    avoid: cleanList(parsed.avoid, 5),
    style_prompt: cleanString(parsed.style_prompt, DEFAULT_STYLE_SCHEMA.style_prompt),
  };

  if (normalized.must_preserve.length === 0) {
    normalized.must_preserve = [...DEFAULT_STYLE_SCHEMA.must_preserve];
  }
  if (!normalized.style_prompt) {
    normalized.style_prompt = DEFAULT_STYLE_SCHEMA.style_prompt;
  }
  return normalized;
}

function parseStyleSchema(rawText, referenceCount) {
  const jsonPayload = extractJsonObject(rawText);
  if (!jsonPayload) return { ...DEFAULT_STYLE_SCHEMA };
  try {
    return normalizeStyleSchema(JSON.parse(jsonPayload), referenceCount);
  } catch {
    return { ...DEFAULT_STYLE_SCHEMA };
  }
}

function buildStyleAnalysisPrompt(referenceCount) {
  return `Analyze these ${referenceCount} reference images and return a single JSON object describing their shared style DNA.

Goal:
- The output will be used to generate a new subject that belongs to the same visual family as these references.
- Focus on aesthetic fidelity, art direction, lighting, rendering medium, palette, texture, composition, and mood.
- Do NOT focus on copying the subject matter.

Instructions:
- Treat the references as a blended set, not a single-image copy task.
- Identify which image best anchors the shared style across the whole set.
- If one or more references are clear outliers, mark them as outliers.
- Preserve the broad family resemblance across the set, not just one dominant trait.

Return ONLY valid JSON with this exact shape:
{
  "best_image_index": 0,
  "consistency_score": 0.0,
  "outlier_indices": [],
  "style_family": "",
  "rendering_medium": "",
  "palette": "",
  "lighting": "",
  "texture_materials": "",
  "composition": "",
  "shape_language": "",
  "mood": "",
  "must_preserve": ["", "", ""],
  "avoid": ["", ""],
  "style_prompt": ""
}

Field rules:
- best_image_index: integer, zero-based index of the best anchor image
- consistency_score: number from 0 to 1 for how cohesive the set is
- outlier_indices: zero-based indices for references that pull away from the shared style
- must_preserve: 2-5 concise style traits that must survive generation
- avoid: 0-5 drift risks or wrong directions
- style_prompt: 90-140 words, dense and specific, describing the shared style for image generation

Be concrete, visually specific, and faithful to the shared aesthetic. Output JSON only.`;
}

async function analyzeStyleSchema(validReferences) {
  let rawResponse = '';
  try {
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model:      ANTHROPIC_STYLE_MODEL,
        max_tokens: 900,
        temperature: 0.3,
        system: 'You are an elite art director and reference-image style analyst. Your job is to extract the shared visual DNA across multiple references so a downstream image generator can create a new subject in the exact same aesthetic family.',
        messages: [{
          role: 'user',
          content: [
            ...validReferences.map(ref => ({
              type: 'image',
              source: { type: 'base64', media_type: ref.mediaType, data: ref.base64 },
            })),
            {
              type: 'text',
              text: buildStyleAnalysisPrompt(validReferences.length),
            },
          ],
        }],
      }),
    });

    if (!claudeResp.ok) {
      throw new Error(`Claude returned ${claudeResp.status}`);
    }

    rawResponse = extractClaudeText(await claudeResp.json());
    const styleSchema = parseStyleSchema(rawResponse, validReferences.length);
    return { styleSchema, rawResponse };
  } catch (err) {
    console.warn('[tack] Claude style analysis failed (non-fatal):', err.message);
    return {
      styleSchema: { ...DEFAULT_STYLE_SCHEMA },
      rawResponse,
    };
  }
}

function buildConditioningReferences(validReferences, styleSchema) {
  const refs = [...validReferences];
  if (refs.length <= 1) return refs;

  const bestIndex = clampIndex(styleSchema.best_image_index, refs.length);
  const [bestRef] = refs.splice(bestIndex, 1);
  const ordered = [bestRef, ...refs];

  const shouldExcludeOutliers = styleSchema.consistency_score < 0.7 && styleSchema.outlier_indices.length > 0;
  if (!shouldExcludeOutliers) return ordered;

  const excluded = new Set(styleSchema.outlier_indices.map(index => validReferences[index]?.url).filter(Boolean));
  const filtered = ordered.filter((ref, index) => index === 0 || !excluded.has(ref.url));
  return filtered.length >= 2 ? filtered : ordered;
}

function buildGenerationPrompt(subject, styleSchema) {
  const lines = [
    `Create ${subject.trim()}.`,
    'Match the shared visual family of the reference images, keeping the subject new but the aesthetic highly consistent.',
    `Style family: ${styleSchema.style_family}.`,
    `Rendering medium: ${styleSchema.rendering_medium}.`,
    `Color palette: ${styleSchema.palette}.`,
    `Lighting: ${styleSchema.lighting}.`,
    `Texture and materials: ${styleSchema.texture_materials}.`,
    `Composition: ${styleSchema.composition}.`,
    `Shape language: ${styleSchema.shape_language}.`,
    `Mood and art direction: ${styleSchema.mood}.`,
    `Preserve these traits: ${styleSchema.must_preserve.join(', ')}.`,
  ];

  if (styleSchema.avoid.length) {
    lines.push(`Avoid drifting into: ${styleSchema.avoid.join(', ')}.`);
  }

  lines.push(`Reference style synthesis: ${styleSchema.style_prompt}`);
  return lines.join(' ');
}

function buildVariationPrompt(subject, styleSchema) {
  return `${buildGenerationPrompt(subject, styleSchema)} Keep the same style fidelity, but vary the framing, crop, or camera distance so it feels like a second image from the same campaign rather than a duplicate.`;
}

// ── FLUX 2 Pro ────────────────────────────────────────────────────────────────
// Accepts reference image URLs alongside the text prompt for conditioning.
// Combined with Claude's rich paragraph-style description this produced the
// best style-accurate results in testing.

async function startFluxPrediction(prompt, imageUrls = [], { retries = 3, backoffMs = 12000, aspectRatio = 'match_input_image' } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(
      `https://api.replicate.com/v1/models/${REPLICATE_FLUX_MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_images:      imageUrls.slice(0, MAX_REFERENCE_IMAGES),
            aspect_ratio:      imageUrls.length > 0 ? aspectRatio : '1:1',
            output_format:     'png',
            output_quality:    95,
            safety_tolerance:  5,
          },
        }),
      }
    );

    if (resp.status === 429) {
      if (attempt === retries) throw new Error('Replicate rate limit reached — please try again in a moment.');
      const wait = backoffMs * (attempt + 1);
      console.warn(`[tack] throttled, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(wait);
      continue;
    }

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
    return data.id;
  }
}

async function waitForResult(predictionId) {
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
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
  const { imageUrls, subject, outputCount } = req.body;
  const requestedOutputCount = Math.max(1, Math.min(2, Number(outputCount) || 2));
  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: 'Missing subject — please describe what you want to create.' });
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: 'No reference images provided — please select at least one.' });
  }

  try {
    // ── Step 1: Fetch reference images ────────────────────────────────────
    const selectedUrls = imageUrls.slice(0, MAX_REFERENCE_IMAGES);
    const fetchedReferences = await Promise.all(selectedUrls.map(async (url, index) => {
      const data = await fetchImageData(url);
      return data ? { ...data, url, index } : null;
    }));
    const validReferences = fetchedReferences.filter(Boolean);

    if (validReferences.length === 0) {
      return res.status(422).json({
        error: 'Could not load any of the selected images. They may have expired. Please rescan and try again.',
      });
    }

    // ── Step 2: Claude structured style analysis ──────────────────────────
    const { styleSchema, rawResponse } = await analyzeStyleSchema(validReferences);
    const conditioningReferences = buildConditioningReferences(validReferences, styleSchema);
    const conditioningUrls = conditioningReferences.map(ref => ref.url);

    // ── Step 3: Build prompts ─────────────────────────────────────────────
    const prompt1 = buildGenerationPrompt(subject, styleSchema);
    const prompt2 = buildVariationPrompt(subject, styleSchema);

    console.log('[tack] prompt1:', prompt1.slice(0, 120) + '...');

    // ── Step 4: Launch both predictions with a stagger ────────────────────
    // Pass the reference image URLs so FLUX 2 Pro can use them for conditioning.
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1, conditioningUrls, { aspectRatio: 'match_input_image' });
      if (requestedOutputCount > 1) {
        await sleep(3000);
        id2 = await startFluxPrediction(prompt2, conditioningUrls, { aspectRatio: 'match_input_image' });
      }
    } catch (err) {
      console.error('[tack] prediction start failed:', err.message);
      throw new Error(`Could not start generation: ${err.message}`);
    }

    // ── Step 5: Wait for results ──────────────────────────────────────────
    const settledResults = await Promise.allSettled([
      waitForResult(id1),
      ...(id2 ? [waitForResult(id2)] : []),
    ]);
    const [result1, result2] = settledResults;

    if (result1.status === 'rejected') console.error('[tack] prediction 1 failed:', result1.reason?.message);
    if (result2?.status === 'rejected') console.error('[tack] prediction 2 failed:', result2.reason?.message);

    const images = [
      result1.status === 'fulfilled' ? (Array.isArray(result1.value) ? result1.value[0] : result1.value) : null,
      result2?.status === 'fulfilled' ? (Array.isArray(result2.value) ? result2.value[0] : result2.value) : null,
    ].filter(Boolean);

    if (images.length === 0) {
      throw new Error(requestedOutputCount > 1 ? 'Both generations failed. Please try again.' : 'Generation failed. Please try again.');
    }

    // ── Step 6: Increment usage ───────────────────────────────────────────
    if (!isAnon) {
      await incrementUsage(user.id, user.email, generationsUsed).catch(e =>
        console.error('[tack] usage increment failed (non-fatal):', e.message)
      );
    }

    const newUsed        = generationsUsed + 1;
    const newMonthlyUsed = monthlyUsed + 1;

    return res.status(200).json({
      images,
      prompt:           prompt1,
      styleDescriptors: styleSchema.style_prompt,
      styleSchema,
      conditioningMeta: {
        selected_count: selectedUrls.length,
        valid_count: validReferences.length,
        used_count: conditioningUrls.length,
        best_image_index: styleSchema.best_image_index,
        consistency_score: styleSchema.consistency_score,
        ...(EXPOSE_STYLE_DEBUG ? { raw_style_analysis: rawResponse || null } : {}),
      },
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
