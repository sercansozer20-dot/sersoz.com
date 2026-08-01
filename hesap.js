/* sersoz.com — ortak hesap bileşeni
 *
 * Her sayfanın gezinme çubuğuna "Giriş / Hesabım" denetimini yerleştirir.
 * Oturum açıksa avatar + Hesabım + Çıkış, kapalıysa Google ile giriş düğmesi.
 * Kendi giriş arayüzü olan sayfalarda (mağaza) devreye girmez.
 */
(function () {
  'use strict';

  /* Sayfanın kendi giriş arayüzü varsa karışma */
  if (document.getElementById('loginBtn') || document.getElementById('girisBtn')) return;

  var KAP = document.querySelector('.nav-links') || document.querySelector('.nav-right');
  if (!KAP) return;

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyBKmrw-nVmuFM7V4HGG0wosdxsVWV1dJ48",
    authDomain: "sersoz-f93c3.firebaseapp.com",
    projectId: "sersoz-f93c3",
    storageBucket: "sersoz-f93c3.firebasestorage.app",
    messagingSenderId: "173131115543",
    appId: "1:173131115543:web:f0313dd00ac0f2d3f80052"
  };

  /* ------------------------------------------------------------ stiller */
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
    '.hesap-kutu .avatar{width:22px;height:22px;border-radius:50%;border:1px solid var(--line,rgba(26,24,21,.28))}',
    '.hesap-kutu .cikis{border:none;padding:7px 4px;color:var(--muted,#5b564d);font-size:9.5px}',
    '.hesap-kutu svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;',
    '  stroke-linecap:round;stroke-linejoin:round}',
    '.hesap-kutu .ad{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '@media (max-width:640px){',
    '  .hesap-kutu{margin-left:6px}',
    '  .hesap-kutu .ad,.hesap-kutu .cikis{display:none}',
    '  .hesap-kutu button,.hesap-kutu a{padding:7px 9px}}'
  ].join('');
  document.head.appendChild(stil);

  var kutu = document.createElement('div');
  kutu.className = 'hesap-kutu';
  KAP.appendChild(kutu);

  var KISI_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 21c0-3.6 3.6-6 8-6s8 2.4 8 6"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Firebase gelene kadar tıklanabilir bir düğme dursun */
  var hazir = false, bekleyenGiris = false;
  kutu.innerHTML = '<button type="button" id="hesapGiris">' + KISI_SVG + '<span class="ad">Giriş</span></button>';
  document.getElementById('hesapGiris').onclick = function () {
    if (!hazir) { bekleyenGiris = true; return; }
  };

  function girisCiz(gir) {
    kutu.innerHTML = '<button type="button" id="hesapGiris">' + KISI_SVG +
      '<span class="ad">Giriş</span></button>';
    document.getElementById('hesapGiris').onclick = gir;
  }

  function hesapCiz(u, cik) {
    kutu.innerHTML =
      (u.photoURL ? '<img class="avatar" src="' + esc(u.photoURL) + '" alt="">' : '') +
      '<a href="/hesabim.html"><span class="ad">' +
        esc((u.displayName || 'Hesabım').split(' ')[0]) + '</span></a>' +
      '<button type="button" class="cikis" id="hesapCikis">Çıkış</button>';
    document.getElementById('hesapCikis').onclick = cik;
  }

  /* ------------------------------------------------------------ Firebase */
  var base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  import(base + 'firebase-app.js').then(function (appMod) {
    return Promise.all([
      appMod.initializeApp(FIREBASE_CONFIG),
      import(base + 'firebase-auth.js')
    ]);
  }).then(function (r) {
    var app = r[0], authMod = r[1];
    var auth = authMod.getAuth(app);
    var provider = new authMod.GoogleAuthProvider();
    hazir = true;

    function gir() {
      authMod.signInWithPopup(auth, provider).catch(function (e) {
        if (e && e.code === 'auth/popup-blocked') {
          alert('Tarayıcı giriş penceresini engelledi. Adres çubuğundaki engel simgesinden izin verip tekrar deneyin.');
        }
      });
    }
    function cik() { authMod.signOut(auth); }

    authMod.onAuthStateChanged(auth, function (u) {
      if (u) hesapCiz(u, cik); else girisCiz(gir);
    });

    if (bekleyenGiris) { bekleyenGiris = false; gir(); }
  }).catch(function () {
    /* Firebase yüklenemezse en azından hesap sayfasına bağlantı kalsın */
    kutu.innerHTML = '<a href="/hesabim.html">' + KISI_SVG + '<span class="ad">Hesabım</span></a>';
  });
})();
