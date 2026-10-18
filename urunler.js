/* sersoz.com — ürün kataloğu
 *
 * Yeni ürün eklemek için bir bloğu kopyalayıp düzenleyin.
 *   id       : benzersiz, boşluksuz (adres çubuğunda görünür: urun.html?id=...)
 *   tur      : 'dijital' | 'hizmet' | 'urun'   (urun = kargolanan fiziksel ürün)
 *   fiyat    : TL, son fiyat (bkz. ayarlar.js kdvOrani)
 *   eskiFiyat: istenirse üstü çizili gösterilir; yoksa silin
 *   gorsel   : istenirse 'gorsel/dosya.jpg'; yoksa türüne göre çizim gösterilir
 *   shopier  : Shopier ürün linki; boşsa kartla ödeme bu üründe kapalı
 *   ozellikler: ürün sayfasında madde madde
 *   rozet    : kartın köşesinde kısa etiket ('Çok satan', 'Yeni' ...)
 */
window.SERSOZ_URUNLER = [
  {
    id: 'vision-detection',
    tur: 'dijital',
    ad: 'Vision Detection App — Tek Hat Lisansı',
    kisa: '3D tarama, ölçüm, kusur denetimi ve PLC haberleşmesi tek uygulamada.',
    fiyat: 64000,
    rozet: 'Amiral ürün',
    shopier: '',
    teslim: 'Lisans anahtarı ödeme onayından sonra 1 iş günü içinde e-postayla',
    aciklama: 'Üretim hattındaki parçayı 3D olarak tarar, ölçer, kusuru bulur ve kararı doğrudan PLC\'ye yazar. Kaynak ağzı ölçümü, paletlemede eksik ürün, kolileme adet/oturma kontrolü ve yüzey kalite denetimi için hazır modüllerle gelir.',
    ozellikler: [
      'Siemens S7, Mitsubishi MC/SLMP ve Modbus TCP hazır',
      '3D nokta bulutu ile ölçüm ve kusur tespiti',
      'Tek üretim hattı için süresiz lisans',
      'Kurulum dokümanı ve uzaktan ilk kurulum desteği'
    ]
  },
  {
    id: 'anomali-lisansi',
    tur: 'dijital',
    ad: 'Anomali Tespiti Lisansı — 1 Hat',
    kisa: 'Yalnız sağlam örneklerle öğrenen kusur tespiti motoru.',
    fiyat: 24000,
    rozet: 'Yeni',
    shopier: '',
    teslim: 'Lisans anahtarı 1 iş günü içinde e-postayla',
    aciklama: 'Kusurlu örnek toplamanın zor olduğu hatlar için: model yalnızca sağlam parçalarla eğitilir, normalden sapan her şeyi işaretler.',
    ozellikler: [
      'Kusurlu örnek gerektirmeden eğitim',
      'Isı haritası ile kusur yeri gösterimi',
      'Vision Detection App ile entegre çalışır',
      'Tek üretim hattı için lisans'
    ]
  },
  {
    id: 'plc-modulu',
    tur: 'dijital',
    ad: 'PLC–Vizyon Haberleşme Modülü',
    kisa: 'Denetim sonucunu el sıkışma bitleriyle PLC\'ye taşıyan hazır modül.',
    fiyat: 8900,
    shopier: '',
    teslim: 'İndirme linki ve lisans 1 iş günü içinde',
    aciklama: 'Görüş sisteminizin sonucunu heartbeat, el sıkışma ve hata bitleriyle PLC\'ye güvenli şekilde aktaran yazılım modülü. Örnek PLC blokları dahildir.',
    ozellikler: [
      'Heartbeat ve el sıkışma protokolü',
      'S7 / MC / Modbus TCP',
      'Örnek PLC programı dahil'
    ]
  },
  {
    id: 'kalibrasyon-plakasi',
    tur: 'urun',
    ad: 'Kalibrasyon Hedef Plakası 100×100',
    kisa: 'El-göz kalibrasyonu için işlenmiş satranç desenli hedef.',
    fiyat: 3400,
    shopier: '',
    teslim: 'Kargo ile 2–4 iş günü',
    aciklama: 'Robot el-göz kalibrasyonu ve kamera iç parametre kalibrasyonu için hassas işlenmiş, mat yüzeyli satranç desenli hedef plaka.',
    ozellikler: [
      '100 × 100 mm, mat yüzey',
      'Hassas desen toleransı',
      'Tsai-Lenz el-göz kalibrasyonuyla uyumlu'
    ]
  },
  {
    id: 'fizibilite',
    tur: 'hizmet',
    ad: '3D Tarama Fizibilite Analizi',
    kisa: 'Parçanızın taranabilirliğini ölçüp sensör önerisiyle raporlarım.',
    fiyat: 12500,
    rozet: 'Önce bununla başlayın',
    shopier: '',
    teslim: 'Numune elime ulaştıktan sonra 5 iş günü içinde rapor',
    aciklama: 'Parçanızı gerçek sensörle tarar, ölçüm yöntemi ve sensör önerisi içeren yazılı rapor hazırlarım. Sonuç olumsuzsa bu da açıkça yazılır.',
    ozellikler: [
      'Gerçek sensörle tarama',
      'Sensör ve ölçüm yöntemi önerisi',
      'Yazılı rapor ve görüntüler'
    ]
  },
  {
    id: 'baslangic-paketi',
    tur: 'hizmet',
    ad: 'Görsel Denetim Başlangıç Paketi',
    kisa: 'Kamera seçimi, aydınlatma, model eğitimi ve devreye alma.',
    fiyat: 45000,
    shopier: '',
    teslim: 'Sipariş sonrası planlama görüşmesiyle başlar',
    aciklama: 'Hattınız için uçtan uca görsel denetim kurulumu: donanım seçimi, aydınlatma tarifi, model eğitimi ve hat üstünde devreye alma desteği.',
    ozellikler: [
      'Kamera ve lens seçimi',
      'Aydınlatma tarifi',
      'Model eğitimi',
      'Hat üstünde devreye alma desteği'
    ]
  },
  {
    id: 'egitim',
    tur: 'hizmet',
    ad: 'Ürün Öğretme Eğitimi (2 Gün)',
    kisa: 'Operatör ve bakım ekibine uygulamalı eğitim.',
    fiyat: 18000,
    shopier: '',
    teslim: 'Tarih sipariş sonrası birlikte belirlenir',
    aciklama: 'Operatör ve bakım ekibinize yeni ürün tanıtma, eşik ayarı ve kusur örnekleme konularında iki günlük uygulamalı eğitim.',
    ozellikler: [
      '2 gün, yerinde veya uzaktan',
      'Yeni ürün tanıtma ve eşik ayarı',
      'Eğitim dokümanı dahil'
    ]
  }
];
