/* sersoz.com — mağaza ortak betiği
 *
 * Her sayfada ayarlar.js ve urunler.js'ten SONRA yüklenir. Üst çubuğu, alt
 * bilgiyi ve sepet çekmecesini kendisi çizer; sayfalar yalnız
 * <header id="ust"></header> ve <footer id="alt"></footer> yer tutucularını koyar.
 *
 * Sepet tarayıcıda tutulur: localStorage 'sersoz_sepet_v2' = { urunId: adet }.
 * (v1 eski sitenin farklı biçimli sepetiydi; old-version/ hâlâ onu kullanır.)
 */
(function (global) {
  'use strict';

  var AYAR = global.SERSOZ_AYAR || {};
  var URUNLER = global.SERSOZ_URUNLER || [];
  var LS_SEPET = 'sersoz_sepet_v2';
  var LS_TEMA = 'sersoz_tema';

  var TL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  var TUR = { dijital: 'Yazılım', hizmet: 'Hizmet', urun: 'Donanım' };

  var IKON = {
    sepet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>',
    ay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    gunes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    kapat: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    tik: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>',
    kalkan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    kamyon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
    mesaj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>'
  };

  /* Türüne göre ürün çizimi — gerçek fotoğraf gelene kadar. */
  var CIZIM = {
    dijital: '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="10" width="100" height="64" rx="6"/><path d="M44 90h32M60 74v16"/><path d="M28 56l14-16 12 10 16-20 22 26" stroke-linecap="round"/><circle cx="84" cy="28" r="5" fill="currentColor" stroke="none"/></svg>',
    hizmet: '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="60" cy="50" r="14"/><path d="M60 18v10M60 72v10M28 50h10M82 50h10M37 27l7 7M76 66l7 7M37 73l7-7M76 34l7-7"/></svg>',
    urun: '<svg viewBox="0 0 120 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true"><path d="M60 10 104 32v36L60 90 16 68V32z"/><path d="M16 32l44 22 44-22M60 54v36"/><path d="M38 21l44 22" opacity=".5"/></svg>'
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
  function oku(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function gorsel(u, sinif) {
    var ic = u.gorsel
      ? '<img src="' + esc(u.gorsel) + '" alt="" loading="lazy">'
      : (CIZIM[u.tur] || CIZIM.dijital);
    return '<div class="gorsel g-' + esc(u.tur) + (sinif ? ' ' + sinif : '') + '">' + ic + '</div>';
  }

  function fiyatHTML(u) {
    return tl(u.fiyat) + (u.eskiFiyat ? '<s>' + tl(u.eskiFiyat) + '</s>' : '');
  }

  function kart(u) {
    var link = 'urun.html?id=' + encodeURIComponent(u.id);
    return '<article class="kart">' +
      '<a class="kart-gorsel" href="' + link + '" tabindex="-1" aria-hidden="true">' +
        (u.rozet ? '<span class="kart-rozet">' + esc(u.rozet) + '</span>' : '') + gorsel(u) +
      '</a>' +
      '<div class="kart-govde">' +
        '<span class="kart-tur">' + esc(TUR[u.tur] || '') + '</span>' +
        '<a class="kart-ad" href="' + link + '">' + esc(u.ad) + '</a>' +
        '<p class="kart-kisa">' + esc(u.kisa) + '</p>' +
        '<div class="kart-alt"><span class="fiyat">' + fiyatHTML(u) + '</span>' +
        '<button type="button" class="dug dug-koyu" data-ekle="' + esc(u.id) + '" aria-label="' + esc(u.ad) + ' sepete ekle">Sepete ekle</button></div>' +
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
    var link = 'urun.html?id=' + encodeURIComponent(l.u.id);
    return '<div class="satir">' + gorsel(l.u) +
      '<div><a class="satir-ad" href="' + link + '">' + esc(l.u.ad) + '</a>' +
      (duzenlenebilir
        ? '<div class="satir-alt"><span class="adet" role="group" aria-label="Adet">' +
            '<button type="button" data-azalt="' + esc(l.u.id) + '" aria-label="Azalt">−</button>' +
            '<span>' + l.adet + '</span>' +
            '<button type="button" data-arttir="' + esc(l.u.id) + '" aria-label="Arttır">+</button></span>' +
            '<button type="button" class="sil" data-sil="' + esc(l.u.id) + '">Kaldır</button></div>'
        : '<div class="kucuk">' + l.adet + ' adet × ' + tl(l.u.fiyat) + '</div>') +
      '</div><div class="satir-fiyat">' + tl(l.tutar) + '</div></div>';
  }

  /* ------------------------------------------------------------- çekmece */
  var sonOdak = null;
  function cekmeceCiz() {
    var govde = $('#cekmeceGovde'), alt = $('#cekmeceAlt');
    if (!govde) return;
    var st = Sepet.satirlar();
    if (!st.length) {
      govde.innerHTML = '<div class="cekmece-bos">' + IKON.sepet + '<p><strong>Sepetiniz boş</strong></p><p class="kucuk" style="margin-top:6px">Ürünlere göz atıp beğendiğinizi ekleyin.</p></div>';
      alt.innerHTML = '<a class="dug dug-cizgi dug-tam" href="index.html#urunler" data-kapat>Ürünlere göz at</a>';
      return;
    }
    govde.innerHTML = st.map(function (l) { return satirHTML(l, true); }).join('');
    alt.innerHTML = toplamHTML(Sepet.toplamlar()) +
      '<a class="dug dug-ana dug-buyuk dug-tam" href="sepet.html">Siparişi tamamla</a>' +
      '<button type="button" class="dug dug-cizgi dug-tam" data-kapat>Alışverişe devam et</button>';
  }
  function cekmeceAc() {
    sonOdak = document.activeElement;
    cekmeceCiz();
    var o = $('#ortu'), c = $('#cekmece');
    o.hidden = false; c.hidden = false;
    requestAnimationFrame(function () { o.classList.add('acik'); c.classList.add('acik'); });
    document.body.style.overflow = 'hidden';
    setTimeout(function () { var k = $('#cekmeceKapat'); if (k) k.focus(); }, 60);
  }
  function cekmeceKapat() {
    var o = $('#ortu'), c = $('#cekmece');
    if (!c || c.hidden) return;
    o.classList.remove('acik'); c.classList.remove('acik');
    document.body.style.overflow = '';
    setTimeout(function () { o.hidden = true; c.hidden = true; }, 250);
    if (sonOdak && sonOdak.focus) sonOdak.focus();
  }

  /* ------------------------------------------------------------ bildirim */
  var bildirimSayac;
  function bildir(mesaj, eylem) {
    var b = $('#bildirim');
    b.innerHTML = '<span>' + esc(mesaj) + '</span>' + (eylem ? '<button type="button" data-sepet-ac>' + esc(eylem) + '</button>' : '');
    b.classList.add('gorun');
    clearTimeout(bildirimSayac);
    bildirimSayac = setTimeout(function () { b.classList.remove('gorun'); }, 3600);
  }

  /* -------------------------------------------------------- iskelet çizimi */
  function ustCiz() {
    var ust = $('#ust');
    if (!ust) return;
    var sayfa = document.body.getAttribute('data-sayfa') || '';
    function a(href, ad, k) { return '<a href="' + href + '"' + (sayfa === k ? ' aria-current="page"' : '') + '>' + ad + '</a>'; }
    ust.className = 'ust';
    ust.innerHTML = '<div class="kap">' +
      '<a class="logo" href="index.html" aria-label="' + esc(AYAR.magazaAdi) + ' ana sayfa"><span class="logo-isaret"><b>S</b></span>' + esc(AYAR.magazaAdi || 'SERSOZ') + '</a>' +
      '<nav aria-label="Ana menü">' + a('index.html#urunler', 'Ürünler', 'urunler') + a('index.html#nasil', 'Nasıl satın alınır', '') + a('index.html#sss', 'Sorular', '') + a('index.html#iletisim', 'İletişim', '') + '</nav>' +
      '<div class="ust-sag">' +
        '<button type="button" class="dug dug-cizgi dug-ikon tema-dug" id="temaDug" aria-label="Temayı değiştir"></button>' +
        '<button type="button" class="dug dug-koyu sepet-dug" data-sepet-ac aria-label="Sepeti aç">' + IKON.sepet + '<span class="sepet-yazi">Sepet</span><span class="rozet-sayi" id="sepetSayi" hidden>0</span></button>' +
      '</div></div>';
    temaIkon();

    var kok = document.createElement('div');
    kok.innerHTML =
      '<div class="ortu" id="ortu" hidden data-kapat></div>' +
      '<aside class="cekmece" id="cekmece" hidden role="dialog" aria-modal="true" aria-labelledby="cekmeceBas">' +
        '<div class="cekmece-bas"><h2 id="cekmeceBas">Sepetim</h2><button type="button" class="dug dug-cizgi dug-ikon" id="cekmeceKapat" data-kapat aria-label="Sepeti kapat">' + IKON.kapat + '</button></div>' +
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
    alt.innerHTML = '<div class="kap">' +
      '<div><strong style="color:var(--metin)">' + esc(AYAR.magazaAdi) + '</strong> · ' + esc(AYAR.sloganKisa) + '<br>' +
        '© ' + new Date().getFullYear() + ' ' + esc(AYAR.saticiAdi) + '</div>' +
      '<div class="alt-baglar">' +
        '<a href="mailto:' + esc(AYAR.eposta) + '">' + esc(AYAR.eposta) + '</a>' +
        (AYAR.telefon ? '<a href="tel:' + esc(AYAR.telefon.replace(/\s/g, '')) + '">' + esc(AYAR.telefon) + '</a>' : '') +
        (AYAR.whatsapp ? '<a href="https://wa.me/' + esc(AYAR.whatsapp) + '" rel="noopener">WhatsApp</a>' : '') +
        '<a href="kosullar.html">Satış koşulları ve iade</a>' +
        '<a href="kosullar.html#gizlilik">Gizlilik</a>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------------- tema */
  function temaSimdi() {
    var t = document.documentElement.getAttribute('data-tema');
    if (t) return t;
    return global.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'koyu' : 'acik';
  }
  function temaIkon() {
    var d = $('#temaDug');
    if (d) d.innerHTML = temaSimdi() === 'koyu' ? IKON.gunes : IKON.ay;
  }

  /* ------------------------------------------------------------ güncelleme */
  function guncelle() {
    var n = Sepet.adet(), r = $('#sepetSayi');
    if (r) {
      var once = r.textContent;
      r.textContent = n; r.hidden = n === 0;
      if (String(n) !== once && n > 0) { r.classList.remove('zipla'); void r.offsetWidth; r.classList.add('zipla'); }
    }
    var c = $('#cekmece');
    if (c && !c.hidden) cekmeceCiz();
    document.dispatchEvent(new CustomEvent('sepet:degisti'));
  }

  /* ------------------------------------------------------------- olaylar */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ekle],[data-sepet-ac],[data-kapat],[data-arttir],[data-azalt],[data-sil],#temaDug');
    if (!t) return;
    if (t.hasAttribute('data-ekle')) {
      var u = bul(t.getAttribute('data-ekle'));
      var adetAlan = t.getAttribute('data-adet-alan');
      var adet = adetAlan ? parseInt(($('#' + adetAlan) || {}).textContent, 10) || 1 : 1;
      Sepet.ekle(u.id, adet);
      bildir(u.ad + ' sepete eklendi', 'Sepeti gör');
      var eski = t.innerHTML;
      t.innerHTML = 'Eklendi ✓'; t.disabled = true;
      setTimeout(function () { t.innerHTML = eski; t.disabled = false; }, 1100);
    } else if (t.hasAttribute('data-sepet-ac')) {
      e.preventDefault(); $('#bildirim').classList.remove('gorun'); cekmeceAc();
    } else if (t.hasAttribute('data-kapat')) {
      if (t.tagName === 'A' && t.getAttribute('href').indexOf('#') > -1) cekmeceKapat();
      else { e.preventDefault(); cekmeceKapat(); }
    } else if (t.hasAttribute('data-arttir')) {
      var id = t.getAttribute('data-arttir'); Sepet.ayarla(id, (Sepet.ham()[id] || 0) + 1);
    } else if (t.hasAttribute('data-azalt')) {
      var id2 = t.getAttribute('data-azalt'); Sepet.ayarla(id2, (Sepet.ham()[id2] || 0) - 1);
    } else if (t.hasAttribute('data-sil')) {
      Sepet.ayarla(t.getAttribute('data-sil'), 0);
    } else if (t.id === 'temaDug') {
      var yeni = temaSimdi() === 'koyu' ? 'acik' : 'koyu';
      document.documentElement.setAttribute('data-tema', yeni);
      try { localStorage.setItem(LS_TEMA, yeni); } catch (er) {}
      temaIkon();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cekmeceKapat();
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
    ayar: AYAR, urunler: URUNLER, tur: TUR, ikon: IKON,
    bul: bul, tl: tl, esc: esc, gorsel: gorsel, kart: kart, fiyatHTML: fiyatHTML,
    sepet: Sepet, satirHTML: satirHTML, toplamHTML: toplamHTML,
    bildir: bildir, cekmeceAc: cekmeceAc
  };
})(window);
