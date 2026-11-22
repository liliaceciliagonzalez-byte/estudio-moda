// Trae una imagen pública por su enlace (para usar fotos de tiendas en el probador).
export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  try {
    const url = String(req.query.url || "");
    if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: "Enlace no válido" });
    const host = new URL(url).hostname;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return res.status(400).json({ error: "Enlace no válido" });
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 EstudioModa" }, redirect: "follow" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return res.status(400).json({ error: "Ese enlace no es una imagen" });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Imagen demasiado grande" });
    res.setHeader("content-type", type);
    res.setHeader("cache-control", "public, max-age=86400, s-maxage=604800");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: "No se pudo traer la imagen" });
  }
}
