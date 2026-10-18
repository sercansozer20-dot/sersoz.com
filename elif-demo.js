/* Elif'in Dolabı — ÖRNEK VERİ (yalnız elif.html?demo=1)
 *
 * Görünümü denemek için tarayıcıda üretilen sahte kullanıcılar, parçalar,
 * kiralamalar ve yorumlar. Veritabanına HİÇBİR ŞEY yazılmaz; sayfada
 * "Örnek veri" şeridi görünür. Gerçek yayında kullanılmaz.
 */

import { ORNEK_FOTO } from './elif-demo-foto.js?v=20261018g';

/* tekrarlanabilir rastgelelik: her açılışta aynı örnekler */
let tohum = 7;
const r = () => { tohum = (tohum * 16807) % 2147483647; return (tohum - 1) / 2147483646; };
const sec = a => a[Math.floor(r() * a.length)];
const aralik = (a, b) => Math.round(a + r() * (b - a));

const KISILER = [
  ['Elif Yılmaz', '#b5655d'], ['Zeynep Kaya', '#7b6ea8'], ['Merve Demir', '#3f7d6e'], ['Ayşe Çelik', '#c0843f'],
  ['Selin Arslan', '#a24d6a'], ['Ece Şahin', '#4f6fa3'], ['Buse Koç', '#8a6a3f'], ['Deniz Öztürk', '#2f6f8f'],
  ['İrem Aydın', '#b0567a'], ['Gizem Polat', '#5c7a3a'], ['Ceren Kurt', '#9b5b3a'], ['Dilara Yıldız', '#6d5aa0'],
  ['Melis Özkan', '#3d8a7a'], ['Nazlı Erdem', '#a8653f'], ['Pelin Güneş', '#4a6aa8'], ['Ezgi Aksoy', '#9a4a5a'],
  ['Cansu Bulut', '#6a8a3a'], ['Sude Tekin', '#8a4a8a'], ['Gamze Kılıç', '#3a7a9a'], ['Esra Doğan', '#a85a4a']
];
export const DEMO_KULLANICI = { uid: 'demo-0', displayName: 'Elif Yılmaz', email: 'elif@ornek.test', emailVerified: true, photoURL: '' };

/* baş harfli yuvarlak avatar (SVG) */
function avatar(ad, renk) {
  const h = ad.split(' ').map(s => s[0]).join('').slice(0, 2);
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${renk}"/><text x="20" y="25.5" font-family="Arial" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${h}</text></svg>`);
}

