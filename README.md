# Mavi Vatan Atlası — altyapı iskeleti

Türkiye'nin deniz yetki alanlarını (Ege · Doğu Akdeniz · Karadeniz) anlatan açık eğitim sitesi.

Bu depo şu an sadece **altyapı iskeletidir**: sunucusuz API uçları + test sayfası.
Atlasın kendisi (harita, katmanlar, antlaşmalar, turlar) bunun üstüne gelecek.

## Yapı

```
public/            → siteye giden statik dosyalar (Cloudflare "build output directory")
  index.html       → kurulum testi sayfası
functions/api/     → Cloudflare Pages Functions (sunucu tarafı, otomatik /api/... adresine bağlanır)
  ping.js          → GET  /api/ping   sağlık kontrolü
  ucus.js          → GET  /api/ucus   canlı uçuşlar (adsb.lol, anahtarsız, ODbL)
  ai.js            → POST /api/ai     Claude proxy (anahtar sunucuda kalır)
```

## Cloudflare Pages ayarları

| Alan | Değer |
|---|---|
| Framework preset | None |
| Build command | *(boş bırak)* |
| Build output directory | `public` |
| Root directory | `/` |

Ortam değişkenleri (Settings → Environment variables), **Secret** olarak, hem Production hem Preview:

| Ad | Değer |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic konsolundan alınan anahtar |
| `MODEL` *(isteğe bağlı)* | `claude-haiku-4-5-20251001` (varsayılan) veya `claude-sonnet-5` |

> API anahtarı **asla** depoya yazılmaz. Sadece Cloudflare panelinde durur.

## Test

Yayına alındıktan sonra:

- `https://<proje>.pages.dev/` → test sayfası
- `https://<proje>.pages.dev/api/ping` → `{"durum":"ayakta", "ai_anahtari":"tanımlı ✓"}`
- `https://<proje>.pages.dev/api/ucus?bolge=turkiye` → o an Türkiye üzerindeki tüm uçaklar

## Maliyet

- Cloudflare Pages + Functions: ücretsiz katman (günde 100.000 istek)
- adsb.lol: ücretsiz, anahtarsız (10 sn önbellek ile nazik davranıyoruz)
- Anthropic API: kullandıkça öde. **Konsolda aylık harcama limiti tanımla.**

## Kaynaklar ve lisanslar

- Uçuş verisi: [adsb.lol](https://adsb.lol) — ODbL 1.0
- Coğrafya: OpenStreetMap katkıcıları (ODbL), Natural Earth (kamu malı)
- FIR sınırları: VATSpy Data Project (ICAO AIRAC döngüsü)
- Hukuki metinler: Resmî Gazete, BM antlaşma tescilleri, UAD/tahkim kararları

## AI hakkında

İki mod vardır ve kullanıcı hangisini okuduğunu bilir:

- **Türk Tezi Danışmanı** — Türkiye'nin hukuki tezini savunur, her iddiayı antlaşma maddesi veya içtihatla
  bağlar, karşı tezi özetleyip çürütmeye çalışır.
- **Tarafsız anlatım** — tezleri yan yana koyar, uzlaşı olan ve olmayan noktaları ayırır.

Her iki modda da uydurma kaynak, uydurma madde numarası ve halklara yönelik aşağılayıcı dil yasaktır.
Bu kural sistem talimatına yazılıdır (`functions/api/ai.js`).
