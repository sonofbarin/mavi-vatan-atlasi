#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gerçek ICAO FIR sınırlarını çeker (VATSpy Data Project — AIRAC döngüsüyle güncellenir).
Çıktı: public/data/fir.geojson  → LGGG (Atina), LTBB (İstanbul), LTAA (Ankara), LCCC (Lefkoşa)
"""
import json, os, requests

KAYNAK = "https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson"
ISTENEN = {
    "LGGG": ("Atina FIR", "#5b8ded"),
    "LTBB": ("İstanbul FIR", "#2dd4c8"),
    "LTAA": ("Ankara FIR", "#2dd4c8"),
    "LCCC": ("Lefkoşa FIR", "#e0a93f"),
}

def main():
    print("→", KAYNAK, flush=True)
    try:
        g = requests.get(KAYNAK, timeout=180,
                         headers={"User-Agent": "MaviVatanAtlasi/1.0 (egitim)"}).json()
    except Exception as e:
        if os.path.exists(os.path.join("public", "data", "fir.geojson")):
            print(f"⚠ VATSpy'a ulaşılamadı ({e}) — mevcut fir.geojson korunuyor.")
            raise SystemExit(0)
        raise

    secilen = []
    for f in g["features"]:
        kod = (f["properties"].get("id") or "").split("-")[0]
        if kod in ISTENEN:
            ad, renk = ISTENEN[kod]
            f["properties"] = {
                "kod": f["properties"].get("id"),
                "fir": kod,
                "ad": ad,
                "renk": renk,
                "not": "FIR uçuş bilgi bölgesidir; egemenlik sınırı DEĞİLDİR (Chicago Söz. m.1-3).",
            }
            secilen.append(f)

    fc = {
        "type": "FeatureCollection",
        "kaynak": "VATSpy Data Project (ICAO AIRAC)",
        "features": secilen,
    }
    yol = os.path.join("public", "data", "fir.geojson")
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with open(yol, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✓ {len(secilen)} FIR poligonu → {yol} ({os.path.getsize(yol)/1024:.0f} KB)")
    for f in secilen:
        n = sum(len(r) for r in (f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" else [c for p in f["geometry"]["coordinates"] for c in p]))
        print(f"   {f['properties']['kod']:8s} {f['properties']['ad']:16s} ~{n} nokta")

if __name__ == "__main__":
    main()
