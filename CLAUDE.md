# CLAUDE.md — Mavi Vatan Atlası proje aktarımı

> Bu dosya, projenin Claude (claude.ai sohbeti) ile inşa edilen bölümünün Claude Code'a devri için yazıldı.
> Depo köküne konur; Claude Code her oturumda otomatik okur. Son güncelleme: 2026-07-13.

## 1. Proje nedir, kimin için

**Mavi Vatan Atlası**, Türkiye'nin deniz yetki alanlarını (Ege · Doğu Akdeniz · Karadeniz) öğreten,
herkese açık, Türkçe bir eğitim sitesidir. Hedef kitle: öğrenmek isteyen herkes — lise öğrencisinden
profesöre. Mobil dahil her cihazda çalışmalı.

İçerik: karasuları, kıta sahanlığı, MEB, esas hat, FIR, SAR, Kıbrıs, GKRY parselleri, 21 antlaşma,
tarihî krizler, Türk tezi / karşı tez, 1780→2026 tarihsel egemenlik animasyonu, rehberli turlar, quiz,
canlı uçuş trafiği, 2412 tıklanabilir ada.

- **Canlı site:** https://mavi-vatan-atlasi.pages.dev
- **Depo:** github.com/sonofbarin/mavi-vatan-atlasi (Public)
- **Sahibi:** Doğukan (EEE öğrencisi; kod bilgisi sınırlı, GitHub'ı web arayüzünden kullanıyor)

## 2. Değişmez ilkeler (bunlar pazarlık dışı)

1. **AI kişiliği:** "Türk Tezi Danışmanı" — Türkiye'nin hukuki tezini *savunur*, ama:
   - Belge/madde/tarih/içtihat **uydurmak yasak**. Kaynaklarda yoksa "atlasta yok" der.
   - Her iddia dayanaklıdır (antlaşma + madde no, veya içtihat + yıl).
   - Etnik aşağılama ve halklara yönelik genelleme yasak; eleştiri devlet politikalarına yöneliktir.
   - Karşı tez özetlenir ve çürütülmeye çalışılır; yok sayılmaz.
   - İkinci mod: **Tarafsız anlatım** — kullanıcı seçer, hangisini okuduğunu bilir.
   Kullanıcı başta "milliyetçi AI" istedi; uydurma üreten bir persona reddedildi, bu kaynaklı-savunucu
   model üzerinde anlaşıldı. Bu çizgiyi koru.
2. **Veri lisansına saygı:** Google/Yandex/Apple harita verisi kopyalanmaz (reddedildi — lisans + faydasız).
   OSM (ODbL) ve adsb.lol (ODbL) **atıfları** sayfada ve kartlarda durur, kaldırılmaz.
3. **Hukuki içerikte doğruluk > etki.** Türkiye aleyhine kesinleşmiş hususlar (ör. Onikiada'nın 1947
   devri) inkâr edilmez; hukuki sonucu tartışılır (silahsızlandırma şartı, TR'nin taraf olmaması).
4. **API anahtarları asla depoya girmez.** Sadece Cloudflare env (Secret).

## 3. Mimari (mevcut, çalışıyor)

```
GitHub (main) ──otomatik──▶ Cloudflare Pages
│                            ├─ public/           (statik site; build yok, output dir: public)
│                            └─ functions/api/    (Pages Functions → /api/*)
└─ .github/workflows/veri-guncelle.yml
     (elle tetikleme + her ayın 1'i 03:00 UTC; veri/*.py koşar,
      public/data/*.geojson üretir, git pull --rebase + push)
```

- **Cloudflare projesi:** `mavi-vatan-atlasi` · Framework: None · Build command: boş · Output: `public`
- **Workers AI binding:** Variable name `AI` (Production + Preview) — ücretsiz katman, kart yok,
  10.000 neuron/gün. Binding/env değişince **Retry deployment** gerekir.
- **Claude'a yükseltme yolu:** Cloudflare env'e `ANTHROPIC_API_KEY` (Secret) eklenirse `functions/api/ai.js`
  otomatik Claude'a geçer (varsayılan model `claude-haiku-4-5-20251001`, `MODEL` env ile değişir).

## 4. Dosya haritası

| Yol | Ne |
|---|---|
| `public/index.html` (~554 KB) | **Atlasın tamamı** — tek dosya, 13 inline `<script>` bloğu. Sona eklenen IIFE yamaları siteyi proxy'lere bağlar (uçuş → `/api/ucus`, AI → `/api/ai` + RAG bağlamı + `#ai-mod` seçici). |
| `public/osm-adalar.js` | OSM katmanı v2: `adalar/fir/tw.geojson` yükler; Path2D önbelleği (3 boy sınıfı, setTransform ile çizim); **ada tarih kutusu** (egemenlik zinciri, rejim paragrafı, antlaşma düğmeleri, TR/GR kıyı mesafesi, UNCLOS m.121/3 notu); Ctrl+K paletine 1361 isimli ada ekler. |
| `public/rag.js` | İstemci tarafı arama: `bilgi.json` içinde Türkçe kök-alma + eşanlamlı + başlık ağırlığı; **alaka eşiği** (en iyi puan < 4 → bağlam yok → AI cevap vermez). |
| `public/data/bilgi.json` (80 KB) | 246 doğrulanmış bilgi parçası (21 antlaşma, 11 tez, 12 kriz, 12 güncel, 30 terim, 24 katman, 63 ada, 13 parsel, 32 tur adımı, 16 soru, 12 egemen). AI **yalnızca** bunlardan konuşur. |
| `public/data/adalar.geojson` (3,5 MB) | 2412 ada/adacık (1361 isimli) — Overpass'tan Actions üretir. |
| `public/data/fir.geojson` | Gerçek ICAO FIR poligonları: LGGG 154 · LTBB 87 · LTAA 112 · LCCC 37 nokta (VATSpy). |
| `public/data/tw.geojson` | OSM adalarından üretilmiş 6 mil kuşakları: `gr6_osm` (tam ikame) + `tr6_ege_osm` (yalnız Ege kesiti). |
| `public/test.html` | Altyapı test sayfası (yalnız pages.dev'de çalışır; file:// açılırsa "Failed to fetch" normaldir). |
| `public/_headers` | Önbellek: `/data/*` 1 gün, js dosyaları 1 saat. |
| `functions/api/ping.js` | Sağlık + AI motoru raporu. |
| `functions/api/ucus.js` | Uçuş proxy zinciri: **adsb.lol → airplanes.live → adsb.fi → OpenSky → bayat kopya** (önbellek 25 sn taze / 900 sn bayat). Sorgular sıralı + 1,1 sn aralıklı (airplanes.live 1 istek/sn kuralı). `?bolge=ege|turkiye` önayarları. |
| `functions/api/ai.js` | AI proxy: Workers AI model zinciri (gemma-3-12b-it → llama-3.3-70b-fp8-fast → qwen2.5-7b → llama-3.1-8b → llama-3-8b) veya Claude; **Origin kontrolü** (yalnız .pages.dev); `temperature 0.15`; tekrar-döngü temizleyici; **bağlam zorunlu** — `baglam` boşsa model hiç çağrılmaz. GET yalnız `?tani=1` teşhisi (model model dener, durum raporlar). |
| `veri/cek_adalar.py` | Overpass (3 ayna, POST) `place=island|islet`, bbox(34,22,42.5,36.5). Dayanıklı: Overpass susarsa **mevcut dosya korunur, exit 0**. |
| `veri/cek_fir.py` | VATSpy `Boundaries.geojson` → 4 FIR. Dayanıklı. |
| `veri/cek_karasulari.py` | NE anakaralar (raw.githubusercontent) + OSM adaları → 6 nm kuşaklar. Aidiyet **iki geçiş**: büyükler (≥15 km²; isim listesi TR; ONIKI/MEIS/DOGU_EGE kutuları → GR) → adacıklar en yakın karaya (anakara + atanmış büyükler). Özel: MEIS kutusunda dTR>0.012 → GR (Kaş kayalıkları TR), ONIKI'de dTR>0.040 → GR (Gökova/Hisarönü Türk adacıkları TR), **KARDAK kutusu kuşaksız**. |
| `arac/smoke_site.js` | 74 duman testi (jsdom). Kullanım: `npm i jsdom` sonra `node arac/smoke_site.js public/index.html`. |
| `arac/bilgi_cikar.js` | `bilgi.json` üreticisi (jsdom ile atlası açıp DATA/GEO'dan metin çıkarır). **index.html'in içerik verisi değişirse bunu çalıştırıp bilgi.json'u yenile.** |

## 5. Atlas motoru — bilinmesi gereken iç API

`index.html` içindeki globaller (yama yazarken bunlara bağlanılır):

- `HARITA` — projeksiyon/çizim: `.ekran(lon,lat)`, `.cograf(px,py)`, `.icinde(nokta,halka)`,
  `.poliIcinde(nokta,halkalar)`, `.sovKod(timeline,yıl)`, `.git(lon,lat,z)`, `.iste()`, `.yolYenile()`,
  `.gorunum{lon,lat,z}`. Projeksiyon **doğrusal** (equirect + cos ölçek) → Path2D dünya koordinatında
  kurulup `setTransform` ile basılabilir (osm-adalar.js böyle yapıyor).
- `KATMAN.liste` + `KATMAN.g(id)` — katmanlar; **yeni katman ekledikten sonra `panelKur()` çağır**
  (`panelYenile()` yalnız mevcut kutucukları tazeler, yeni satır çizmez — bu bir kez hataya yol açtı).
- `DATA` — antlasmalar/tezler/krizler/adalar/parseller/sozluk/katmanDetay/turlar/quiz.
- `GEO` — `parts` (tarihsel egemenlik parçaları `{c,t,p}`), `sov` (55 egemen: OSM TR GR IT GB YED GRT
  CY CYR KKTC IHT …), `tw` (karasuyu halkaları: `gr6`, `trcur`, …), `ada` (113'lük eski katalog).
- `POP.genel(başlık, html, px, py)` — açılır kart. DOM: `#hk-baslik`, `#hk-govde`.
- `MOD.git(sekme)` — sekme geçişi. Antlaşma kartı DOM id'si `ant-{id}`, ada dosyası `ada-{id}`.
- `TIKLA_EK(lon,lat,px,py)` ve `canliCiz()` — **zincirlenerek** genişletilir (eskisini sakla, çağır).
- `ZAMAN.yil`, `PALET.dizin` (Ctrl+K), `bildir(mesaj)`, `$`/`$$`/`H` (querySelector/escape).
- Antlaşma id'leri: `lon1830 lon13 atina13 k1914 loz z32o z32 montro par47 cen58 bern76 unclos ks2674
  cb95 tb97 sscb gkrymisir gkryisrail trkktc mou19 yunmisir`.

**Kritik senkron:** ONIKI/MEIS/KARDAK kutuları ve mesafe eşikleri **iki yerde** tanımlı —
`veri/cek_karasulari.py` (kuşak aidiyeti) ve `public/osm-adalar.js` (tarih kutusu). Birini değiştirirsen
diğerini de değiştir.

## 6. Alınan kararlar (kronolojik özet)

1. Tek dosya offline atlas (v1→v4) → canlı siteye evrildi; offline sürüm hâlâ üretilebilir (file:// açılışta
   yamalar kendini devre dışı bırakır — `location.protocol` koruması).
2. Barındırma: **GitHub + Cloudflare Pages + Pages Functions** (ücretsiz katman). Onaylandı, kuruldu.
3. Veri: kullanıcı hiçbir şey çalıştırmaz → **GitHub Actions cron**. Kuruldu, çalıştı.
4. AI: kullanıcı para yatırmak istemedi → **Workers AI ücretsiz**; `ANTHROPIC_API_KEY` gelirse otomatik Claude.
5. Küçük modellerin uydurması → **RAG + bağlam zorunluluğu** ("1930 Ege Deniz Antlaşması" gibi
   halüsinasyonlar böyle bitirildi). Bağlamsız soru = model çağrılmaz.
6. Uydu karosu işleme / ticari harita kopyalama **reddedildi**; adalar OSM'den, FIR VATSpy'dan,
   sınırlar resmî koordinatlardan gelecek.
7. Uçuşlar: OpenSky tek başına yetmedi (paylaşımlı CF IP → 429/522) → 4 kaynaklı zincir.
8. Karasuları statikti, 2412 adayı kapsamıyordu → Actions'ta OSM'den yeniden üretim.
9. Her adaya tarih kutusu istendi → **uydurmadan**, kural setinden türetilen egemenlik zinciri +
   grup rejim metinleri + antlaşma bağlantıları. 2350 adacık için elle tarih yazılmadı ve yazılmayacak;
   63 önemli ada için elle yazılmış dosyalar var.
10. Depo Public kalıyor (şeffaflık + sınırsız Actions); güvenlik anahtarların gizliliğiyle sağlanıyor.

## 7. Mevcut durum

**Çalışıyor (canlıda doğrulandı):**
- Uydu/OSM zemin + tüm hukuk katmanları (karasuları, KS/MEB, parseller 1-13, enerji, Libya hattı,
  Sevilla, Karadeniz MEB), tarihsel egemenlik kaydırıcısı, turlar, quiz, antlaşma kütüphanesi.
- Gerçek ICAO FIR'ları (karada da çizilir — doğru, FIR kara sahasını da kapsar).
- Uçuşlar: 281 uçak `airplanes.live` yedeğinden geldi — zincir görevini yaptı.
- 2412 OSM adası + ada başına 6 nm kuşak baloncukları (ekran görüntüsüyle teyitli).
- Actions koşusu: `2412 ada (1361 isimli), adalar.geojson 3551 KB`, 4 FIR.
- 74/74 duman testi.

**Yüklenmesi bekleniyor (kod hazır, kullanıcı GitHub'a koymadıysa):**
- `public/osm-adalar.js` **v2** (tarih kutulu son sürüm) ve `public/_headers`.
- Kontrol: canlıdaki dosyada `tr6_ege_osm` ve `ADA_KART` kelimeleri geçiyorsa v2 yüklüdür.

**Yapılmadı / sırada:**
1. **ADIM 3 testi:** canlıda AI'ya "Meis'in kıta sahanlığı üretip üretemeyeceğini hangi antlaşma ve
   içtihatlar belirler?" sor → uydurma olmamalı, cevabın altında "— Atlas kaynakları: …" kuyruğu olmalı.
   `/api/ai?tani=1` hangi modelin çalıştığını raporlar.
2. **Karasuları Actions koşusu:** `cek_karasulari.py` adımının canlıda en az bir kez başarıyla koşup
   `tw.geojson` ürettiğinin teyidi (beklenen log: `aidiyet: TR=… GR=… ihtilaflı(kuşaksız)=2`).
3. **MapLibre GL geçişi — onaylı, başlanmadı.** Amaç: gerçek zemin karo motoru, pinch-zoom, retina,
   mobil performans. Mevcut canvas motoru korunarak kademeli geçiş planlanmalı (katmanlar MapLibre
   custom layer veya GeoJSON source olarak taşınır).
4. **Resmî antlaşma koordinatları:** temsilî hatların yerine gerçek noktalar:
   TR–Libya 2019 (Resmî Gazete 30971, E-F noktaları), Yunanistan–Mısır 2020 (BM tescil eki),
   GKRY 13 parsel köşeleri, TR–KKTC 2011 eki, TR kıta sahanlığı dış sınırı (BM mektupları),
   SAR yönetmelik koordinatları, Yunan 230/1936 esas hatları. Her hat kartında kaynak künyesi gösterilecek.
5. Kullanıcıya sunulmuş, seçim bekleyen özellik menüsü: paylaşım linki (#lat,lon,z+katmanlar),
   mesafe cetveli (km+nm), PWA, ada karşılaştırma.
6. İsteğe bağlı sertleştirme: `/api/ai` için KV tabanlı IP hız limiti (tasarımı var, şu an yalnız
   Origin kontrolü + uzunluk sınırı aktif).
7. Test altyapısını depoya taşı: `package.json` + `npm i -D jsdom` + `arac/smoke_site.js`'i CI'da koştur
   (şu an testler yalnız elle koşuyor).

## 8. Veri kaynakları ve lisanslar

| Veri | Kaynak | Lisans/Not |
|---|---|---|
| Adalar (2412) | OSM Overpass (3 ayna) | ODbL — atıf zorunlu, kartlarda ve altbilgide var |
| FIR | VATSpy Data Project (GitHub) | AIRAC döngüsüyle güncel; "FIR ≠ egemenlik" notu her yerde |
| Anakara kıyıları | Natural Earth 10m (nvkelso GitHub) | Kamu malı |
| Uçuşlar | adsb.lol / airplanes.live / adsb.fi / OpenSky | ODbL vb.; UA başlığında depo iletişimi |
| Hukuk metin özetleri | Atlasın kendi elle yazılmış içeriği (bilgi.json) | Tek AI bilgi kaynağı |
| Zemin karolar | Atlas motorundaki mevcut karo desteği (`data-tile`) | MapLibre geçişinde netleşecek |

## 9. Kullanıcıyla çalışma düzeni (önemli)

- **Dil Türkçe.** Teknik ama resmiyetsiz; uzun girişler yok.
- **Adım adım mod:** tek seferde tek iş; kullanıcı "bitti" deyince sonraki adım. Kod üretimine
  başlamadan onay bekle ("başla" der).
- Kullanıcı GitHub'ı **web arayüzünden** kullanır: dosya düzenleme = kalem ✏️; yeni dosya =
  Add file → Create new file (tam yol yazılır, `/` klasör açar). Terminali yok sayılır.
- **Actions kuralları:** asla "Re-run jobs" (eski kod fotoğrafını koşar) — hep taze "Run workflow";
  koşu bitene dek commit atılmaz (bot artık rebase'liyor ama yine de).
- Hata ayıklama ekran görüntüsüyle yürür; kullanıcının yapıştırdığı log satırları ciddiye alınır.

## 10. Bilinen tuzaklar

- `index.html` içine inline script yazarken **`</script` dizisi geçirme** (parser'ı bitirir).
- `panelYenile()` yeni katman satırı ÇİZMEZ; katman ekledikten sonra `panelKur()`.
- jsdom testlerinde harici `<script src>` yüklenmez → osm-adalar/rag testte elle enjekte edilir
  (smoke bu yüzden onları saymaz; fonksiyonel test ayrı yapıldı).
- Cloudflare paylaşımlı çıkış IP'si yüzünden tek uçuş kaynağına güvenme; zincir bozulursa sıradakine geç.
- `bilgi.json` elle düzenlenmez; içerik `index.html`'de değişince `arac/bilgi_cikar.js` ile yeniden üretilir
  (jsdom gerekir), yoksa AI eski metinden konuşur.
- Overpass sandbox/istemciden 406 döndürür (bot koruması) — ada verisi YALNIZ Actions üzerinden çekilir.
- `test.html` file:// ile açılınca "Failed to fetch" — hata değil; yalnız pages.dev'de anlamlı.

## 11. Hızlı komutlar (Claude Code için)

```bash
npm i -D jsdom                                  # bir kez
node arac/smoke_site.js public/index.html      # 74 test — her index.html değişikliğinden sonra
node arac/bilgi_cikar.js public/index.html     # içerik değiştiyse bilgi.json'u yenile
```

Canlı teşhis uçları:
`/api/ping` · `/api/ucus?bolge=ege` · `/api/ai?tani=1`
