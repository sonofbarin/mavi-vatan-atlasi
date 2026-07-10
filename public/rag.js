/* ============================================================
   RAG — Atlasın kendi metinlerinden cevap
   Soru gelince /data/bilgi.json içinden ilgili parçaları bulur,
   modele "yalnız bunlardan cevapla" diye verir.
   Amaç: küçük/ücretsiz modellerin antlaşma uydurmasını bitirmek.
   ============================================================ */
(() => {
  const BILGI = { parca: [], hazir: false };

  /* Türkçe için kaba ama etkili kök alma: son ekleri kırp */
  const EKLER = [
    "larının", "lerinin", "ların", "lerin", "ları", "leri", "lar", "ler",
    "sının", "sinin", "nın", "nin", "nun", "nün", "ın", "in", "un", "ün",
    "dan", "den", "tan", "ten", "da", "de", "ta", "te",
    "ya", "ye", "a", "e", "ı", "i", "u", "ü",
  ];
  const kok = (k) => {
    k = k.toLowerCase().replace(/[^\wçğıöşü]/g, "");
    if (k.length <= 4) return k;
    for (const e of EKLER) if (k.length - e.length >= 4 && k.endsWith(e)) return k.slice(0, -e.length);
    return k;
  };
  const kelimeler = (s) =>
    s.toLowerCase().split(/[^\wçğıöşü]+/).filter((k) => k.length > 2).map(kok);

  const DURDUR = new Set(["nedir", "nasıl", "hangi", "için", "olan", "veya", "daha", "ile", "bir", "bu", "şu", "mi", "mu"]);

  /* eşanlamlılar: kullanıcı farklı yazsa da doğru parçayı bulsun */
  const ES = {
    meis: ["kastellorizo", "megisti"],
    kardak: ["imia", "egaydaak"],
    "kıta": ["sahanlık", "sahanlığı"],
    meb: ["münhasır", "ekonomik", "bölge"],
    fir: ["uçuş", "bilgi", "bölgesi", "atina", "istanbul"],
    sevilla: ["sevil"],
    casus: ["belli", "savaş", "sebebi"],
    egaydaak: ["kardak", "aidiyeti", "tartışmalı"],
    lozan: ["1923"],
    montrö: ["boğazlar", "montreux"],
    onikiada: ["paris", "1947", "rodos", "istanköy"],
    sar: ["arama", "kurtarma"],
    parsel: ["gkry", "ruhsat", "afrodit"],
  };

  async function yukle() {
    try {
      const r = await fetch("/data/bilgi.json", { cache: "force-cache" });
      if (!r.ok) throw new Error("bilgi.json yok");
      const j = await r.json();
      BILGI.parca = j.parca.map((p) => {
        const havuz = kelimeler(p.baslik + " " + p.metin);
        const sayac = new Map();
        for (const k of havuz) sayac.set(k, (sayac.get(k) || 0) + 1);
        return { ...p, sayac, basKok: new Set(kelimeler(p.baslik)) };
      });
      BILGI.hazir = true;
      console.log(`RAG: ${BILGI.parca.length} bilgi parçası yüklendi`);
    } catch (e) {
      console.warn("RAG kapalı:", e.message);
    }
  }

  function ara(soru, adet = 6) {
    if (!BILGI.hazir) return [];
    let anahtar = kelimeler(soru).filter((k) => !DURDUR.has(k));
    for (const k of [...anahtar]) if (ES[k]) anahtar.push(...ES[k].map(kok));
    if (!anahtar.length) return [];

    const puanli = BILGI.parca.map((p) => {
      let puan = 0;
      for (const k of anahtar) {
        const n = p.sayac.get(k) || 0;
        if (n) puan += 1 + Math.log(1 + n);
        if (p.basKok.has(k)) puan += 2.5;          // başlıkta geçiyorsa ağır bas
      }
      if (p.tur === "antlasma" || p.tur === "tez") puan *= 1.15;
      return { p, puan };
    });

    const sirali = puanli.filter((x) => x.puan > 1.2).sort((a, b) => b.puan - a.puan);
    if (!sirali.length || sirali[0].puan < 4.0) return [];   // konu dışı → bağlam yok → AI cevap vermez
    return sirali.slice(0, adet).map((x) => x.p);
  }

  function baglam(soru) {
    const bulunan = ara(soru);
    if (!bulunan.length) return { metin: "", kaynaklar: [] };
    const metin = bulunan
      .map((p, i) => `[${i + 1}] ${p.baslik.toUpperCase()} (${p.tur})\n${p.metin}`)
      .join("\n\n");
    return { metin, kaynaklar: bulunan.map((p) => p.baslik) };
  }

  window.RAG = { yukle, ara, baglam, BILGI };

  document.addEventListener("DOMContentLoaded", () => setTimeout(yukle, 200));
  if (document.readyState !== "loading") setTimeout(yukle, 200);
})();
