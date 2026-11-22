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
  "prueba-virtual": "Virtual try-on. Take ONLY the garment from the FIRST image (if a person wears it there, ignore that person completely). Recreate the SECOND image as faithfully as possible: the same woman, same pose, same framing, same background and same lighting, now wearing that garment in place of the matching piece of clothing. Keep every other item of clothing, accessory and the hair exactly as in the second image. The fit, folds and shadows of the garment must look natural on her body.",
  "lifestyle": "Aspirational lifestyle photo: a woman wearing the garment in a bright modern apartment with plants, holding a coffee cup, soft daylight.",
};
const RATIOS = ["3:4", "4:5", "9:16", "1:1"];
const MODEL_LOCK =
  "The FIRST image is the garment. The SECOND image is the model. The person wearing the garment MUST be the exact same person as in the second image: identical face shape, eyes, nose, lips, eyebrows, skin tone, age, hair color and hairstyle, and approximate body type. Do not beautify, slim, age or change her face in any way. Face clearly visible and recognizable. Identity preservation is the top priority.";
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = readBody(req);
    const denied = checkAccess(req, body, "foto");
    if (denied) return res.status(403).json({ error: denied });

    const { imagen, mime = "image/jpeg", estilo, formato = "3:4", detalles = "", marca = "", modelo = "", color = "" } = body;
    if (!imagen || !STYLES[estilo]) return res.status(400).json({ error: "Falta la foto de la prenda o el estilo." });

    const colorTxt = String(color).trim().slice(0, 60);
    const lock = colorTxt
      ? `Use the exact garment from the reference image (same cut, length, fabric texture, buttons, seams and every design detail) but change its color to: ${colorTxt}. The new color must look natural and realistic on the fabric, with correct shadows and highlights. Only the color changes.`
      : GARMENT_LOCK;
    const prompt = [lock, modelo ? MODEL_LOCK : "", STYLES[estilo], marca ? `Brand style to respect (in Spanish): ${String(marca).slice(0, 400)}` : "", detalles ? `Extra details from the shop owner (in Spanish): ${String(detalles).slice(0, 400)}` : "", QUALITY]
      .filter(Boolean).join("\n\n");

    const flash = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const pro = process.env.GEMINI_FACE_MODEL || "gemini-3-pro-image";
    const run = (model) => gemini(model, {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imagen } }, ...(modelo ? [{ inline_data: { mime_type: "image/jpeg", data: modelo } }] : [])] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: RATIOS.includes(formato) ? formato : "3:4", ...(model === pro ? { imageSize: "2K" } : {}) },
      },
    });
    // Con cara de modelo usamos el modelo Pro, que respeta mucho mejor la identidad.
    let data, motor = flash, aviso = "";
    if (modelo) {
      try { data = await run(pro); motor = pro; } catch (e) { aviso = String(e.message || e).slice(0, 200); data = await run(flash); }
    } else {
      data = await run(flash);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const inline = img?.inlineData || img?.inline_data;
    if (!inline?.data) return res.status(502).json({ error: "No se pudo crear la foto. Prueba con otra imagen de la prenda." });
    return res.status(200).json({ imagen: inline.data, mime: inline.mimeType || inline.mime_type || "image/png", motor, aviso });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error inesperado" });
  }
}
