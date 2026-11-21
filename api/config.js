export default function handler(req, res) {
  const codigo = (process.env.CODIGOS_ACCESO || "").trim().length > 0;
  res.status(200).json({ codigo });
}
