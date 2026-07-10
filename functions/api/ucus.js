// GET /api/ucus?lat=39&lon=32&r=250        → tek nokta çevresi
// GET /api/ucus?bolge=turkiye              → Türkiye'nin tamamı (3 sorgu birleştirilir)
// Kaynak: adsb.lol — anahtar gerektirmez, ODbL lisanslı, filtrelenmemiş (her havayolu + genel havacılık)
// Ziyaretçi hesap açmadan bunu görür. Kendi OpenSky hesabı olan kullanıcı tarayıcıdan doğrudan bağlanır.

const UA = "MaviVatanAtlasi/1.0 (egitim amacli; iletisim: github.com/sonofbarin/mavi-vatan-atlasi)";

// Türkiye'yi kapsayan 3 daire (250 nm sınırı yüzünden)
const TURKIYE = [
  { lat: 40.3, lon: 28.0, r: 250 }, // Marmara + Ege + Batı Karadeniz
  { lat: 37.5, lon: 32.5, r: 250 }, // İç Anadolu + Akdeniz + Kıbrıs
  { lat: 39.9, lon: 39.5, r: 250 }, // Doğu Anadolu + Doğu Karadeniz
];

function sayi(v, varsayilan) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : varsayilan;
}

async function nokta(lat, lon, r, waitUntil) {
  const url = `https://api.adsb.lol/v2/point/${lat}/${lon}/${Math.min(250, Math.max(1, r))}`;
  const cache = caches.default;
  const anahtar = new Request(url, { method: "GET" });

  let cevap = await cache.match(anahtar);
  if (!cevap) {
    const yukari = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!yukari.ok) throw new Error("adsb.lol " + yukari.status);
    const govde = await yukari.text();
    cevap = new Response(govde, {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=10" },
    });
    waitUntil(cache.put(anahtar, cevap.clone()));
  }
  const j = await cevap.json();
  return j.ac || [];
}

export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);

  try {
    let ucaklar;
    if (url.searchParams.get("bolge") === "turkiye") {
      const gruplar = await Promise.all(TURKIYE.map((p) => nokta(p.lat, p.lon, p.r, waitUntil)));
      const harita = new Map();
      for (const g of gruplar) for (const u of g) if (u.hex) harita.set(u.hex, u);
      ucaklar = [...harita.values()];
    } else {
      const lat = sayi(url.searchParams.get("lat"), 39.0);
      const lon = sayi(url.searchParams.get("lon"), 32.0);
      const r = sayi(url.searchParams.get("r"), 250);
      ucaklar = await nokta(lat, lon, r, waitUntil);
    }

    // Sadece havadaki uçaklar, ihtiyacımız olan alanlar
    const sade = ucaklar
      .filter((u) => u.lat != null && u.lon != null && u.alt_baro !== "ground")
      .map((u) => ({
        hex: u.hex,
        cs: (u.flight || "").trim() || u.r || u.hex,
        tescil: u.r || null,
        tip: u.t || null,
        lat: u.lat,
        lon: u.lon,
        irt: typeof u.alt_baro === "number" ? u.alt_baro : null, // feet
        hiz: u.gs ?? null,   // knot
        yon: u.track ?? null,
        dikey: u.baro_rate ?? null,
        askeri: Boolean(u.dbFlags & 1),
      }));

    return Response.json(
      { sayi: sade.length, zaman: Date.now(), kaynak: "adsb.lol (ODbL)", ucaklar: sade },
      { headers: { "cache-control": "public, max-age=10", "x-veri-kaynagi": "adsb.lol ODbL 1.0" } }
    );
  } catch (e) {
    return Response.json({ hata: "Uçuş verisi alınamadı", ayrinti: String(e.message || e) }, { status: 502 });
  }
}
