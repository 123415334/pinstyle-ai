const FREE_MONTHLY_LIMIT = 3;
const PRO_MONTHLY_LIMIT = 120;
const STUDIO_MONTHLY_LIMIT = 600;
const API_VERSION = '2026-06-17.reference-first-style-transfer';
const MAX_REFERENCE_IMAGES = 12;
const MAX_FLUX_INPUT_IMAGES = 8;
const MAX_CONDITIONING_IMAGES = 4;
const MAX_GRAPHIC_CONDITIONING_IMAGES = 6;
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
const DEFAULT_STYLE_PROMPT = 'reference-matched visual style from the selected images';
const DEFAULT_ASPECT_RATIO = '1:1';
const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '1:1', '9:16']);
const OUTPUT_DIMENSIONS = Object.freeze({
  '16:9': { width: 1600, height: 896 },
  '1:1':  { width: 1024, height: 1024 },
  '9:16': { width: 896, height: 1600 },
});
const OUTPUT_ASPECT_TOLERANCE = 0.02;
const DEFAULT_STYLE_SCHEMA = Object.freeze({
  best_image_index: 0,
  consistency_score: 0.75,
  outlier_indices: [],
  medium_type: 'photograph',
  medium_subgenre: 'reference-matched photographic style',
  style_family: 'selected reference image style',
  rendering_medium: 'same visible medium as the selected references',
  production_style: 'same visible art direction as the selected references',
  palette: 'same visible palette strategy as the selected references',
  lighting: 'same visible lighting design as the selected references',
  camera_viewpoint: 'same visible viewpoint and crop logic as the selected references',
  texture_materials: 'same visible texture and surface treatment as the selected references',
  composition: 'same visible composition logic as the selected references',
  shape_language: 'same visible shape language as the selected references',
  mood: 'same visible mood as the selected references',
  subject_translation: 'render the requested subject as a new hero subject in the exact visible style of the selected references',
  generic_drift_risks: ['generic output'],
  positive_style_contract: 'Use the selected reference images as the authoritative style guide. Match their exact visible medium, subgenre, palette, lighting, texture, composition, camera/viewpoint, shape language, mood, and production style while replacing the reference subject matter with the requested subject.',
  must_preserve: ['exact visible reference style', 'specific art direction'],
  avoid: [],
  reference_subjects: [],
  subject_leak_risks: [],
  style_prompt: DEFAULT_STYLE_PROMPT,
});
const ANTHROPIC_STYLE_MODEL = process.env.ANTHROPIC_STYLE_MODEL || 'claude-sonnet-4-20250514';
const REPLICATE_FLUX_MODEL  = process.env.REPLICATE_FLUX_MODEL || 'black-forest-labs/flux-2-pro';
const EXPOSE_STYLE_DEBUG     = process.env.EXPOSE_STYLE_DEBUG === '1';
const MIN_STYLE_CONTRACT_FIELDS = 7;
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

function normalizeAspectRatio(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'horizontal') return '16:9';
  if (normalized === 'square') return '1:1';
  if (normalized === 'vertical') return '9:16';
  return ALLOWED_ASPECT_RATIOS.has(value) ? value : DEFAULT_ASPECT_RATIO;
}

function getOutputDimensions(aspectRatio) {
  return OUTPUT_DIMENSIONS[normalizeAspectRatio(aspectRatio)] || OUTPUT_DIMENSIONS[DEFAULT_ASPECT_RATIO];
}

function getAspectRatioPromptInstruction(aspectRatio) {
  const normalized = normalizeAspectRatio(aspectRatio);
  if (normalized === '16:9') return 'The generated file must be a native horizontal 16:9 landscape image, composed for the full wide canvas, not a square crop or square image inside a wide frame.';
  if (normalized === '9:16') return 'The generated file must be a native vertical 9:16 portrait image, composed for the full tall canvas, not a square crop or square image inside a tall frame.';
  return 'The generated file must be a native square 1:1 image composed for the full square canvas.';
}

