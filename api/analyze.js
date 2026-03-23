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
    return Buffer.from(await resp.arrayBuffer());
  } catch (_) { return null; }
}

async function fetchImageAsBase64(url) {
  const buf = await fetchImageBuffer(url);
  if (!buf) return null;
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

function buildMultipartBody(buffers, prompt) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];
  buffers.forEach((buf, i) => {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="ref${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
    ));
    parts.push(buf);
    parts.push(Buffer.from('\r\n'));
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
    // Step 1: Download images for both Claude Vision and gpt-image-1
    const [buffers, base64Images] = await Promise.all([
      Promise.all(imageUrls.slice(0, 4).map(fetchImageBuffer)),
      Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64)),
    ]);
    const validBuffers = buffers.filter(Boolean);
    const validBase64 = base64Images.filter(Boolean);

    if (validBuffers.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    // Step 2: Claude Vision analyzes the style of the reference images
    const claudeContent = [
      {
        type: "text",
        text: `Analyze the visual style of these reference images. Extract the specific illustration/design style so it can be applied to a new subject. Return ONLY a comma-separated list of style descriptors (no explanation, no JSON) — things like "flat design, grainy texture, bold color blocking, minimal shading, geometric shapes, dark background, duotone colors" etc. Be specific to what you actually see.`
      },
      ...validBase64.map(img => ({
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

    let styleDescriptors = "illustrated style, flat design, bold colors";
    if (claudeResp.ok) {
      const claudeData = await claudeResp.json();
      styleDescriptors = claudeData.content?.[0]?.text?.trim() || styleDescriptors;
    }
    console.log(`[analyze] Style descriptors: ${styleDescriptors}`);

    // Step 3: Build full prompt = subject + auto style from references
    const fullPrompt = `${subject}, ${styleDescriptors}. Match the exact visual style of the reference images.`;
    console.log(`[analyze] Full prompt: ${fullPrompt}`);

    // Step 4: Generate with gpt-image-1 using actual images as reference
    const generateImage = async (prompt) => {
      const { body, boundary } = buildMultipartBody(validBuffers, prompt);
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

    const image1 = await generateImage(fullPrompt);
    const image2 = await generateImage(`${fullPrompt} Slightly different composition.`);

    return res.status(200).json({
      images: [image1, image2].filter(Boolean),
      prompt: fullPrompt,
      styleDescriptors,
    });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
