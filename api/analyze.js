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

function buildMultipartBody(buffers, prompt) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const parts = [];

  buffers.forEach((buf, i) => {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image[]"; filename="ref${i}.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
    );
    parts.push(buf);
    parts.push('\r\n');
  });

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-1\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="n"\r\n\r\n1\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n1024x1024\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="quality"\r\n\r\nhigh\r\n` +
    `--${boundary}--\r\n`
  );

  const bufferParts = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
  return { body: Buffer.concat(bufferParts), boundary };
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
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageBuffer));
    const validBuffers = downloaded.filter(Boolean);
    if (validBuffers.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    const prompt = `${subject}. Match the exact visual style, color grading, lighting, mood and aesthetic of the reference images.`;

    const generateImage = async (p) => {
      const { body, boundary } = buildMultipartBody(validBuffers, p);
      const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || JSON.stringify(data));
      const img = data.data?.[0];
      return img?.url || (img?.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
    };

    const image1 = await generateImage(prompt);
    const image2 = await generateImage(`${prompt} Slightly different angle.`);

    return res.status(200).json({ images: [image1, image2].filter(Boolean), prompt });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
