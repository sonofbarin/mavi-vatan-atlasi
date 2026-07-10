// GET /api/ucus?lat=39&lon=32&r=250   → tek nokta çevresi (yarıçap deniz mili, en fazla 250)
// GET /api/ucus?bolge=turkiye         → Türkiye'nin tamamı (3 daire, sırayla, birleştirilmiş)
// GET /api/ucus?bolge=ege             → Ege + Doğu Akdeniz (tek daire, en hafif sorgu)
//
// DAYANIKLILIK ZİNCİRİ
//   1) Önbellek (20 sn taze)                          → hiç dış istek atılmaz
//   2) adsb.lol  (anahtarsız, ODbL, filtrelenmemiş)
//   3) OpenSky   (anonim, adsb.lol 429 verirse)
//   4) Son iyi veri (10 dk'ya kadar, "bayat: true")
//
// adsb.lol gönüllü bir servis. Sorguları sıraya diziyor, önbellekliyor ve 429'a saygı gösteriyoruz.

const UA = "MaviVatanAtlasi/1.1 (egitim amacli; github.com/sonofbarin/mavi-vatan-atlasi)";
const TAZE_SN = 20;      // önbellek ömrü
const BAYAT_SN = 600;    // acil durum kopyası

const BOLGE = {
  turkiye: [
    { lat: 40.3, lon: 28.0, r: 250 }, // Marmara + Ege + Batı Karadeniz
    { lat: 37.5, lon: 32.5, r: 250 }, // İç Anadolu + Akdeniz + Kıbrıs
    { lat: 39.9, lon: 39.5, r: 250 }, // Doğu Anadolu + Doğu Karadeniz
  ],
  ege: [{ lat: 37.8, lon: 27.2, r: 220 }],
};

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const sayi = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