function getOutputRatio(aspectRatio) {
  const dims = getOutputDimensions(aspectRatio);
  return dims.width / dims.height;
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

async function fetchGeneratedBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim();
    if (contentType && !contentType.startsWith('image/')) return null;
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return buffer.length ? buffer : null;
  } catch (err) {
    console.warn('[tack] generated image fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadGeneratedBuffer(ownerId, buffer, index) {
  if (!buffer?.length) return null;
  const timestamp = Date.now();
  const safeOwner = String(ownerId || 'anonymous')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .slice(0, 80) || 'anonymous';
  const path = `${safeOwner}/api_${timestamp}_${index}.png`;
  const resp = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/generated-images/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'apikey':        process.env.SUPABASE_SERVICE_KEY,
      'Content-Type':  'image/png',
      'x-upsert':      'false',
    },
    body: buffer,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.warn('[tack] generated image upload failed:', resp.status, body);
    return null;
  }
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`;
}

async function enforceOutputAspect(url, aspectRatio, index, ownerId) {
  const dimensions = getOutputDimensions(aspectRatio);
  const expectedRatio = getOutputRatio(aspectRatio);

  if (!sharp) {
    console.warn(`[tack] enforceOutputAspect[${index}]: sharp not available — skipping correction for ${aspectRatio}`);
    return url;
  }

  const sourceBuffer = await fetchGeneratedBuffer(url);
  if (!sourceBuffer) {
    console.warn(`[tack] enforceOutputAspect[${index}]: could not fetch generated image`);
    return url;
  }

  try {
    const meta = await sharp(sourceBuffer, { limitInputPixels: 64_000_000 }).rotate().metadata();
    const sourceRatio = meta.width && meta.height ? meta.width / meta.height : 0;
    console.log(`[tack] enforceOutputAspect[${index}]: flux=${meta.width}x${meta.height} (${sourceRatio.toFixed(3)}) expected=${dimensions.width}x${dimensions.height} (${expectedRatio.toFixed(3)}) aspectRatio=${aspectRatio}`);

    if (sourceRatio && Math.abs(sourceRatio - expectedRatio) <= OUTPUT_ASPECT_TOLERANCE) {
      console.log(`[tack] enforceOutputAspect[${index}]: ratio OK — no correction needed`);
      return url;
    }

    console.log(`[tack] enforceOutputAspect[${index}]: correcting ${meta.width}x${meta.height} → ${dimensions.width}x${dimensions.height}`);

    const background = await sharp(sourceBuffer, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize(dimensions.width, dimensions.height, { fit: 'cover', position: 'attention' })
      .blur(32)
      .modulate({ brightness: 0.82, saturation: 0.82 })
      .png()
      .toBuffer();

    const foreground = await sharp(sourceBuffer, { limitInputPixels: 64_000_000 })
      .rotate()
      .resize(dimensions.width, dimensions.height, { fit: 'contain', withoutEnlargement: false })
      .png()
      .toBuffer();

    const finalBuffer = await sharp(background, { limitInputPixels: 64_000_000 })
      .composite([{ input: foreground, gravity: 'center' }])
      .png({ quality: 95 })
      .toBuffer();

    const correctedUrl = await uploadGeneratedBuffer(ownerId, finalBuffer, index);
    console.log(`[tack] enforceOutputAspect[${index}]: correction ${correctedUrl ? 'uploaded OK' : 'upload FAILED — using original'}`);
    return correctedUrl || url;
  } catch (err) {
    console.warn(`[tack] enforceOutputAspect[${index}]: correction failed:`, err.message);
    return url;
  }
}

async function enforceOutputAspects(urls, aspectRatio, ownerId) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  return Promise.all(urls.map((url, index) => enforceOutputAspect(url, aspectRatio, index, ownerId)));
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

function normalizeMediumType(value) {
  const normalized = cleanString(value, DEFAULT_STYLE_SCHEMA.medium_type).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const aliases = {
    photo: 'photograph',
    photography: 'photograph',
    photographic: 'photograph',
    illustration: 'illustration',
    illustrated: 'illustration',
    vector: 'illustration',
    painting: 'painting',
    painted: 'painting',
    graphic: 'graphic_design',
    graphic_art: 'graphic_design',
    graphic_design: 'graphic_design',
    design: 'graphic_design',
    render: '3d_render',
    '3d': '3d_render',
    cgi: '3d_render',
    collage: 'collage',
    mixed: 'mixed_media',
    mixed_media: 'mixed_media',
  };
  const medium = aliases[normalized] || normalized;
  const allowed = new Set(['photograph', 'illustration', 'painting', 'graphic_design', '3d_render', 'collage', 'mixed_media']);
  return allowed.has(medium) ? medium : DEFAULT_STYLE_SCHEMA.medium_type;
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
    medium_type: normalizeMediumType(parsed.medium_type),
    medium_subgenre: cleanString(parsed.medium_subgenre, parsed.style_subgenre || DEFAULT_STYLE_SCHEMA.medium_subgenre),
    style_family: cleanString(parsed.style_family, DEFAULT_STYLE_SCHEMA.style_family),
    rendering_medium: cleanString(parsed.rendering_medium, DEFAULT_STYLE_SCHEMA.rendering_medium),
    production_style: cleanString(parsed.production_style, DEFAULT_STYLE_SCHEMA.production_style),
    palette: cleanString(parsed.palette, DEFAULT_STYLE_SCHEMA.palette),
    lighting: cleanString(parsed.lighting, DEFAULT_STYLE_SCHEMA.lighting),
    camera_viewpoint: cleanString(parsed.camera_viewpoint, DEFAULT_STYLE_SCHEMA.camera_viewpoint),
    texture_materials: cleanString(parsed.texture_materials, DEFAULT_STYLE_SCHEMA.texture_materials),
    composition: cleanString(parsed.composition, DEFAULT_STYLE_SCHEMA.composition),
    shape_language: cleanString(parsed.shape_language, DEFAULT_STYLE_SCHEMA.shape_language),
    mood: cleanString(parsed.mood, DEFAULT_STYLE_SCHEMA.mood),
    subject_translation: cleanString(parsed.subject_translation, DEFAULT_STYLE_SCHEMA.subject_translation),
    generic_drift_risks: cleanList(parsed.generic_drift_risks, 6),
    positive_style_contract: cleanString(parsed.positive_style_contract, DEFAULT_STYLE_SCHEMA.positive_style_contract),
    must_preserve: cleanList(parsed.must_preserve, 5),
    avoid: cleanList(parsed.avoid, 5),
    reference_subjects: cleanList(parsed.reference_subjects, 8),
    subject_leak_risks: cleanList(parsed.subject_leak_risks, 8),
    style_prompt: cleanString(parsed.style_prompt, DEFAULT_STYLE_SCHEMA.style_prompt),
  };

  if (normalized.must_preserve.length === 0) {
    normalized.must_preserve = [...DEFAULT_STYLE_SCHEMA.must_preserve];
  }
  if (normalized.generic_drift_risks.length === 0) {
    normalized.generic_drift_risks = [...DEFAULT_STYLE_SCHEMA.generic_drift_risks];
  }
  if (!normalized.style_prompt) {
    normalized.style_prompt = DEFAULT_STYLE_SCHEMA.style_prompt;
  }
  return normalized;
}

function parseStyleSchema(rawText, referenceCount) {
  const jsonPayload = extractJsonObject(rawText);
  if (!jsonPayload) throw new Error('Style analysis did not return JSON');
  try {
    return normalizeStyleSchema(JSON.parse(jsonPayload), referenceCount);
  } catch (err) {
    throw new Error(`Style analysis JSON could not be parsed: ${err.message}`);
  }
}

function countSpecificStyleFields(styleSchema = {}) {
  return [
    styleSchema.medium_subgenre,
    styleSchema.style_family,
    styleSchema.rendering_medium,
    styleSchema.production_style,
    styleSchema.palette,
    styleSchema.lighting,
    styleSchema.camera_viewpoint,
    styleSchema.texture_materials,
    styleSchema.composition,
    styleSchema.shape_language,
    styleSchema.mood,
    styleSchema.positive_style_contract,
    styleSchema.style_prompt,
  ].filter(value => {
    const text = String(value || '').toLowerCase();
    return text && !text.includes('selected reference') && !text.includes('same visible') && !text.includes('reference-matched');
  }).length;
}

function assertUsableStyleSchema(styleSchema = {}) {
  if (!styleSchema || typeof styleSchema !== 'object') {
    throw new Error('Style analysis returned an empty style contract');
  }
  if (countSpecificStyleFields(styleSchema) < MIN_STYLE_CONTRACT_FIELDS) {
    throw new Error('Style analysis was too generic to generate reliably');
  }
  if (!styleSchema.positive_style_contract || styleSchema.positive_style_contract === DEFAULT_STYLE_SCHEMA.positive_style_contract) {
    throw new Error('Style analysis did not produce a specific positive style contract');
  }
}

function buildReferenceFirstFallbackStyleSchema(referenceCount) {
  return {
    ...DEFAULT_STYLE_SCHEMA,
    consistency_score: referenceCount > 1 ? 0.68 : 0.82,
    medium_subgenre: 'direct reference image style',
    style_family: 'style visible in the selected reference images',
    rendering_medium: 'same visible medium as the selected references',
    production_style: 'same visible art direction and production style as the references',
    palette: 'palette sampled from the selected references',
    lighting: 'lighting design visible in the selected references',
    camera_viewpoint: 'viewpoint, crop, and perspective visible in the selected references',
    texture_materials: 'texture, grain, material, and surface treatment visible in the selected references',
    composition: 'composition logic visible in the selected references',
    shape_language: 'shape language visible in the selected references',
    mood: 'mood visible in the selected references',
    subject_translation: 'replace reference subject matter with the requested subject while matching the selected references as closely as possible',
    positive_style_contract: 'Use the provided reference images as the authoritative style source. Create the requested subject in the same visible medium, palette, lighting, texture, composition, crop, shape language, mood, and production style shown in those references.',
    must_preserve: ['visible reference style', 'reference palette and lighting', 'reference composition logic'],
    style_prompt: 'Direct reference-conditioned style transfer from the selected images. Match the visible medium, palette, lighting, texture, composition, crop, shape language, mood, and production style of the references while replacing their subject matter with the requested subject.',
  };
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

function isPhotographicStyle(styleSchema = {}) {
  if (styleSchema.medium_type === 'photograph') return true;
  const styleText = [
    styleSchema.medium_subgenre,
    styleSchema.style_family,
    styleSchema.rendering_medium,
    styleSchema.production_style,
    styleSchema.camera_viewpoint,
    styleSchema.style_prompt,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(photo|photograph|photography|photographic|camera|lens|film|flash|studio|editorial|product campaign|still life|lifestyle|documentary|snapshot|digicam)\b/.test(styleText)
    && !isNonPhotographicStyle(styleSchema);
}

function isNonPhotographicStyle(styleSchema = {}) {
  if (['illustration', 'painting', 'graphic_design', 'collage', 'mixed_media'].includes(styleSchema.medium_type)) return true;
  if (styleSchema.medium_type === '3d_render') return false;
  const styleText = [
    styleSchema.medium_subgenre,
    styleSchema.style_family,
    styleSchema.rendering_medium,
    styleSchema.production_style,
    styleSchema.texture_materials,
    styleSchema.composition,
    styleSchema.shape_language,
    styleSchema.mood,
    styleSchema.style_prompt,
    ...(styleSchema.must_preserve || []),
  ].filter(Boolean).join(' ').toLowerCase();

  const artTerms = /\b(painting|painted|oil paint|oil painting|acrylic|watercolor|gouache|brushwork|canvas|illustration|illustrated|drawing|sketch|charcoal|pastel|collage|mixed media|printmaking|screenprint|linocut|woodcut|ink|anime|manga|cartoon|comic|airbrush|airbrushed|dither|dithered|stipple|stippled|risograph|riso|posterized|flat vector|gradient mesh|grain|grainy|fine grain|micro[-\s]?grain|noise texture|textured gradient|speckle|speckled|halftone|sculptural)\b/;
  const photoTerms = /\b(photo|photograph|photography|photographic|camera|film photo|35mm|flash photograph|snapshot|documentary photo|street photography|editorial photography|product photography)\b/;
  const negativePhotoTerms = /\b(non[-\s]?photographic|not photorealistic|not photographic|avoid photorealism|avoid photographic|avoid photo|no photo|no photorealism|not a camera photo)\b/;
  return artTerms.test(styleText) && (!photoTerms.test(styleText) || negativePhotoTerms.test(styleText));
}

function isThreeDStyle(styleSchema = {}) {
  if (styleSchema.medium_type === '3d_render') return true;
  const styleText = [
    styleSchema.medium_subgenre,
    styleSchema.rendering_medium,
    styleSchema.production_style,
    styleSchema.style_prompt,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(3d render|cgi|octane|blender|cinema 4d|c4d|physically based|pbr|clay render|toy render|isometric render)\b/.test(styleText);
}

function isMicroGrainStyle(styleSchema = {}) {
  const styleText = [
    styleSchema.style_family,
    styleSchema.rendering_medium,
    styleSchema.texture_materials,
    styleSchema.composition,
    styleSchema.shape_language,
    styleSchema.mood,
    styleSchema.style_prompt,
    ...(styleSchema.must_preserve || []),
  ].filter(Boolean).join(' ').toLowerCase();

  return /\b(micro[-\s]?grain|fine grain|grainy|noise texture|grain texture|dither|dithered|stipple|stippled|speckle|speckled|halftone|airbrush|airbrushed|soft grain|texture overlay|paper tooth|posterized gradient)\b/.test(styleText);
}

function getStyleMatchMode(styleSchema = {}, { styleDriven = false, nonPhotographic = false } = {}) {
  const score = Number(styleSchema.consistency_score) || 0;
  if (nonPhotographic || styleDriven) {
    return score < 0.62 ? 'strict_cohesive_style_lock' : 'strict_style_lock';
  }
  return score < 0.62 ? 'cohesive_style_lock' : 'balanced_style_transfer';
}

function buildStyleAnalysisPrompt(referenceCount, subject, { repair = false } = {}) {
  const humanRequest = isHumanSubjectRequest(subject);
  return `Analyze these ${referenceCount} reference images and return a single JSON object describing their shared style DNA.

