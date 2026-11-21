const hits = new Map();

function codes() {
  return (process.env.CODIGOS_ACCESO || "").split(",").map((c) => c.trim()).filter(Boolean);
}

function count(key) {
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  return n;
}

// kind: "foto" | "ficha" | "video"
export function checkAccess(req, body, kind = "foto") {
  const list = codes();
  const code = String(body.codigo || "").trim();
  const hasCode = list.length > 0 && list.includes(code);
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  const day = new Date().toISOString().slice(0, 10);

  if (list.length > 0 && !hasCode) {
    if (kind === "video") return "Los vídeos están incluidos en los planes de pago. Escríbenos para activar tu código.";
    const free = Number(process.env.GRATIS_POR_DIA || 2);
    if (count(`free:${kind}:${ip}:${day}`) > free) {
      return "Ya usaste tu prueba gratis. Activa tu plan para seguir creando.";
    }
    return null;
  }
  const limit = Number(process.env.LIMITE_DIARIO_IP || 60);
  if (count(`${kind}:${hasCode ? code : ip}:${day}`) > limit) return "Has llegado al límite de hoy. Vuelve mañana.";
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

export function readBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
}
