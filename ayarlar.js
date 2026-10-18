/* sersoz.com — mağaza ayarları
 *
 * Mağazanın bütün kişisel/ticari bilgileri BURADA. Başka dosyaya dokunmadan
 * bu alanları doldurmanız yeterli. Boş bırakılan alan sitede gizlenir
 * (örn. IBAN boşsa havale seçeneği "yakında" görünür).
 *
 * Şirket gerektirmeyen yapı:
 *   - Havale/EFT     : yalnız IBAN yeter.
 *   - Kart (Shopier) : bireysel satıcı hesabı açılır, her ürün için Shopier'de
 *                      ürün oluşturulup linki urunler.js içindeki "shopier"
 *                      alanına yapıştırılır.
 *   - Sipariş e-postası: web3forms.com'dan e-posta adresinizle ücretsiz
 *                      "Access Key" alıp web3formsKey alanına yapıştırın.
 *                      Boşsa sipariş, müşterinin e-posta uygulamasında
 *                      hazırlanır (daha zayıf: müşteri göndermeyi unutabilir).
 */
window.SERSOZ_AYAR = {
  magazaAdi: 'SERSOZ',
  sloganKisa: 'Elektronik ve Otomasyon Market',
  saticiAdi: 'Sercan Sözer',
  eposta: 'sercansozer20@gmail.com',
  telefon: '',          // örn. '+90 5xx xxx xx xx' — iletişimde görünür
  whatsapp: '',         // örn. '905xxxxxxxxx' (başında + yok) — "WhatsApp ile sor" düğmesi

  havale: {
    iban: '',           // örn. 'TR00 0000 0000 0000 0000 0000 00'
    hesapSahibi: 'Sercan Sözer',
    banka: ''           // örn. 'Ziraat Bankası'
  },

  web3formsKey: '',

  /* Bireysel satışta KDV eklenmez; fiyatlar son fiyattır. Şirket kurulursa
     buraya 0.20 yazılır ve sepet KDV satırını kendiliğinden gösterir. */
  kdvOrani: 0,

  /* Sitenin en üstündeki turuncu şeritte görünen kısa duyurular.
     Yerine getirebileceğiniz sözleri yazın; boş [] bırakılırsa kargo eşiği yazılır. */
  duyurular: [
    '2.000 TL ve üzeri siparişlerde kargo bedava',
    'Hafta içi saat 15:00\'e kadar verilen siparişler aynı gün kargoda'
  ],

  /* Elif'in Dolabı · öne çıkarma paketleri. Fiyatları değiştirebilirsiniz; "saat" değerlerini
     değiştirmeyin (firestore.rules ile eşleşir: 1 / 24 / 168 / 720). */
  oneCikarma: [
    { paket: 'saatlik', ad: '1 saat', saat: 1, fiyat: 10 },
    { paket: 'gunluk', ad: '1 gün', saat: 24, fiyat: 39 },
    { paket: 'haftalik', ad: '1 hafta', saat: 168, fiyat: 149 },
    { paket: 'aylik', ad: '1 ay (30 gün)', saat: 720, fiyat: 399 }
  ],

  /* Kargo: fiziksel ürünlerde uygulanır. ucretsizEsik üstünde kargo bedava. */
  kargo: { ucret: 150, ucretsizEsik: 2000 }
};
