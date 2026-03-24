async function fetchImageBuffer(url) {
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
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 800000) return null;
    return { buffer: Buffer.from(buf), mediaType: (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim() };
  } catch (_) { return null; }
}

function buildMultipart(buffers, prompt) {
  const boundary = "----PSBoundary" + Math.random().toString(36).slice(2);
  const parts = [];
  buffers.forEach((img, i) => {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="ref${i}.jpg"\r\nContent-Type: ${img.mediaType}\r\n\r\n`
    ));
    parts.push(img.buffer);
    parts.push(Buffer.from("\r\n"));
  });
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="n"\r\n\r\n1\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nhigh\r\n` +
    `--${boundary}--\r\n`
  ));
  return { body: Buffer.concat(parts), boundary };
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
    const downloaded = await Promise.all(imageUrls.slice(0, 2).map(fetchImageBuffer));
    const validImages = downloaded.filter(Boolean);
    if (validImages.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    // Step 1: Claude Vision analyzes ALL references and writes a DALL-E optimized style prompt
    const claudeContent = [
      {
        type: "text",
        text: `You are an expert AI image prompt engineer. Analyze these ${validImages.length} reference images carefully.

Your job: write a single DALL-E image generation prompt that will produce an image of "${subject}" in the EXACT visual style of these references.

Study the references for:
- Rendering style (photo, illustration, 3D render, flat design, etc)
- Lighting (studio, natural, dramatic, flat, moody, etc)
- Color palette and grading (saturated, muted, warm, cool, specific hues)
- Texture and finish (glossy, matte, grainy, smooth, etc)
- Composition style (centered, diagonal, floating, etc)
- Background treatment (solid color, gradient, contextual, etc)
- Overall mood and aesthetic

Write ONE complete prompt (100-150 words) for: "${subject}"

The prompt must:
1. Start with the subject: "${subject}"
2. Include specific visual style details from the references
3. Mention lighting, color, texture, composition
4. End with the rendering quality (e.g. "professional photography" or "digital illustration")

Return ONLY the prompt text. No explanation, no preamble.`
      },
      ...validImages.slice(0, 3).map(img => ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.buffer.toString("base64") }
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
        max_tokens: 400,
        messages: [{ role: "user", content: claudeContent }],
      }),
    });

    let imagePrompt = subject;
    if (claudeResp.ok) {
      const claudeData = await claudeResp.json();
      imagePrompt = claudeData.content?.[0]?.text?.trim() || subject;
    }
    console.log("[analyze] Image prompt:", imagePrompt);

    // Step 2: Generate with gpt-image-1 /edits — real images as visual reference
    const generateImage = async (prompt) => {
      const { body, boundary } = buildMultipart(validImages, prompt);
      const resp = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || JSON.stringify(data));
      const img = data.data?.[0];
      return img?.url || (img?.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
    };

    const image1 = await generateImage(imagePrompt);
    const image2 = await generateImage(imagePrompt + " Alternative composition, same style.");

    const images = [image1, image2].filter(Boolean);
    return res.status(200).json({ images, prompt: imagePrompt });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};