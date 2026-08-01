/* sersoz.com — ortak hesap bileşeni
 *
 * 1) Her sayfanın gezinme çubuğuna "Giriş / Hesabım" denetimini yerleştirir.
 *    (Kendi giriş arayüzü olan sayfada — mağaza — arayüz eklenmez.)
 * 2) Giriş yapan kullanıcının profil kaydını tutar — YALNIZCA "Kişiselleştirme"
 *    onayı verilmişse (KVKK). Onay yoksa giriş çalışır ama kayıt yazılmaz.
 */
(function (global) {
  'use strict';

  var KAP = document.querySelector('.nav-links') || document.querySelector('.nav-right');
  var KENDI_GIRISI = !!(document.getElementById('loginBtn') || document.getElementById('girisBtn'));

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBKmrw-nVmuFM7V4HGG0wosdxsVWV1dJ48",
    authDomain: "sersoz-f93c3.firebaseapp.com",
    projectId: "sersoz-f93c3",
    storageBucket: "sersoz-f93c3.firebasestorage.app",
    messagingSenderId: "173131115543",
    appId: "1:173131115543:web:f0313dd00ac0f2d3f80052"
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var KISI_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21c0-3.6 3.6-6 8-6s8 2.4 8 6"/></svg>';

  /* ------------------------------------------------------------- arayüz */
  var kutu = null;

  function arayuzKur() {
    if (KENDI_GIRISI || !KAP) return;

    var stil = document.createElement('style');
    stil.textContent = [
      '.hesap-kutu{display:inline-flex!important;align-items:center;gap:8px;margin-left:10px}',
      '.hesap-kutu button,.hesap-kutu a{',
      '  display:inline-flex!important;align-items:center;gap:7px;cursor:pointer;',
      '  font-family:var(--mono,Consolas,monospace);font-size:10.5px;letter-spacing:.14em;',
      '  text-transform:uppercase;text-decoration:none;background:transparent;',
      '  color:var(--ink,#1a1815);border:1px solid var(--line,rgba(26,24,21,.28));',
      '  padding:7px 12px;transition:border-color .2s,color .2s}',
      '.hesap-kutu button:hover,.hesap-kutu a:hover{',
      '  border-color:var(--accent,#c2410c);color:var(--accent,#c2410c)}',
      '.hesap-kutu .avatar{width:22px;height:22px;border-radius:50%;',
      '  border:1px solid var(--line,rgba(26,24,21,.28))}',
      '.hesap-kutu .cikis{border:none;padding:7px 4px;color:var(--muted,#5b564d);font-size:9.5px}',
      '.hesap-kutu svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;',
      '  stroke-linecap:round;stroke-linejoin:round}',
      '.hesap-kutu .ad{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@media (max-width:640px){.hesap-kutu{margin-left:6px}',
      '  .hesap-kutu .ad,.hesap-kutu .cikis{display:none}',
      '  .hesap-kutu button,.hesap-kutu a{padding:7px 9px}}'
    ].join('');
    document.head.appendChild(stil);

    kutu = document.createElement('div');
    kutu.className = 'hesap-kutu';
    KAP.appendChild(kutu);
  }

  function girisCiz(gir) {
    if (!kutu) return;
    kutu.innerHTML = '<button type="button" id="hesapGiris">' + KISI_SVG +
      '<span class="ad">Giriş</span></button>';
    document.getElementById('hesapGiris').onclick = gir;
  }

  function hesapCiz(u, cik) {
    if (!kutu) return;
    kutu.innerHTML =
      (u.photoURL ? '<img class="avatar" src="' + esc(u.photoURL) + '" alt="">' : '') +
      '<a href="/hesabim.html"><span class="ad">' +
        esc((u.displayName || 'Hesabım').split(' ')[0]) + '</span></a>' +
      '<button type="button" class="cikis" id="hesapCikis">Çıkış</button>';
    document.getElementById('hesapCikis').onclick = cik;
  }

  /* --------------------------------------------------- profil kaydı (onaylı) */
  function profilYaz(fsMod, db, u) {
    if (!u) return;
    if (!global.Onay || !global.Onay.izinVar('kisisel')) return;   /* onay yoksa yazma */

    try {
      fsMod.setDoc(
        fsMod.doc(db, 'kullanicilar', u.uid),
        {
          uid: u.uid,
          eposta: u.email || '',
          ad: u.displayName || '',
          foto: u.photoURL || '',
          sonGiris: fsMod.serverTimestamp()
        },
        { merge: true }
      ).catch(function () { /* sessiz — giriş akışını bozmasın */ });
    } catch (e) {}
  }

  /* ------------------------------------------------------------ Firebase */
  arayuzKur();
  if (kutu) {
    kutu.innerHTML = '<button type="button" id="hesapGiris">' + KISI_SVG +
      '<span class="ad">Giriş</span></button>';
  }

  var base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  import(base + 'firebase-app.js').then(function (appMod) {
    return Promise.all([
      appMod.initializeApp(FIREBASE_CONFIG),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js')
    ]);
  }).then(function (r) {
    var app = r[0], authMod = r[1], fsMod = r[2];
    var auth = authMod.getAuth(app);
    var db = fsMod.getFirestore(app);
    var provider = new authMod.GoogleAuthProvider();

    function gir() {
      authMod.signInWithPopup(auth, provider).catch(function (e) {
        if (e && e.code === 'auth/popup-blocked') {
          alert('Tarayıcı giriş penceresini engelledi. Adres çubuğundaki engel ' +
                'simgesinden izin verip tekrar deneyin.');
        }
      });
    }
    function cik() { authMod.signOut(auth); }

    authMod.onAuthStateChanged(auth, function (u) {
      if (u) {
        hesapCiz(u, cik);
        profilYaz(fsMod, db, u);
        /* onay sonradan verilirse kaydı o an oluştur */
        if (global.Onay) {
          global.Onay.bekle(function () { profilYaz(fsMod, db, u); });
        }
      } else {
        girisCiz(gir);
      }
    });
  }).catch(function () {
    if (kutu) {
      kutu.innerHTML = '<a href="/hesabim.html">' + KISI_SVG +
        '<span class="ad">Hesabım</span></a>';
    }
  });
})(window);