/* ---------- adsb.lol ---------- */
async function adsbNokta(lat, lon, r) {
  const url = `https://api.adsb.lol/v2/point/${lat}/${lon}/${Math.min(250, Math.max(1, Math.round(r)))}`;
  const cache = caches.default;
  const anahtar = new Request(url);

  const onbellek = await cache.match(anahtar);
  if (onbellek) return (await onbellek.json()).ac || [];

  const cevap = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (cevap.status === 429) throw Object.assign(new Error("adsb-429"), { kod: 429 });
  if (!cevap.ok) throw new Error("adsb-" + cevap.status);

  const govde = await cevap.text();
  await cache.put(anahtar, new Response(govde, {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${TAZE_SN}` },
  }));
  return (JSON.parse(govde).ac) || [];
}

function adsbSadelestir(ham) {
  return ham
    .filter((u) => u.lat != null && u.lon != null && u.alt_baro !== "ground")
    .map((u) => ({
      hex: u.hex,
      cs: (u.flight || "").trim() || u.r || u.hex,
      tescil: u.r || null,
      tip: u.t || null,
      lat: u.lat,
      lon: u.lon,
      irt: typeof u.alt_baro === "number" ? Math.round(u.alt_baro * 0.3048) : null, // ft → m
      hiz: u.gs != null ? Math.round(u.gs) : null,                                   // knot
      yon: u.track ?? null,
      askeri: Boolean(u.dbFlags & 1),
    }));
}

/* ---------- OpenSky (yedek, anonim) ---------- */
async function openSkyKutu(la0, lo0, la1, lo1) {
  const url = `https://opensky-network.org/api/states/all?lamin=${la0}&lomin=${lo0}&lamax=${la1}&lomax=${lo1}`;
  const cache = caches.default;
  const anahtar = new Request(url);

  const onbellek = await cache.match(anahtar);
  const j = onbellek ? await onbellek.json() : await (async () => {
    const c = await fetch(url, { headers: { "User-Agent": UA } });
    if (!c.ok) throw new Error("opensky-" + c.status);
    const t = await c.text();
    await cache.put(anahtar, new Response(t, {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${TAZE_SN}` },
    }));
    return JSON.parse(t);
  })();

  return (j.states || [])
    .filter((s) => s[5] != null && s[6] != null && !s[8])
    .map((s) => ({
      hex: s[0],
      cs: (s[1] || "").trim() || s[0],
      tescil: null,
      tip: null,
      lat: s[6],
      lon: s[5],
      irt: s[13] != null ? Math.round(s[13]) : s[7] != null ? Math.round(s[7]) : null, // metre
      hiz: s[9] != null ? Math.round(s[9] * 1.944) : null,
      yon: s[10] ?? null,
      askeri: false,
      ulke: s[2] || null,
    }));
}

/* ---------- son iyi veri ---------- */
const bayatAnahtar = (etiket) => new Request(`https://mva-onbellek.local/bayat/${etiket}`);

async function bayatOku(etiket) {
  const c = await caches.default.match(bayatAnahtar(etiket));
  return c ? await c.json() : null;
}
async function bayatYaz(etiket, veri) {
  await caches.default.put(bayatAnahtar(etiket), new Response(JSON.stringify(veri), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${BAYAT_SN}` },
  }));
}

/* ---------- uç nokta ---------- */
export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);
  const bolgeAd = url.searchParams.get("bolge");
  const daireler = BOLGE[bolgeAd] || [
    { lat: sayi(url.searchParams.get("lat"), 39.0), lon: sayi(url.searchParams.get("lon"), 32.0), r: sayi(url.searchParams.get("r"), 200) },
  ];
  const etiket = bolgeAd || `${daireler[0].lat},${daireler[0].lon},${daireler[0].r}`;

  // 1+2) adsb.lol — sırayla, aralarında nefes payı
  try {
    const harita = new Map();
    for (let i = 0; i < daireler.length; i++) {
      if (i) await bekle(300);
      const d = daireler[i];
      for (const u of adsbSadelestir(await adsbNokta(d.lat, d.lon, d.r))) harita.set(u.hex, u);
    }
    const ucaklar = [...harita.values()];
    const paket = { sayi: ucaklar.length, zaman: Date.now(), kaynak: "adsb.lol (ODbL)", ucaklar };
    waitUntil(bayatYaz(etiket, paket));
    return Response.json(paket, { headers: { "cache-control": `public, max-age=${TAZE_SN}` } });
  } catch (e) {
    // 3) OpenSky yedeği
    try {
      const lats = daireler.map((d) => d.lat), lons = daireler.map((d) => d.lon);
      const pay = Math.max(...daireler.map((d) => d.r)) / 60; // nm → derece (kaba)
      const ucaklar = await openSkyKutu(
        (Math.min(...lats) - pay).toFixed(2), (Math.min(...lons) - pay * 1.3).toFixed(2),
        (Math.max(...lats) + pay).toFixed(2), (Math.max(...lons) + pay * 1.3).toFixed(2)
      );
      const paket = { sayi: ucaklar.length, zaman: Date.now(), kaynak: "OpenSky (yedek)", not: "adsb.lol geçici olarak limitledi", ucaklar };
      waitUntil(bayatYaz(etiket, paket));
      return Response.json(paket, { headers: { "cache-control": `public, max-age=${TAZE_SN}` } });
    } catch (e2) {
      // 4) son iyi veri
      const eski = await bayatOku(etiket);
      if (eski) {
        return Response.json(
          { ...eski, bayat: true, yas_sn: Math.round((Date.now() - eski.zaman) / 1000), not: "Canlı kaynaklar şu an cevap vermiyor; son alınan görüntü gösteriliyor." },
          { headers: { "cache-control": "no-store" } }
        );
      }
      return Response.json(
        { hata: "Uçuş verisi şu an alınamıyor.", ayrinti: `${e.message || e} / ${e2.message || e2}`, oneri: "Birkaç dakika sonra tekrar deneyin." },
        { status: 503 }
      );
    }
  }
}
