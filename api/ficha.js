import { checkAccess, gemini, readBody } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const body = readBody(req);
    const denied = checkAccess(req, body, "ficha");
    if (denied) return res.status(403).json({ error: denied });
    const { imagen, mime = "image/jpeg", detalles = "" } = body;
    if (!imagen) return res.status(400).json({ error: "Falta la foto de la prenda." });

    const prompt = `Eres copywriter de moda para boutiques en español (tono cercano, elegante y vendedor).
Mira la prenda de la foto y devuelve SOLO un JSON con estas claves:
"nombre": nombre comercial corto del producto,
"descripcion": descripción para la tienda online (2-3 frases, materiales/estilo aparentes, sin inventar tallas ni precios),
"estilismo": una frase de cómo combinarla,
"caption": caption para Instagram con gancho y llamada a la acción, con 2-3 emojis,
"hashtags": 8 hashtags en español separados por espacios.
${detalles ? `Datos de la tienda: ${String(detalles).slice(0, 400)}` : ""}`;

    const data = await gemini(process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash", {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imagen } }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error inesperado" });
  }
}
