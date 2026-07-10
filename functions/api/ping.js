// GET /api/ping  → kurulumun çalıştığını doğrular
export async function onRequestGet(context) {
  const anahtarVar = Boolean(context.env.ANTHROPIC_API_KEY);
  return Response.json({
    durum: "ayakta",
    zaman: new Date().toISOString(),
    ai_anahtari: anahtarVar ? "tanımlı ✓" : "TANIMSIZ — Cloudflare > Settings > Environment variables",
    surum: "iskelet-1.0"
  });
}
