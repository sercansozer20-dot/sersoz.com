/* sersoz.com — hafif ziyaret izleyici
 *
 * Firestore REST API'sine anonim kayıt bırakır; Firebase SDK yüklemez (~1 KB).
 * Kişisel veri toplanmaz: IP, çerez, parmak izi yok. Yalnız sayfa yolu, zaman,
 * yönlendiren site, ekran genişliği, dil ve oturum boyu yaşayan rastgele bir kimlik.
 * Tarayıcıda "izlenmek istemiyorum" (Do Not Track) açıksa hiçbir kayıt yapılmaz.
 */
(function () {
  'use strict';

  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  /* YEREL_ATLA — gelistirme trafigi istatistikleri kirletmesin */
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '' || h.indexOf('192.168.') === 0) return;

  var PROJE = 'sersoz-f93c3';
  var URL_ = 'https://firestore.googleapis.com/v1/projects/' + PROJE +
             '/databases/(default)/documents/ziyaretler';

  var sid;
  try {
    sid = sessionStorage.getItem('sersoz_oturum');
    if (!sid) {
      sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      sessionStorage.setItem('sersoz_oturum', sid);
    }
  } catch (e) {
    sid = 'gecici';
  }

  function kaynakBul() {
    var r = document.referrer || '';
    if (!r) return 'dogrudan';
    try {
      var h = new URL(r).hostname;
      if (h === location.hostname) return 'ic';
      return h.slice(0, 120);
    } catch (e) { return 'bilinmiyor'; }
  }

  function yaz(olay) {
    var govde = {
      fields: {
        sayfa: { stringValue: (location.pathname + location.search).slice(0, 120) },
        zaman: { timestampValue: new Date().toISOString() },
        kaynak: { stringValue: kaynakBul() },
        genislik: { integerValue: String(window.innerWidth || 0) },
        dil: { stringValue: (navigator.language || '').slice(0, 12) },
        oturum: { stringValue: sid },
        olay: { stringValue: olay }
      }
    };

    try {
      fetch(URL_, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
        keepalive: true,
        mode: 'cors'
      }).catch(function () {});
    } catch (e) {}
  }

  var cikisYazildi = false;
  function cikis() {
    if (cikisYazildi) return;
    cikisYazildi = true;
    yaz('cikis');
  }

  /* Kayıt yalnızca İstatistik onayı verilmişse tutulur (KVKK).
     Onay yoksa hiçbir istek gönderilmez. */
  function basla() {
    yaz('giris');
    addEventListener('pagehide', cikis);
    addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') cikis();
    });
  }

  function onayKontrol() {
    if (!window.Onay) {
      /* onay.js yoksa güvenli taraf: kayıt tutma */
      return;
    }
    window.Onay.bekle(function (secim) {
      if (secim && secim.istatistik === true) basla();
    });
  }

  /* onay.js defer ile yükleniyor olabilir — hazır olunca bak */
  if (window.Onay) onayKontrol();
  else addEventListener('DOMContentLoaded', onayKontrol);
})();
