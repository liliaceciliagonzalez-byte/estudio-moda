import { apiKey, checkAccess, readBody } from "./_shared.js";

export const config = { maxDuration: 300 };

const MOVES = {
  pasarela: "The model walks confidently toward the camera like on a fashion runway, then stops and poses.",
  giro: "The model does a slow elegant 360-degree turn to show the garment from every angle.",
  detalle: "Slow cinematic camera push-in from full body to close-up details of the garment's fabric and texture.",
  viento: "Soft breeze moves the fabric and hair, the model smiles and adjusts the garment naturally.",
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
    const { imagen, mime = "image/png", movimiento = "pasarela", detalles = "" } = body;
    if (!imagen) return res.status(400).json({ error: "Falta la foto para el vídeo." });

    const prompt = [
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
        store: false,
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
