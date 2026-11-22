import { apiKey, checkAccess, readBody } from "./_shared.js";

export const config = { maxDuration: 300 };

const MOVES = {
  pasarela: "The model walks confidently toward the camera like on a fashion runway, then stops and poses.",
  giro: "The model does a slow elegant 360-degree turn to show the garment from every angle.",
  detalle: "Slow cinematic camera push-in from full body to close-up details of the garment's fabric and texture.",
  viento: "Soft breeze moves the fabric and hair, the model smiles and adjusts the garment naturally.",
};

const PMOVES = {
  resena: "Authentic UGC review filmed on a phone: the person holds the product up to the camera, shows the label, and talks enthusiastically about it as if recommending it to a friend.",
  uso: "Authentic UGC video: the person uses the product naturally (applies it, tastes it or wears it) and reacts with a genuine happy expression.",
  unboxing: "UGC unboxing: hands take the product out of the package, turn it to show every side and hold it close to the camera.",
  giro: "Product showcase without people: slow smooth orbit around the product, soft light highlights, premium commercial look.",
};

function findVideo(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "video" && (node.uri || node.data)) return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const f = findVideo(v);
    if (f) return f;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = readBody(req);
    const denied = checkAccess(req, body, "video");
    if (denied) return res.status(403).json({ error: denied });
    const { imagen, mime = "image/png", movimiento = "pasarela", detalles = "", guion = "" } = body;
    const isProd = body.tipo === "producto";
    if (!imagen) return res.status(400).json({ error: "Falta la foto para el vídeo." });

    const prompt = isProd ? [
      "Vertical 9:16 UGC style video for Instagram Reels and TikTok, based on the reference photo, handheld smartphone feel.",
      PMOVES[movimiento] || PMOVES.resena,
      "Keep the product exactly identical to the photo: same shape, colors, packaging, label, logo and printed text. Same person and setting.",
      guion ? `The person speaks in Spanish (Spain), natural and warm, saying: "${String(guion).slice(0, 220)}"` : "Natural ambient sound.",
      "Realistic motion. No added captions, no watermark.",
      detalles ? `Extra details: ${String(detalles).slice(0, 300)}` : "",
    ].filter(Boolean).join(" ") : [
      "Vertical 9:16 fashion video for Instagram Reels and TikTok, based on the reference photo.",
      MOVES[movimiento] || MOVES.pasarela,
      "Keep the garment exactly identical to the photo (color, fabric, pattern, cut, details). Same model and setting.",
      "Smooth professional camera work, realistic motion, premium fashion brand look. No text, no logos, no watermark.",
      detalles ? `Extra details: ${String(detalles).slice(0, 300)}` : "",
    ].filter(Boolean).join(" ");

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({
        model: process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash",
        input: [
          { type: "image", data: imagen, mime_type: mime },
          { type: "text", text: prompt },
        ],
        response_format: { type: "video", aspect_ratio: "9:16", delivery: "uri" },
        background: false,
        store: true,
        stream: false,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `Error ${r.status} del motor de vídeo`);
    const v = findVideo(data);
    if (!v) return res.status(502).json({ error: "No se pudo crear el vídeo. Prueba con otra foto." });
    if (v.uri) {
      const id = (v.uri.match(/files\/([^/?:]+)/) || [])[1];
      if (!id) return res.status(502).json({ error: "Respuesta de vídeo no válida." });
      return res.status(200).json({ archivo: id });
    }
    return res.status(200).json({ inline: true, mime: v.mime_type || "video/mp4", video: v.data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error inesperado" });
  }
}
