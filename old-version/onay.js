/* sersoz.com — çerez / veri kullanım onayı
 *
 * KVKK ve benzeri düzenlemeler gereği, zorunlu olmayan veri işlemeleri
 * kullanıcı onayına bağlanır. Seçim tarayıcıda saklanır.
 *
 * Kategoriler:
 *   gerekli      — her zaman açık (oturum, sepet, güvenlik). Onay gerektirmez.
 *   istatistik   — ziyaret kayıtları (iz.js). Onaysız hiçbir kayıt yazılmaz.
 *   kisisel      — giriş yapan kullanıcının profil kaydı (ad, e-posta, fotoğraf).
 *
 * Diğer betikler şu API ile sorar:
 *   Onay.izinVar('istatistik')  ->  true / false
 *   Onay.bekle(fn)              ->  seçim yapıldığında/varsa hemen çağırır
 */
(function (global) {
  'use strict';

  var ANAHTAR = 'sersoz_onay_v1';
  var dinleyiciler = [];

  function oku() {
    try {
      var h = localStorage.getItem(ANAHTAR);
      return h ? JSON.parse(h) : null;
    } catch (e) { return null; }
  }

  function yaz(secim) {
    secim.tarih = new Date().toISOString();
    secim.surum = 1;
    try { localStorage.setItem(ANAHTAR, JSON.stringify(secim)); } catch (e) {}
    for (var i = 0; i < dinleyiciler.length; i++) {
      try { dinleyiciler[i](secim); } catch (e) {}
    }
    dinleyiciler = [];
  }

  var Onay = {
    durum: oku,
    izinVar: function (kategori) {
      var s = oku();
      return !!(s && s[kategori] === true);
    },
    bekle: function (fn) {
      var s = oku();
      if (s) { try { fn(s); } catch (e) {} return; }
      dinleyiciler.push(fn);
    },
    /* Ayarları yeniden açmak için (gizlilik sayfasındaki bağlantı kullanır) */
    yenidenSor: function () {
      try { localStorage.removeItem(ANAHTAR); } catch (e) {}
      goster();
    }
  };
  global.Onay = Onay;

  /* --------------------------------------------------------------- arayüz */
  function goster() {
    if (document.getElementById('onayBandi')) return;

    var stil = document.createElement('style');
    stil.textContent = [
      '#onayBandi{position:fixed;left:0;right:0;bottom:0;z-index:80;',
      '  background:#11161d;color:#e8edf5;border-top:2px solid #c2410c;',
      '  padding:18px 22px;font-family:var(--sans,system-ui,sans-serif);',
      '  box-shadow:0 -8px 28px rgba(0,0,0,.25);',
      '  transform:translateY(100%);transition:transform .38s cubic-bezier(.2,.7,.3,1)}',
      '#onayBandi.acik{transform:none}',
      '#onayBandi .ic{max-width:1120px;margin:0 auto;display:flex;gap:22px;',
      '  align-items:flex-start;flex-wrap:wrap;justify-content:space-between}',
      '#onayBandi .metin{flex:1 1 420px;font-size:13.5px;line-height:1.65;color:rgba(232,237,245,.82)}',
      '#onayBandi .metin b{color:#fff}',
      '#onayBandi .metin a{color:#ffb47a}',
      '#onayBandi .dugmeler{display:flex;gap:9px;flex-wrap:wrap;align-items:center}',
      '#onayBandi button{cursor:pointer;padding:11px 18px;border:1px solid rgba(255,255,255,.28);',
      '  background:transparent;color:#e8edf5;font-family:var(--mono,Consolas,monospace);',
      '  font-size:11px;letter-spacing:.12em;text-transform:uppercase;',
      '  transition:border-color .2s,background .2s,color .2s}',
      '#onayBandi button:hover{border-color:#ffb47a;color:#ffb47a}',
      '#onayBandi button.ana{background:#c2410c;border-color:#c2410c;color:#fff}',
      '#onayBandi button.ana:hover{background:#e0561c;border-color:#e0561c;color:#fff}',
      '#onayBandi .secenekler{flex:1 1 100%;display:none;gap:18px;flex-wrap:wrap;',
      '  margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}',
      '#onayBandi .secenekler.acik{display:flex}',
      '#onayBandi .kutu{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;',
      '  line-height:1.55;color:rgba(232,237,245,.75);max-width:330px}',
      '#onayBandi .kutu input{margin-top:2px;width:15px;height:15px;accent-color:#c2410c}',
      '#onayBandi .kutu b{display:block;color:#fff;font-size:12px;letter-spacing:.04em}',
      '@media(max-width:640px){#onayBandi{padding:15px 16px}',
      '  #onayBandi .dugmeler{width:100%}#onayBandi button{flex:1 1 auto}}'
    ].join('');
    document.head.appendChild(stil);

    var b = document.createElement('div');
    b.id = 'onayBandi';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Veri kullanım onayı');
    b.innerHTML =
      '<div class="ic">' +
        '<div class="metin">' +
          '<b>Bu sitede hangi verileri işliyoruz?</b><br>' +
          'Sitenin çalışması için gereken bilgiler (oturum, sepet) her zaman tutulur. ' +
          'Bunun dışında ziyaret istatistikleri ve giriş yapan kullanıcıların profil bilgileri ' +
          'yalnızca <b>siz izin verirseniz</b> saklanır. Ayrıntı: ' +
          '<a href="/gizlilik.html">Gizlilik ve Çerez Bildirimi</a>' +
        '</div>' +
        '<div class="dugmeler">' +
          '<button type="button" id="onaySecenek">Seçenekler</button>' +
          '<button type="button" id="onayGerekli">Yalnız gerekli</button>' +
          '<button type="button" class="ana" id="onayHepsi">Kabul et</button>' +
        '</div>' +
        '<div class="secenekler" id="onaySecenekler">' +
          '<label class="kutu"><input type="checkbox" disabled checked>' +
            '<span><b>Gerekli</b>Oturum, sepet ve güvenlik. Kapatılamaz, kişisel veri içermez.</span></label>' +
          '<label class="kutu"><input type="checkbox" id="onayIstatistik">' +
            '<span><b>İstatistik</b>Hangi sayfaların gezildiği, nereden gelindiği. Çerez kullanılmaz, ' +
            'kimliğiniz kaydedilmez.</span></label>' +
          '<label class="kutu"><input type="checkbox" id="onayKisisel">' +
            '<span><b>Kişiselleştirme</b>Giriş yaptığınızda adınız, e-postanız ve profil fotoğrafınız ' +
            'hesabınıza bağlı olarak saklanır.</span></label>' +
        '</div>' +
      '</div>';
    document.body.appendChild(b);
    requestAnimationFrame(function () { b.classList.add('acik'); });

    function kapat() {
      b.classList.remove('acik');
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 420);
    }

    document.getElementById('onaySecenek').onclick = function () {
      document.getElementById('onaySecenekler').classList.toggle('acik');
    };
    document.getElementById('onayGerekli').onclick = function () {
      yaz({ istatistik: false, kisisel: false }); kapat();
    };
    document.getElementById('onayHepsi').onclick = function () {
      var s = document.getElementById('onaySecenekler');
      if (s.classList.contains('acik')) {
        yaz({
          istatistik: document.getElementById('onayIstatistik').checked,
          kisisel: document.getElementById('onayKisisel').checked
        });
      } else {
        yaz({ istatistik: true, kisisel: true });
      }
      kapat();
    };
  }

  /* Seçim yapılmadıysa bandı göster */
  function baslat() {
    if (!oku()) goster();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', baslat);
  } else {
    baslat();
  }
})(window);
