# CLAUDE.md: sersoz.com

Kullanıcı Türkçe konuşur; arayüz ve belgeler Türkçe. Yanıtlar kısa olsun. Bu depo **herkese açık**: gizli anahtar, şifre, IBAN gibi bilgi yazma.

> ⚠ **Depoyu gizli (private) yapma.** Ücretsiz GitHub planında gizli depoda Pages kapanır, sersoz.com 404 verir; App Store'daki
> uygulamalar (Elif'in Dolabı, VisionCap, MecaLib, ElectroLib…) ve gizlilik/destek adresleri de çöker. 21 Ekim 2026'da oldu;
> geri açmak için depo herkese açık yapılıp Pages yeniden kuruldu (kaynak `main` /, alan adı sersoz.com, HTTPS zorunlu).
> Gizli bir şey gerekiyorsa ayrı, gizli bir depoya koy.

## Ne var

Statik site, GitHub Pages (CNAME sersoz.com). **`main`'e push = canlı yayın**; kullanıcı istemeden push etme.

| Dosya | İçerik |
|---|---|
| `elif.html`, `elif.js`, `elif.css` | **Elif'in Dolabı**: kişiden kişiye kıyafet kiralama (Firebase `sersoz-f93c3`, Firestore). Tek sayfa, `#` ile sayfalar |
| `elif-demo.js`, `elif-demo-foto.js` | Örnek mod verisi (`elif.html?demo=1`); `?ekran=1` örnek şeridini gizler |
| `ayarlar.js` | Site ayarları: kampanyalar, öne çıkarma fiyatları (`oneCikarma`), `jeton` ayarları, havale |
| `firestore.rules` | Veritabanı kuralları (şema yorumları içinde) |
| `functions/` | Firebase Cloud Functions (Node 22, europe-west1): `jeton.js` (App Store satın alma doğrulama, jeton, Satıcı Pro), `index.js` (e-posta bildirimleri) |
| `elif-gizlilik.html`, `elif-destek.html`, `elif-sozlesme.html` | App Store'un baktığı gizlilik, destek ve sözleşme sayfaları |
| `visioncap.html`, `visioncap.css`, `visioncap-gizlilik.html`, `visioncap-destek.html` | **VisionCap**: tanıtım, App Store gizlilik ve destek sayfaları. Uygulama veri toplamaz; gizlilik metni buna göre |
| `visioncap-ders.html`, `visioncap-dersler.js`, `visioncap-kartlar.js` | **VisionCap uygulaması**: 12 ders (WebGL), Kwit tarzı sekmeler (Bugün, Dersler, Kartlar, Gelişim), salla-öğren bilgi ve makale kartları, VisionCap Pro (yalnız `Abonelik` eklentisi varken: ilk 6 ders, günde 3 kart ücretsiz), ilerleme `localStorage`. iOS kabuğu (Capacitor) bu sayfayı açar; `visioncap-dersler.js` değişince `visioncap-ders.html` içindeki `?v=`, `visioncap-kartlar.js` değişince `visioncap-dersler.js` içindeki import `?v=` değerini artır. Yerel eklenti yoksa ilgili özellik gizlenir |
| `electrolib/` | **ElectroLib** web sürümü (Expo derleme çıktısı, elle düzenlenmez). Kaynak ayrı: `Desktop\Projects\ElectroLib`; orada `npm run build:web` → `dist/` içeriğini buraya kopyala. `_expo/` klasörü için kökte `.nojekyll` gerekir. `electrolib-gizlilik.html`, `electrolib-destek.html`: mağaza gizlilik ve destek sayfaları (uygulama veri toplamaz) |
| `mecalib/`, `mecalib.css`, `mecalib-gizlilik.html`, `mecalib-destek.html` | **MecaLib**: makine mühendisliği öğrenme uygulaması (PWA, tek dosya `mecalib/index.html`, veri cihazda) ile App Store gizlilik ve destek sayfaları. Uygulama değişince `mecalib/sw.js` içindeki `CACHE` adını artır |
| `trifed/` | **TriFed** rota uygulamasının derlenmiş hali, elle düzenlenmez. Kaynak: `Projects/TriFed` (github.com/sercansozer20-dot/trifed, private), orada `npm run build:site` |
| `magaza*.`, `urun*`, `kategori.html`, `index.html`, `projeler.html` | SERSOZ mağaza ve tanıtım sayfaları |

## Kurallar

1. **Sürüm:** `elif.*` değişince `?v=` değerini **üç dosyada birlikte** artır: `elif.html` (3 yer), `elif.js` (`./elif-demo.js?v=`), `elif-demo.js` (`./elif-demo-foto.js?v=`). Biçim `YYYYMMDD` + harf (ör. `20261021c`). Uygulama ve sekmeler yeni sürümü bu değerden anlayıp kendini yeniler.
2. **Söz dizimi denetimi:** `node --input-type=module --check < elif.js`
3. **iPhone uygulaması bu sayfayı açar** (Capacitor, ayrı depo `elif-dolabi-ios`). `NATIVE` uygulama içinde true; `IAP` yerel satın alma eklentisi varsa true.
   App Store kuralı: iOS'ta dijital hizmet (öne çıkarma, jeton, Pro) **yalnız uygulama içi satın almayla** satılır; havale ya da dış bağlantı gösterilmez. Kiralama ödemesi fiziksel hizmet, uygulama dışında (havale/Shopier) kalır.
4. **Jeton** yalnız öne çıkarmaya harcanır; kiralamaya, nakde dönmez. Bakiye ve hareketleri **yalnız sunucu** yazar. Öne çıkarma jeton bedeli `ayarlar.js → oneCikarma` fiyatı ile `functions/jeton.js → PAKET` **aynı** tutulur. `jeton.iosSatista` jetonlu iPhone sürümü yayına girince true.
5. **Firebase yüklemesi bulutta yapılamaz:** `firestore.rules` ya da `functions/` değişirse kodu yaz ve gönder, ama kullanıcıya "bilgisayardan yüklenmesi gerekiyor" de:
   `firebase deploy --only firestore:rules --project sersoz-f93c3` · `firebase deploy --only functions:<ad> --project sersoz-f93c3`.
   Site kodu yeni bir fonksiyonu çağırıyorsa, fonksiyon yüklenene kadar hata vermeyecek biçimde yaz.
6. **Satışta dürüstlük:** sahte sayaç, sahte yorum, sahte aciliyet yok. Para maliyetli kampanya kullanıcı onayı olmadan açılmaz.
7. Kullanıcı metinlerinde telefon/e-posta/küfür filtresi (`icerikSorunu`) ve kurallardaki `temizMetin()` eşleşir; birini değiştirirsen ötekini de.
8. `functions/node_modules/` depoya girmez (`.gitignore`).
