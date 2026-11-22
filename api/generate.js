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
  "prueba-virtual": "Virtual try-on. Take ONLY the clothing items from the garment image(s) (if a person wears them there, ignore that person completely). Recreate the model photo as faithfully as possible: the same woman, same pose, same framing, same background and same lighting, now wearing those items in place of the matching pieces of clothing. Keep every other item of clothing, accessory and the hair exactly as in the model photo. The fit, folds and shadows must look natural on her body.",
  "lifestyle": "Aspirational lifestyle photo: a woman wearing the garment in a bright modern apartment with plants, holding a coffee cup, soft daylight.",
};
const MODEL_LOCK =
  "The FIRST image is the garment. The SECOND image is the model. The person wearing the garment MUST be the exact same person as in the second image: identical face shape, eyes, nose, lips, eyebrows, skin tone, age, hair color and hairstyle, and approximate body type. Do not beautify, slim, age or change her face in any way. Face clearly visible and recognizable. Identity preservation is the top priority.";
const RATIOS = ["3:4", "4:5", "9:16", "1:1"];

// Modo producto (cosmética, perfumes, comida, accesorios…): fotos tipo UGC conservando el producto exacto.
const PRODUCT_LOCK =
  "Use the exact product from the reference image: identical shape, size proportions, colors, materials, packaging, cap, label layout, logo and printed text. Do not redesign, rename or invent text on it. The label must stay readable.";
const PRODUCT_QUALITY =
  "Photorealistic, natural light, authentic smartphone UGC look, sharp focus on the product. No added text, no watermark.";
const PSTYLES = {
  "ugc-selfie": "UGC selfie photo: a real-looking woman holds the product next to her face, smiling at the phone camera, cozy bedroom background, natural daylight.",
  "ugc-uso": "UGC photo: a real-looking woman using the product the way it is meant to be used (applying it, tasting it, wearing it), candid moment at home, product clearly visible.",
  "ugc-bano": "UGC photo in a bright modern bathroom: a woman in front of the mirror holding the product, morning routine vibe.",
  "ugc-cocina": "UGC photo in a bright home kitchen: a woman holding the product toward the camera, friendly and spontaneous.",
  "ugc-calle": "UGC photo outdoors in a sunny city street: a woman showing the product to the camera, lifestyle vibe.",
  "unboxing": "Unboxing photo from above: hands opening a package and holding the product, tissue paper, cozy table, product clearly visible.",
  "estudio-producto": "Clean e-commerce product photo: the product alone on a seamless soft background with a subtle shadow, studio lighting. No person.",
  "bodegon": "Styled product still life: the product on a beige stone surface with natural props (leaves, fabric, water drops) matching its use, premium brand look. No person.",
};
const PMODEL =
  "The person MUST be the exact same person as in the last image: identical face shape, eyes, nose, lips, eyebrows, skin tone, age, hair color and hairstyle. Do not beautify or change her face. Face clearly visible and recognizable.";

// Herramientas de edición: parten de una foto ya hecha (con persona) y solo cambian una cosa.
const EDIT_LOCK =
  "Edit this fashion photo. Keep EXACTLY the same person (face, hair, skin tone, body) and EXACTLY the same clothes, shoes and accessories with every detail, color and print. Do not add or remove clothing.";
const EDITS = {
  "cambiar-postura": (o) => `Only change her pose to: ${o || "a natural, confident fashion pose"}. Keep the same background, framing style and lighting.`,
  "cambiar-angulo": (o) => `Only change the camera angle to: ${o || "a three-quarter view"}. Show the same scene from that new angle, keeping the same lighting and location.`,
  "cambiar-escena": (o) => `Only change the background and location to: ${o || "a bright modern boutique"}. Keep her pose; adapt the lighting naturally to the new place.`,
};

export const config = { maxDuration: 120 };

