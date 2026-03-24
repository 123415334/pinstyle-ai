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
    const downloaded = await Promise.all(imageUrls.slice(0, 2).map(fetchImageAsBase64Small));
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Analyze the visual style of these reference images. Return ONLY a comma-separated list of precise style descriptors — rendering technique, lighting, color treatment, texture, mood. No explanation." },
              ...validImages.map(img => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } }))
            ]
          }],
        }),
      });

      if (claudeResp.ok) {
        const claudeData = await claudeResp.json();
        styleDescriptors = claudeData.content?.[0]?.text?.trim() || styleDescriptors;
      }
    }

    console.log(`[analyze] Style: ${styleDescri
cd ~/Downloads/pinstyle-ai && git add -A && git commit -m "fix analyze.js - remove accidental git commands" && git push
cat ~/Downloads/pinstyle-ai/api/analyze.js | head -5
