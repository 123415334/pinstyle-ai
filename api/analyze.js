const FREE_MONTHLY_LIMIT = 3;
const PRO_MONTHLY_LIMIT = 120;
const STUDIO_MONTHLY_LIMIT = 600;
const API_VERSION = '2026-05-23.human-art-style-conditioning';
const MAX_REFERENCE_IMAGES = 12;
const MAX_CONDITIONING_IMAGES = 4;
const MAX_GRAPHIC_CONDITIONING_IMAGES = 6;
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
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
  reference_subjects: [],
  subject_leak_risks: [],
  style_prompt: DEFAULT_STYLE_PROMPT,
});
const ANTHROPIC_STYLE_MODEL = process.env.ANTHROPIC_STYLE_MODEL || 'claude-sonnet-4-20250514';
const REPLICATE_FLUX_MODEL  = process.env.REPLICATE_FLUX_MODEL || 'black-forest-labs/flux-2-pro';
const EXPOSE_STYLE_DEBUG     = process.env.EXPOSE_STYLE_DEBUG === '1';
let sharp = null;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

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

function normalizePlan(plan) {
  const value = (plan || '').toLowerCase();
  if (value === 'unlimited') return 'studio';
  return ['free', 'pro', 'studio'].includes(value) ? value : 'free';
}

function getPlanLimit(plan) {
  if (plan === 'free') return FREE_MONTHLY_LIMIT;
  if (plan === 'pro') return PRO_MONTHLY_LIMIT;
  if (plan === 'studio') return STUDIO_MONTHLY_LIMIT;
  return FREE_MONTHLY_LIMIT;
}

function getEffectiveMonthlyUsage(monthlyUsed, monthlyResetAt) {
  const periodExpired = !monthlyResetAt || new Date(monthlyResetAt) <= new Date();
  return periodExpired ? 0 : monthlyUsed;
}

function getNextMonthlyReset(monthlyResetAt) {
  if (monthlyResetAt && new Date(monthlyResetAt) > new Date()) return monthlyResetAt;
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

async function incrementUsage(userId, email, { currentUsed, effectiveMonthly, monthlyResetAt }) {
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
    body: JSON.stringify({
      generations_used: currentUsed + 1,
      monthly_generations: effectiveMonthly + 1,
      monthly_reset_at: getNextMonthlyReset(monthlyResetAt),
    }),
  });
}

// ── Image fetching ────────────────────────────────────────────────────────────
// Fetches reference images so Claude can analyze their visual style.

async function normalizeImageBuffer(buffer, mediaType) {
  if (!buffer || !buffer.length) return null;
  if (!sharp) return { buffer, mediaType };

  try {
    const normalized = await sharp(buffer, { limitInputPixels: 36_000_000 })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return { buffer: normalized, mediaType: 'image/jpeg' };
  } catch (err) {
    console.warn('[tack] image normalization failed; using original:', err.message);
    return { buffer, mediaType };
  }
}

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
    const originalBuffer = Buffer.from(arrayBuf);
    if (originalBuffer.length === 0 || originalBuffer.length > MAX_REFERENCE_BYTES * 3) return null;

    const normalized = await normalizeImageBuffer(originalBuffer, mediaType);
    if (!normalized?.buffer?.length || normalized.buffer.length > MAX_REFERENCE_BYTES) return null;

    const base64 = normalized.buffer.toString('base64');
    return { buffer: normalized.buffer, base64, mediaType: normalized.mediaType };
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
    reference_subjects: cleanList(parsed.reference_subjects, 8),
    subject_leak_risks: cleanList(parsed.subject_leak_risks, 8),
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

function isGraphicDesignRequest(subject = '') {
  return /\b(poster|flyer|album cover|book cover|magazine|zine|typography|type treatment|lettering|logo|brand|branding|packaging|label|sticker|graphic|layout|collage|moodboard|ad campaign|banner|social post|web design|ui|icon|illustration)\b/i.test(subject);
}

function isStyleDrivenRequest(subject = '') {
  return !isHumanSubjectRequest(subject) || isGraphicDesignRequest(subject);
}

function isHumanSubjectRequest(subject = '') {
  return /\b(person|people|portrait|woman|man|lady|girl|boy|child|teen|adult|elderly|old|young|model|subject|face|couple|family|mother|father|grandmother|grandfather)\b/i.test(subject);
}

