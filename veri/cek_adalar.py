#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenStreetMap'ten Ege · Doğu Akdeniz · Marmara · Karadeniz kıyısındaki
BÜTÜN adaları ve adacıkları çeker (isimleriyle birlikte).

Çıktı: public/data/adalar.geojson
Lisans: © OpenStreetMap katkıcıları, ODbL 1.0 — atıf zorunludur.

GitHub Actions içinde çalışır; kimsenin bilgisayarında terminal açmasına gerek yok.
"""
import json, math, os, sys, time
import requests
from shapely.geometry import Polygon, MultiPolygon, mapping, LineString
from shapely.ops import linemerge, polygonize, unary_union

# (güney, batı, kuzey, doğu)
KUTU = (34.0, 22.0, 42.5, 36.5)

SORGU = f"""
[out:json][timeout:600];
(
  way["place"~"^(island|islet)$"]({KUTU[0]},{KUTU[1]},{KUTU[2]},{KUTU[3]});
  relation["place"~"^(island|islet)$"]({KUTU[0]},{KUTU[1]},{KUTU[2]},{KUTU[3]});
);
out geom;
"""

SUNUCULAR = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]
UA = "MaviVatanAtlasi/1.0 (egitim amacli; github.com/sonofbarin/mavi-vatan-atlasi)"


def cek():
    son = None
    for sunucu in SUNUCULAR:
        for deneme in range(3):
            try:
                print(f"→ {sunucu} (deneme {deneme+1})", flush=True)
                c = requests.post(sunucu, data={"data": SORGU},
                                  headers={"User-Agent": UA}, timeout=900)
                if c.status_code == 200:
                    return c.json()
                print(f"   HTTP {c.status_code}", flush=True)
                son = f"HTTP {c.status_code}"
            except Exception as e:
                son = str(e)
                print("   hata:", son, flush=True)
            time.sleep(20)
    yol = os.path.join("public", "data", "adalar.geojson")
    if os.path.exists(yol):
        print(f"⚠ Overpass şu an cevap vermiyor ({son}) — depodaki mevcut adalar.geojson korunuyor.")
        raise SystemExit(0)
    raise SystemExit("Overpass'tan veri alınamadı: " + str(son))


def halka(geom):
    """Overpass 'out geom' çıktısındaki nokta dizisini kapalı halkaya çevirir."""
    p = [(g["lon"], g["lat"]) for g in geom]
    if len(p) < 4:
        return None
    if p[0] != p[-1]:
        p.append(p[0])
    try:
        poly = Polygon(p)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly if (not poly.is_empty and poly.area > 0) else None
    except Exception:
        return None


def rel_poligon(el):
    """Çok parçalı (multipolygon) ilişkiyi dış halkalardan kurar."""
    dis, ic = [], []
    for uye in el.get("members", []):
        if uye.get("type") != "way" or "geometry" not in uye:
            continue
        cizgi = LineString([(g["lon"], g["lat"]) for g in uye["geometry"]])
        (dis if uye.get("role") != "inner" else ic).append(cizgi)
    if not dis:
        return None
    try:
        d = list(polygonize(linemerge(dis)))
        if not d:
            return None
        govde = unary_union(d)
        if ic:
            i = list(polygonize(linemerge(ic)))
            if i:
                govde = govde.difference(unary_union(i))
        return govde if not govde.is_empty else None
    except Exception:
        return None


def alan_km2(g):
    la = g.centroid.y
    k = math.cos(math.radians(la))
    return abs(g.area) * (111.32 ** 2) * k


def ad_sec(t):
    for anahtar in ("name:tr", "name"):
        if t.get(anahtar):
            return t[anahtar]
    return None


def main():
    veri = cek()
    ozellikler = []
    atlanan = 0

    for el in veri.get("elements", []):
        t = el.get("tags", {}) or {}
        if el["type"] == "way" and "geometry" in el:
            g = halka(el["geometry"])
        elif el["type"] == "relation":
            g = rel_poligon(el)
        else:
            g = None
        if g is None or g.is_empty:
            atlanan += 1
            continue

        g = g.simplify(0.00015, preserve_topology=True)
        if g.is_empty:
            atlanan += 1
            continue

        km2 = alan_km2(g)
        merkez = g.representative_point()
        ozellikler.append({
            "type": "Feature",
            "geometry": mapping(g),
            "properties": {
                "ad": ad_sec(t),
                "yerel": t.get("name"),
                "en": t.get("name:en"),
                "el": t.get("name:el"),
                "tur": t.get("place"),
                "alan": round(km2, 3),
                "x": round(merkez.x, 5),
                "y": round(merkez.y, 5),
                "osm": f"{el['type'][0]}{el['id']}",
            },
        })

    ozellikler.sort(key=lambda f: -f["properties"]["alan"])
    fc = {
        "type": "FeatureCollection",
        "lisans": "© OpenStreetMap katkıcıları, ODbL 1.0",
        "uretim": time.strftime("%Y-%m-%d"),
        "kutu": KUTU,
        "features": ozellikler,
    }

    yol = os.path.join("public", "data", "adalar.geojson")
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with open(yol, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))

    isimli = sum(1 for f in ozellikler if f["properties"]["ad"])
    print(f"\n✓ {len(ozellikler)} ada/adacık  ({isimli} isimli, {len(ozellikler)-isimli} isimsiz, {atlanan} atlandı)")
    print(f"✓ dosya: {yol}  ({os.path.getsize(yol)/1024:.0f} KB)")
    print("\nEn büyük 12:")
    for f in ozellikler[:12]:
        p = f["properties"]
        print(f"   {p['alan']:9.1f} km²  {p['ad'] or '(isimsiz)'}")


if __name__ == "__main__":
    main()