Goal:
- The output will be used to generate this new subject: "${subject.trim()}".
- The new subject must belong to the same visual family as the strongest compatible references.
- Focus on aesthetic fidelity, art direction, exact medium, subgenre, lighting, palette, texture, composition, camera/viewpoint, and mood.
- Do NOT focus on copying the subject matter.

Instructions:
- ${repair
    ? 'This is a retry because the prior style analysis was too generic. Be more concrete. Name the exact medium/subgenre and visible art-direction traits from the images. Do not use generic placeholders like "selected reference style", "same visible style", "high quality", "professional photography", or "polished image".'
    : 'Be specific enough that a generator could recreate the board\'s visual direction without seeing the images.'}
- Treat the references as a candidate style board, not all equally useful.
- Identify which image best anchors the desired style for the requested subject.
- Mark references as outliers when they conflict with the requested subject, have a different medium, are close body fragments, private/intimate scenes, or would pull the generation toward wrong content.
- ${humanRequest
    ? 'Because this is a human-subject request, treat reference people as style examples only. Do not preserve their identity, face, age, hairstyle, outfit, pose, or body type as required content.'
    : 'Because this is not a human-subject request, preserve useful visual style signals from product renders, illustration, typography, layout, collage, material, lighting, color, photography, and graphic-design references when they support the requested subject.'}