/* kategoriye göre düz serim (flat-lay) kıyafet çizimi */
const SEKIL = {
  elbise: 'M120 70 L140 60 Q150 85 160 60 L180 70 L172 120 L205 300 L95 300 L128 120 Z',
  ust: 'M100 95 L135 75 Q150 95 165 75 L200 95 L222 150 L195 160 L188 135 L188 270 L112 270 L112 135 L105 160 L78 150 Z',
  alt: 'M105 80 L195 80 L205 300 L160 300 L150 140 L140 300 L95 300 Z',
  'dis-giyim': 'M95 90 L135 70 L150 110 L165 70 L205 90 L230 290 L200 295 L190 160 L190 300 L110 300 L110 160 L100 295 L70 290 Z',
  ayakkabi: 'M70 230 Q80 180 120 175 L150 200 Q190 205 230 225 Q240 250 220 255 L80 255 Q65 250 70 230 Z',
  canta: 'M90 140 L210 140 L222 280 L78 280 Z M120 140 Q120 90 150 90 Q180 90 180 140',
  aksesuar: 'M150 110 m-60 0 a60 60 0 1 0 120 0 a60 60 0 1 0 -120 0 M150 170 L150 250',
  diger: 'M100 100 L200 100 L200 260 L100 260 Z'
};
const ZEMIN = ['#f3e9e4', '#ede7df', '#e8ecef', '#efe9f2', '#e9efe7', '#f4ece2'];
function cizim(kategori, renk) {
  const yol = SEKIL[kategori] || SEKIL.diger;
  const cizgi = kategori === 'canta' || kategori === 'aksesuar';
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="${sec(ZEMIN)}"/>` +
    `<ellipse cx="150" cy="330" rx="95" ry="10" fill="rgba(0,0,0,.06)"/>` +
    `<g transform="translate(0,20)"><path d="${yol}" fill="${renk}" ${cizgi ? `stroke="${renk}" stroke-width="10" stroke-linejoin="round"` : ''}/>` +
    `<path d="${yol}" fill="none" stroke="rgba(0,0,0,.12)" stroke-width="2"/></g></svg>`);
}

const RENKLER = [['Siyah', '#2b2b2e'], ['Ekru', '#e9dfcc'], ['Bordo', '#7a2737'], ['Lacivert', '#22304f'], ['Haki', '#6b6b45'],
  ['Pudra', '#e2b4ab'], ['Taba', '#a8673a'], ['Zümrüt', '#1f6b55'], ['Gri', '#8d8f94'], ['Kırmızı', '#b3262e'], ['Krem', '#efe4cf'], ['Mavi', '#5d86b8']];
const MARKALAR = ['Zara', 'Mango', 'Massimo Dutti', 'H&M', 'Koton', 'İpekyol', 'Beymen Club', 'Vakko', 'Network', 'Twist', 'Stradivarius', 'Bershka', 'Machka', 'Vakkorama'];
const PARCALAR = {
  elbise: ['Saten midi elbise', 'Payetli abiye', 'Keten yazlık elbise', 'Kadife gece elbisesi', 'Gömlek elbise', 'Drapeli kokteyl elbisesi'],
  ust: ['İpek bluz', 'Oversize blazer', 'Fırfırlı gömlek', 'Kaşmir kazak', 'Korse bluz'],
  alt: ['Palazzo pantolon', 'Pileli midi etek', 'Deri etek', 'Yüksek bel jean', 'Kumaş pantolon'],
  'dis-giyim': ['Yün kaban', 'Trençkot', 'Deri ceket', 'Uzun palto', 'Tüvit ceket'],
  ayakkabi: ['Topuklu stiletto', 'Saten babet', 'Deri bot', 'Abiye sandalet'],
  canta: ['Zincir askılı çanta', 'Abiye clutch', 'Deri omuz çantası', 'Hasır çanta'],
  aksesuar: ['İnci kolye', 'İpek eşarp', 'Taşlı küpe seti', 'Hasır şapka']
};
const BEDEN = { ayakkabi: ['36', '37', '38', '39', '40'], canta: ['Tek beden'], aksesuar: ['Tek beden'] };
const YORUMLAR = [
  [5, 'Tam ölçüsünde geldi, tertemizdi. Düğünde çok iltifat aldım.'],
  [5, 'Çok ilgiliydi, teslim ve iade çok kolay oldu. Tekrar kiralarım.'],
  [4, 'Fotoğraftakinden biraz daha koyu ama çok şık. Kumaşı kaliteli.'],
  [5, 'Bir gecelik davet için harika bir çözüm oldu, satın almaya gerek kalmadı.'],
  [4, 'Kalıbı biraz dar, bir beden büyüğünü tercih edebilirsiniz. Sahibi çok nazik.'],
  [5, 'Ütülü ve kılıfında geldi. Özenli bir dolap sahibi.'],
  [3, 'Güzel parça ama teslimde biraz gecikme oldu.'],
  [5, 'Mezuniyet için kiraladım, herkes nereden aldığımı sordu.'],
  [4, 'Fiyatına göre çok iyi. Depozito iadesi aynı gün yapıldı.'],
  [5, 'Kesinlikle tavsiye ederim, hem parça hem iletişim on numara.']
];

export function demoVeri() {
  tohum = 7;
  const kullanicilar = KISILER.map(([ad, renk], i) => ({ uid: 'demo-' + i, ad, foto: avatar(ad, renk) }));
  const simdi = Date.now();
  const ts = msOnce => ({ toMillis: () => simdi - msOnce });
  const tarih = gun => new Date(simdi + gun * 864e5).toISOString().slice(0, 10);

  /* parçalar: her kişiye 2-3 parça */
  const esyalar = [];
  const fotoSira = {};
  kullanicilar.forEach((k, ki) => {
    const adet = ki === 0 ? 4 : aralik(2, 3);
    for (let j = 0; j < adet; j++) {
      const kategori = sec(Object.keys(PARCALAR));
      const [renkAd, renk] = sec(RENKLER);
      const premium = r() < .25;
      const gunluk = (kategori === 'aksesuar' ? aralik(4, 12) : kategori === 'ayakkabi' ? aralik(8, 20) : premium ? aralik(35, 90) : aralik(12, 40)) * 5;
      /* Gerçek (CC lisanslı) fotoğraf varsa onu kullan; renk bilinmediği için başlığa renk yazılmaz. */
      const havuz = ORNEK_FOTO[kategori] || [];
      const sira = fotoSira[kategori] = (fotoSira[kategori] ?? -1) + 1;
      const f = havuz.length ? havuz[sira % havuz.length] : null;
      const foto = f ? f.src : cizim(kategori, renk);
      esyalar.push({
        id: 'demo-esya-' + esyalar.length, sahipId: k.uid, sahipAd: k.ad, sahipFoto: k.foto,
        baslik: f ? sec(PARCALAR[kategori]) : renkAd + ' ' + sec(PARCALAR[kategori]).toLocaleLowerCase('tr-TR'), marka: sec(MARKALAR), kategori,
        beden: sec(BEDEN[kategori] || ['XS', 'S', 'M', 'L', '36', '38', '40']), renk: f ? '' : renkAd,
        kaynak: f ? { yazar: f.yazar, lisans: f.lisans, url: f.kaynak } : null,
        aciklama: sec(['Bir kez giyildi, kuru temizlemeden yeni geldi.', 'Astarlı, kalıbı tam oturuyor. Boy 1,68 için diz altı.',
          'Özel gün için aldım, dolapta duruyor. Kılıfıyla teslim edilir.', 'Kumaşı esnek değil, ölçüyü dikkate alın.',
          'Ütülü ve temiz teslim edilir. Evcil hayvan ve sigara olmayan evden.']),
        gunlukUcret: gunluk, depozito: Math.round(gunluk * aralik(3, 8) / 50) * 50,
        fotolar: [foto], aktif: !(ki === 0 && j === 3), olusturma: ts(aralik(1, 60) * 864e5),
        onay: 'onaylandi', redNeden: '', sozlesme: 'v1'
      });
    }
  });

  /* yorumlar: parçaların çoğuna 0-6 yorum */
  const yorumlar = {};
  esyalar.forEach(e => {
    const n = r() < .2 ? 0 : aralik(1, 6);
    yorumlar[e.id] = Array.from({ length: n }, () => {
      const y = sec(kullanicilar.filter(k => k.uid !== e.sahipId));
      const [puan, metin] = sec(YORUMLAR);
      return { ad: y.ad, foto: y.foto, puan, metin, tarih: ts(aralik(2, 120) * 864e5) };
    }).sort((a, b) => b.tarih.toMillis() - a.tarih.toMillis());
  });

  /* kiralamalar: örnek kullanıcının (Elif) kiraladıkları ve dolabından kiralananlar */
  const kiralamalar = [];
  const kira = (esya, kiraci, durum, basGun, gun) => {
    const kiraTutar = gun * esya.gunlukUcret;
    kiralamalar.push({
      id: 'demo-kira-' + kiralamalar.length, esyaId: esya.id, esyaBaslik: esya.baslik, esyaFoto: esya.fotolar[0],
      sahipId: esya.sahipId, kiraciId: kiraci.uid, kiraciAd: kiraci.ad,
      kiraciIletisim: '0532 000 00 ' + String(10 + kiralamalar.length).slice(-2) + ' · ' + kiraci.ad.split(' ')[0].toLocaleLowerCase('tr-TR') + '@ornek.test',
      sahipIletisim: ['beklemede'].includes(durum) ? '' : '0533 000 00 99 · ' + esya.sahipAd.split(' ')[0].toLocaleLowerCase('tr-TR') + '@ornek.test',
      baslangic: tarih(basGun), bitis: tarih(basGun + gun), gun, gunlukUcret: esya.gunlukUcret,
      kira: kiraTutar, depozito: esya.depozito, toplam: kiraTutar + esya.depozito,
      not: sec(['Düğün için lazım, cumartesi akşamı.', 'Mezuniyet töreni.', '', 'Kadıköy\'de elden teslim olabilir mi?']),
      durum, olusturma: ts(aralik(1, 20) * 864e5), guncelleme: ts(aralik(0, 5) * 36e5)
    });
  };
  const elif = kullanicilar[0];
  const baskalarininki = esyalar.filter(e => e.sahipId !== elif.uid);
  const elifinki = esyalar.filter(e => e.sahipId === elif.uid);
  [['beklemede', 6, 2], ['onaylandi', 9, 3], ['odeme_bildirildi', 4, 1], ['odendi', 2, 2], ['teslim_edildi', -6, 2], ['iade_edildi', -20, 2], ['reddedildi', 12, 2]]
    .forEach(([d, b, g], i) => kira(baskalarininki[i * 5], elif, d, b, g));
  [['beklemede', 5, 2, 3], ['beklemede', 14, 1, 7], ['odendi', 3, 3, 9], ['teslim_edildi', -12, 3, 12], ['iade_edildi', -30, 2, 15], ['iptal', 8, 1, 4]]
    .forEach(([d, b, g, ki]) => kira(elifinki[ki % elifinki.length], kullanicilar[ki], d, b, g));

  /* onay kuyruğu: birkaç parça admin onayı bekliyor, biri reddedilmiş */
  [3, 11, 19, 27, 35].forEach(i => { if (esyalar[i]) esyalar[i].onay = 'bekliyor'; });
  const elifEsyalari = esyalar.filter(e => e.sahipId === 'demo-0');
  if (elifEsyalari[1]) elifEsyalari[1].onay = 'bekliyor';
  if (esyalar[42]) { esyalar[42].onay = 'reddedildi'; esyalar[42].redNeden = 'Fotoğraf ürünü net göstermiyor, lütfen yeniden çekin.'; }

  /* üyeler (dolapUyeler) */
  const eposta = k => k.ad.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(' ', '.') + '@gmail.com';
  const uyeler = kullanicilar.map((k, i) => ({
    uid: k.uid, ad: k.ad, foto: k.foto, eposta: i === 0 ? 'sercansozer20@gmail.com' : eposta(k),
    telefon: '0532 000 00 ' + String(10 + i), ilkGiris: ts(aralik(20, 90) * 864e5), sonGiris: ts(aralik(0, 72) * 36e5),
    adresler: i === 0 ? [
      { baslik: 'Ev', adSoyad: 'Elif Yılmaz', telefon: '0532 000 00 10', adres: 'Caferağa Mah. Moda Cad. No: 12 D: 4', ilce: 'Kadıköy', il: 'İstanbul' },
      { baslik: 'İş', adSoyad: 'Elif Yılmaz', telefon: '0532 000 00 10', adres: 'Levent Mah. Büyükdere Cad. No: 185', ilce: 'Beşiktaş', il: 'İstanbul' }] : [],
    filtreler: i === 0 ? [
      { ad: 'Elbiseler, 300 TL altı', kategori: 'elbise', ara: '', beden: '', maxFiyat: 300 },
      { ad: 'Uygun çantalar', kategori: 'canta', ara: '', beden: '', maxFiyat: 150 },
      { ad: 'Zara her şey', kategori: 'hepsi', ara: 'zara', beden: '', maxFiyat: 0 }] : [],
    bildirimEposta: true, istatistikIzni: true
  }));

  /* roller (dolapRoller): iki admin, bir kısıtlı */
  const roller = [
    { eposta: uyeler[1].eposta, rol: 'admin', neden: '', atayan: 'sercansozer20@gmail.com', zaman: ts(15 * 864e5) },
    { eposta: uyeler[2].eposta, rol: 'admin', neden: '', atayan: 'sercansozer20@gmail.com', zaman: ts(9 * 864e5) },
    { eposta: uyeler[7].eposta, rol: 'kisitli', neden: 'İki kiralamada eşyayı geç iade etti, depozito anlaşmazlığı.', atayan: uyeler[1].eposta, zaman: ts(3 * 864e5) }
  ];

  /* gezinti kayıtları (dolapOlaylar): son 30 gün */
  const olaylar = [];
  const ARAMALAR = ['zara elbise', 'abiye', 'mezuniyet', 'siyah elbise', 'çanta', 'topuklu', 'blazer', 'düğün', 'mango', 'kaban', 'saten', 'kırmızı'];
  const yayinda = esyalar.filter(e => e.onay === 'onaylandi');
  for (let o = 0; o < 260; o++) {
    const girisli = r() < .6;
    const k = girisli ? sec(kullanicilar) : null;
    const oturum = 'ot-' + o;
    let t = aralik(0, 29) * 864e5 + aralik(0, 86000) * 1000;
    const adim = (tur, ek) => {
      olaylar.push(Object.assign({ tur, sayfa: '', esyaId: '', marka: '', kategori: '', baslik: '', ara: '', oturum,
        uid: k ? k.uid : '', ad: k ? k.ad : '', zaman: ts(t) }, ek));
      t -= aralik(8, 140) * 1000;   // sonraki adım biraz daha yeni
      if (t < 0) t = 0;
    };
    if (girisli && r() < .3) adim('giris', { sayfa: 'kesfet' });
    adim('sayfa', { sayfa: 'kesfet' });
    const n = aralik(1, 6);
    for (let j = 0; j < n; j++) {
      const x = r();
      if (x < .55) { const e = sec(yayinda); adim('esya', { sayfa: 'esya', esyaId: e.id, marka: e.marka, kategori: e.kategori, baslik: e.baslik }); }
      else if (x < .75) adim('arama', { sayfa: 'kesfet', ara: sec(ARAMALAR) });
      else adim('sayfa', { sayfa: sec(girisli ? ['dolabim', 'kiralamalar', 'hesabim', 'kesfet'] : ['kesfet']) });
    }
  }
  olaylar.sort((a, b) => b.zaman.toMillis() - a.zaman.toMillis());

  /* gelen kutusu örnekleri (dolapSohbet) */
  const m = (kimden, ad, metin, saatOnce) => ({ kimden, ad, metin, zaman: simdi - saatOnce * 36e5 });
  const sohbetler = [
    { id: 'demo-soh-1', uid: 'demo-4', ad: 'Selin Arslan', eposta: uyeler[4].eposta, konu: 'Abiyeyi bir gün erken alabilir miyim?', durum: 'acik', adminOkudu: false, kullaniciOkudu: true,
      mesajlar: [m('kullanici', 'Selin Arslan', 'Merhaba, kiraladığım abiyeyi düğünden bir gün önce alabilir miyim? Ekstra ücret çıkar mı?', 3)], sonZaman: ts(3 * 36e5) },
    { id: 'demo-soh-2', uid: 'demo-9', ad: 'Gizem Polat', eposta: uyeler[9].eposta, konu: 'Ödememi yaptım ama durum değişmedi', durum: 'acik', adminOkudu: false, kullaniciOkudu: true,
      mesajlar: [m('kullanici', 'Gizem Polat', 'Dün akşam havale yaptım, açıklamaya EK kodunu da yazdım ama hâlâ "ödeme kontrol ediliyor" görünüyor.', 20)], sonZaman: ts(20 * 36e5) },
    { id: 'demo-soh-3', uid: 'demo-12', ad: 'Melis Özkan', eposta: uyeler[12].eposta, konu: 'Ürünüm neden reddedildi?', durum: 'yanitlandi', adminOkudu: true, kullaniciOkudu: false,
      mesajlar: [m('kullanici', 'Melis Özkan', 'Eklediğim çanta reddedilmiş, sebebini anlamadım.', 30),
        m('admin', 'Zeynep Kaya', 'Merhaba Melis, fotoğrafta çantanın tamamı görünmüyordu. Gün ışığında, tamamı görünecek şekilde yeniden çekip düzenlersen hemen onaylarız.', 26)], sonZaman: ts(26 * 36e5) },
    { id: 'demo-soh-4', uid: 'demo-15', ad: 'Ezgi Aksoy', eposta: uyeler[15].eposta, konu: 'Kargoyla gönderim', durum: 'kapali', adminOkudu: true, kullaniciOkudu: true,
      mesajlar: [m('kullanici', 'Ezgi Aksoy', 'İzmir\'deyim, kargoyla kiralama yapılabiliyor mu?', 80),
        m('admin', 'Elif Yılmaz', 'Evet, kiraya verenle anlaşarak kargoyla gönderim yapabilirsiniz. Kargo ücreti ve süresi kira süresine dahil edilmeli.', 76),
        m('kullanici', 'Ezgi Aksoy', 'Çok teşekkürler!', 75)], sonZaman: ts(75 * 36e5) }
  ];

  /* öne çıkarma örnekleri: üç parça şu an öne çıkan, biri ödeme onayı bekliyor, Elif'in biri ödeme bekliyor */
  const boostlar = [];
  const PK = { saatlik: [1, 10], gunluk: [24, 39], haftalik: [168, 149], aylik: [720, 399] };
  const boost = (e, paket, durum, kalanSaat) => {
    const [saat, fiyat] = PK[paket];
    const b = { id: 'demo-oc-' + boostlar.length, esyaId: e.id, esyaBaslik: e.baslik, esyaFoto: e.fotolar[0], sahipId: e.sahipId, sahipAd: e.sahipAd,
      paket, saat, fiyat, durum, baslangic: null, bitis: null, olusturma: ts(aralik(2, 40) * 36e5), guncelleme: ts(aralik(0, 30) * 36e5) };
    if (durum === 'aktif') { b.baslangic = ts((saat - kalanSaat) * 36e5); b.bitis = ts(-kalanSaat * 36e5); e.oneCikanBitis = b.bitis; }
    boostlar.push(b);
  };
  const onayli = esyalar.filter(e => e.onay === 'onaylandi' && e.aktif && e.sahipId !== 'demo-0');
  boost(onayli[2], 'haftalik', 'aktif', 96);
  boost(onayli[9], 'gunluk', 'aktif', 7);
  boost(onayli[17], 'aylik', 'aktif', 500);
  boost(onayli[24], 'gunluk', 'odeme_bildirildi');
  boost(onayli[30], 'saatlik', 'odeme_bildirildi');
  const elifOnayli = esyalar.find(e => e.sahipId === 'demo-0' && e.onay === 'onaylandi' && e.aktif);
  if (elifOnayli) boost(elifOnayli, 'haftalik', 'odeme_bekliyor');

  return { kullanicilar, esyalar, yorumlar, kiralamalar, uyeler, roller, olaylar, sohbetler, boostlar };
}
