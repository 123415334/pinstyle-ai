async function fetchImageBase64(url) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const isPinterest = url.includes("pinimg.com") || url.includes("pinterest.com");
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...(isPinterest ? { "Referer": "https://www.pinterest.com/" } : {}),
      },
    });
    if (!resp.ok) return null;
    const ct = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const buf = await resp.arrayBuffer();
    return { b64: Buffer.from(buf).toString("base64"), mediaType: ct, size: buf.byteLength };
  } catch (_) { return null; }
}

function buildMultipart(imageBuffers, prompt) {
  const boundary = "PSBound" + Date.now();
  const parts = [];
  imageBuffers.forEach((img, i) => {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="ref${i}.jpg"\r\nContent-Type: ${img.mediaType}\r\n\r\n`
    ));
    parts.push(Buffer.from(img.b64, "base64"));
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
    // Fetch images server-side — no client size limit
    const fetched = await Promise.all(imageUrls.slice(0, 3).map(fetchImageBase64));
    const valid = fetched.filter(Boolean);
    console.log(`[analyze] Fetched ${valid.length} images, sizes: ${valid.map(i => Math.round(i.size/1024) + "kb").join(", ")}`);

    if (valid.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    // Step 1: Claude Vision writes a full DALL-E optimized prompt
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
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert AI image prompt engineer. Analyze these reference images and write a single DALL-E generation prompt for: "${subject}"

The prompt must make the output look like it belongs in the same visual collection as these references. Study the rendering style, lighting, colors, texture, composition, and mood.

Write ONE prompt of 80-120 words starting with "${subject}". Be specific about visual style. End with the medium (e.g. "digital illustration" or "studio photography"). Return ONLY the prompt, nothing else.`
            },
            ...valid.slice(0, 2).map(img => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType, data: img.b64 }
            }))
          ]
        }],
      }),
    });

    let imagePrompt = subject;
    if (claudeResp.ok) {
      const d = await claudeResp.json();
      imagePrompt = d.content?.[0]?.text?.trim() || subject;
    }
    console.log("[analyze] Prompt:", imagePrompt.slice(0, 100));

    // Step 2: Use only the 2 smallest images for gpt-image-1 to stay under limits
    const sorted = [...valid].sort((a, b) => a.size - b.size);
    const forEdit = sorted.slice(0, 2);
    console.log(`[analyze] Sending ${forEdit.length} images to gpt-image-1, total: ${Math.round(forEdit.reduce((s,i) => s+i.size, 0)/1024)}kb`);

    const generateImage = async (prompt) => {
      const { body, boundary } = buildMultipart(forEdit, prompt);
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
    const image2 = await generateImage(imagePrompt + " Slightly different angle.");
    const images = [image1, image2].filter(Boolean);

    return res.status(200).json({ images, prompt: imagePrompt });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};