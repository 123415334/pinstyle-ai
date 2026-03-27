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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageUrls, subject } = req.body;
  if (!subject) return res.status(400).json({ error: "Missing subject" });
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return res.status(400).json({ error: "Missing imageUrls" });

  try {
    const downloaded = await Promise.all(imageUrls.slice(0, 2).map(fetchImageAsBase64));
    const validImages = downloaded.filter(Boolean);
    console.log("[analyze] Got " + validImages.length + " images for Claude Vision");

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
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: "You are an expert art director and image generation prompt engineer. Your job is to deeply analyze reference images, identify the single most distinctive visual element that defines their style, and write a prompt that leads with that element so an AI image generator reproduces the exact same style for any new subject.",
          messages: [{ role: "user", content: [
            ...validImages.map(img => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } })),
            { type: "text", text: `You are analyzing reference images to extract a style, then reconciling that style with the user's subject description.

USER'S SUBJECT: "${subject}"

STEP 1 — Identify the DOMINANT STYLE ELEMENT from the reference images. Choose ONE:
- TEXTURE/SURFACE PATTERN (e.g. topographic lines, marbling, weaving, engraving, dots)
- RENDERING TECHNIQUE (e.g. hand-drawn illustration, 3D render, collage, painting)
- COLOR & LIGHT (e.g. neon gradients, flat bold primaries, moody shadows)
- FORM & SHAPE LANGUAGE (e.g. inflated organic blobs, geometric precision, fluid curves)
- ARTISTIC MOVEMENT (e.g. Y2K, folk art, brutalism, surrealism)

STEP 2 — Check the user's subject description for any OVERRIDE PROPERTIES: specific textures, patterns, colors, or materials they explicitly named (e.g. "dot grid", "marble", "red", "wooden"). These override the equivalent style element from the references while ALL OTHER style properties are inherited unchanged.

STEP 3 — Write the final prompt:
- Start with the dominant style element — but substitute any override properties from the user's subject
- Then describe all remaining style properties from the references: rendering technique, form language, lighting, composition, color (unless overridden), mood
- Naturally weave the user's subject into the description as the object being rendered
- Be extremely specific and concrete
- No headers, no explanation, just the prompt
- 140-180 words total` }
          ]}],
        }),
      });
      if (claudeResp.ok) {
        const d = await claudeResp.json();
        styleDescriptors = d.content?.[0]?.text?.trim() || styleDescriptors;
      }
    }

    const fullPrompt = "Subject: " + subject + ". Style: " + styleDescriptors;
    console.log("[analyze] Prompt: " + fullPrompt);

    const startPrediction = async (prompt) => {
      const resp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.REPLICATE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: { prompt, input_image: imageUrls[0], aspect_ratio: "1:1", output_format: "jpg", safety_tolerance: 2 } }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
      return data.id;
    };

    const id1 = await startPrediction(fullPrompt);
    const output1 = await waitForResult(id1);
    await new Promise(r => setTimeout(r, 12000));
    const id2 = await startPrediction(fullPrompt + ", slightly different composition");
    const output2 = await waitForResult(id2);

    const images = [
      Array.isArray(output1) ? output1[0] : output1,
      Array.isArray(output2) ? output2[0] : output2
    ].filter(Boolean);

    return res.status(200).json({ images, prompt: fullPrompt, styleDescriptors });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};