- When the board is mixed, prefer cohesive style signals that support the requested medium over unusual subjects or one-off compositions.
- Preserve the broad family resemblance across the compatible references, not just one dominant trait.
- Treat rendering modality as mandatory style DNA. Classify medium_type as exactly one of: photograph, illustration, painting, graphic_design, 3d_render, collage, mixed_media.
- Identify the most specific medium_subgenre you can see. For photographs, examples include editorial tabletop still life, product campaign photography, flash-lit digicam snapshot, analog documentary, luxury studio product, food editorial, architectural interior, fashion editorial, lifestyle photography, e-commerce product photo. For illustration, examples include micro-grain airbrush illustration, risograph poster, flat vector editorial, painterly gouache, ink comic, watercolor children's book, anime cel, 3D clay-like illustration, paper-cut collage.
- If medium_type is photograph, the output should remain a photograph and must preserve the photographic subgenre, art direction, camera viewpoint, lighting design, color strategy, prop styling, crop, depth of field, lens feel, grain/noise, and post-processing. Do not collapse it into generic professional photography.
- If medium_type is illustration, painting, graphic_design, collage, mixed_media, or 3d_render, the output should remain that same medium family and subgenre. The requested subject must be translated into that medium, not placed as a realistic object on a styled background.
- Treat surface texture as a first-class style signal. If the references use visible fine grain, micro-grain, stippling, dithering, airbrushed noise, posterized gradients, paper tooth, or speckled color transitions, explicitly name that texture and whether it appears globally, only in shadows, only in gradients, or on subject edges.
- In generic_drift_risks, name the bland defaults this board could accidentally become, such as generic stock photo, neutral studio product photo, rustic lifestyle photography, glossy 3D mockup, generic vector art, or generic anime, depending on the references.
- positive_style_contract must be written as a compact, affirmative generation instruction. Put the exact medium and subgenre first, then the most important visual traits. Avoid vague terms like "high quality" unless the references are actually generic.

