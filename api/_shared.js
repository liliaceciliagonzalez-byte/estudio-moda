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

// Si existe VERTEX_API_KEY, las fotos y fichas se pagan con los créditos de Google Cloud (Vertex AI).
// Para volver a AI Studio basta con borrar VERTEX_API_KEY en Vercel.
export async function gemini(model, payload) {
  const vertex = process.env.VERTEX_API_KEY;
  const url = vertex
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = { ...payload, contents: (payload.contents || []).map((c) => ({ role: "user", ...c })) };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": vertex || apiKey() },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 429 || /quota/i.test(data?.error?.message || "")) {
    throw new Error("El servicio está saturado o falta activar la facturación en Google AI Studio. Prueba de nuevo en unos minutos.");
  }
  if (!r.ok) throw new Error(data?.error?.message || `Error ${r.status} del motor de imágenes`);
  return data;
}

export function readBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
}