const inline = (data, mime = "image/jpeg") => ({ inline_data: { mime_type: mime, data } });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = readBody(req);
    const denied = checkAccess(req, body, "foto");
    if (denied) return res.status(403).json({ error: denied });

    const { imagen, mime = "image/jpeg", estilo, formato = "3:4", detalles = "", marca = "", modelo = "", color = "", area = "", opcion = "" } = body;
    const extras = (Array.isArray(body.prendas) ? body.prendas : []).filter(Boolean).slice(0, 3);
    const isEdit = !!EDITS[estilo];
    const isProd = body.tipo === "producto";
    if (isProd && !PSTYLES[estilo]) return res.status(400).json({ error: "Elige un estilo." });
    if (!imagen || (!STYLES[estilo] && !isEdit && !isProd)) return res.status(400).json({ error: "Falta la foto o el tipo de creación." });

    const flash = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const pro = process.env.GEMINI_FACE_MODEL || "gemini-3-pro-image";
    const ratio = RATIOS.includes(formato) ? formato : "3:4";

    let prompt, parts;
    if (isProd) {
      const nP = 1 + extras.length;
      prompt = [PRODUCT_LOCK,
        nP > 1 ? `The first ${nP} images are ${nP} different products that must ALL appear together, each one exactly as in its reference image.` : "",
        modelo ? `Image ${nP + 1} (the last image) is the person. ${PMODEL}` : "",
        PSTYLES[estilo],
        marca ? `Brand style to respect (in Spanish): ${String(marca).slice(0, 400)}` : "",
        detalles ? `Extra details from the seller (in Spanish): ${String(detalles).slice(0, 400)}` : "",
        PRODUCT_QUALITY].filter(Boolean).join("\n\n");
      parts = [{ text: prompt }, inline(imagen, mime), ...extras.map((d) => inline(d)), ...(modelo ? [inline(modelo)] : [])];
    } else if (isEdit) {
      prompt = [EDIT_LOCK, EDITS[estilo](String(opcion).slice(0, 200)), detalles ? `Extra details (in Spanish): ${String(detalles).slice(0, 400)}` : "", QUALITY].filter(Boolean).join("\n\n");
      parts = [{ text: prompt }, inline(imagen, mime)];
    } else {
      const nG = 1 + extras.length;
      const outfit = nG > 1
        ? `The first ${nG} images are ${nG} different clothing items that together form ONE complete outfit. The model must wear ALL of them at the same time, each one exactly as in its reference image (same color, fabric, cut, length, details). Do not add other main garments.`
        : "";
      const colorTxt = String(color).trim().slice(0, 60);
      const lock = colorTxt
        ? `Use the exact garment from the reference image (same cut, length, fabric texture, buttons, seams and every design detail) but change its color to: ${colorTxt}. The new color must look natural and realistic on the fabric, with correct shadows and highlights. Only the color changes.`
        : GARMENT_LOCK;
      const modelLock = modelo
        ? `Image ${nG + 1} (the last image) is the model. ` + MODEL_LOCK.replace(/^The FIRST image is the garment\. The SECOND image is the model\. /, "").replace(/the second image/g, "the last image")
        : "";
      const areaTxt = area ? `The garment to place on her is: ${String(area).slice(0, 40)} (in Spanish). Replace only that part of her outfit.` : "";
      prompt = [lock, outfit, modelLock, STYLES[estilo], areaTxt, marca ? `Brand style to respect (in Spanish): ${String(marca).slice(0, 400)}` : "", detalles ? `Extra details from the shop owner (in Spanish): ${String(detalles).slice(0, 400)}` : "", QUALITY]
        .filter(Boolean).join("\n\n");
      parts = [{ text: prompt }, inline(imagen, mime), ...extras.map((d) => inline(d)), ...(modelo ? [inline(modelo)] : [])];
    }

    const run = (model) => gemini(model, {
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ratio, ...(model === pro ? { imageSize: "2K" } : {}) } },
    });
    // Con persona real (su modelo o una foto a editar) usamos el modelo Pro, que respeta mucho mejor la cara.
    let data, motor = flash, aviso = "";
    if (modelo || isEdit || extras.length || isProd) {
      try { data = await run(pro); motor = pro; } catch (e) { aviso = String(e.message || e).slice(0, 200); data = await run(flash); }
    } else {
      data = await run(flash);
    }
    const out = data?.candidates?.[0]?.content?.parts || [];
    const img = out.find((p) => p.inlineData || p.inline_data);
    const inl = img?.inlineData || img?.inline_data;
    if (!inl?.data) return res.status(502).json({ error: "No se pudo crear la foto. Prueba con otra imagen." });
    return res.status(200).json({ imagen: inl.data, mime: inl.mimeType || inl.mime_type || "image/png", motor, aviso });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error inesperado" });
  }
}
