import { apiKey } from "./_shared.js";

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  try {
    const id = String(req.query.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) return res.status(400).json({ error: "Falta el vídeo" });
    const meta = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${id}`, {
      headers: { "x-goog-api-key": apiKey() },
    }).then((r) => r.json());
    if (meta?.state === "FAILED") return res.status(502).json({ error: "El vídeo falló. Prueba otra vez." });
    if (meta?.state && meta.state !== "ACTIVE") return res.status(202).json({ estado: meta.state });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${id}:download?alt=media`, {
      headers: { "x-goog-api-key": apiKey() },
    });
    if (!r.ok) return res.status(502).json({ error: `No se pudo descargar el vídeo (${r.status})` });
    res.setHeader("content-type", r.headers.get("content-type") || "video/mp4");
    res.setHeader("cache-control", "private, max-age=3600");
    for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message || "Error inesperado" });
    else res.end();
  }
}
