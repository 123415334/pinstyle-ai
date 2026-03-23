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
    return Buffer.from(buf);
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
    // Download reference images
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageBuffer));
    const validBuffers = downloaded.filter(Boolean);
    if (validBuffers.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    // Build multipart form with all reference images + prompt
    const generateWithEdit = async (prompt) => {
      const { FormData, Blob } = await import('node:buffer').catch(() => globalThis);
      
      const form = new FormData();
      
      // Add all reference images
      validBuffers.forEach((buf, i) => {
        form.append('image[]', new Blob([buf], { type: 'image/jpeg' }), `ref${i}.jpg`);
      });
      
      form.append('prompt', prompt);
      form.append('model', 'gpt-image-1');
      form.append('n', '1');
      form.append('size', '1024x1024');
      form.append('quality', 'high');

      const resp = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: form,
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || JSON.stringify(data));
      
      const img = data.data?.[0];
      return img?.url || (img?.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
    };

    const prompt = `Generate a photorealistic image of: ${subject}. Match the exact visual style, color grading, lighting, mood, texture and aesthetic of the reference images provided. The subject should be ${subject} but rendered in the same artistic style as the references.`;

    const image1 = await generateWithEdit(prompt);
    const image2 = await generateWithEdit(`${prompt} Slightly different angle or composition.`);

    const images = [image1, image2].filter(Boolean);
    return res.status(200).json({ images, prompt });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
