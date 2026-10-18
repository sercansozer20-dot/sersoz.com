/* sersoz.com — ürün kataloğu
 *
 * Yeni ürün eklemek için bir bloğu kopyalayıp düzenleyin.
 *   id        : benzersiz, boşluksuz (adres çubuğunda görünür: urun.html?id=...)
 *   kod       : katalog kodu, listede ve ürün sayfasında görünür
 *   tur       : 'dijital' | 'hizmet' | 'urun'   (urun = kargolanan fiziksel ürün)
 *   fiyat     : TL, son fiyat (bkz. ayarlar.js kdvOrani)
 *   eskiFiyat : istenirse üstü çizili gösterilir; yoksa yazmayın
 *   gorsel    : fotoğraf, örn. 'gorsel/plaka.jpg'; yoksa kod yazan levha görünür
 *   shopier   : Shopier ürün linki; boşsa kartla ödeme bu üründe kapalı
 *   teslimKisa: listede yeşil yazan kısa teslim bilgisi
 *   teslim    : ürün sayfasındaki uzun teslim bilgisi
 *   maddeler  : açıklamanın altındaki madde listesi
 *   bilgi     : ürün sayfasındaki teknik bilgi tablosu [başlık, değer]
 */
window.SERSOZ_URUNLER = [
  /* ---------------- Makine görüşü: kendi ürünleri ve hizmetleri (gerçek) ---------------- */
  {
    id: 'vision-detection',
    vitrin: true,
    kod: 'VD-100',
    tur: 'dijital',
    kategori: 'makine-gorusu',
    ad: 'Vision Detection App, tek hat lisansı',
    kisa: '3D tarama, ölçüm, kusur kontrolü ve PLC haberleşmesi tek programda.',
    fiyat: 64000,
    shopier: '',
    teslimKisa: '1 iş günü',
    teslim: 'Lisans anahtarı ödeme onayından sonra 1 iş günü içinde e-postayla gelir. İlk kurulumu uzaktan birlikte yapıyoruz.',
    aciklama: 'Hattaki parçayı lazer profil sensörüyle tarıyor, nokta bulutundan ölçüyor, toleransın dışına çıkanı işaretliyor ve sonucu doğrudan PLC\'ye yazıyor. Şu an sahada kaynak ağzı ölçümü, paletlemede eksik ürün, koli adet ve oturma kontrolü ile yüzey kontrolünde çalışıyor.',
    maddeler: [
      'Siemens S7, Mitsubishi MC/SLMP ve Modbus TCP sürücüleri içinde',
      'Ürün reçeteleri: yeni parçayı operatör kendisi tanıtabilir',
      'Her ölçüm kaydı tarih ve sonuçla birlikte saklanır'
    ],
    bilgi: [
      ['Lisans', '1 üretim hattı, süresiz'],
      ['İşletim sistemi', 'Windows 10 / 11, 64 bit'],
      ['PLC protokolleri', 'S7, MC/SLMP, Modbus TCP'],
      ['Güncellemeler', '1 yıl ücretsiz'],
      ['Destek', 'E-posta ve uzaktan bağlantı']
    ]
  },
  {
    id: 'anomali-lisansi',
    kod: 'AN-110',
    tur: 'dijital',
    kategori: 'makine-gorusu',
    ad: 'Anomali tespiti modülü, 1 hat',
    kisa: 'Sadece sağlam parçalarla eğitilen kusur tespiti.',
    fiyat: 24000,
    shopier: '',
    teslimKisa: '1 iş günü',
    teslim: 'Lisans anahtarı 1 iş günü içinde e-postayla gelir.',
    aciklama: 'Kusurlu parça bulmanın zor olduğu hatlar için. Modeli yalnızca sağlam parçalarla eğitiyorsunuz; normalden farklı görünen her şeyi işaretliyor ve kusurun yerini ısı haritasıyla gösteriyor.',
    maddeler: [
      'Kusurlu örnek toplamadan eğitim',
      'Kusur yeri ısı haritasıyla görünür',
      'VD-100 içinde ek modül olarak çalışır'
    ],
    bilgi: [
      ['Lisans', '1 üretim hattı, süresiz'],
      ['Gereksinim', 'VD-100 lisansı'],
      ['Eğitim için örnek', 'En az 50 sağlam parça görüntüsü']
    ]
  },
  {
    id: 'plc-modulu',
    kod: 'PLC-20',
    tur: 'dijital',
    kategori: 'makine-gorusu',
    ad: 'PLC haberleşme modülü',
    kisa: 'Görüş sisteminin sonucunu el sıkışmalı olarak PLC\'ye aktarır.',
    fiyat: 8900,
    shopier: '',
    teslimKisa: '1 iş günü',
    teslim: 'İndirme linki ve lisans 1 iş günü içinde e-postayla gelir.',
    aciklama: 'Kendi görüş yazılımınız varsa ve sonucu PLC\'ye güvenli şekilde taşımak istiyorsanız: heartbeat, tetik/cevap el sıkışması ve hata bitleri hazır. Örnek PLC blokları da pakette.',
    maddeler: [
      'Heartbeat ve tetik/cevap el sıkışması',
      'Bağlantı koparsa PLC tarafında hata biti',
      'Örnek TIA Portal ve GX Works blokları'
    ],
    bilgi: [
      ['Protokoller', 'S7, MC/SLMP, Modbus TCP'],
      ['Kullanım', '.NET kütüphanesi (C#)'],
      ['Lisans', 'Makine başına']
    ]
  },
  {
    id: 'kalibrasyon-plakasi',
    vitrin: true,
    kod: 'KP-100',
    tur: 'urun',
    kategori: 'makine-gorusu',
    ad: 'Kalibrasyon plakası 100×100 mm',
    kisa: 'Robot el-göz kalibrasyonu için satranç desenli hedef plaka.',
    fiyat: 3400,
    shopier: '',
    teslimKisa: '2-4 iş günü kargo',
    teslim: 'Ödeme onayından sonra kargoya verilir, 2-4 iş günü içinde elinizde olur.',
    aciklama: 'Robot el-göz kalibrasyonu ve kamera kalibrasyonu için kullandığım plakanın aynısı. Mat yüzey, parlama yapmıyor. Tsai-Lenz yöntemiyle kalibrasyon için hazır.',
    maddeler: [
      'Mat yüzey, lazer ve kamerada parlama yok',
      'Robot flanşına bağlamak için delikli'
    ],
    bilgi: [
      ['Ölçü', '100 × 100 mm'],
      ['Desen', 'Satranç, 10 mm kare'],
      ['Yüzey', 'Mat']
    ]
  },
  {
    id: 'fizibilite',
    kod: 'HZ-01',
    tur: 'hizmet',
    kategori: 'makine-gorusu',
    ad: '3D tarama fizibilite analizi',
    kisa: 'Parçanızı gerçek sensörle tarıyorum, uygun mu değil mi raporluyorum.',
    fiyat: 12500,
    shopier: '',
    teslimKisa: 'Rapor 5 iş günü',
    teslim: 'Numune bana ulaştıktan sonra 5 iş günü içinde yazılı rapor.',
    aciklama: 'Neyin işe yarayacağından emin değilseniz buradan başlayın. Parçanızı gönderiyorsunuz, gerçek sensörle tarıyorum ve hangi yöntemle, hangi hassasiyetle ölçülebileceğini rapor ediyorum. Ölçülemiyorsa raporda bu da açıkça yazıyor.',
    maddeler: [
      'Gerçek sensörle tarama, simülasyon değil',
      'Sensör ve ölçüm yöntemi önerisi',
      'Tarama görüntüleri ve ham veri'
    ],
    bilgi: [
      ['Numune', '1-3 adet, kargo ile'],
      ['Teslim', 'PDF rapor + ham nokta bulutu'],
      ['Sonrası', 'Satın alırsanız ücret VD-100 fiyatından düşülür']
    ]
  },
  {
    id: 'baslangic-paketi',
    kod: 'HZ-02',
    tur: 'hizmet',
    kategori: 'makine-gorusu',
    ad: 'Görsel kontrol kurulumu',
    kisa: 'Kamera seçimi, aydınlatma, model eğitimi ve hatta devreye alma.',
    fiyat: 45000,
    shopier: '',
    teslimKisa: 'Planlama ile',
    teslim: 'Sipariş sonrası telefonla görüşüp tarih planlıyoruz.',
    aciklama: 'Hattınızda görsel kontrol kurmak istiyorsunuz ama nereden başlayacağınızı bilmiyorsanız: kamera ve lensi seçiyorum, aydınlatmayı kuruyorum, modeli eğitiyorum ve hat üstünde çalışır hale getiriyorum.',
    maddeler: [
      'Kamera, lens ve aydınlatma seçimi',
      'Model eğitimi ve eşik ayarı',
      'Hat üstünde devreye alma'
    ],
    bilgi: [
      ['Kapsam', '1 kontrol noktası'],
      ['Donanım', 'Fiyata dahil değil, listeyle ayrıca teklif'],
      ['Yer', 'Yerinde (İzmir dışı yol ve konaklama ayrıca)']
    ]
  },
  {
    id: 'egitim',
    kod: 'HZ-03',
    tur: 'hizmet',
    kategori: 'makine-gorusu',
    ad: 'Operatör ve bakım eğitimi, 2 gün',
    kisa: 'Yeni ürün tanıtma, eşik ayarı ve kusur örnekleme.',
    fiyat: 18000,
    shopier: '',
    teslimKisa: 'Tarih birlikte',
    teslim: 'Tarihi sipariş sonrası birlikte belirliyoruz.',
    aciklama: 'Sistemi kurduktan sonra ekibinizin bana ihtiyaç duymadan kullanabilmesi için. Yeni ürün tanıtma, eşik ayarlama ve kusur örneği toplama üzerine iki günlük uygulamalı eğitim.',
    maddeler: [
      'Yerinde veya uzaktan',
      'Türkçe eğitim dokümanı'
    ],
    bilgi: [
      ['Süre', '2 gün, günde 6 saat'],
      ['Katılımcı', 'En fazla 6 kişi'],
      ['Yer', 'Yerinde veya uzaktan']
    ]
  }
];

/* Kategoriler: menüde ve ana sayfadaki kutucuklarda bu sırayla görünür.
   ikon: magaza.js içindeki çizimlerden biri
   (kart, sensor, motor, olcum, lehim, kablo, guc, kamera). */
window.SERSOZ_KATEGORILER = [
  { id: 'gelistirme', ad: 'Geliştirme Kartları', ikon: 'kart' },
  { id: 'sensor', ad: 'Sensörler', ikon: 'sensor' },
  { id: 'motor', ad: 'Motor ve Sürücüler', ikon: 'motor' },
  { id: 'olcum', ad: 'Ölçüm Aletleri', ikon: 'olcum' },
  { id: 'lehim', ad: 'Lehimleme', ikon: 'lehim' },
  { id: 'kablo', ad: 'Kablo ve Breadboard', ikon: 'kablo' },
  { id: 'guc', ad: 'Güç ve Adaptör', ikon: 'guc' },
  { id: 'makine-gorusu', ad: 'Makine Görüşü', ikon: 'kamera' }
];
