/* sersoz.com — mağaza ortak betiği
 *
 * Her sayfada ayarlar.js, urunler.js (ve varsa urunler-ornek.js) SONRASINDA
 * yüklenir. Duyuru şeridini, başlığı, kategori menüsünü, alt bilgiyi ve sepet
 * çekmecesini kendisi çizer; sayfalar yalnız <header id="ust"></header> ve
 * <footer id="alt"></footer> yer tutucularını koyar.
 *
 * Sepet tarayıcıda tutulur: localStorage 'sersoz_sepet_v2' = { urunId: adet }.
 * (v1 eski sitenin farklı biçimli sepetiydi; old-version/ hâlâ onu kullanır.)
 */
(function (global) {
  'use strict';

  var AYAR = global.SERSOZ_AYAR || {};
  var URUNLER = global.SERSOZ_URUNLER || [];
  var KATEGORILER = global.SERSOZ_KATEGORILER || [];
  var LS_SEPET = 'sersoz_sepet_v2';

  var TL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var TUR = { dijital: 'Yazılım', hizmet: 'Hizmet', urun: 'Ürün' };

  function svg(ic, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic + '</svg>';
  }
  var IKON = {
    sepet: svg('<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/>'),
    ara: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', 2.2),
    kapat: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 2),
    mesaj: svg('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8"/>'),
    telefon: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    kamyon: svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'),
    kalkan: svg('<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    kredi: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    destek: svg('<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/>'),
    okSol: svg('<path d="m15 5-7 7 7 7"/>', 2.2),
    okSag: svg('<path d="m9 5 7 7-7 7"/>', 2.2),
    tik: svg('<path d="M5 12.5 10 17 19 7"/>', 2.4),

    /* kategori çizimleri — ürün fotoğrafı yokken de bunlar görünür */
    kart: svg('<rect x="4" y="4" width="16" height="16" rx="1.5"/><rect x="8.5" y="8.5" width="7" height="7"/><path d="M8 1.5v2.5M12 1.5v2.5M16 1.5v2.5M8 20v2.5M12 20v2.5M16 20v2.5M1.5 8h2.5M1.5 12h2.5M1.5 16h2.5M20 8h2.5M20 12h2.5M20 16h2.5"/>', 1.4),
    sensor: svg('<circle cx="7.5" cy="12" r="3.5"/><circle cx="16.5" cy="12" r="3.5"/><rect x="2" y="6" width="20" height="12" rx="1.5"/><circle cx="7.5" cy="12" r="1.2"/><circle cx="16.5" cy="12" r="1.2"/>', 1.4),
    motor: svg('<rect x="3" y="6" width="13" height="12" rx="1.5"/><path d="M16 10h3v4h-3M19 12h3"/><circle cx="9.5" cy="12" r="3"/><path d="M5 6V4M14 6V4"/>', 1.4),
    olcum: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><rect x="7.5" y="4.5" width="9" height="5" rx=".5"/><circle cx="12" cy="15" r="3"/><path d="m12 15 1.6-1.6M8 20h.01M16 20h.01"/>', 1.4),
    lehim: svg('<path d="M3 21 9 15"/><path d="m8 12 4 4 9-9-4-4z"/><path d="m14 5 5 5"/><path d="M5.5 18.5 4 20"/>', 1.4),
    kablo: svg('<path d="M4 4v5a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v3"/><rect x="2.5" y="2" width="3" height="3" rx=".5"/><rect x="18.5" y="19" width="3" height="3" rx=".5"/><path d="M10 13v4M14 13v-4"/>', 1.4),
    guc: svg('<rect x="3" y="7" width="16" height="10" rx="1.5"/><path d="M19 10h2v4h-2"/><path d="m11 8.5-2.5 4h4L10 15.5"/>', 1.4),
    kamera: svg('<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="4"/><circle cx="12" cy="13" r="1.5"/>', 1.4),
    yazilim: svg('<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/><path d="m9 9-2 2 2 2M15 9l2 2-2 2M13 8l-2 6"/>', 1.4),
    hizmet: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>', 1.4)
  };

  /* ---------------------------------------------------------- yardımcılar */
  function $(s, k) { return (k || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tl(n) { return TL.format(n); }
  function bul(id) { for (var i = 0; i < URUNLER.length; i++) if (URUNLER[i].id === id) return URUNLER[i]; return null; }
  function kategori(id) { for (var i = 0; i < KATEGORILER.length; i++) if (KATEGORILER[i].id === id) return KATEGORILER[i]; return null; }
  function oku(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function urunLink(u) { return 'urun.html?id=' + encodeURIComponent(u.id); }
  function katLink(id) { return 'kategori.html?k=' + encodeURIComponent(id); }
  function indirim(u) { return u.eskiFiyat && u.eskiFiyat > u.fiyat ? Math.round((1 - u.fiyat / u.eskiFiyat) * 100) : 0; }
  function katSayi(id) { return URUNLER.filter(function (u) { return u.kategori === id; }).length; }

  function urunIkon(u) {
    if (u.tur === 'dijital') return IKON.yazilim;
    if (u.tur === 'hizmet') return IKON.hizmet;
    var k = kategori(u.kategori);
    return IKON[(k && k.ikon) || 'kart'] || IKON.kart;
  }
  function gorsel(u) {
    return '<div class="gorsel">' + (u.gorsel ? '<img src="' + esc(u.gorsel) + '" alt="' + esc(u.ad) + '" loading="lazy">' : urunIkon(u)) + '</div>';
  }
  function rozetler(u) {
    var r = '', y = indirim(u);
    if (y) r += '<span class="rozet indirim">%' + y + ' İndirim</span>';
    if (u.yeni) r += '<span class="rozet yeni">Yeni</span>';
    if (u.ornek) r += '<span class="rozet ornek">Örnek</span>';
    return r ? '<div class="rozetler">' + r + '</div>' : '';
  }
  function fiyatHTML(u) {
    return (u.eskiFiyat ? '<s>' + tl(u.eskiFiyat) + '</s>' : '') + '<b>' + tl(u.fiyat) + '</b>';
  }

  function kart(u) {
    return '<article class="kart">' +
      '<a class="kart-gorsel" href="' + urunLink(u) + '" tabindex="-1" aria-hidden="true">' + rozetler(u) + gorsel(u) + '</a>' +
      '<div class="kart-govde">' +
        '<a class="kart-ad" href="' + urunLink(u) + '">' + esc(u.ad) + '</a>' +
        '<div class="kart-kod">Ürün kodu: ' + esc(u.kod) + '</div>' +
        '<div class="kart-fiyat' + (indirim(u) ? ' indirimli' : '') + '">' + fiyatHTML(u) + '</div>' +
        '<div class="kart-alt">' + esc(u.teslimKisa || 'Stokta') + '</div>' +
        '<button type="button" class="dug dug-ana dug-tam" data-ekle="' + esc(u.id) + '" aria-label="' + esc(u.ad) + ' sepete ekle">Sepete Ekle</button>' +
      '</div></article>';
  }

  /* ---------------------------------------------------------------- sepet */
  var Sepet = {
    ham: function () {
      var s = oku(LS_SEPET, {}), temiz = {};
      for (var id in s) if (bul(id) && s[id] > 0) temiz[id] = Math.min(99, Math.floor(s[id]));
      return temiz;
    },
    kaydet: function (s) { yaz(LS_SEPET, s); guncelle(); },
    ekle: function (id, adet) {
      var s = this.ham(); s[id] = Math.min(99, (s[id] || 0) + (adet || 1)); this.kaydet(s);
    },
    ayarla: function (id, adet) {
      var s = this.ham(); if (adet <= 0) delete s[id]; else s[id] = Math.min(99, adet); this.kaydet(s);
    },
    temizle: function () { this.kaydet({}); },
    satirlar: function () {
      var s = this.ham(), out = [];
      for (var id in s) { var u = bul(id); out.push({ u: u, adet: s[id], tutar: u.fiyat * s[id] }); }
      return out;
    },
    adet: function () { var n = 0, s = this.ham(); for (var id in s) n += s[id]; return n; },
    toplamlar: function () {
      var st = this.satirlar(), ara = 0, fiziksel = false;
      st.forEach(function (l) { ara += l.tutar; if (l.u.tur === 'urun') fiziksel = true; });
      var k = AYAR.kargo || {};
      var kargo = (fiziksel && !(k.ucretsizEsik && ara >= k.ucretsizEsik)) ? (k.ucret || 0) : 0;
      var kdv = Math.round((ara + kargo) * (AYAR.kdvOrani || 0));
      return { ara: ara, kargo: kargo, fiziksel: fiziksel, kdv: kdv, genel: ara + kargo + kdv };
    }
  };

  function toplamHTML(t) {
    var h = '<div class="toplam-satir"><span>Ara toplam</span><span>' + tl(t.ara) + '</span></div>';
    if (t.fiziksel) h += '<div class="toplam-satir"><span>Kargo</span><span>' + (t.kargo ? tl(t.kargo) : 'Ücretsiz') + '</span></div>';
    if (t.kdv) h += '<div class="toplam-satir"><span>KDV</span><span>' + tl(t.kdv) + '</span></div>';
    h += '<div class="toplam-satir genel"><span>Toplam</span><span>' + tl(t.genel) + '</span></div>';
    return h;
  }

  function satirHTML(l, duzenlenebilir) {
    return '<div class="satir">' + gorsel(l.u) +
      '<div><a class="satir-ad" href="' + urunLink(l.u) + '">' + esc(l.u.ad) + '</a>' +
      (duzenlenebilir
        ? '<div class="satir-alt"><span class="adet" role="group" aria-label="Adet">' +
            '<button type="button" data-azalt="' + esc(l.u.id) + '" aria-label="Azalt">−</button>' +
            '<span>' + l.adet + '</span>' +
            '<button type="button" data-arttir="' + esc(l.u.id) + '" aria-label="Arttır">+</button></span>' +
            '<button type="button" class="sil" data-sil="' + esc(l.u.id) + '">Sil</button></div>'
        : '<div class="kucuk" style="margin-top:3px">' + l.adet + ' adet × ' + tl(l.u.fiyat) + '</div>') +
      '</div><div class="satir-fiyat">' + tl(l.tutar) + '</div></div>';
  }

  function kargoCubukHTML(t) {
    var k = AYAR.kargo || {};
    if (!t.fiziksel || !k.ucretsizEsik) return '';
    if (t.ara >= k.ucretsizEsik) return '<div class="kargo-cubuk"><b style="color:var(--yesil)">Kargonuz ücretsiz.</b><div class="ray"><i style="width:100%"></i></div></div>';
    var oran = Math.round(t.ara / k.ucretsizEsik * 100);
    return '<div class="kargo-cubuk">Ücretsiz kargo için <b>' + tl(k.ucretsizEsik - t.ara) + '</b> daha ekleyin.<div class="ray"><i style="width:' + oran + '%"></i></div></div>';
  }

  /* ------------------------------------------------------------- çekmece */
  var sonOdak = null;
  function cekmeceCiz() {
    var govde = $('#cekmeceGovde'), alt = $('#cekmeceAlt');
    if (!govde) return;
    var st = Sepet.satirlar();
    $('#cekmeceBas').textContent = 'Sepetim' + (st.length ? ' (' + Sepet.adet() + ' ürün)' : '');
    if (!st.length) {
      govde.innerHTML = '<div class="cekmece-bos">' + IKON.sepet + '<p><b>Sepetiniz boş</b></p><p class="kucuk" style="margin-top:4px">Ürünleri inceleyip sepete ekleyebilirsiniz.</p></div>';
      alt.innerHTML = '<a class="dug dug-ana dug-tam" href="index.html" data-kapat>Alışverişe başla</a>';
      return;
    }
    var t = Sepet.toplamlar();
    govde.innerHTML = st.map(function (l) { return satirHTML(l, true); }).join('');
    alt.innerHTML = kargoCubukHTML(t) + toplamHTML(t) +
      '<a class="dug dug-ana dug-buyuk dug-tam" href="sepet.html" style="margin-top:6px">Sepeti Onayla</a>' +
      '<button type="button" class="dug dug-tam" data-kapat>Alışverişe devam et</button>';
  }
  function cekmeceAc() {
    sonOdak = document.activeElement;
    cekmeceCiz();
    var o = $('#ortu'), c = $('#cekmece');
    o.hidden = false; c.hidden = false;
    requestAnimationFrame(function () { c.classList.add('acik'); });
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var k = $('#cekmeceKapat'); if (k) k.focus(); }, 50);
  }
  function cekmeceKapat() {
    var o = $('#ortu'), c = $('#cekmece');
    if (!c || c.hidden) return;
    c.classList.remove('acik'); o.hidden = true;
    document.body.style.overflow = '';
    setTimeout(function () { c.hidden = true; }, 220);
    if (sonOdak && sonOdak.focus) sonOdak.focus();
  }

  /* ------------------------------------------------------------ bildirim */
  var bildirimSayac;
  function bildir(mesaj, eylem) {
    var b = $('#bildirim');
    b.innerHTML = '<span style="color:var(--yesil);width:20px;flex:none">' + IKON.tik + '</span><span>' + esc(mesaj) + '</span>' +
      (eylem ? '<button type="button" class="dug dug-ana" data-sepet-ac>' + esc(eylem) + '</button>' : '');
    b.classList.add('gorun');
    clearTimeout(bildirimSayac);
    bildirimSayac = setTimeout(function () { b.classList.remove('gorun'); }, 3500);
  }

  /* -------------------------------------------------------- iskelet çizimi */
  function ustCiz() {
    var ust = $('#ust');
    if (!ust) return;
    var params = new URLSearchParams(location.search);
    var q = params.get('q') || '';
    var k = AYAR.kargo || {};

    var duyuru = document.createElement('div');
    duyuru.className = 'duyuru';
    var duyurular = AYAR.duyurular && AYAR.duyurular.length ? AYAR.duyurular
      : (k.ucretsizEsik ? [tl(k.ucretsizEsik).replace(',00', '') + ' ve üzeri siparişlerde kargo bedava'] : []);
    duyuru.innerHTML = '<div class="kap">' + duyurular.map(function (d, i) {
      return '<span' + (i ? ' class="ikincil"' : '') + '>' + esc(d) + '</span>';
    }).join('') + '</div>';
    duyuru.hidden = !duyurular.length;
    ust.parentNode.insertBefore(duyuru, ust);

    ust.className = 'ust';
    ust.innerHTML = '<div class="kap ust-ana">' +
      '<a class="logo" href="index.html" aria-label="' + esc(AYAR.magazaAdi) + ' ana sayfa">' + '<span class="wm" aria-hidden="true">SERS<span class="mercek"></span>Z</span>' +
        '<small>Elektronik · Robotik · Görüntü</small></a>' +
      '<form class="arama" action="kategori.html" role="search">' +
        '<label class="sr-only" for="ustAra">Ürün ara</label>' +
        '<input id="ustAra" name="q" type="search" placeholder="Ürün, kategori veya ürün kodu ara" value="' + esc(q) + '" autocomplete="off">' +
        '<button type="submit" aria-label="Ara">' + IKON.ara + '</button>' +
      '</form>' +
      '<div class="ust-eylem">' +
        '<a class="ust-link gizle-m" href="' + (AYAR.whatsapp ? 'https://wa.me/' + esc(AYAR.whatsapp) : 'mailto:' + esc(AYAR.eposta)) + '">' + IKON.destek + '<span><b>Destek</b>Soru sorun</span></a>' +
        '<button type="button" class="dug dug-ana sepet-dug" data-sepet-ac aria-label="Sepeti aç">' + IKON.sepet + '<span class="yazi">Sepetim</span><span class="sayi" id="sepetSayi" hidden>0</span></button>' +
      '</div></div>';

    var menu = document.createElement('nav');
    menu.className = 'menu-cubuk';
    menu.setAttribute('aria-label', 'Kategoriler');
    var sayfa = location.pathname.split('/').pop();
    var aktifK = params.get('k') || params.get('liste');
    function ml(href, ad, anahtar, ek) {
      return '<a class="menu-link' + (ek ? ' ' + ek : '') + '" href="' + href + '"' + (aktifK === anahtar && sayfa === 'kategori.html' ? ' aria-current="page"' : '') + '>' + ad + '</a>';
    }
    menu.innerHTML = '<div class="kap">' +
      '<div class="tum-kat" id="tumKat"><button type="button" aria-expanded="false" aria-controls="katAcilir">' + IKON.menu + 'Tüm Kategoriler</button>' +
        '<div class="kat-acilir" id="katAcilir">' +
          KATEGORILER.map(function (c) { return '<a href="' + katLink(c.id) + '">' + (IKON[c.ikon] || '') + esc(c.ad) + '<span>' + katSayi(c.id) + '</span></a>'; }).join('') +
        '</div></div>' +
      ml('kategori.html?liste=indirim', 'İndirimli Ürünler', 'indirim', 'vurgu') +
      ml('kategori.html?liste=yeni', 'Yeni Ürünler', 'yeni') +
      ml(katLink('makine-gorusu'), 'Makine Görüşü', 'makine-gorusu') +
      ml('kategori.html?liste=hepsi', 'Tüm Ürünler', 'hepsi') +
      '<span class="sag">Destek: <b>' + esc(AYAR.telefon || AYAR.eposta) + '</b></span>' +
      '</div>';
    ust.parentNode.insertBefore(menu, ust.nextSibling);

    var kok = document.createElement('div');
    kok.innerHTML =
      '<div class="ortu" id="ortu" hidden data-kapat></div>' +
      '<aside class="cekmece" id="cekmece" hidden role="dialog" aria-modal="true" aria-labelledby="cekmeceBas">' +
        '<div class="cekmece-bas"><h2 id="cekmeceBas">Sepetim</h2><button type="button" class="dug dug-ikon" id="cekmeceKapat" data-kapat aria-label="Sepeti kapat" style="border:0">' + IKON.kapat + '</button></div>' +
        '<div class="cekmece-govde" id="cekmeceGovde"></div>' +
        '<div class="cekmece-alt" id="cekmeceAlt"></div>' +
      '</aside>' +
      '<div class="bildirim" id="bildirim" role="status" aria-live="polite"></div>';
    while (kok.firstChild) document.body.appendChild(kok.firstChild);
  }

  function altCiz() {
    var alt = $('#alt');
    if (!alt) return;
    alt.className = 'alt';
    alt.id = 'iletisim';
    alt.innerHTML = '<div class="kap alt-ust">' +
      '<div><a class="logo" href="index.html" aria-label="' + esc(AYAR.magazaAdi) + ' ana sayfa">' + '<span class="wm" aria-hidden="true">SERS<span class="mercek"></span>Z</span>' + '</a>' +
        '<p>Geliştirme kartları, sensörler, motor ve sürücüler, ölçüm aletleri ve makine görüşü çözümleri.</p></div>' +
      '<div><h3>Kategoriler</h3><ul>' +
        KATEGORILER.slice(0, 6).map(function (c) { return '<li><a href="' + katLink(c.id) + '">' + esc(c.ad) + '</a></li>'; }).join('') +
      '</ul></div>' +
      '<div><h3>Müşteri Hizmetleri</h3><ul>' +
        '<li><a href="kosullar.html">Satış Koşulları</a></li>' +
        '<li><a href="kosullar.html#iade">İade ve Değişim</a></li>' +
        '<li><a href="kosullar.html#teslimat">Kargo ve Teslimat</a></li>' +
        '<li><a href="kosullar.html#gizlilik">Gizlilik</a></li>' +
      '</ul></div>' +
      '<div><h3>İletişim</h3><ul>' +
        '<li><a href="mailto:' + esc(AYAR.eposta) + '">' + esc(AYAR.eposta) + '</a></li>' +
        (AYAR.telefon ? '<li><a href="tel:' + esc(AYAR.telefon.replace(/\s/g, '')) + '">' + esc(AYAR.telefon) + '</a></li>' : '') +
        (AYAR.whatsapp ? '<li><a href="https://wa.me/' + esc(AYAR.whatsapp) + '" rel="noopener">WhatsApp hattı</a></li>' : '') +
        '<li>Hafta içi 09:00 - 18:00</li>' +
      '</ul></div>' +
      '</div>' +
      '<div class="alt-alt"><div class="kap"><span>© ' + new Date().getFullYear() + ' ' + esc(AYAR.magazaAdi) + ' · ' + esc(AYAR.saticiAdi) + '</span>' +
        '<span class="odeme-rozet"><span>Havale / EFT</span>' + (URUNLER.some(function (u) { return u.shopier; }) ? '<span>Kredi Kartı · Shopier</span>' : '') + '</span></div></div>';
  }

  /* ------------------------------------------------------------ güncelleme */
  function guncelle() {
    var n = Sepet.adet(), r = $('#sepetSayi');
    if (r) { r.textContent = n; r.hidden = n === 0; }
    var c = $('#cekmece');
    if (c && !c.hidden) cekmeceCiz();
    document.dispatchEvent(new CustomEvent('sepet:degisti'));
  }

  /* ------------------------------------------------------------- olaylar */
  document.addEventListener('click', function (e) {
    var tk = $('#tumKat');
    if (tk) {
      var dug = e.target.closest('#tumKat > button');
      if (dug) {
        var acik = tk.classList.toggle('acik');
        dug.setAttribute('aria-expanded', String(acik));
        return;
      }
      if (!e.target.closest('#tumKat')) { tk.classList.remove('acik'); tk.firstChild.setAttribute('aria-expanded', 'false'); }
    }

    var t = e.target.closest('[data-ekle],[data-sepet-ac],[data-kapat],[data-arttir],[data-azalt],[data-sil]');
    if (!t) return;
    if (t.hasAttribute('data-ekle')) {
      var u = bul(t.getAttribute('data-ekle'));
      var adetAlan = t.getAttribute('data-adet-alan');
      var adet = adetAlan ? parseInt(($('#' + adetAlan) || {}).textContent, 10) || 1 : 1;
      Sepet.ekle(u.id, adet);
      bildir('Ürün sepetinize eklendi.', 'Sepete Git');
      var eski = t.textContent;
      t.textContent = 'Eklendi'; t.disabled = true;
      setTimeout(function () { t.textContent = eski; t.disabled = false; }, 1000);
    } else if (t.hasAttribute('data-sepet-ac')) {
      e.preventDefault(); $('#bildirim').classList.remove('gorun'); cekmeceAc();
    } else if (t.hasAttribute('data-kapat')) {
      if (t.tagName === 'A') cekmeceKapat();
      else { e.preventDefault(); cekmeceKapat(); }
    } else if (t.hasAttribute('data-arttir')) {
      var id = t.getAttribute('data-arttir'); Sepet.ayarla(id, (Sepet.ham()[id] || 0) + 1);
    } else if (t.hasAttribute('data-azalt')) {
      var id2 = t.getAttribute('data-azalt'); Sepet.ayarla(id2, (Sepet.ham()[id2] || 0) - 1);
    } else if (t.hasAttribute('data-sil')) {
      Sepet.ayarla(t.getAttribute('data-sil'), 0);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      cekmeceKapat();
      var tk = $('#tumKat'); if (tk) tk.classList.remove('acik');
    }
    if (e.key === 'Tab') {
      var c = $('#cekmece');
      if (!c || c.hidden) return;
      var f = c.querySelectorAll('a[href],button:not([disabled])');
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  /* Başka sekmede sepet değişirse bu sekme de güncellenir. */
  global.addEventListener('storage', function (e) { if (e.key === LS_SEPET) guncelle(); });

  ustCiz();
  altCiz();
  guncelle();

  global.Magaza = {
    ayar: AYAR, urunler: URUNLER, kategoriler: KATEGORILER, tur: TUR, ikon: IKON,
    bul: bul, kategori: kategori, katLink: katLink, katSayi: katSayi, tl: tl, esc: esc, indirim: indirim,
    gorsel: gorsel, rozetler: rozetler, kart: kart, fiyatHTML: fiyatHTML, urunLink: urunLink,
    sepet: Sepet, satirHTML: satirHTML, toplamHTML: toplamHTML,
    bildir: bildir, cekmeceAc: cekmeceAc
  };
})(window);
