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
    return `data:${ct};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (_) { return null; }
}

async function waitForResult(predictionId) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Token ${process.env.REPLICATE_API_KEY}` }
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
    const downloaded = await Promise.all(imageUrls.slice(0, 3).map(fetchImageAsBase64));
    const validImages = downloaded.filter(Boolean);
    if (validImages.length === 0) return res.status(400).json({ error: "Could not load reference images" });

    const styleImage = validImages[0];

    const startPrediction = async (prompt) => {
      const resp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Token ${process.env.REPLICATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            redux_image: styleImage,
            prompt: prompt,
            num_inference_steps: 28,
            guidance: 3.5,
            megapixels: "1",
            output_format: "webp",
          }
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || JSON.stringify(data) || "Failed to start prediction");
      return data.id;
    };

    const id1 = await startPrediction(subject);
    const output1 = await waitForResult(id1);
    const id2 = await startPrediction(`${subject}, slightly different angle`);
    const output2 = await waitForResult(id2);

    const images = [
      Array.isArray(output1) ? output1[0] : output1,
      Array.isArray(output2) ? output2[0] : output2,
    ].filter(Boolean);

    return res.status(200).json({ images, prompt: subject });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
