import { checkAccess, gemini, readBody } from "./_shared.js";

const GARMENT_LOCK =
  "Use the exact garment from the reference image: keep its color, fabric, texture, pattern, cut, length, buttons, prints and every detail identical. Do not redesign or recolor it.";
const QUALITY =
  "Photorealistic professional fashion photography, sharp focus on the garment, natural skin, flattering light. No text, no watermark, no added logos.";

const STYLES = {
  "estudio-limpio": "E-commerce catalog photo: a female model wearing the garment, full body, seamless pure white studio background, soft even lighting, neutral pose.",
  "editorial": "Fashion magazine editorial: a female model wearing the garment, dramatic directional light, minimal grey backdrop, confident editorial pose.",
  "exterior-calido": "Outdoor fashion campaign: a female model wearing the garment walking on a sunny Mediterranean street at golden hour, warm natural light.",
  "marmol-lujo": "Luxury boutique photo: a female model wearing the garment beside white marble with subtle gold details, elegant high-end lighting.",
  "editorial-premium": "Ultra-premium high fashion campaign: a female model wearing the garment, sculptural pose, deep cinematic shadows, rich color grading.",
  "modelo-casual": "Casual lifestyle photo: a smiling Latina woman wearing the garment styled with jeans in a bright cafe, candid Instagram look.",
  "modelo-estudio": "Professional studio portrait: a female model wearing the garment, beige paper backdrop, softbox lighting, half body, confident pose.",
  "flat-lay": "Styled flat lay from directly above: the garment laid neatly on a beige linen surface with sunglasses, a small handbag and gold jewelry. No person.",
  "lifestyle": "Aspirational lifestyle photo: a woman wearing the garment in a bright modern apartment with plants, holding a coffee cup, soft daylight.",
};
const RATIOS = ["3:4", "4:5", "9:16", "1:1"];
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = readBody(req);
    const denied = checkAccess(req, body, "foto");
    if (denied) return res.status(403).json({ error: denied });

    const { imagen, mime = "image/jpeg", estilo, formato = "3:4", detalles = "", marca = "" } = body;
    if (!imagen || !STYLES[estilo]) return res.status(400).json({ error: "Falta la foto de la prenda o el estilo." });

    const prompt = [GARMENT_LOCK, STYLES[estilo], marca ? `Brand style to respect (in Spanish): ${String(marca).slice(0, 400)}` : "", detalles ? `Extra details from the shop owner (in Spanish): ${String(detalles).slice(0, 400)}` : "", QUALITY]
      .filter(Boolean).join("\n\n");

    const data = await gemini(process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image", {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imagen } }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: RATIOS.includes(formato) ? formato : "3:4" },
      },
    });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const inline = img?.inlineData || img?.inline_data;
    if (!inline?.data) return res.status(502).json({ error: "No se pudo crear la foto. Prueba con otra imagen de la prenda." });
    return res.status(200).json({ imagen: inline.data, mime: inline.mimeType || inline.mime_type || "image/png" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error inesperado" });
  }
}
