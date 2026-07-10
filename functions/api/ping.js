// GET /api/ping  → kurulumun çalıştığını doğrular
export async function onRequestGet(context) {
  const claude = Boolean(context.env.ANTHROPIC_API_KEY);
  const cfai = Boolean(context.env.AI);
  return Response.json({
    durum: "ayakta",
    zaman: new Date().toISOString(),
    ai_motoru: claude ? "Claude (ücretli anahtar tanımlı)"
             : cfai   ? "Cloudflare Workers AI (ücretsiz) ✓"
             : "BAĞLANMAMIŞ — Settings > Functions > AI binding ekleyin (Variable name: AI)",
    ucus_kaynagi: "adsb.lol (anahtarsız, ücretsiz)",
    surum: "iskelet-1.1"
  });
}
