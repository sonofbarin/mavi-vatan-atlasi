// GET /api/ucus?bolge=ege        → Ege + Doğu Akdeniz (tek daire, en hafif)
// GET /api/ucus?bolge=turkiye    → Türkiye'nin tamamı (3 daire)
// GET /api/ucus?lat=..&lon=..&r= → serbest nokta (yarıçap deniz mili, en fazla 250)
//
// KAYNAK ZİNCİRİ (hepsi ücretsiz, anahtarsız, ADSBExchange-v2 uyumlu):
//   1) önbellek (25 sn)
//   2) adsb.lol        → ODbL
//   3) airplanes.live  → 1 istek/sn
//   4) adsb.fi         → opendata
//   5) OpenSky (anonim, farklı format)
//   6) son iyi veri ("bayat: true")
// Hepsi gönüllü servis: sıralı sorgu + önbellek + zaman aşımı ile nazik davranıyoruz.

const UA = "MaviVatanAtlasi/1.2 (egitim; github.com/sonofbarin/mavi-vatan-atlasi)";
const TAZE_SN = 25;
const BAYAT_SN = 900;
const ZAMAN_ASIMI = 6000;

const BOLGE = {
  ege: [{ lat: 37.8, lon: 27.2, r: 220 }],
  turkiye: [
    { lat: 40.3, lon: 28.0, r: 250 },
    { lat: 37.5, lon: 32.5, r: 250 },
    { lat: 39.9, lon: 39.5, r: 250 },
  ],
};

const KAYNAKLAR = [
  { ad: "adsb.lol",       url: (a, o, r) => `https://api.adsb.lol/v2/point/${a}/${o}/${r}` },
  { ad: "airplanes.live", url: (a, o, r) => `https://api.airplanes.live/v2/point/${a}/${o}/${r}` },
  { ad: "adsb.fi",        url: (a, o, r) => `https://opendata.adsb.fi/api/v2/lat/${a}/lon/${o}/dist/${r}` },
];

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const sayi = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

async function getir(url) {
  const iptal = new AbortController();
  const zaman = setTimeout(() => iptal.abort(), ZAMAN_ASIMI);
  try {
    const c = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: iptal.signal });
    if (!c.ok) throw new Error(c.status);
    return await c.json();
  } finally {
    clearTimeout(zaman);
  }
}

async function onbellekliGetir(url) {
  const cache = caches.default;
  const anahtar = new Request(url);
  const eski = await cache.match(anahtar);
  if (eski) return await eski.json();
  const j = await getir(url);
  await cache.put(anahtar, new Response(JSON.stringify(j), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${TAZE_SN}` },
  }));
  return j;
}

function sadelestir(ham) {
  return (ham || [])
    .filter((u) => u.lat != null && u.lon != null && u.alt_baro !== "ground")
    .map((u) => ({
      hex: u.hex,
      cs: (u.flight || "").trim() || u.r || u.hex,
      tescil: u.r || null,
      tip: u.t || null,
      lat: u.lat,
      lon: u.lon,
      irt: typeof u.alt_baro === "number" ? Math.round(u.alt_baro * 0.3048) : null,
      hiz: u.gs != null ? Math.round(u.gs) : null,
      yon: u.track ?? null,
      askeri: Boolean(u.dbFlags & 1),
    }));
}

async function adsbZinciri(daireler) {
  const hatalar = [];
  for (const k of KAYNAKLAR) {
    try {
      const harita = new Map();
      for (let i = 0; i < daireler.length; i++) {
        if (i) await bekle(1100); // airplanes.live: 1 istek/sn
        const d = daireler[i];
        const j = await onbellekliGetir(k.url(d.lat, d.lon, Math.min(250, Math.round(d.r))));
        for (const u of sadelestir(j.ac)) harita.set(u.hex, u);
      }
      return { kaynak: k.ad, ucaklar: [...harita.values()] };
    } catch (e) {
      hatalar.push(`${k.ad}:${String(e.message || e).slice(0, 40)}`);
    }
  }
  throw new Error(hatalar.join(" | "));
}

async function openSky(daireler) {
  const lats = daireler.map((d) => d.lat), lons = daireler.map((d) => d.lon);
  const pay = Math.max(...daireler.map((d) => d.r)) / 60;
  const url = `https://opensky-network.org/api/states/all?lamin=${(Math.min(...lats) - pay).toFixed(2)}&lomin=${(Math.min(...lons) - pay * 1.3).toFixed(2)}&lamax=${(Math.max(...lats) + pay).toFixed(2)}&lomax=${(Math.max(...lons) + pay * 1.3).toFixed(2)}`;
  const j = await onbellekliGetir(url);
  return (j.states || [])
    .filter((s) => s[5] != null && s[6] != null && !s[8])
    .map((s) => ({
      hex: s[0],
      cs: (s[1] || "").trim() || s[0],
      tescil: null, tip: null,
      lat: s[6], lon: s[5],
      irt: s[13] != null ? Math.round(s[13]) : s[7] != null ? Math.round(s[7]) : null,
      hiz: s[9] != null ? Math.round(s[9] * 1.944) : null,
      yon: s[10] ?? null,
      askeri: false,
      ulke: s[2] || null,
    }));
}

const bayatAnahtar = (e) => new Request(`https://mva.local/bayat/${e}`);
const bayatOku = async (e) => {
  const c = await caches.default.match(bayatAnahtar(e));
  return c ? await c.json() : null;
};
const bayatYaz = (e, v) =>
  caches.default.put(bayatAnahtar(e), new Response(JSON.stringify(v), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${BAYAT_SN}` },
  }));

export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);
  const bolgeAd = url.searchParams.get("bolge");
  const daireler = BOLGE[bolgeAd] || [{
    lat: sayi(url.searchParams.get("lat"), 38.5),
    lon: sayi(url.searchParams.get("lon"), 27.0),
    r: sayi(url.searchParams.get("r"), 200),
  }];
  const etiket = bolgeAd || `${daireler[0].lat},${daireler[0].lon},${daireler[0].r}`;
  const notlar = [];

  try {
    const { kaynak, ucaklar } = await adsbZinciri(daireler);
    const paket = { sayi: ucaklar.length, zaman: Date.now(), kaynak, ucaklar };
    waitUntil(bayatYaz(etiket, paket));
    return Response.json(paket, { headers: { "cache-control": `public, max-age=${TAZE_SN}` } });
  } catch (e1) {
    notlar.push("adsb: " + String(e1.message || e1));
    try {
      const ucaklar = await openSky(daireler);
      const paket = { sayi: ucaklar.length, zaman: Date.now(), kaynak: "OpenSky (yedek)", notlar, ucaklar };
      waitUntil(bayatYaz(etiket, paket));
      return Response.json(paket, { headers: { "cache-control": `public, max-age=${TAZE_SN}` } });
    } catch (e2) {
      notlar.push("opensky: " + String(e2.message || e2));
      const eski = await bayatOku(etiket);
      if (eski) {
        return Response.json({ ...eski, bayat: true, yas_sn: Math.round((Date.now() - eski.zaman) / 1000), notlar }, { headers: { "cache-control": "no-store" } });
      }
      return Response.json({ hata: "Tüm uçuş kaynakları şu an erişilemez.", notlar, oneri: "Birkaç dakika sonra tekrar deneyin." }, { status: 503 });
    }
  }
}
