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
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Bearer ${process.env.REPLICATE_API_KEY}` }
    });
    const data = await resp.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed") throw new Error(data.error || "Prediction failed");
  }
  throw new Error("Timed out waiting for image");
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
    // Download reference images
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64));
    const validImages = downloaded.filter(Boolean);
    if (validImages.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    // Step 1: Claude Vision extracts style from ALL reference images
    const claudeContent = [
      {
        type: "text",
        text: `Analyze the visual style of these reference images. Be extremely specific about what you see — describe the exact rendering technique, lighting, color treatment, texture, mood, and aesthetic. Return ONLY a comma-separated list of precise style descriptors (no explanation, no JSON). Examples: "flat vector illustration, bold color blocking, grainy texture overlay, minimal shadows, geometric shapes, cream background" or "moody film photography, desaturated warm tones, shallow depth of field, grainy 35mm, natural window light". Be specific to what you actually see.`
      },
      ...validImages.map(img => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 }
      }))
    ];

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: claudeContent }],
      }),
    });

    let styleDescriptors = "professional photography, natural lighting, high quality";
    if (claudeResp.ok) {
      const claudeData = await claudeResp.json();
      styleDescriptors = claudeData.content?.[0]?.text?.trim() || styleDescriptors;
    }
    console
cd ~/Downloads/pinstyle-ai && git add -A && git commit -m "switch to FLUX.1 Kontext for style-matched generation" && git push
cat > ~/Downloads/pinstyle-ai/api/analyze.js << 'ENDOFFILE'
async function waitForResult(predictionId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Bearer ${process.env.REPLICATE_API_KEY}` }
    });
    const data = await resp.json();
    if (data.status === "succeeded") return data.output;
    if (data.status === "failed") throw new Error(data.error || "Prediction failed");
  }
  throw new Error("Timed out waiting for image");
}

async function fetchImageAsBase64Small(url) {
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
    // Only use if under 1MB to avoid quota issues
    if (buf.byteLength > 1000000) return null;
    return { base64: Buffer.from(buf).toString("base64"), mediaType: ct };
  } catch (_) { return null; }
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
    // Step 1: Claude Vision — only download small images for analysis
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64Small));
    const validImages = downloaded.filter(Boolean);

    let styleDescriptors = "professional photography, natural lighting, high quality";

    if (validImages.length > 0) {
      const claudeContent = [
        {
          type: "text",
          text: `Analyze the visual style of these reference images. Return ONLY a comma-separated list of precise style descriptors — rendering technique, lighting, color treatment, texture, mood. No explanation. Examples: "flat vector illustration, bold color blocking, grainy texture, minimal shadows" or "moody film photography, desaturated warm tones, 35mm grain, natural light". Be specific to what you see.`
        },
        ...validImages.slice(0, 2).map(img => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.base64 }
        }))
      ];

      const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{ role: "user", content: claudeContent }],
        }),
      });

      if (claudeResp.ok) {
        const claudeData = await claudeResp.json();
        styleDescriptors = claudeData.content?.[0]?.text?.trim() || styleDescriptors;
      }
    }

    console.log(`[analyze] Style: ${styleDescriptors}`);

    // Step 2: Pass image URL directly to Kontext — no base64 needed
    const referenceImageUrl = imageUrls[0];
    const fullPrompt = `${subject}, ${styleDescriptors}`;
    console.log(`[analyze] Prompt: ${fullPrompt}`);

    const startPrediction = async (prompt) => {
      const resp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.REPLICATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: referenceImageUrl,
            aspect_ratio: "1:1",
            output_format: "webp",
            safety_tolerance: 2,
          }
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data));
      return data.id;
    };

    const id1 = await startPrediction(fullPrompt);
    const output1 = await waitForResult(id1);
    const id2 = await startPrediction(`${fullPrompt}, slightly different angle or composition`);
    const output2 = await waitForResult(id2);

    const images = [
      Array.isArray(output1) ? output1[0] : output1,
      Array.isArray(output2) ? output2[0] : output2,
    ].filter(Boolean);

    return res.status(200).json({ images, prompt: fullPrompt, styleDescriptors });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