function isNonPhotographicStyle(styleSchema = {}) {
  const styleText = [
    styleSchema.style_family,
    styleSchema.rendering_medium,
    styleSchema.texture_materials,
    styleSchema.composition,
    styleSchema.shape_language,
    styleSchema.mood,
    styleSchema.style_prompt,
  ].filter(Boolean).join(' ').toLowerCase();

  const artTerms = /\b(painting|painted|oil paint|oil painting|acrylic|watercolor|gouache|brushwork|canvas|illustration|illustrated|drawing|sketch|charcoal|pastel|collage|mixed media|printmaking|screenprint|linocut|woodcut|ink|anime|manga|cartoon|comic|3d render|cgi|sculptural)\b/;
  const photoTerms = /\b(photo|photograph|photography|photographic|camera|film photo|35mm|flash photograph|snapshot|documentary photo|street photography|editorial photography|product photography)\b/;
  return artTerms.test(styleText) && !photoTerms.test(styleText);
}

function buildStyleAnalysisPrompt(referenceCount, subject) {
  const humanRequest = isHumanSubjectRequest(subject);
  return `Analyze these ${referenceCount} reference images and return a single JSON object describing their shared style DNA.

Goal:
- The output will be used to generate this new subject: "${subject.trim()}".
- The new subject must belong to the same visual family as the strongest compatible references.
- Focus on aesthetic fidelity, art direction, lighting, rendering medium, palette, texture, composition, and mood.
- Do NOT focus on copying the subject matter.

Instructions:
- Treat the references as a candidate style board, not all equally useful.
- Identify which image best anchors the desired style for the requested subject.
- Mark references as outliers when they conflict with the requested subject, have a different medium, are close body fragments, private/intimate scenes, or would pull the generation toward wrong content.
- ${humanRequest
    ? 'Because this is a human-subject request, treat reference people as style examples only. Do not preserve their identity, face, age, hairstyle, outfit, pose, or body type as required content.'
    : 'Because this is not a human-subject request, preserve useful visual style signals from product renders, illustration, typography, layout, collage, material, lighting, color, photography, and graphic-design references when they support the requested subject.'}
- When the board is mixed, prefer cohesive style signals that support the requested medium over unusual subjects or one-off compositions.
- Preserve the broad family resemblance across the compatible references, not just one dominant trait.

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
  "reference_subjects": ["", ""],
  "subject_leak_risks": ["", ""],
  "style_prompt": ""
}

Field rules:
- best_image_index: integer, zero-based index of the best anchor image
- consistency_score: number from 0 to 1 for how cohesive the compatible style subset is
- outlier_indices: zero-based indices for references that pull away from the shared style or conflict with the requested subject
- must_preserve: 2-5 concise style traits that must survive generation
- avoid: 0-5 drift risks or wrong directions
- reference_subjects: 2-8 concise nouns for the main depicted subjects, objects, characters, or motifs recurring in the references
- subject_leak_risks: 0-8 specific reference subjects or motifs that must NOT leak into a new generation unless explicitly requested
- style_prompt: 90-140 words, dense and specific, describing the shared style for image generation

Be concrete, visually specific, and faithful to the compatible shared aesthetic. Output JSON only.`;
}