Return ONLY valid JSON with this exact shape:
{
  "best_image_index": 0,
  "consistency_score": 0.0,
  "outlier_indices": [],
  "medium_type": "photograph",
  "medium_subgenre": "",
  "style_family": "",
  "rendering_medium": "",
  "production_style": "",
  "palette": "",
  "lighting": "",
  "camera_viewpoint": "",
  "texture_materials": "",
  "composition": "",
  "shape_language": "",
  "mood": "",
  "subject_translation": "",
  "generic_drift_risks": ["", ""],
  "positive_style_contract": "",
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
- medium_type: one of photograph, illustration, painting, graphic_design, 3d_render, collage, mixed_media
- medium_subgenre: 2-8 words naming the specific subgenre or production mode, never just "photo" or "illustration" when more detail is visible
- production_style: campaign/editorial/design production category, including prop styling and art direction when visible
- camera_viewpoint: for photographs, include angle, crop, lens feel, depth of field, and perspective; for non-photo media, describe viewpoint/framing
- subject_translation: one sentence explaining how a new subject should inherit this medium and subgenre while replacing reference subject matter
- generic_drift_risks: 2-6 concise labels for generic styles this should not degrade into
- positive_style_contract: 35-70 words, affirmative and specific, starting with the exact medium_type and medium_subgenre, suitable to paste near the top of an image generation prompt
- must_preserve: 2-5 concise style traits that must survive generation
- avoid: 0-5 drift risks or wrong directions
- reference_subjects: 2-8 concise nouns for the main depicted subjects, objects, characters, or motifs recurring in the references
- subject_leak_risks: 0-8 specific reference subjects or motifs that must NOT leak into a new generation unless explicitly requested
- style_prompt: 90-140 words, dense and specific, describing the shared style for image generation. For non-photographic illustration, drawing, airbrush, grain-textured digital art, vector art, or painting styles, name the exact medium character: whether lines are rough or clean, thick or thin, scratchy or geometric; whether fills are flat, gradient, posterized, speckled, dithered, or textured; whether edges are hard, feathered, hazy, or loose; whether the hand of the artist is visible or the work looks digitally finished and smooth. Capture any micro-grain, noise texture, paper texture, ink bleed, stippling, dithering, airbrush haze, or brushstroke quality that distinguishes the style

Be concrete, visually specific, and faithful to the compatible shared aesthetic. Output JSON only.`;
}

async function requestStyleAnalysis(validReferences, subject, { repair = false } = {}) {
  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model:      ANTHROPIC_STYLE_MODEL,
      max_tokens: 1800,
      temperature: repair ? 0.15 : 0.3,
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
            text: buildStyleAnalysisPrompt(validReferences.length, subject, { repair }),
          },
        ],
      }],
    }),
  });

  if (!claudeResp.ok) {
    throw new Error(`Claude returned ${claudeResp.status}`);
  }
  return extractClaudeText(await claudeResp.json());
}

async function analyzeStyleSchema(validReferences, subject) {
  let rawResponse = '';
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      rawResponse = await requestStyleAnalysis(validReferences, subject, { repair: attempt > 0 });
      const styleSchema = parseStyleSchema(rawResponse, validReferences.length);
      assertUsableStyleSchema(styleSchema);
      if (attempt > 0) console.log('[tack] style analysis repair succeeded');
      return { styleSchema, rawResponse };
    } catch (err) {
      lastError = err;
      console.warn(`[tack] Claude style analysis attempt ${attempt + 1} failed:`, err.message);
      if (/Claude returned/.test(err.message)) break;
    }
  }

  lastError.rawStyleAnalysis = rawResponse;
  throw lastError;
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
  const baseLimit = isStyleDrivenRequest(subject) ? MAX_GRAPHIC_CONDITIONING_IMAGES : MAX_CONDITIONING_IMAGES;
  const score = Number(styleSchema.consistency_score) || 0;
  const limit = score < 0.62 ? Math.min(baseLimit, 3) : baseLimit;
  return compatible.slice(0, limit);
}

function buildConditioningInput(ref) {
  if (!ref?.base64 || !ref?.mediaType?.startsWith('image/')) return ref?.url || '';
  return `data:${ref.mediaType};base64,${ref.base64}`;
}

function getMediumContract(styleSchema = {}, { nonPhotographic = false } = {}) {
  if (isPhotographicStyle(styleSchema)) {
    return `Produce a photograph in the same photographic subgenre: ${styleSchema.medium_subgenre}. Preserve the reference camera viewpoint, lens feel, crop, depth of field, lighting design, color grade, set/prop styling, surface texture, and post-processing. The result should read as another image from the same shoot or campaign, with the requested subject replacing the reference subject matter.`;
  }
  if (isThreeDStyle(styleSchema)) {
    return `Produce a 3D/CGI image in the same render subgenre: ${styleSchema.medium_subgenre}. Preserve the reference material model, lighting rig, camera angle, simplified or realistic geometry, surface finish, color behavior, and render polish. The requested subject should be modeled in that same render language.`;
  }
  if (nonPhotographic) {
    return `Produce ${styleSchema.medium_type} in the same subgenre: ${styleSchema.medium_subgenre}. Translate the requested subject into the reference medium using the same mark-making, line quality, edge treatment, fill behavior, texture, color system, composition, and finish. The whole image, including the subject itself, belongs to that medium.`;
  }
  return `Produce a new image in the same medium and subgenre: ${styleSchema.medium_subgenre}. Preserve the reference art direction, palette, lighting, texture, composition, shape language, and finish.`;
}

function buildStructuredPromptPayload(subject, styleSchema, options = {}) {
  const nonPhotographic = Boolean(options.nonPhotographic);
  const styleMatchMode = options.styleMatchMode || 'balanced_style_transfer';
  const strict = styleMatchMode.includes('strict');
  const payload = {
    task: 'Generate one complete, single-scene image from the requested subject while transferring only the visual style of the selected reference images.',
    subject: {
      prompt: subject.trim(),
      priority: 'The requested subject is the hero subject and replaces the reference image subject matter.',
      fidelity: 'Honor all concrete subject details including quantity, object type, color, action, setting, and aspect ratio.',
    },
    style_contract: {
      lock_strength: strict ? 'strict' : 'balanced',
      medium_type: styleSchema.medium_type,
      medium_subgenre: styleSchema.medium_subgenre,
      positive_contract: styleSchema.positive_style_contract,
      medium_rule: getMediumContract(styleSchema, { nonPhotographic }),
      style_family: styleSchema.style_family,
      rendering_medium: styleSchema.rendering_medium,
      production_style: styleSchema.production_style,
      palette: styleSchema.palette,
      lighting: styleSchema.lighting,
      camera_or_viewpoint: styleSchema.camera_viewpoint,
      texture_and_materials: styleSchema.texture_materials,
      composition: styleSchema.composition,
      shape_language: styleSchema.shape_language,
      mood: styleSchema.mood,
      subject_translation: styleSchema.subject_translation,
      must_preserve: styleSchema.must_preserve,
    },
    reference_handling: {
      use_references_for: 'medium, subgenre, art direction, palette, lighting, texture, composition, camera/viewpoint, and mood',
      replace_reference_subjects_with_requested_subject: true,
      output_format: 'One continuous image on one canvas. Compose a single finished scene, not a grid, diptych, triptych, before-and-after layout, contact sheet, moodboard, collage, screenshot, or reference comparison.',
      reference_subjects_seen: styleSchema.reference_subjects,
      subject_leak_risks: styleSchema.subject_leak_risks,
    },
    quality_controls: {
      result_standard: strict
        ? 'The result should be immediately recognizable as belonging to the same specific visual subgenre as the strongest compatible references.'
        : 'The result should preserve the reference visual family while allowing natural variation.',
      specificity_floor: 'Use the named medium_subgenre and concrete art-direction traits as the style floor. A broad label like professional photo, illustration, render, or high quality is insufficient by itself.',
      single_scene_standard: 'The whole output is one cohesive final image with one main hero subject and one coherent environment or designed set.',
      artifact_control: 'Keep anatomy, object count, object placement, hands, faces, edges, and perspective coherent. Include text or logos only when the user explicitly asks for them.',
    },
    style_synthesis: styleSchema.style_prompt,
  };

  if (isMicroGrainStyle(styleSchema)) {
    payload.style_contract.texture_requirement = 'Visible fine grain, speckling, stippling, dithering, or airbrushed noise carries across the subject and background, especially in gradients, shadows, color transitions, and softened edges.';
  }
  if (options.variation) {
    payload.variation = 'Create a second campaign-matched variation with different framing, silhouette, crop, and object placement while keeping the same medium, subgenre, palette, lighting, texture, and production style.';
  }
  return payload;
}

function buildGenerationPrompt(subject, styleSchema, options = {}) {
  const nonPhotographic = Boolean(options.nonPhotographic);
  const lines = [
    `Create ${subject.trim()} as one cohesive finished image on a single canvas.`,
    `Use the provided reference images as the authoritative style source: ${styleSchema.positive_style_contract}`,
    `Match this medium/subgenre as closely as the references show it: ${styleSchema.medium_type} / ${styleSchema.medium_subgenre}.`,
    `Preserve the reference art direction: ${styleSchema.production_style}.`,
    `Preserve palette: ${styleSchema.palette}.`,
    `Preserve lighting: ${styleSchema.lighting}.`,
    `Preserve camera/viewpoint/crop: ${styleSchema.camera_viewpoint}.`,
    `Preserve texture/material treatment: ${styleSchema.texture_materials}.`,
    `Preserve composition logic and shape language: ${styleSchema.composition}; ${styleSchema.shape_language}.`,
    `Preserve mood: ${styleSchema.mood}.`,
    `Translate only the style. Replace reference subject matter with the requested subject: ${subject.trim()}.`,
    'Do not create a grid, diptych, triptych, contact sheet, moodboard, screenshot, comparison image, or copied reference layout.',
  ];

  if (styleSchema.must_preserve.length) {
    lines.push(`Must preserve: ${styleSchema.must_preserve.join(', ')}.`);
  }
  if (nonPhotographic) {
    lines.push('The requested subject itself must be rendered in the same non-photographic medium as the references, not as a realistic object placed on a styled background.');
  } else if (isPhotographicStyle(styleSchema)) {
    lines.push('The result should read as a real photograph from the same shoot or campaign style as the references.');
  }
  if (isMicroGrainStyle(styleSchema)) {
    lines.push('Carry the visible grain, speckling, stippling, dithering, or airbrushed noise across both the subject and background.');
  }
  if (options.variation) {
    lines.push('Vary the framing and object placement while preserving the same reference style.');
  }
  lines.push(`Reference style synthesis: ${styleSchema.style_prompt}`);
  return lines.join(' ');
}

function buildVariationPrompt(subject, styleSchema, options = {}) {
  return buildGenerationPrompt(subject, styleSchema, { ...options, variation: true });
}

// ── FLUX 2 Pro ────────────────────────────────────────────────────────────────
// Accepts reference image URLs alongside the text prompt for conditioning.
// Combined with Claude's rich paragraph-style description this produced the
// best style-accurate results in testing.

async function startFluxPrediction(prompt, imageUrls = [], { retries = 3, backoffMs = 12000, aspectRatio = DEFAULT_ASPECT_RATIO } = {}) {
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  const dims = OUTPUT_DIMENSIONS[normalizedRatio] || OUTPUT_DIMENSIONS[DEFAULT_ASPECT_RATIO];
  for (let attempt = 0; attempt <= retries; attempt++) {
    const input = {
      prompt,
      aspect_ratio:     normalizedRatio,
      width:            dims.width,
      height:           dims.height,
      output_format:    'png',
      output_quality:   95,
      safety_tolerance: 5,
    };
    if (imageUrls.length > 0) input.input_images = imageUrls.slice(0, MAX_FLUX_INPUT_IMAGES);

    console.log(`[tack] startFluxPrediction: model=${REPLICATE_FLUX_MODEL} aspect_ratio=${normalizedRatio} width=${dims.width} height=${dims.height} input_images=${input.input_images?.length || 0}`);

    const resp = await fetch(
      `https://api.replicate.com/v1/models/${REPLICATE_FLUX_MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ input }),
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

async function runPredictionPair(prompt1, prompt2, conditioningInputs, requestedOutputCount, aspectRatio = DEFAULT_ASPECT_RATIO) {
  const id1 = await startFluxPrediction(prompt1, conditioningInputs, { aspectRatio });
  let id2 = null;
  if (requestedOutputCount > 1) {
    await sleep(3000);
    id2 = await startFluxPrediction(prompt2, conditioningInputs, { aspectRatio });
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
  const aspectRatio = normalizeAspectRatio(req.body?.aspectRatio || req.body?.aspect_ratio);
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
    let styleSchema, rawResponse, styleAnalysisMode = 'claude_style_contract';
    try {
      ({ styleSchema, rawResponse } = await analyzeStyleSchema(validReferences, subject));
    } catch (err) {
      console.warn('[tack] using direct reference fallback style contract:', err.message);
      styleSchema = buildReferenceFirstFallbackStyleSchema(validReferences.length);
      rawResponse = err.rawStyleAnalysis || '';
      styleAnalysisMode = 'direct_reference_fallback';
    }
    const conditioningReferences = buildConditioningReferences(validReferences, styleSchema, subject);
    const nonPhotographic = isNonPhotographicStyle(styleSchema);
    const requiresNativeAspectCanvas = aspectRatio !== '1:1';
    // Non-photographic styles (paintings, illustrations) carry no face/identity leakage risk,
    // so condition at any aspect ratio. Photo-based human references keep the 1:1 restriction.
    const shouldUseImageConditioning = (
      !isHumanSubjectRequest(subject)
      || isStyleDrivenRequest(subject)
      || nonPhotographic
    ) && (!requiresNativeAspectCanvas || nonPhotographic);
    const conditioningInputs = shouldUseImageConditioning ? conditioningReferences.map(buildConditioningInput).filter(Boolean) : [];

    // ── Step 3: Build prompts ─────────────────────────────────────────────
    const styleDriven = isStyleDrivenRequest(subject) || nonPhotographic;
    const styleMatchMode = getStyleMatchMode(styleSchema, { styleDriven, nonPhotographic });
    const promptOptions = { styleDriven, nonPhotographic, styleMatchMode };
    const prompt1 = `${buildGenerationPrompt(subject, styleSchema, promptOptions)} ${getAspectRatioPromptInstruction(aspectRatio)}`;
    const prompt2 = `${buildVariationPrompt(subject, styleSchema, promptOptions)} ${getAspectRatioPromptInstruction(aspectRatio)}`;

    console.log('[tack] prompt1:', prompt1.slice(0, 120) + '...');

    // ── Step 4: Launch both predictions with a stagger ────────────────────
    // Human-subject prompts use text-only style transfer to prevent identity,
    // face, age, clothing, and pose leakage from reference photos.
    let id1, id2;
    try {
      id1 = await startFluxPrediction(prompt1, conditioningInputs, { aspectRatio });
      if (requestedOutputCount > 1) {
        await sleep(3000);
        id2 = await startFluxPrediction(prompt2, conditioningInputs, { aspectRatio });
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
      const fallbackId = await startFluxPrediction(prompt1, conditioningInputs.slice(0, 1), { aspectRatio, retries: 1 });
      const fallbackResult = await waitForResult(fallbackId);
      images = [Array.isArray(fallbackResult) ? fallbackResult[0] : fallbackResult].filter(Boolean);
      usedFallbackConditioning = images.length > 0;
    }

    if (images.length === 0) {
      throw new Error(requestedOutputCount > 1 ? 'Both generations failed. Please try again.' : 'Generation failed. Please try again.');
    }

    images = await enforceOutputAspects(images, aspectRatio, user?.id || req.body?.anonymousId || 'anonymous');

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
      aspectRatio,
      outputDimensions: getOutputDimensions(aspectRatio),
      styleDescriptors: styleSchema.style_prompt,
      styleSchema,
      conditioningMeta: {
        selected_count: selectedUrls.length,
        valid_count: validReferences.length,
        used_count: usedFallbackConditioning ? 1 : conditioningInputs.length,
        mode: usedFallbackConditioning ? 'image_conditioned_fallback' : (shouldUseImageConditioning ? 'image_conditioned' : 'style_text_only'),
        style_match_mode: styleMatchMode,
        style_analysis_mode: styleAnalysisMode,
        medium_type: styleSchema.medium_type,
        medium_subgenre: styleSchema.medium_subgenre,
        conditioning_reference_indices: conditioningReferences.map(ref => ref.index).filter(Number.isInteger),
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
