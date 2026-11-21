const hits = new Map();

export function checkAccess(req, body) {
  const codes = (process.env.CODIGOS_ACCESO || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (codes.length > 0 && !codes.includes(String(body.codigo || "").trim())) {
    return "Código de acceso no válido. Pídelo para activar tu plan.";
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  const limit = Number(process.env.LIMITE_DIARIO_IP || 40);
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${day}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > limit) return "Has llegado al límite de hoy. Vuelve mañana.";
  return null;
}

export function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("Falta GEMINI_API_KEY en Vercel (Settings → Environment Variables).");
  return k;
}

export async function gemini(model, payload) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Error ${r.status} del motor de imágenes`);
  return data;
}
