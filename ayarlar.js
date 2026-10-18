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
  sloganKisa: 'Makine görüşü yazılımı, donanımı ve hizmetleri',
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

  /* Kargo: fiziksel ürünlerde uygulanır. ucretsizEsik üstünde kargo bedava. */
  kargo: { ucret: 150, ucretsizEsik: 2000 }
};
