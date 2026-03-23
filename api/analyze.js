
const fetch = require("node-fetch");

async function fetchImageAsBase64(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const isPinterest = url.includes("pinimg.com") || url.includes("pinterest.com");
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageUrls, subject, pageUrl } = req.body;

  if (!subject) return res.status(400).json({ error: "Missing subject" });
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return res.status(400).json({ error: "Missing imageUrls" });

  try {
    // Download up to 4 reference images
    const downloaded = await Promise.all(imageUrls.slice(0, 4).map(fetchImageAsBase64));
    const validImages = downloaded.filter(Boolean);
    console.log(`[analyze] Downloaded ${validImages.length}/${Math.min(imageUrls.length, 4)} reference images`);

    if (validImages.length === 0) {
      return res.status(400).json({ error: "Could not download any reference images" });
    }

    // Build gpt-image-1 request with image references + subject
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Generate a photorealistic image of: "${subject}"

Use these reference images to match the exact visual style — lighting, color grading, mood, composition, texture, and aesthetic. The output should look like it belongs in the same collection as these reference images. Match the photography style precisely.`
          },
          ...validImages.map(img => ({
            type: "image_url",
            image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
          }))
        ]
      }
    ];

    // Generate 2 variations in parallel
    const [resp1, resp2] = await Promise.all([
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          messages,
          n: 1,
          size: "1024x1024",
          quality: "high",
        }),
      }),
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          messages: [...messages.slice(0, -0), {
            role: "user",
            content: [{ type: "text", text: `Generate a second variation of: "${subject}" — same style, slightly different angle or composition.` },
              ...validImages.map(img => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } }))
            ]
          }],
          n: 1,
          size: "1024x1024",
          quality: "high",
        }),
      }),
    ]);

    const data1 = await resp1.json();
    console.log("[analyze] gpt-image-1 response:", JSON.stringify(data1).slice(0, 300));

    if (!resp1.ok) {
      return res.status(500).json({ error: data1.error?.message || "Image generation failed" });
    }

    // gpt-image-1 returns base64 in data[0].b64_json
    const img1 = data1.data?.[0];
    const imageUrl = img1?.url || (img1?.b64_json ? `data:image/png;base64,${img1.b64_json}` : null);

    let imageUrl2 = null;
    if (resp2.ok) {
      const data2 = await resp2.json();
      const img2 = data2.data?.[0];
      imageUrl2 = img2?.url || (img2?.b64_json ? `data:image/png;base64,${img2.b64_json}` : null);
    }

    return res.status(200).json({
      images: [imageUrl, imageUrl2].filter(Boolean),
      prompt: `Style-matched generation of "${subject}" using ${validImages.length} reference images`,
    });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong" });
  }
};
