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
  // Atomic increment via RPC
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

// ── Image helpers ─────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const isPinterest = url.includes("pinimg.com") || url.includes("pinterest.com");
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(isPinterest ? { "Referer": "https://www.pinterest.com/" } : {}),
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = await resp.arrayBuffer();
    return { base64: Buffer.from(buf).toString("base64"), mediaType: ct };
  } catch (_) { return null; }
}

async function waitForResult(predictionId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await fetch("https://api.replicate.com/v1/predictions/" + predictionId, {
      headers: { "Authorization": "Bearer " + process.env.REPLICATE_API_KEY }
    });
    const data = await resp.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed") throw new Error(data.error || "Prediction failed");
  }
  throw new Error("Timed out");
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth check ──────────────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const rawToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // Treat missing or literal "null" token as anonymous preview mode
  const isAnon = !rawToken || rawToken === 'null';
  const token  = isAnon ? null : rawToken;

  let user = null;
  if (!isAnon) {
    user = await validateToken(token);
    if (!user) {
      return res.status(401).json({ error: 'auth_invalid', message: 'Your session has expired. Please sign in again.' });
    }
  }

  // ── Usage / trial check (skip for anonymous preview) ────────────────────────
  let profile, generationsUsed, monthlyUsed, monthlyResetAt, plan;
  if (isAnon) {
    // Anonymous preview — one free generation, no account needed
    profile          = null;
    generationsUsed  = 0;
    monthlyUsed      = 0;
    monthlyResetAt   = null;
    plan             = 'anon';
  } else {
    profile         = await getUsage(user.id);
    generationsUsed = profile?.generations_used   ?? 0;
    monthlyUsed     = profile?.monthly_generations ?? 0;
    monthlyResetAt  = profile?.monthly_reset_at   ?? null;
    plan            = profile?.plan               ?? 'free';

    // Free trial exhausted
    if (plan === 'free' && generationsUsed >= FREE_TRIAL_LIMIT) {
      return res.status(402).json({
        error:   'trial_exhausted',
        message: `You've used all ${FREE_TRIAL_LIMIT} free generations. Upgrade to Pro to keep creating.`,
        used:    generationsUsed,
        limit:   FREE_TRIAL_LIMIT,
      });
    }

    // Pro monthly limit — check if period has reset first
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
    // Unlimited plan — no checks needed
  }

  // ── Generation ──────────────────────────────────────────────────────────────
  const { imageUrls, subject } = req.body;
  if (!subject) return res.status(400).json({ error: "Missing subject" });
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return res.status(400).json({ error: "Missing imageUrls" });

  try {
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64));
    const validImages = downloaded.filter(Boolean);

    let styleDescriptors = "professional photography, natural lighting, high quality";

    if (validImages.length > 0) {
      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          system: "You are an expert art director and image generation prompt engineer. Your job is to deeply analyze reference images, identify the single most distinctive visual element that defines their style, and write a prompt that leads with that element so an AI image generator reproduces the exact same style for any new subject.",
          messages: [{ role: "user", content: [
            ...validImages.map(img => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } })),
            { type: "text", text: `Analyze these reference images and extract their shared artistic style DNA.

FIRST: If there are multiple images, identify which single image (by index, starting at 0) best represents the dominant shared style. Output this on the very first line as: BEST_IMAGE_INDEX: <number>

THEN on the next line, write the style prompt:
Analyze these reference images and extract their shared artistic style DNA.

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
- 140-180 words total` }
          ]}],
        }),
      });
      if (claudeResp.ok) {
        const d = await claudeResp.json();
        const rawText = d.content?.[0]?.text?.trim() || "";
        const indexMatch = rawText.match(/BEST_IMAGE_INDEX:\s*(\d+)/);
        if (indexMatch) {
          styleDescriptors = rawText.replace(/BEST_IMAGE_INDEX:\s*\d+\s*/, "").trim();
        } else {
          styleDescriptors = rawText || styleDescriptors;
        }
      }
    }

    const fullPrompt = "Subject: " + subject + ". Style: " + styleDescriptors;

    const startPrediction = async (prompt) => {
      const refInput = {};
      imageUrls.slice(0, 4).forEach((url, i) => {
        if (i === 0) refInput.input_image = url;
        else refInput[`input_image_${i + 1}`] = url;
      });
      const resp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.REPLICATE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: { prompt, ...refInput, aspect_ratio: "1:1", output_format: "webp", output_quality: 90, safety_tolerance: 2 } }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
      return data.id;
    };

    const id1 = await startPrediction(fullPrompt);
    const output1 = await waitForResult(id1);
    await new Promise(r => setTimeout(r, 12000));
    const id2 = await startPrediction(fullPrompt + ". Focus specifically on: " + subject + ". Different angle and composition than the first image.");
    const output2 = await waitForResult(id2);

    const images = [
      Array.isArray(output1) ? output1[0] : output1,
      Array.isArray(output2) ? output2[0] : output2,
    ].filter(Boolean);

    // ── Increment usage after successful generation (skip for anon) ─────────
    if (!isAnon) {
      await incrementUsage(user.id);
    }
    const newUsed        = generationsUsed + 1;
    const newMonthlyUsed = monthlyUsed + 1;

    return res.status(200).json({
      images,
      prompt: fullPrompt,
      styleDescriptors,
      // No usage data for anonymous previews — client tracks locally
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
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
