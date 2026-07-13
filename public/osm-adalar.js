/* ============================================================
   OSM ADALARI v2 — tarih kutulu, hızlı, aranabilir
   /data/adalar.geojson : 2412 ada (OpenStreetMap, ODbL)
   /data/fir.geojson    : gerçek ICAO FIR poligonları (VATSpy)
   /data/tw.geojson     : OSM adalarından üretilmiş 6 mil kuşakları
   Dosyalar yoksa atlas eskisi gibi çalışır.
   ============================================================ */
(() => {
  if (!location.protocol.startsWith("http")) return;

  const OSM = { adalar: [], yuklendi: false };
  const FIR = { alanlar: [], yuklendi: false };
  const YOL = { buyuk: null, orta: null, kucuk: null, hazir: false };

  const halkalariAl = (g) =>
    g.type === "Polygon" ? [g.coordinates[0]]
    : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0])
    : [];
  const kutu = (hs) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const h of hs) for (const [x, y] of h) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  };

  /* ---------------- VERİ YÜKLEME ---------------- */
  async function yukle() {
    try {
      const j = await (await fetch("/data/adalar.geojson?v=20260713b", { cache: "force-cache" })).json();
      OSM.adalar = j.features
        .map((f) => ({ p: f.properties, h: halkalariAl(f.geometry) }))
        .filter((a) => a.h.length)
        .map((a) => ((a.k = kutu(a.h)), a));
      OSM.yuklendi = true;
      yollariKur();
      paletiBesle();
      bildir(`OpenStreetMap: ${OSM.adalar.length} ada yüklendi — hepsi tıklanabilir`);
    } catch (e) { console.warn("adalar.geojson:", e.message); }

    try {
      const j = await (await fetch("/data/fir.geojson?v=20260713b", { cache: "force-cache" })).json();
      FIR.alanlar = j.features.map((f) => ({ p: f.properties, h: halkalariAl(f.geometry) }));
      FIR.yuklendi = true;
    } catch (e) {}

    try {
      const j = await (await fetch("/data/tw.geojson?v=20260713b", { cache: "force-cache" })).json();
      if (j.gr6_osm?.length && GEO.tw) {
        GEO.tw.gr6 = j.gr6_osm;
        if (j.tr6_ege_osm?.length) {
          // Ege 6 mil + Karadeniz/Akdeniz 12 mil — hepsi gerçek kıyı çizgisinden üretildi
          const yeni = j.tr6_ege_osm.slice();
          if (j.tr12_kdz_osm?.length) yeni.push(...j.tr12_kdz_osm);
          if (j.tr12_akd_osm?.length) yeni.push(...j.tr12_akd_osm);
          if (!j.tr12_kdz_osm?.length && !j.tr12_akd_osm?.length) {
            // eski tw.geojson (12 mil kuşakları yok): kaba Ege-dışı halkaları koru
            const egeDisi = (GEO.tw.trcur || []).filter((h) => {
              const x = h[0][0], y = h[0][1];
              return !(x >= 19.0 && x <= 28.55 && y >= 33.9 && y <= 41.12);
            });
            yeni.push(...egeDisi);
          }
          GEO.tw.trcur = yeni;
        }
        HARITA.yolYenile ? HARITA.yolYenile() : HARITA.iste();
      }
    } catch (e) {}

    if (OSM.yuklendi || FIR.yuklendi) { katmanEkle(); HARITA.iste(); }
  }

  /* ---------------- KATMANLAR ---------------- */
  function katmanEkle() {
    const r = getComputedStyle(document.documentElement);
    if (OSM.yuklendi && !KATMAN.liste.some((k) => k.id === "osmada")) {
      KATMAN.liste.splice(3, 0, {
        id: "osmada", ad: `OSM adaları (${OSM.adalar.length})`, grup: "Temel",
        gorunur: 1, renk: r.getPropertyValue("--kara").trim() || "#2b3b46", detay: "osmada",
      });
      DATA.katmanDetay.osmada = {
        b: "OpenStreetMap Adaları",
        m: `${OSM.adalar.length} ada ve adacık — Ege, Marmara, Doğu Akdeniz, Karadeniz kıyısındaki HER formasyon. ${OSM.adalar.filter(a=>a.p.ad).length} tanesi isimli. Her birine tıklayın: egemenlik geçmişi, dayanak antlaşma, hukuki rejim ve mesafeler açılır. Veri © OpenStreetMap katkıcıları (ODbL); Natural Earth'te bulunmayan adacıkların kaynağı budur.`,
      };
    }
    if (FIR.yuklendi && !KATMAN.liste.some((k) => k.id === "firGercek")) {
      KATMAN.liste.push({
        id: "firGercek", ad: "FIR sınırları (gerçek ICAO)", grup: "Havacılık & SAR",
        gorunur: 0, renk: "#9ad1ff", detay: "firGercek",
      });
      DATA.katmanDetay.firGercek = {
        b: "Gerçek ICAO FIR Sınırları",
        m: "VATSpy verisinden, AIRAC döngüsüyle güncellenen resmî FIR poligonları: Atina (LGGG), İstanbul (LTBB), Ankara (LTAA), Lefkoşa (LCCC). FIR uçuş bilgi bölgesidir; egemenlik sınırı değildir (Chicago Söz. m.1-3).",
      };
    }
    if (typeof panelKur === "function") { panelKur(); typeof panelYenile === "function" && panelYenile(); }
  }

  /* ---------------- ÇİZİM: Path2D önbelleği ---------------- */
  /* dünya → normalize Web Mercator karesi (0..1). nY, index.html'deki ly'nin
     ws çarpansız hâliyle BİREBİR aynı olmalı — böylece dönüşüm izotrop kalır. */
  const nx = (lon) => (lon + 180) / 360;
  const nY = (lat) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };

  function yollariKur() {
    const sinif = { buyuk: new Path2D(), orta: new Path2D(), kucuk: new Path2D() };
    for (const a of OSM.adalar) {
      const hedef = a.p.alan >= 1.2 ? sinif.buyuk : a.p.alan >= 0.15 ? sinif.orta : sinif.kucuk;
      for (const h of a.h) {
        hedef.moveTo(nx(h[0][0]), nY(h[0][1]));
        for (let i = 1; i < h.length; i++) hedef.lineTo(nx(h[i][0]), nY(h[i][1]));
        hedef.closePath();
      }
    }
    Object.assign(YOL, sinif, { hazir: true });
  }

  const _ciz = canliCiz;
  canliCiz = function () {
    const c = $("#tuval").getContext("2d");
    const z = HARITA.gorunum.z;

    if (FIR.yuklendi && KATMAN.g("firGercek")) {
      c.save(); c.lineWidth = 1.6; c.setLineDash([10, 4, 2, 4]);
      for (const f of FIR.alanlar) {
        c.strokeStyle = f.p.renk;
        for (const h of f.h) {
          c.beginPath();
          h.forEach(([x, y], i) => { const [px, py] = HARITA.ekran(x, y); i ? c.lineTo(px, py) : c.moveTo(px, py); });
          c.stroke();
        }
      }
      c.restore();
    }

    if (OSM.yuklendi && YOL.hazir && KATMAN.g("osmada")) {
      /* normalize Mercator karesi → ekran: gerçek projeksiyonla birebir uyuşan izotrop matris.
         (Eski afin matris lat'ı düz çizgiyle yaklaşıklıyordu → adalar enleme göre ~100px'e
          varan sapmayla güneye kayıp kıyıdan kopuk "hayalet" bırakıyordu.) */
      const [px0, py0] = HARITA.ekran(0, 0);    // nx=0.5, nY=0.5
      const [px1]      = HARITA.ekran(90, 0);   // nx=0.75  → yatay ölçek
      const [, py1]    = HARITA.ekran(0, 60);   // nY(60)   → dikey ölçek
      const sx = (px1 - px0) / (nx(90) - nx(0));
      const sy = (py1 - py0) / (nY(60) - nY(0));
      /* Ana harita ctx'i dpr ile ölçekli çizer (ciz(): setTransform(dpr,..)); ama
         ekran() CSS-piksel döndürür. setTransform mutlak olduğu için matrisi dpr ile
         çarpmazsak yüksek-DPI ekranlarda (Windows %125+, retina) adalar yarı ölçek/
         kaymış "HAYALET" olur — dpr=1'de fark yoktur, o yüzden gözden kaçar.
         dpr'yi canvas'tan türet: cv.width(aygıt) / clientWidth(CSS) = harita ile birebir. */
      const dpr = (c.canvas.width / c.canvas.clientWidth) || 1;
      const tile = document.documentElement.dataset.tile;
      c.save();
      c.setTransform(sx * dpr, 0, 0, sy * dpr, (px0 - sx * nx(0)) * dpr, (py0 - sy * nY(0)) * dpr);
      const doldur = !tile || tile === "yok";
      const parti = (p) => {
        if (doldur) { c.fillStyle = "#33505e"; c.globalAlpha = 0.95; c.fill(p); c.globalAlpha = 1; }
        c.strokeStyle = "rgba(120,190,205,.6)"; c.lineWidth = 1 / Math.abs(sx); c.stroke(p);
      };
      parti(YOL.buyuk);
      if (z > 6.2) parti(YOL.orta);
      if (z > 8.0) parti(YOL.kucuk);
      c.restore();

      if (z > 7.2) {
        c.font = "10px " + getComputedStyle(document.body).fontFamily;
        c.strokeStyle = "rgba(0,0,0,.7)"; c.lineWidth = 2.6;
        const W = c.canvas.width, Hh = c.canvas.height;
        for (const a of OSM.adalar) {
          if (!a.p.ad) continue;
          if (a.p.alan < 0.4 && z < 9) continue;
          if (DATA.adalar.some((x) => x.ad === a.p.ad)) continue;   // atlasın kendi etiketi var
          const [px, py] = HARITA.ekran(a.p.x, a.p.y);
          if (px < -40 || py < -20 || px > W + 20 || py > Hh + 20) continue;
          c.fillStyle = "rgba(200,225,235,.9)";
          c.strokeText(a.p.ad, px + 4, py + 3); c.fillText(a.p.ad, px + 4, py + 3);
        }
      }
    }
    _ciz();
  };

  /* ---------------- TARİH TÜRETME ---------------- */
  const IN = (p, x0, y0, x1, y1) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const TL = {
    oniki:  [[1780, "OSM"], [1912, "IT"], [1947, "GR"]],
    dogu:   [[1780, "OSM"], [1912, "GR"]],
    kiklad: [[1780, "OSM"], [1830, "GR"]],
    iyon:   [[1780, "YED"], [1815, "GB"], [1864, "GR"]],
    girit:  [[1780, "OSM"], [1898, "GRT"], [1913, "GR"]],
    kibris: [[1780, "OSM"], [1878, "GB"], [1960, "CY"], [1974, "CYR"]],
  };
  const REJIM = {
    oniki: { b: "Onikiada rejimi", ant: ["par47", "loz"],
      m: "1912'de İtalya işgal etti; Lozan m.15 (1923) adaları hukuken İtalya'ya bıraktı; 1947 Paris Antlaşması m.14, 'silahsızlandırılmış olarak' Yunanistan'a devretti. Türkiye 1947'nin tarafı değildir ve gayri askerî statünün ihlalini BM nezdinde belgelemiştir." },
    meis:  { b: "Meis grubu (Onikiada)", ant: ["par47", "z32o"],
      m: "1947 Paris m.14 ile Yunanistan'a geçen Onikiada'nın en doğu ucudur. 1932 TR–İtalya Sözleşmesi yalnız Meis çevresinde deniz sınırı çizmişti; Türk tezine göre bu grup ancak karasuyu kadar alan üretir (enklav — 1977 İngiltere-Fransa tahkimi emsali)." },
    dogu:  { b: "Doğu Ege rejimi (Lozan m.12-13)", ant: ["loz", "k1914", "atina13"],
      m: "1912-13 Balkan Savaşı'nda Yunan donanması işgal etti; 1914 Altı Büyük Devlet Kararı ve Lozan m.12 Yunan egemenliğini tanıdı. Lozan m.13 ise adaların SİLAHSIZ kalmasını şart koştu — bugünkü silahlandırma tartışmasının hukuki kaynağı budur." },
    kiklad:{ b: "1830 çekirdeği", ant: ["lon1830"],
      m: "Londra Protokolü (1830) ile kurulan bağımsız Yunanistan'a bırakılan çekirdek adalardandır; Osmanlı'dan büyük devlet kararıyla koptu. Ege'deki ada kaybı zincirinin ilk halkasıdır." },
    iyon:  { b: "İyon (Yedi Ada) rejimi", ant: [],
      m: "1800-1807'de Rus-Osmanlı ortak himayesindeki Yedi Ada Cumhuriyeti'nin parçasıydı — tarihteki ilk özerk Yunan devleti. 1815 Viyana düzeniyle Britanya himayesine girdi, 1864 devir antlaşmasıyla Yunanistan'a katıldı." },
    girit: { b: "Girit rejimi", ant: ["lon13", "atina13"],
      m: "1898'de büyük devletlerin zoruyla özerk Girit Devleti kuruldu (Osmanlı hükümranlığı kâğıt üstünde sürdü); 1913 Londra ve Atina antlaşmalarıyla Yunanistan'a katıldı." },
    kibris:{ b: "Kıbrıs rejimi", ant: ["loz"],
      m: "1571 Osmanlı fethi; 1878'de idaresi Britanya'ya devredildi, 1914'te ilhak edildi, Lozan m.20 ile tanındı. 1960'ta garanti sistemine dayalı ortaklık cumhuriyeti kuruldu; 1974'ten beri ada fiilen iki kesimdir." },
    tr:    { b: "Türk adası", ant: ["loz"],
      m: "Lozan m.12 gereği Anadolu kıyısının 3 mil içindeki adalar ile m.14'te sayılan İmroz (Gökçeada), Bozcaada ve Tavşan Adaları Türkiye'nindir. Marmara'daki adalar Türk iç sularındadır — karasuyu rejimi bile uygulanmaz, egemenlik karadaki kadar tamdır." },
    iht:   { b: "Statüsü ihtilaflı (EGAYDAAK)", ant: ["loz", "z32"],
      m: "Türkiye'ye göre egemenliği antlaşmalarla devredilmemiş formasyondur: ismen sayılmamış, 3 mil dışında ve 1932 zaptı onaysızdır. Yunanistan fiilen kontrol eder veya egemenlik iddia eder; aidiyet ancak müzakereyle çözülebilir." },
  };

  function enYakinParca(p) {
    let en = null, uzak = 9e9;
    for (const pt of GEO.parts) {
      for (const h of pt.p) {
        for (let i = 0; i < h.length; i += 3) {
          const d = (h[i][0] - p.x) * (h[i][0] - p.x) * 0.62 + (h[i][1] - p.y) * (h[i][1] - p.y);
          if (d < uzak) { uzak = d; en = pt; }
        }
      }
    }
    return { pt: en, d2: uzak };
  }

  function tarihce(p) {
    for (const pt of GEO.parts) if (HARITA.poliIcinde([p.x, p.y], pt.p)) {
      const sv = HARITA.sovKod(pt.t, 2026);
      if (sv === "IHT") return { tl: pt.t, r: REJIM.iht };
      return { tl: pt.t, r: null, parca: true };
    }
    const yk = enYakinParca(p);
    const ykSv = yk.pt ? HARITA.sovKod(yk.pt.t, 2026) : null;
    if (IN(p, 31.8, 34.4, 35.8, 36.0))  return { tl: TL.kibris, r: REJIM.kibris };
    if (IN(p, 29.2, 35.9, 30.15, 36.45)) {
      if (ykSv === "TR" && yk.d2 < 0.000144) return { tl: yk.pt.t, r: REJIM.tr, turetildi: true };   // Kaş liman kayalıkları
      return { tl: TL.oniki, r: REJIM.meis };
    }
    if (IN(p, 26.10, 35.15, 29.20, 37.50)) {
      if (ykSv === "TR" && yk.d2 < 0.0016) return { tl: yk.pt.t, r: REJIM.tr, turetildi: true };     // Gökova/Hisarönü Türk adacıkları
      return { tl: TL.oniki, r: REJIM.oniki };
    }
    if (IN(p, 19.0, 36.0, 21.5, 40.25) || IN(p, 22.7, 35.7, 23.45, 36.65)) return { tl: TL.iyon, r: REJIM.iyon };
    if (IN(p, 23.2, 34.55, 26.65, 35.95)) return { tl: TL.girit, r: REJIM.girit };
    if (IN(p, 24.55, 37.35, 27.45, 41.06)) return { tl: TL.dogu, r: REJIM.dogu };
    if (IN(p, 22.6, 36.1, 26.1, 39.55))  return { tl: TL.kiklad, r: REJIM.kiklad };
    if (yk.pt) {
      return { tl: yk.pt.t, r: ykSv === "TR" ? REJIM.tr : null, turetildi: true };
    }
    return { tl: [[1780, "OSM"]], r: null };
  }

  /* ---------------- MESAFE (tıklamada, örneklemeli) ---------------- */
  let KIYI = null;
  function kiyilar() {
    if (KIYI) return KIYI;
    KIYI = { TR: [], GR: [] };
    for (const pt of GEO.parts) {
      const sv = HARITA.sovKod(pt.t, 2026);
      if (sv !== "TR" && sv !== "GR") continue;
      const buyukMu = pt.p.some((h) => h.length > 260);
      if (!buyukMu) continue;                       // anakaralar + dev adalar
      for (const h of pt.p) for (let i = 0; i < h.length; i += 4) KIYI[sv].push(h[i]);
    }
    return KIYI;
  }
  function mesafe(p, taraf) {
    const k = kiyilar()[taraf];
    let en = 9e9;
    for (const [x, y] of k) {
      const d = (x - p.x) * (x - p.x) * 0.62 + (y - p.y) * (y - p.y);
      if (d < en) en = d;
    }
    return Math.sqrt(en) * 111.32;
  }

  /* ---------------- TARİH KUTUSU ---------------- */
  function antButonlari(ids) {
    return (ids || []).map((id) => {
      const a = DATA.antlasmalar.find((x) => x.id === id);
      return a ? `<button class="hk-detay" onclick="MOD.git('antlasmalar');setTimeout(()=>{const e=document.getElementById('ant-${a.id}');if(e){e.scrollIntoView({block:'center'});e.style.outline='2px solid var(--tr)'}},90)">${a.yil} · ${H(a.ad)} →</button>` : "";
    }).join("");
  }

  function kart(a, px, py, clon, clat) {
    const p = a.p, yil = ZAMAN.yil;
    // Büyük ada (ör. Kıbrıs) iki egemenlik parçasına bölünmüşse, adanın merkezi değil
    // TIKLANAN nokta egemenliği belirler — yoksa kuzeye tıklasan da merkez güneyde kalır.
    const T = tarihce(clon != null ? { x: clon, y: clat } : p);
    const sv = HARITA.sovKod(T.tl, yil);
    const s = GEO.sov[sv];
    const kur = DATA.adalar.find((x) => x.ad === p.ad || (p.yerel && x.gr === p.yerel) || (p.el && x.gr === p.el));

    const zaman = T.tl.map((e) => {
      const g = GEO.sov[e[1]];
      return `<div class="stat-satir"><span>${e[0] === 1780 ? "1780 öncesi" : e[0]}</span><b style="color:${g ? g.renk : ""}">${g ? H(g.ad) : e[1]}</b></div>`;
    }).join("");

    const alan = p.alan >= 1 ? p.alan.toLocaleString("tr", { maximumFractionDigits: 1 }) + " km²"
               : p.alan >= 0.01 ? p.alan.toFixed(2) + " km²"
               : "≈" + Math.round(p.alan * 1e6).toLocaleString("tr") + " m²";
    const dTR = mesafe(p, "TR"), dGR = mesafe(p, "GR");
    const kaya = p.alan < 0.5;
    const dm = kur && kur.demil && kur.demil !== "-" ?
      `<span class="rozet ${kur.ihlal ? "rz-teh" : "rz-n"}">${{ L13: "Lozan m.13", P47: "Paris '47 m.14", BOG: "Boğazlar Söz." }[kur.demil] || kur.demil}${kur.ihlal ? " · İHLAL" : ""}</span>` : "";

    POP.genel(
      p.ad || "Adı OSM'de kayıtlı değil",
      `<div class="rozet-dizi">
        ${s ? `<span class="rozet" style="color:${s.renk};border-color:${s.renk}">${yil} · ${H(s.ad)}</span>` : ""}
        ${p.yerel && p.yerel !== p.ad ? `<span class="rozet rz-n">${H(p.yerel)}</span>` : ""}${dm}
        ${sv === "IHT" ? `<span class="rozet rz-teh">EGAYDAAK</span>` : ""}
       </div>
       <div class="stat-satir"><span>Yüzölçümü</span><b>${alan}</b></div>
       <div class="stat-satir"><span>Türk kıyısına</span><b>${dTR.toFixed(1)} km <span style="color:var(--soluk)">(${(dTR / 1.852).toFixed(1)} dm)</span></b></div>
       <div class="stat-satir"><span>Yunan kıyısına</span><b>${dGR.toFixed(1)} km</b></div>
       ${p.en || p.el ? `<div class="stat-satir"><span>Diğer adlar</span><b>${H([p.en, p.el].filter(Boolean).join(" · "))}</b></div>` : ""}

       <p style="margin-top:8px;font-size:12px;color:var(--soluk)">Egemenlik geçmişi${T.turetildi ? " (en yakın kıyıdan türetildi)" : ""}:</p>
       ${zaman}

       ${T.r ? `<p style="margin-top:8px"><b style="color:var(--tr)">${H(T.r.b)}</b><br>${H(T.r.m)}</p>` : ""}
       ${kur && kur.aciklama ? `<p style="margin-top:7px">${H(kur.aciklama)}</p>` : ""}
       ${kaya ? `<p style="margin-top:7px;font-size:12.5px;color:var(--uyari)">Kayalık ölçeği: UNCLOS m.121/3'e göre insan yaşamına elverişsiz kayalıklar MEB ve kıta sahanlığı üretmez — küçük formasyonlara "tam etki" veren iddialara karşı Türk tezinin dayanaklarındandır.</p>` : ""}

       ${T.r ? antButonlari(T.r.ant) : ""}
       ${kur ? `<button class="hk-detay" onclick="MOD.git('adalar');setTimeout(()=>{const e=document.getElementById('ada-${kur.id}');e&&e.scrollIntoView({block:'center'})},80)">Ada dosyasını aç</button>` : ""}
       ${p.ad ? `<button class="hk-detay" onclick="window.open('https://tr.wikipedia.org/wiki/%C3%96zel:Ara?search='+encodeURIComponent('${H(p.ad)} adası'),'_blank')">Vikipedi'de ara ↗</button>` : ""}
       <p style="margin-top:8px;font-size:11px;color:var(--soluk)">Geometri/ad: © OpenStreetMap (ODbL) · ${H(p.osm)} · Mesafeler kıyı örneklemesinden, yaklaşıktır.</p>`,
      px, py
    );
  }

  /* ---------------- TIKLAMA ---------------- */
  const icinde = (lon, lat, hs) => { let ic = false; for (const h of hs) if (HARITA.icinde([lon, lat], h)) ic = !ic; return ic; };
  const _tikla = TIKLA_EK;
  TIKLA_EK = function (lon, lat, px, py) {
    if (OSM.yuklendi && KATMAN.g("osmada")) {
      const aday = OSM.adalar.filter((a) =>
        lon >= a.k[0] - 0.002 && lon <= a.k[2] + 0.002 && lat >= a.k[1] - 0.002 && lat <= a.k[3] + 0.002);
      aday.sort((x, y) => x.p.alan - y.p.alan);
      for (const a of aday) if (icinde(lon, lat, a.h)) { kart(a, px, py, lon, lat); return true; }
    }
    return _tikla(lon, lat, px, py);
  };

  /* ---------------- Ctrl+K: 2412 ada aranabilir ---------------- */
  function paletiBesle() {
    if (typeof PALET === "undefined" || !PALET.dizin) return;
    for (const a of OSM.adalar) {
      if (!a.p.ad) continue;
      PALET.dizin.push({
        tip: "Ada", ad: a.p.ad + (a.p.yerel && a.p.yerel !== a.p.ad ? " · " + a.p.yerel : ""),
        f: () => { MOD.git("harita"); HARITA.git(a.p.x, a.p.y, Math.max(8.6, HARITA.gorunum.z)); setTimeout(() => kart(a, innerWidth / 2, innerHeight / 2), 220); },
      });
    }
  }

  window.OSM_ADA = OSM; window.FIR_GERCEK = FIR; window.ADA_KART = kart;

  if (document.readyState !== "loading") setTimeout(yukle, 350);
  else document.addEventListener("DOMContentLoaded", () => setTimeout(yukle, 350));
})();
