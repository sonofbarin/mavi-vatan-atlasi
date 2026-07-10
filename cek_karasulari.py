#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Karasuları kuşaklarını yeniden üretir — OSM'den gelen 2412 adanın TAMAMI dahil.

Aidiyet yöntemi (atlasın v3 üretimiyle aynı mantık):
  1) Ad istisnaları (Gökçeada, Bozcaada, İmralı, Marmara adaları…)        → TR
  2) Onikiada + Meis kutuları (Paris 1947 m.14)                           → GR
  3) Sakız-Midilli-Sisam-Limni vb. büyük Doğu Ege adaları zaten OSM'de GR → en yakın anakara
  4) Kalanlar: ölçekli mesafeyle EN YAKIN ANAKARA (TR/GR) hangisiyse o

Anakara geometrisi: Natural Earth 10m admin-0 (kamu malı, raw.githubusercontent).
Çıktı: public/data/tw.geojson  → gr6_osm (tam ikame), tr6_ege_osm (yalnız Ege; 
Akdeniz/Karadeniz 12 mil halkaları istemcide korunur).
"""
import json, math, os, urllib.request
from shapely.geometry import shape, box
from shapely.ops import unary_union
from shapely import affinity

NM6 = 6 * 1.852 / 111.32
K = math.cos(math.radians(37.5))
EGE = box(19.0, 33.9, 28.55, 41.12)              # v3 üretimindeki Ege kutusuyla aynı
ONIKI = box(26.10, 35.15, 29.20, 37.50)
MEIS = box(29.20, 35.90, 30.15, 36.45)
TR_AD = ("Gökçeada", "İmroz", "Bozcaada", "Tenedos", "İmralı", "Marmara", "Avşa",
         "Paşalimanı", "Ekinlik", "Büyükada", "Heybeliada", "Burgazada", "Kınalıada",
         "Uzunada", "Tavşan", "Alibey", "Cunda", "Garip", "Çıplak", "Salih", "Gökada")

NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson"

def anakaralar():
    yol = "/tmp/ne10.geojson"
    if not os.path.exists(yol):
        print("→ Natural Earth indiriliyor…", flush=True)
        urllib.request.urlretrieve(NE_URL, yol)
    fc = json.load(open(yol, encoding="utf-8"))
    out = {}
    for f in fc["features"]:
        ad = f["properties"].get("ADMIN")
        if ad in ("Turkey", "Greece"):
            g = shape(f["geometry"])
            en = max((p for p in (g.geoms if g.geom_type == "MultiPolygon" else [g])), key=lambda p: p.area)
            out["TR" if ad == "Turkey" else "GR"] = en
    assert "TR" in out and "GR" in out
    return out["TR"], out["GR"]

def main():
    fc = json.load(open("public/data/adalar.geojson", encoding="utf-8"))
    TRana, GRana = anakaralar()
    TRs = affinity.scale(TRana, xfact=K, yfact=1, origin=(0, 0))
    GRs = affinity.scale(GRana, xfact=K, yfact=1, origin=(0, 0))

    DOGU_EGE = box(24.5, 35.0, 28.6, 41.05)   # Midilli-Sakız-Sisam kuşağı: büyük ada + isim-TR değil → GR
    KARDAK = box(27.10, 37.02, 27.21, 37.09)  # EGAYDAAK: hiçbir kuşağa girmez

    kayit = []
    for f in fc["features"]:
        g = shape(f["geometry"])
        if g.is_empty:
            continue
        p = f["properties"]
        ad = (p.get("ad") or "") + "|" + (p.get("yerel") or "") + "|" + (p.get("en") or "")
        kayit.append((g, p, ad, g.representative_point()))

    tr, gr = [], []
    buyukler = []   # (geom_scaled, taraf)

    # 1. GEÇİŞ — büyük adalar (≥15 km²)
    for g, p, ad, rp in kayit:
        if p["alan"] < 15:
            continue
        if any(k in ad for k in TR_AD):
            taraf = "TR"
        elif ONIKI.contains(rp) or MEIS.contains(rp) or DOGU_EGE.contains(rp):
            taraf = "GR"
        else:
            gs = affinity.scale(g, xfact=K, yfact=1, origin=(0, 0))
            taraf = "TR" if TRs.distance(gs) < GRs.distance(gs) else "GR"
        (tr if taraf == "TR" else gr).append(g)
        buyukler.append((affinity.scale(g, xfact=K, yfact=1, origin=(0, 0)), taraf))

    # 2. GEÇİŞ — adacıklar: en yakın KARA (anakara veya atanmış büyük ada)
    adaylar = [(TRs, "TR"), (GRs, "GR")] + buyukler
    atlanan = 0
    for g, p, ad, rp in kayit:
        if p["alan"] >= 15:
            continue
        if KARDAK.contains(rp):
            atlanan += 1; continue                    # ihtilaflı: kuşaksız
        if any(k in ad for k in TR_AD):
            tr.append(g); continue
        gs = affinity.scale(g, xfact=K, yfact=1, origin=(0, 0))
        dTR = TRs.distance(gs)
        if MEIS.contains(rp):
            # Meis grubu Yunan'dır (Paris 1947) — ama Kaş limanı kayalıkları (<~1 km) Türk'tür
            (gr if dTR > 0.012 else tr).append(g); continue
        if ONIKI.contains(rp):
            # Onikiada kuşağı Yunan — ama Gökova/Hisarönü gibi körfez içi Türk adacıkları (<~3,7 km) hariç
            (gr if dTR > 0.040 else tr).append(g); continue
        enTaraf, enUzak = "GR", 9e9
        for kara, taraf in adaylar:
            d = kara.distance(gs)
            if d < enUzak:
                enUzak, enTaraf = d, taraf
        (tr if enTaraf == "TR" else gr).append(g)

    print(f"aidiyet: TR={len(tr)}  GR={len(gr)}  ihtilaflı(kuşaksız)={atlanan}")

    def tampon(geoms):
        u = unary_union(geoms)
        s = affinity.scale(u, xfact=K, yfact=1, origin=(0, 0))
        b = s.buffer(NM6, quad_segs=6)
        return affinity.scale(b, xfact=1 / K, yfact=1, origin=(0, 0))

    gr6 = tampon([GRana] + gr)                       # Yunan: anakara + tüm adaları, tam ikame
    tr6 = tampon([TRana] + tr).intersection(EGE)     # Türk: yalnız Ege kesiti (6 mil bölgesi)

    def halkalar(g, tol=0.0045):
        g = g.simplify(tol, preserve_topology=True)
        out = []
        for p in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            if p.area < 8e-6:
                continue
            h = [[round(x, 4), round(y, 4)] for x, y in p.exterior.coords]
            if len(h) >= 4:
                out.append(h)
        return out

    cikti = {
        "uretim": fc.get("uretim"),
        "not": "OSM adaları + NE anakaralarından üretilmiş 6 mil kuşakları (geometrik yaklaşım; resmî esas hat değildir).",
        "gr6_osm": halkalar(gr6),
        "tr6_ege_osm": halkalar(tr6),
    }
    os.makedirs("public/data", exist_ok=True)
    with open("public/data/tw.geojson", "w", encoding="utf-8") as f:
        json.dump(cikti, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ gr6: {len(cikti['gr6_osm'])} halka · tr6(Ege): {len(cikti['tr6_ege_osm'])} halka")
    print(f"✓ dosya: public/data/tw.geojson ({os.path.getsize('public/data/tw.geojson')/1024:.0f} KB)")

if __name__ == "__main__":
    main()