async function analyzeStyleSchema(validReferences, subject) {
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
              text: buildStyleAnalysisPrompt(validReferences.length, subject),
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

function buildConditioningReferences(validReferences, styleSchema, subject = '') {
  const refs = [...validReferences];
  if (refs.length <= 1) return refs;

  const bestIndex = clampIndex(styleSchema.best_image_index, refs.length);
  const [bestRef] = refs.splice(bestIndex, 1);
  const ordered = [bestRef, ...refs];

  const excluded = new Set(styleSchema.outlier_indices.map(index => validReferences[index]?.url).filter(Boolean));
  const filtered = ordered.filter((ref, index) => index === 0 || !excluded.has(ref.url));
  const compatible = filtered.length >= 2 ? filtered : ordered;
  const limit = isStyleDrivenRequest(subject) ? MAX_GRAPHIC_CONDITIONING_IMAGES : MAX_CONDITIONING_IMAGES;
  return compatible.slice(0, limit);
}

function buildConditioningInput(ref) {
  if (!ref?.base64 || !ref?.mediaType?.startsWith('image/')) return ref?.url || '';
  return `data:${ref.mediaType};base64,${ref.base64}`;
}

function buildGenerationPrompt(subject, styleSchema, { styleDriven = false, nonPhotographic = false } = {}) {
  const lines = [
    `Create ${subject.trim()}.`,
    `Primary subject requirement: the image must clearly depict ${subject.trim()} as the hero subject.`,
    'The requested subject overrides all reference image subjects.',
    'Do not copy or preserve any reference person identity, face, age, hairstyle, outfit, body type, pose, or character.',
    'If the requested subject differs from people in the references, replace the reference person completely while keeping only the visual style.',
    'Honor every concrete detail in the subject request, including quantity, color, age, objects, action, setting, and time of day.',
    'Make one coherent, believable image with natural anatomy, realistic faces and hands, correct limb structure, and no duplicated bodies or fused objects.',
    'If the subject includes people holding or carrying objects, make the grip, object count, and object placement visually legible.',
    'Match the shared visual family of the reference images, keeping the subject new but the aesthetic highly consistent.',
    'Style fidelity is critical: the result should be immediately recognizable as belonging to the same visual world as the references.',
    'Translate style only. Do not copy the exact subject matter, character design, mascot, lettering, logo, pose, layout, or composition from the reference images.',
    'If the references contain recognizable objects or characters, carry over only their aesthetic treatment, not their identity.',
    `Style family: ${styleSchema.style_family}.`,
    `Rendering medium: ${styleSchema.rendering_medium}.`,
    `Color palette: ${styleSchema.palette}.`,
    `Lighting: ${styleSchema.lighting}.`,
    `Texture and materials: ${styleSchema.texture_materials}.`,
    `Composition: ${styleSchema.composition}.`,
    `Shape language: ${styleSchema.shape_language}.`,
    `Mood and art direction: ${styleSchema.mood}.`,
    `Preserve these traits: ${styleSchema.must_preserve.join(', ')}.`,
    'Avoid AI artifacts, warped fingers, distorted faces, extra limbs, missing limbs, melting objects, illegible object counts, text/logos, collages, screenshots, and graphic-design layouts unless explicitly requested.',
  ];

  if (styleDriven) {
    lines.push('For stylized product, object, graphic, or illustrative references, preserve the rendering medium, material treatment, lighting logic, color behavior, edge quality, shadow style, and compositional boldness more strongly than generic photorealism.');
  }

  if (nonPhotographic) {
    lines.push('The final image must preserve the non-photographic medium of the references. Do not render this as a camera photo, stock photo, documentary photograph, or photorealistic snapshot.');
  }

  if (styleSchema.avoid.length) {
    lines.push(`Avoid drifting into: ${styleSchema.avoid.join(', ')}.`);
  }

  if (styleSchema.reference_subjects.length) {
    lines.push(`Reference subjects present in the board: ${styleSchema.reference_subjects.join(', ')}.`);
  }

  if (styleSchema.subject_leak_risks.length) {
    lines.push(`Do not let these reference subjects or motifs leak into the result unless explicitly requested: ${styleSchema.subject_leak_risks.join(', ')}.`);
  }

  lines.push(`Reference style synthesis: ${styleSchema.style_prompt}`);
  return lines.join(' ');
}

function buildVariationPrompt(subject, styleSchema, options = {}) {
  return `${buildGenerationPrompt(subject, styleSchema, options)} Keep the same style fidelity, but vary the framing, silhouette, crop, and composition so it feels like a second image from the same campaign rather than a duplicate. Do not reuse the same arrangement or recurring motifs from the references.`;
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

async function runPredictionPair(prompt1, prompt2, conditioningInputs, requestedOutputCount) {
  const id1 = await startFluxPrediction(prompt1, conditioningInputs, { aspectRatio: 'match_input_image' });
  let id2 = null;
  if (requestedOutputCount > 1) {
    await sleep(3000);
    id2 = await startFluxPrediction(prompt2, conditioningInputs, { aspectRatio: 'match_input_image' });
  }

  const settledResults = await Promise.allSettled([
    waitForResult(id1),
    ...(id2 ? [waitForResult(id2)] : []),
  ]);

  settledResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[tack] prediction ${index + 1} failed:`, result.reason?.message);
    }
  });

  return settledResults
    .map(result => result.status === 'fulfilled'
      ? (Array.isArray(result.value) ? result.value[0] : result.value)
      : null)
    .filter(Boolean);
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
    plan            = normalizePlan(profile?.plan ?? 'free');
    monthlyUsed     = getEffectiveMonthlyUsage(monthlyUsed, monthlyResetAt);
    const limit      = getPlanLimit(plan);

    if (monthlyUsed >= limit) {
      return res.status(402).json({
        error:        plan === 'free' ? 'free_limit_reached' : `${plan}_limit_reached`,
        message:      plan === 'free'
          ? `You've used all ${FREE_MONTHLY_LIMIT} free generations for this month. Upgrade to Pro to keep creating.`
          : `You've reached your ${limit} generation monthly limit. Upgrade for more monthly generations.`,
        monthly_used: monthlyUsed,
        limit,
        resets_at:    monthlyResetAt,
      });
    }
  }

  // ── Input validation ──────────────────────────────────────────────────────
  const { imageUrls, subject, outputCount } = req.body;
  const defaultOutputCount = ['pro', 'studio'].includes(plan) ? 2 : 1;
  const requestedOutputCount = Math.max(1, Math.min(defaultOutputCount, Number(outputCount) || defaultOutputCount));
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
    const { styleSchema, rawResponse } = await analyzeStyleSchema(validReferences, subject);
    const conditioningReferences = buildConditioningReferences(validReferences, styleSchema, subject);
    const nonPhotographic = isNonPhotographicStyle(styleSchema);
    const shouldUseImageConditioning = !isHumanSubjectRequest(subject)
      || isStyleDrivenRequest(subject)
      || nonPhotographic;
    const conditioningInputs = shouldUseImageConditioning ? conditioningReferences.map(buildConditioningInput).filter(Boolean) : [];

    // ── Step 3: Build prompts ─────────────────────────────────────────────
    const styleDriven = isStyleDrivenRequest(subject) || nonPhotographic;
    const promptOptions = { styleDriven, nonPhotographic };
    const prompt1 = buildGenerationPrompt(subject, styleSchema, promptOptions);
    const prompt2 = buildVariationPrompt(subject, styleSchema, promptOptions);

    console.log('[tack] prompt1:', prompt1.slice(0, 120) + '...');

    // ── Step 4: Launch both predictions with a stagger ────────────────────
    // Human-subject prompts use text-only style transfer to prevent identity,
    // face, age, clothing, and pose leakage from reference photos.
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1, conditioningInputs, { aspectRatio: 'match_input_image' });
      if (requestedOutputCount > 1) {
        await sleep(3000);
        id2 = await startFluxPrediction(prompt2, conditioningInputs, { aspectRatio: 'match_input_image' });
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

    let images = [
      result1.status === 'fulfilled' ? (Array.isArray(result1.value) ? result1.value[0] : result1.value) : null,
      result2?.status === 'fulfilled' ? (Array.isArray(result2.value) ? result2.value[0] : result2.value) : null,
    ].filter(Boolean);

    let usedFallbackConditioning = false;
    if (images.length === 0 && conditioningInputs.length > 1) {
      console.warn('[tack] conditioned predictions failed; retrying with strongest reference only');
      const fallbackId = await startFluxPrediction(prompt1, conditioningInputs.slice(0, 1), { aspectRatio: 'match_input_image', retries: 1 });
      const fallbackResult = await waitForResult(fallbackId);
      images = [Array.isArray(fallbackResult) ? fallbackResult[0] : fallbackResult].filter(Boolean);
      usedFallbackConditioning = images.length > 0;
    }

    if (images.length === 0) {
      throw new Error(requestedOutputCount > 1 ? 'Both generations failed. Please try again.' : 'Generation failed. Please try again.');
    }

    // ── Step 6: Increment usage ───────────────────────────────────────────
    if (!isAnon) {
      await incrementUsage(user.id, user.email, {
        currentUsed: generationsUsed,
        effectiveMonthly: monthlyUsed,
        monthlyResetAt,
      }).catch(e =>
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
        used_count: usedFallbackConditioning ? 1 : conditioningInputs.length,
        mode: usedFallbackConditioning ? 'image_conditioned_fallback' : (shouldUseImageConditioning ? 'image_conditioned' : 'style_text_only'),
        best_image_index: styleSchema.best_image_index,
        consistency_score: styleSchema.consistency_score,
        ...(EXPOSE_STYLE_DEBUG ? { raw_style_analysis: rawResponse || null } : {}),
      },
      ...(isAnon ? {} : {
        usage: {
          used:         newUsed,
          monthly_used: newMonthlyUsed,
          limit:        getPlanLimit(plan),
          remaining:    getPlanLimit(plan) - newMonthlyUsed,
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
