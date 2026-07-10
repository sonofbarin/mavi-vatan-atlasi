/* ============================================================
   OSM ADALARI + GERÇEK FIR SINIRLARI
   /data/adalar.geojson  → OpenStreetMap, ODbL (GitHub Actions çeker)
   /data/fir.geojson     → VATSpy / ICAO AIRAC
   Dosyalar yoksa atlas eskisi gibi çalışır, hiçbir şey kırılmaz.
   ============================================================ */
(() => {
  if (!location.protocol.startsWith("http")) return;

  const OSM = { adalar: [], yuklendi: false, hata: null };
  const FIR = { alanlar: [], yuklendi: false };

  /* --- yardımcılar --- */
  const kutu = (halkalar) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const h of halkalar) for (const [x, y] of h) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  };
  const halkalariAl = (g) =>
    g.type === "Polygon" ? [g.coordinates[0]]
    : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0])
    : [];

  /* --- veri yükle --- */
  async function yukle() {
    try {
      const r = await fetch("/data/adalar.geojson", { cache: "force-cache" });
      if (!r.ok) throw new Error("adalar.geojson yok (Actions'ı bir kez çalıştırın)");
      const j = await r.json();
      OSM.adalar = j.features.map((f) => {
        const h = halkalariAl(f.geometry);
        return { p: f.properties, h, k: kutu(h) };
      }).filter((a) => a.h.length);
      OSM.yuklendi = true;
      const isimli = OSM.adalar.filter((a) => a.p.ad).length;
      console.log(`OSM: ${OSM.adalar.length} ada (${isimli} isimli)`);
      bildir(`OpenStreetMap: ${OSM.adalar.length} ada yüklendi`);
    } catch (e) {
      OSM.hata = e.message;
      console.warn("OSM adaları:", e.message);
    }

    try {
      const r = await fetch("/data/fir.geojson", { cache: "force-cache" });
      if (r.ok) {
        const j = await r.json();
        FIR.alanlar = j.features.map((f) => ({ p: f.properties, h: halkalariAl(f.geometry) }));
        FIR.yuklendi = true;
        console.log(`FIR: ${FIR.alanlar.length} poligon (gerçek ICAO sınırı)`);
      }
    } catch (e) {}

    if (OSM.yuklendi || FIR.yuklendi) {
      katmanEkle();
      HARITA.iste();
    }
  }

  /* --- katman kaydı --- */
  function katmanEkle() {
    const r = getComputedStyle(document.documentElement);
    if (OSM.yuklendi && !KATMAN.liste.some((k) => k.id === "osmada")) {
      KATMAN.liste.splice(3, 0, {
        id: "osmada", ad: `OSM adaları (${OSM.adalar.length})`, grup: "Temel",
        gorunur: 1, renk: r.getPropertyValue("--kara").trim() || "#2b3b46",
        detay: "osmada",
      });
      DATA.katmanDetay.osmada = {
        b: "OpenStreetMap Adaları",
        m: `Natural Earth'ün admin-0 katmanında Ege'deki küçük adacıkların çoğu YOKTUR — atlasın önceki sürümlerinde bazı adaların uydu görüntüsünde görünüp vektörde bulunmamasının sebebi budur. Bu katman doğrudan OpenStreetMap'ten çekilir: ${OSM.adalar.length} ada ve adacık, ${OSM.adalar.filter(a=>a.p.ad).length} tanesi isimli. Her birine tıklanabilir. Veri © OpenStreetMap katkıcıları, ODbL 1.0.`,
      };
    }
    if (FIR.yuklendi && !KATMAN.liste.some((k) => k.id === "firGercek")) {
      KATMAN.liste.push({
        id: "firGercek", ad: "FIR sınırları (gerçek ICAO)", grup: "Havacılık & SAR",
        gorunur: 0, renk: "#9ad1ff", detay: "firGercek",
      });
      DATA.katmanDetay.firGercek = {
        b: "Gerçek ICAO FIR Sınırları",
        m: "VATSpy Data Project'ten alınan, AIRAC döngüsüyle güncellenen resmî FIR poligonları: Atina (LGGG), İstanbul (LTBB), Ankara (LTAA), Lefkoşa (LCCC). Atlasın elle çizilmiş temsilî hatlarının yerini alır. FIR uçuş bilgi bölgesidir; egemenlik sınırı değildir — devlet (askerî) uçakları Chicago Sözleşmesi m.3 gereği ICAO planına tabi değildir.",
      };
    }
    if (typeof panelYenile === "function") panelYenile();
  }

  /* --- çizim: canliCiz zincirine takılır --- */
  const _ciz = canliCiz;
  canliCiz = function () {
    const c = $("#tuval").getContext("2d");
    const z = HARITA.gorunum.z;
    const [gx0, gy0] = HARITA.cograf(0, 0);
    const [gx1, gy1] = HARITA.cograf(c.canvas.width, c.canvas.height);
    const gorusAlani = [Math.min(gx0, gx1), Math.min(gy0, gy1), Math.max(gx0, gx1), Math.max(gy0, gy1)];
    const kesisir = (k) => !(k[2] < gorusAlani[0] || k[0] > gorusAlani[2] || k[3] < gorusAlani[1] || k[1] > gorusAlani[3]);

    /* FIR poligonları */
    if (FIR.yuklendi && KATMAN.g("firGercek")) {
      c.save();
      c.lineWidth = 1.6;
      c.setLineDash([10, 4, 2, 4]);
      for (const f of FIR.alanlar) {
        c.strokeStyle = f.p.renk;
        for (const h of f.h) {
          c.beginPath();
          h.forEach(([x, y], i) => {
            const [px, py] = HARITA.ekran(x, y);
            i ? c.lineTo(px, py) : c.moveTo(px, py);
          });
          c.stroke();
        }
      }
      c.restore();
    }

    /* OSM adaları */
    if (OSM.yuklendi && KATMAN.g("osmada")) {
      const tile = document.documentElement.dataset.tile;
      c.save();
      for (const a of OSM.adalar) {
        if (!kesisir(a.k)) continue;
        if (a.p.alan < 0.15 && z < 8.5) continue;
        if (a.p.alan < 1.2 && z < 7.0) continue;
        c.beginPath();
        for (const h of a.h) {
          h.forEach(([x, y], i) => {
            const [px, py] = HARITA.ekran(x, y);
            i ? c.lineTo(px, py) : c.moveTo(px, py);
          });
          c.closePath();
        }
        if (!tile || tile === "yok") {
          c.fillStyle = "#33505e";
          c.globalAlpha = 0.95;
          c.fill();
          c.globalAlpha = 1;
        }
        c.strokeStyle = "rgba(120,190,205,.65)";
        c.lineWidth = 1;
        c.stroke();
      }
      /* isimler */
      if (z > 7.2) {
        c.font = "10px " + getComputedStyle(document.body).fontFamily;
        c.strokeStyle = "rgba(0,0,0,.7)";
        c.lineWidth = 2.6;
        for (const a of OSM.adalar) {
          if (!a.p.ad || !kesisir(a.k)) continue;
          if (a.p.alan < 0.4 && z < 9) continue;
          const [px, py] = HARITA.ekran(a.p.x, a.p.y);
          c.fillStyle = "rgba(200,225,235,.9)";
          c.strokeText(a.p.ad, px + 4, py + 3);
          c.fillText(a.p.ad, px + 4, py + 3);
        }
      }
      c.restore();
    }

    _ciz();
  };

  /* --- tıklama --- */
  function noktaIcinde(lon, lat, halkalar) {
    let ic = false;
    for (const h of halkalar) if (HARITA.icinde([lon, lat], h)) ic = !ic;
    return ic;
  }

  const _tikla = TIKLA_EK;
  TIKLA_EK = function (lon, lat, px, py) {
    if (OSM.yuklendi && KATMAN.g("osmada")) {
      const aday = OSM.adalar.filter(
        (a) => lon >= a.k[0] - 0.002 && lon <= a.k[2] + 0.002 && lat >= a.k[1] - 0.002 && lat <= a.k[3] + 0.002
      );
      aday.sort((x, y) => x.p.alan - y.p.alan); // en küçük (en özel) ada kazansın
      for (const a of aday) {
        if (noktaIcinde(lon, lat, a.h)) {
          kart(a, px, py);
          return true;
        }
      }
    }
    return _tikla(lon, lat, px, py);
  };

  function kart(a, px, py) {
    const p = a.p;
    const yil = ZAMAN.yil;
    /* Egemenliği atlasın tarihsel katmanından oku */
    let sv = null;
    for (const pt of GEO.parts) {
      if (HARITA.poliIcinde([p.x, p.y], pt.p)) { sv = HARITA.sovKod(pt.t, yil); break; }
    }
    const s = sv ? GEO.sov[sv] : null;
    const kur = DATA.adalar.find((x) => x.ad === p.ad || (p.yerel && x.gr === p.yerel));

    const alan = p.alan >= 1 ? p.alan.toLocaleString("tr", { maximumFractionDigits: 1 }) + " km²"
               : p.alan >= 0.01 ? p.alan.toFixed(2) + " km²"
               : "≈" + (p.alan * 1e6).toFixed(0) + " m² (kayalık)";

    POP.genel(
      p.ad || "Adı OSM'de kayıtlı değil",
      `<div class="rozet-dizi">
        ${s ? `<span class="rozet" style="color:${s.renk};border-color:${s.renk}">${yil} · ${H(s.ad)}</span>` : ""}
        ${p.yerel && p.yerel !== p.ad ? `<span class="rozet rz-n">${H(p.yerel)}</span>` : ""}
        ${p.tur === "islet" ? `<span class="rozet rz-n">adacık</span>` : ""}
       </div>
       <div class="stat-satir"><span>Yüzölçümü</span><b>${alan}</b></div>
       ${p.en ? `<div class="stat-satir"><span>Uluslararası ad</span><b>${H(p.en)}</b></div>` : ""}
       ${p.el ? `<div class="stat-satir"><span>Yunanca</span><b>${H(p.el)}</b></div>` : ""}
       <div class="stat-satir"><span>Koordinat</span><b>${p.y.toFixed(4)}°K ${p.x.toFixed(4)}°D</b></div>
       ${kur && kur.aciklama ? `<p style="margin-top:8px">${H(kur.aciklama)}</p>` : ""}
       ${kur ? `<button class="hk-detay" onclick="MOD.git('adalar');setTimeout(()=>{const e=document.getElementById('ada-${kur.id}');e&&e.scrollIntoView({block:'center'})},80)">Ada dosyasını aç</button>` : ""}
       <p style="margin-top:8px;font-size:11px;color:var(--soluk)">Geometri ve ad: © OpenStreetMap katkıcıları (ODbL) · OSM kimliği: ${H(p.osm)}</p>`,
      px, py
    );
  }

  /* --- başlat --- */
  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(yukle, 400);
  else document.addEventListener("DOMContentLoaded", () => setTimeout(yukle, 400));

  window.OSM_ADA = OSM;
  window.FIR_GERCEK = FIR;
})();
