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

  /* Elif'in Dolabı · sadakat seviyesi indirimleri (yüzde). Kira bedeline uygulanır, depozitoya değil.
     Fark site tarafından karşılanır: eşya sahibine tam kira ödenir. 0 yazılırsa o seviyede indirim olmaz.
     En çok %30 (firestore.rules sınırı). Seviyeler: Bronz 50+, Gümüş 150+, Altın 300+ puan. */
  sadakatIndirim: { 'Bronz': 5, 'Gümüş': 10, 'Altın': 15 },

  /* Elif'in Dolabı · Keşfet'in başında dönen kampanya afişleri (5 sn'de bir).
     Sırayı değiştirebilir, yenisini ekleyebilir, silebilirsiniz. Boş [] bırakılırsa afiş çıkmaz.
     ust: küçük üst yazı · baslik · metin · dugme: düğme yazısı · link: tıklanınca gidilecek yer
     renk: afiş zemin rengi · foto: sağdaki görsel (gorsel/ klasöründen) */
  kampanyalar: [
    { ust: 'Yeni', baslik: 'Sepetini doldur, sırayla kirala', metin: 'Beğendiğin parçaları ♡ ile sepete at, istekleri tek tek gönder.',
      dugme: 'Sepetime git', link: '#sepet', renk: '#7a2e3a', foto: 'gorsel/ornek/elbise-3.jpg' },
    { ust: 'Sadakat puanı', baslik: 'Seviyen yükseldikçe indirimin artar', metin: 'Bronz %5 · Gümüş %10 · Altın %15 kira indirimi. Sorunsuz her kiralama puan kazandırır.',
      dugme: 'Puanımı gör', link: '#hesabim/puan', renk: '#3d4a3a', foto: 'gorsel/ornek/canta-2.jpg' },
    { ust: 'Dolabını kiraya ver', baslik: 'Giymediğin parçalar kazandırsın', metin: 'İlan vermek ücretsiz. Onaylanan parçan Keşfet\'te yayında.',
      dugme: 'Parça ekle', link: '#dolabim', renk: '#2a1f1e', foto: 'gorsel/ornek/dis-giyim-2.jpg' },
    { ust: 'Öne çıkar', baslik: 'İlanını Keşfet\'in en üstüne taşı', metin: 'Saatlik, günlük, haftalık ve aylık paketler.',
      dugme: 'Dolabıma git', link: '#dolabim', renk: '#6b4423', foto: 'gorsel/ornek/ayakkabi-1.jpg' }
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
