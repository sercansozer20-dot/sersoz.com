/* Elif'in Dolabı — kişiden kişiye kıyafet kiralama
 *
 * Firebase (sersoz-f93c3): Google ile giriş, Firestore (dolapEsyalar,
 * dolapKiralamalar), Storage (dolap/{uid}/ fotoğrafları).
 * Güvenlik kuralları: firestore.rules ve storage.rules — konsoldan ELLE yayımlanır.
 * Durum akışı ve kim neyi değiştirebilir: firestore.rules içindeki şemaya bakın.
 *
 * Sayfalar (adres çubuğundaki #):
 *   #kesfet · #esya/{id} · #dolabim · #kiralamalar · #kiralamalar/sahip · #kiralamalar/yonetim
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { demoVeri, DEMO_KULLANICI } from './elif-demo.js';

const app = initializeApp({
  apiKey: 'AIzaSyBKmrw-nVmuFM7V4HGG0wosdxsVWV1dJ48',
  authDomain: 'sersoz-f93c3.firebaseapp.com',
  projectId: 'sersoz-f93c3',
  storageBucket: 'sersoz-f93c3.firebasestorage.app',
  messagingSenderId: '173131115543',
  appId: '1:173131115543:web:f0313dd00ac0f2d3f80052'
});
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const YONETICI = 'sercansozer20@gmail.com';
const AYAR = window.SERSOZ_AYAR || {};
const LS_ILETISIM = 'elif_iletisim';
/* Sözleşme metni elif-sozlesme.html; madde değişirse sürümü artırın (firestore.rules'taki 'v1' ile birlikte). */
const SOZLESME_SURUM = 'v1';
const GECIKME_KAT = 1.5;        // geç iadede günlük kiranın katı
const KAYIP_GUN = 7;            // bu kadar gün geçerse teslim edilmemiş sayılır
const SARTLAR_OZET = '<ul class="sartlar">' +
  '<li><b>Geç iade:</b> her gün için günlük kiranın 1,5 katı depozitodan düşülür.</li>' +
  '<li><b>İade gününden 7 gün geçerse</b> eşya teslim edilmemiş sayılır; depozitonun tamamı kiraya verene ödenir, zarar daha büyükse fark kiracıdan istenir.</li>' +
  '<li><b>Hasar ve leke</b> bedeli depozitodan düşülür.</li>' +
  '<li><b>İptal:</b> başlangıca 48 saatten az kala kira bedelinin %50\'si ödenir.</li></ul>';

/* ?demo=1 → tarayıcıda üretilen örnek veriyle çalışır, veritabanına yazmaz (elif-demo.js) */
const DEMO = new URLSearchParams(location.search).has('demo');
const D = DEMO ? demoVeri() : null;
function demoEngel() {
  if (!DEMO) return false;
  bildir('Örnek modda değişiklik kaydedilmez.');
  return true;
}

/* veri katmanı: örnek modda bellekten, normalde Firestore'dan */
async function esyaListesi(alan, deger) {
  if (D) return D.esyalar.filter(e => e[alan] === deger).map(e => ({ ...e }));
  const snap = await getDocs(query(collection(db, 'dolapEsyalar'), where(alan, '==', deger)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function esyaGetir(id) {
  if (D) {
    const e = D.esyalar.find(x => x.id === id);
    if (!e) throw { message: 'Bu parça bulunamadı ya da kaldırıldı.' };
    return { ...e };
  }
  const s = await getDoc(doc(db, 'dolapEsyalar', id));
  if (!s.exists()) throw { message: 'Bu parça bulunamadı ya da kaldırıldı.' };
  return { id: s.id, ...s.data() };
}
async function kiraListesi(alan, deger) {
  if (D) return D.kiralamalar.filter(k => k[alan] === deger).map(k => ({ ...k }));
  return (await getDocs(query(collection(db, 'dolapKiralamalar'), where(alan, '==', deger)))).docs.map(d => ({ id: d.id, ...d.data() }));
}
/* Yorumlar şimdilik yalnız örnek modda var; gerçek yorum yazma sonraki adım. */
const yorumlar = id => (D && D.yorumlar[id]) || [];
function puanOzeti(id) {
  const y = yorumlar(id);
  if (!y.length) return null;
  return { ort: (y.reduce((t, x) => t + x.puan, 0) / y.length).toFixed(1).replace('.', ','), adet: y.length };
}
const yildiz = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

const KATEGORI = { elbise: 'Elbise', ust: 'Üst giyim', alt: 'Alt giyim', 'dis-giyim': 'Dış giyim', ayakkabi: 'Ayakkabı', canta: 'Çanta', aksesuar: 'Aksesuar', diger: 'Diğer' };
const DURUM = {
  beklemede: 'Onay bekliyor', onaylandi: 'Onaylandı · ödeme bekleniyor', odeme_bildirildi: 'Ödeme kontrol ediliyor',
  odendi: 'Ödendi · teslim bekleniyor', teslim_edildi: 'Kirada', iade_edildi: 'İade edildi', reddedildi: 'Reddedildi', iptal: 'İptal edildi'
};
const TL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

const $ = (s, k = document) => k.querySelector(s);
const icerik = $('#icerik');
let kullanici = null;
let aktifIstek = 0;   // eski sayfa yüklemeleri yenisinin üstüne yazmasın

/* ---------------------------------------------------------------- yardımcılar */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const tl = n => TL.format(n || 0);
const yonetici = () => !!kullanici && kullanici.email === YONETICI && kullanici.emailVerified;
const zaman = d => (d && d.toMillis ? d.toMillis() : 0);
const refKod = id => 'EK-' + id.slice(0, 6).toUpperCase();
const bugun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const gunFarki = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const tarihYaz = s => new Date(s + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

let bildirimSayac;
function bildir(m) {
  const b = $('#bildirim');
  b.textContent = m; b.hidden = false;
  clearTimeout(bildirimSayac);
  bildirimSayac = setTimeout(() => { b.hidden = true; }, 3800);
}
function hataMetni(e) {
  const k = e && e.code || '';
  if (k === 'auth/unauthorized-domain') return 'Bu alan adı Firebase\'de yetkili değil (Authentication → Settings → Authorized domains).';
  if (k === 'auth/popup-closed-by-user' || k === 'auth/cancelled-popup-request') return '';
  if (k === 'permission-denied' || k === 'storage/unauthorized') return 'İzin verilmedi. Veritabanı kuralları henüz yayımlanmamış olabilir.';
  return (e && e.message) || 'Bir hata oluştu.';
}

/* ---------------------------------------------------------------- oturum */
async function girisYap() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { const m = hataMetni(e); if (m) bildir(m); }
}
const G_IKON = '<svg class="g-ikon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function hesapCiz() {
  const h = $('#hesap');
  if (!kullanici) {
    h.innerHTML = '<button type="button" class="dug" id="girisDug">' + G_IKON + 'Google ile giriş</button>';
    $('#girisDug').onclick = girisYap;
    return;
  }
  h.innerHTML = (kullanici.photoURL ? '<img class="avatar" src="' + esc(kullanici.photoURL) + '" alt="" referrerpolicy="no-referrer">' : '') +
    '<span class="ad">' + esc(kullanici.displayName || kullanici.email) + '</span>' +
    '<button type="button" class="dug dug-kucuk" id="cikisDug">Çıkış</button>';
  $('#cikisDug').onclick = () => signOut(auth);
}
function girisCagrisi(baslik, metin) {
  icerik.innerHTML = '<div class="giris-cagri"><h2>' + esc(baslik) + '</h2><p>' + esc(metin) + '</p>' +
    '<button type="button" class="dug dug-ana" id="cagriGiris">' + G_IKON + 'Google ile giriş yap</button></div>';
  $('#cagriGiris').onclick = girisYap;
}

/* ---------------------------------------------------------------- yönlendirme */
function yol() { return (location.hash || '#kesfet').slice(1).split('/'); }
function sayfaCiz() {
  const [s, p] = yol();
  document.querySelectorAll('[data-sekme]').forEach(a => {
    const on = a.dataset.sekme === s || (s === 'esya' && a.dataset.sekme === 'kesfet');
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const istek = ++aktifIstek;
  if (s === 'esya' && p) return esyaSayfasi(p, istek);
  if (s === 'dolabim') return dolabim(istek);
  if (s === 'kiralamalar') return kiralamalar(p || 'kiraci', istek);
  return kesfet(istek);
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); sayfaCiz(); });

/* ---------------------------------------------------------------- eşya kartı */
function esyaKarti(e, kendi) {
  return '<a class="esya" href="#esya/' + esc(e.id) + '">' +
    '<span class="foto"><img src="' + esc(e.fotolar[0]) + '" alt="" loading="lazy">' +
      '<span class="etiket' + (e.aktif ? '' : ' pasif-etiket') + '">' + (e.aktif ? esc(KATEGORI[e.kategori] || '') : 'Yayında değil') + '</span></span>' +
    '<h3>' + esc(e.baslik) + '</h3>' +
    (puanOzeti(e.id) ? '<span class="puan">★ ' + puanOzeti(e.id).ort + ' <span>(' + puanOzeti(e.id).adet + ')</span></span>' : '') +
    '<span class="alt"><span>' + esc([e.marka, e.beden].filter(Boolean).join(' · ')) + '</span><span class="fiyat">' + tl(e.gunlukUcret) + ' / gün</span></span>' +
    (kendi ? '' : '<span class="sahip">' + (e.sahipFoto ? '<img src="' + esc(e.sahipFoto) + '" alt="" referrerpolicy="no-referrer">' : '') + esc(e.sahipAd) + '\'nin dolabı</span>') +
    '</a>';
}

/* ---------------------------------------------------------------- KEŞFET */
let kesfetSuzgec = 'hepsi', kesfetAra = '';
async function kesfet(istek) {
  icerik.innerHTML = '<div class="bas"><div><h1>Keşfet</h1><p>Herkesin dolabından kiralanabilir parçalar.</p></div>' +
    '<a class="dug dug-vurgu" href="#dolabim">+ Dolabına eşya ekle</a></div>' +
    '<div class="suzgec" id="suzgec"></div><div class="izgara" id="izgara"><p class="yukleniyor" style="grid-column:1/-1">Yükleniyor…</p></div>';
  let esyalar;
  try {
    esyalar = (await esyaListesi('aktif', true)).sort((a, b) => zaman(b.olusturma) - zaman(a.olusturma));
  } catch (e) {
    if (istek !== aktifIstek) return;
    $('#izgara').innerHTML = '<div class="bos"><h3>Liste yüklenemedi</h3><p>' + esc(hataMetni(e)) + '</p></div>';
    return;
  }
  if (istek !== aktifIstek) return;

  $('#suzgec').innerHTML = [['hepsi', 'Tümü']].concat(Object.entries(KATEGORI)).map(([k, ad]) =>
    '<button type="button" class="cip" data-k="' + k + '" aria-pressed="' + (k === kesfetSuzgec) + '">' + ad + '</button>').join('') +
    '<input class="ara" id="ara" type="search" placeholder="Marka, renk, parça ara…" value="' + esc(kesfetAra) + '" aria-label="Ara">';
  const ciz = () => {
    const q = kesfetAra.toLocaleLowerCase('tr-TR');
    const l = esyalar.filter(e => (kesfetSuzgec === 'hepsi' || e.kategori === kesfetSuzgec) &&
      (!q || [e.baslik, e.marka, e.renk, e.beden].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
    $('#izgara').innerHTML = l.length ? l.map(e => esyaKarti(e, kullanici && e.sahipId === kullanici.uid)).join('')
      : '<div class="bos"><h3>' + (esyalar.length ? 'Aramaya uyan parça yok' : 'Dolaplar henüz boş') + '</h3><p>' +
        (esyalar.length ? 'Başka bir kategori ya da kelime deneyin.' : 'İlk parçayı sen ekle, kiraya veren ilk kişi ol.') + '</p>' +
        (esyalar.length ? '' : '<a class="dug dug-vurgu" href="#dolabim">Dolabına eşya ekle</a>') + '</div>';
  };
  $('#suzgec').addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    kesfetSuzgec = b.dataset.k;
    document.querySelectorAll('#suzgec .cip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    ciz();
  });
  $('#ara').addEventListener('input', e => { kesfetAra = e.target.value; ciz(); });
  ciz();
}

/* ---------------------------------------------------------------- EŞYA SAYFASI */
async function esyaSayfasi(id, istek) {
  icerik.innerHTML = '<p class="yukleniyor">Yükleniyor…</p>';
  let e;
  try {
    e = await esyaGetir(id);
  } catch (h) {
    if (istek !== aktifIstek) return;
    icerik.innerHTML = '<div class="bos"><h3>Parça bulunamadı</h3><p>' + esc(hataMetni(h)) + '</p><a class="dug" href="#kesfet">Keşfet\'e dön</a></div>';
    return;
  }
  if (istek !== aktifIstek) return;
  const kendi = kullanici && kullanici.uid === e.sahipId;

  icerik.innerHTML = '<p class="kucuk" style="margin-bottom:14px"><a href="#kesfet">← Keşfet</a></p>' +
    '<div class="ayrinti">' +
      '<div class="galeri"><div class="buyuk"><img id="buyukFoto" src="' + esc(e.fotolar[0]) + '" alt="' + esc(e.baslik) + '"></div>' +
        (e.fotolar.length > 1 ? '<div class="kucukler">' + e.fotolar.map((f, i) =>
          '<button type="button" data-f="' + esc(f) + '" aria-current="' + (i === 0) + '" aria-label="Fotoğraf ' + (i + 1) + '"><img src="' + esc(f) + '" alt=""></button>').join('') + '</div>' : '') +
      '</div>' +
      '<div class="bilgi">' +
        '<span class="kucuk">' + esc(KATEGORI[e.kategori] || '') + '</span>' +
        '<h1>' + esc(e.baslik) + '</h1>' +
        '<p class="marka-beden">' + esc([e.marka, e.beden && 'Beden ' + e.beden, e.renk].filter(Boolean).join(' · ')) + '</p>' +
        (puanOzeti(e.id) ? '<p class="puan" style="margin-top:6px">★ ' + puanOzeti(e.id).ort + ' <span>· ' + puanOzeti(e.id).adet + ' yorum</span></p>' : '') +
        '<p class="ucret">' + tl(e.gunlukUcret) + ' <small>/ gün</small></p>' +
        (e.depozito ? '<p class="kucuk">+ ' + tl(e.depozito) + ' depozito (iade edilir)</p>' : '') +
        '<p class="kucuk" style="margin-top:4px"><a href="elif-sozlesme.html" target="_blank" style="text-decoration:underline">Kiralama şartları</a> · geç iade ve teslim etmeme kuralları</p>' +
        (e.aciklama ? '<p class="aciklama">' + esc(e.aciklama) + '</p>' : '') +
        '<p class="sahip" style="margin-top:14px">' + (e.sahipFoto ? '<img src="' + esc(e.sahipFoto) + '" alt="" referrerpolicy="no-referrer">' : '') + esc(e.sahipAd) + '\'nin dolabından</p>' +
        '<div class="kutu" id="kiraKutu"></div>' +
      '</div>' +
    '</div>' +
    yorumBolumu(e.id);

  icerik.querySelector('.kucukler')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    $('#buyukFoto').src = b.dataset.f;
    icerik.querySelectorAll('.kucukler button').forEach(x => x.setAttribute('aria-current', String(x === b)));
  });

  const kutu = $('#kiraKutu');
  if (kendi) {
    kutu.innerHTML = '<h2>Bu parça senin dolabında</h2><p class="kucuk" style="margin-bottom:12px">' + (e.aktif ? 'Keşfet\'te görünüyor.' : 'Şu an yayında değil.') + '</p>' +
      '<a class="dug" href="#dolabim">Dolabıma git</a>';
    return;
  }
  if (!e.aktif) { kutu.innerHTML = '<h2>Şu an kiralanamıyor</h2><p class="kucuk">Sahibi bu parçayı yayından kaldırdı.</p>'; return; }
  if (!kullanici) {
    kutu.innerHTML = '<h2>Kiralamak için giriş yap</h2><p class="kucuk" style="margin-bottom:12px">Google hesabınla saniyeler içinde giriş yapabilirsin.</p>' +
      '<button type="button" class="dug dug-ana dug-tam" id="kiraGiris">' + G_IKON + 'Google ile giriş yap</button>';
    $('#kiraGiris').onclick = girisYap;
    return;
  }
  const ilet = localStorage.getItem(LS_ILETISIM) || '';
  kutu.innerHTML = '<h2>Kiralama isteği</h2>' +
    '<div class="form-izgara">' +
      '<div class="alan"><label for="kBas">Başlangıç</label><input type="date" id="kBas" min="' + bugun() + '"></div>' +
      '<div class="alan"><label for="kBit">İade</label><input type="date" id="kBit" min="' + bugun() + '"></div>' +
      '<div class="alan tam"><label for="kIlet">Telefonun</label><input id="kIlet" type="tel" placeholder="05xx xxx xx xx" value="' + esc(ilet) + '" autocomplete="tel"></div>' +
      '<div class="alan tam"><label for="kNot">Not <span class="kucuk">(isteğe bağlı)</span></label><textarea id="kNot" maxlength="500" placeholder="Örn. düğün için, teslim yeri tercihi…"></textarea></div>' +
    '</div>' +
    '<div id="kOzet" style="margin-top:12px"></div>' +
    '<div class="uyari" style="margin-top:14px">' + SARTLAR_OZET + '</div>' +
    '<label class="onay-kutu"><input type="checkbox" id="kSozlesme"><span><a href="elif-sozlesme.html" target="_blank">Kiralama sözleşmesini</a> okudum; geç iade, teslim etmeme ve hasar maddelerini kabul ediyorum.</span></label>' +
    '<p class="hata" id="kHata" role="alert"></p>' +
    '<button type="button" class="dug dug-vurgu dug-tam" id="kGonder">İstek gönder</button>' +
    '<p class="kucuk" style="margin-top:10px">Sahibi onaylayınca ödeme bilgileri Kiralamalarım\'da görünür. Telefonun yalnız kiralama kesinleşince karşı tarafa açılır.</p>';

  const hesapla = () => {
    const a = $('#kBas').value, b = $('#kBit').value;
    const gun = a && b ? gunFarki(a, b) : 0;
    $('#kOzet').innerHTML = gun > 0 ?
      '<div class="ozet-satir"><span>' + tl(e.gunlukUcret) + ' × ' + gun + ' gün</span><span>' + tl(gun * e.gunlukUcret) + '</span></div>' +
      (e.depozito ? '<div class="ozet-satir"><span>Depozito (iade edilir)</span><span>' + tl(e.depozito) + '</span></div>' : '') +
      '<div class="ozet-satir toplam"><span>Toplam</span><span>' + tl(gun * e.gunlukUcret + e.depozito) + '</span></div>' : '';
    return gun;
  };
  ['kBas', 'kBit'].forEach(i => $('#' + i).addEventListener('change', () => {
    if ($('#kBas').value) $('#kBit').min = $('#kBas').value;
    hesapla();
  }));
  $('#kGonder').onclick = async () => {
    const hata = $('#kHata'); hata.textContent = '';
    if (demoEngel()) return;
    const gun = hesapla(), tel = $('#kIlet').value.trim();
    if (!(gun >= 1)) { hata.textContent = 'Başlangıç ve iade tarihini seçin (iade, başlangıçtan sonra olmalı).'; return; }
    if (gun > 60) { hata.textContent = 'En fazla 60 günlük kiralama yapılabilir.'; return; }
    if (tel.replace(/\D/g, '').length < 10) { hata.textContent = 'Geçerli bir telefon numarası yazın.'; return; }
    if (!$('#kSozlesme').checked) { hata.textContent = 'Devam etmek için kiralama sözleşmesini kabul edin.'; return; }
    localStorage.setItem(LS_ILETISIM, tel);
    const dug = $('#kGonder'); dug.disabled = true; dug.textContent = 'Gönderiliyor…';
    try {
      await addDoc(collection(db, 'dolapKiralamalar'), {
        esyaId: e.id, esyaBaslik: e.baslik, esyaFoto: e.fotolar[0], sahipId: e.sahipId,
        kiraciId: kullanici.uid, kiraciAd: (kullanici.displayName || kullanici.email || '').slice(0, 80),
        kiraciIletisim: (tel + ' · ' + (kullanici.email || '')).slice(0, 200), sahipIletisim: '',
        baslangic: $('#kBas').value, bitis: $('#kBit').value, gun,
        gunlukUcret: e.gunlukUcret, kira: gun * e.gunlukUcret, depozito: e.depozito, toplam: gun * e.gunlukUcret + e.depozito,
        not: $('#kNot').value.trim().slice(0, 500), durum: 'beklemede', sozlesme: SOZLESME_SURUM,
        olusturma: serverTimestamp(), guncelleme: serverTimestamp()
      });
      bildir('İsteğin gönderildi. Sahibi onaylayınca haber Kiralamalarım\'da.');
      location.hash = '#kiralamalar';
    } catch (h) {
      hata.textContent = hataMetni(h);
      dug.disabled = false; dug.textContent = 'İstek gönder';
    }
  };
}

function yorumBolumu(id) {
  const y = yorumlar(id);
  const tarih = t => new Date(t.toMillis()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return '<section class="yorumlar" aria-labelledby="yorumBas"><h2 id="yorumBas">Yorumlar' +
    (y.length ? ' <span class="kucuk">(' + y.length + ')</span>' : '') + '</h2>' +
    (y.length ? y.map(x =>
      '<article class="yorum"><img src="' + esc(x.foto) + '" alt=""><div>' +
        '<p class="yorum-bas"><b>' + esc(x.ad) + '</b> <span class="yildiz" aria-label="' + x.puan + ' yıldız">' + yildiz(x.puan) + '</span> ' +
        '<span class="kucuk">' + tarih(x.tarih) + '</span></p><p>' + esc(x.metin) + '</p></div></article>').join('')
      : '<p class="kucuk">Bu parça için henüz yorum yok. Kiralayanlar teslimden sonra yorum bırakabilecek.</p>') +
    '</section>';
}

/* ---------------------------------------------------------------- DOLABIM */
async function dolabim(istek) {
  if (!kullanici) return girisCagrisi('Dolabın seni bekliyor', 'Google hesabınla giriş yap, kiraya vermek istediğin parçaları ekle.');
  icerik.innerHTML = '<div class="bas"><div><h1>Dolabım</h1><p>Kiraya verdiğin parçalar.</p></div>' +
    '<button type="button" class="dug dug-vurgu" id="yeniEsya">+ Eşya ekle</button></div><div class="liste" id="liste"><p class="yukleniyor">Yükleniyor…</p></div>';
  $('#yeniEsya').onclick = () => esyaFormu();
  let l;
  try {
    l = (await esyaListesi('sahipId', kullanici.uid)).sort((a, b) => zaman(b.olusturma) - zaman(a.olusturma));
  } catch (h) {
    if (istek === aktifIstek) $('#liste').innerHTML = '<div class="bos"><h3>Yüklenemedi</h3><p>' + esc(hataMetni(h)) + '</p></div>';
    return;
  }
  if (istek !== aktifIstek) return;
  if (!l.length) {
    $('#liste').innerHTML = '<div class="bos"><h3>Dolabın boş</h3><p>Kiraya vermek istediğin ilk parçayı ekle.</p><button type="button" class="dug dug-vurgu" id="ilkEsya">+ Eşya ekle</button></div>';
    $('#ilkEsya').onclick = () => esyaFormu();
    return;
  }
  $('#liste').innerHTML = l.map(e =>
    '<div class="satir"><img class="k" src="' + esc(e.fotolar[0]) + '" alt="">' +
      '<div><h3><a href="#esya/' + esc(e.id) + '">' + esc(e.baslik) + '</a></h3>' +
        '<p class="kira-detay">' + esc([KATEGORI[e.kategori], e.marka, e.beden].filter(Boolean).join(' · ')) + ' · <b>' + tl(e.gunlukUcret) + '/gün</b></p>' +
        '<p class="kira-detay">' + (e.aktif ? '<span class="durum d-onaylandi">Yayında</span>' : '<span class="durum">Yayında değil</span>') + '</p></div>' +
      '<div class="eylem">' +
        '<button type="button" class="dug dug-kucuk" data-duzenle="' + esc(e.id) + '">Düzenle</button>' +
        '<button type="button" class="dug dug-kucuk" data-yayin="' + esc(e.id) + '">' + (e.aktif ? 'Yayından kaldır' : 'Yayınla') + '</button>' +
        '<button type="button" class="dug dug-kucuk dug-tehlike" data-sil="' + esc(e.id) + '">Sil</button>' +
      '</div></div>').join('');
  $('#liste').onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const e = l.find(x => x.id === (b.dataset.duzenle || b.dataset.yayin || b.dataset.sil));
    if (!e) return;
    if (!b.dataset.duzenle && demoEngel()) return;
    try {
      if (b.dataset.duzenle) return esyaFormu(e);
      if (b.dataset.yayin) { b.disabled = true; await updateDoc(doc(db, 'dolapEsyalar', e.id), { aktif: !e.aktif }); bildir(e.aktif ? 'Yayından kaldırıldı.' : 'Yayında.'); }
      if (b.dataset.sil) {
        if (!confirm('"' + e.baslik + '" dolabından silinsin mi? Bu geri alınamaz.')) return;
        await deleteDoc(doc(db, 'dolapEsyalar', e.id));
        e.fotolar.forEach(f => deleteObject(ref(storage, f)).catch(() => {}));
        bildir('Silindi.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); b.disabled = false; }
  };
}

/* fotoğrafı tarayıcıda küçült: uzun kenar en fazla 1400 px, JPEG */
function kucult(dosya) {
  return new Promise((ok, hata) => {
    const img = new Image();
    img.onload = () => {
      const o = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * o); c.height = Math.round(img.height * o);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => (b ? ok(b) : hata(new Error('Fotoğraf işlenemedi.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => hata(new Error('Bu dosya açılamadı. JPG veya PNG seçin.'));
    img.src = URL.createObjectURL(dosya);
  });
}

function esyaFormu(e) {
  const p = $('#pencere');
  let fotolar = e ? e.fotolar.map(u => ({ url: u })) : [];   // {url} mevcut, {dosya, onizleme} yeni
  const kaldirilan = [];
  p.innerHTML = '<div class="pencere-ic">' +
    '<h2 id="pencereBas">' + (e ? 'Parçayı düzenle' : 'Dolabına eşya ekle') + '</h2>' +
    '<div class="alan" style="margin-bottom:12px"><label>Fotoğraflar <span class="kucuk">(1-4 adet, ilk fotoğraf kapak olur)</span></label><div class="foto-sec" id="fotoSec"></div>' +
      '<input type="file" id="fotoDosya" accept="image/*" multiple hidden></div>' +
    '<div class="form-izgara">' +
      '<div class="alan tam"><label for="fBaslik">Başlık</label><input id="fBaslik" maxlength="80" placeholder="Örn. Saten midi elbise" value="' + esc(e?.baslik) + '"></div>' +
      '<div class="alan"><label for="fKat">Kategori</label><select id="fKat">' + Object.entries(KATEGORI).map(([k, ad]) =>
        '<option value="' + k + '"' + (e?.kategori === k ? ' selected' : '') + '>' + ad + '</option>').join('') + '</select></div>' +
      '<div class="alan"><label for="fMarka">Marka</label><input id="fMarka" maxlength="40" placeholder="Zara, Mango…" value="' + esc(e?.marka) + '"></div>' +
      '<div class="alan"><label for="fBeden">Beden</label><input id="fBeden" maxlength="12" placeholder="S, 38…" value="' + esc(e?.beden) + '"></div>' +
      '<div class="alan"><label for="fRenk">Renk</label><input id="fRenk" maxlength="30" value="' + esc(e?.renk) + '"></div>' +
      '<div class="alan"><label for="fUcret">Günlük kira (TL)</label><input id="fUcret" type="number" min="1" step="1" inputmode="numeric" value="' + esc(e?.gunlukUcret) + '"></div>' +
      '<div class="alan"><label for="fDepozito">Depozito (TL)</label><input id="fDepozito" type="number" min="0" step="1" inputmode="numeric" value="' + esc(e?.depozito ?? 0) + '"></div>' +
      '<p class="kucuk tam">Depozitoyu eşyanın gerçek değerine yakın belirleyin; eşya iade edilmezse alabileceğiniz tutar depozitodur.</p>' +
      '<div class="alan tam"><label for="fAciklama">Açıklama</label><textarea id="fAciklama" maxlength="1000" placeholder="Kumaş, kalıp, kaç kez giyildi, temizlik notu…">' + esc(e?.aciklama) + '</textarea></div>' +
    '</div>' +
    '<label class="onay-kutu"><input type="checkbox" id="fSozlesme"' + (e?.sozlesme === SOZLESME_SURUM ? ' checked' : '') + '><span><a href="elif-sozlesme.html" target="_blank">Kiralama sözleşmesindeki</a> kiraya veren yükümlülüklerini kabul ediyorum: eşyayı ilana uygun, temiz ve zamanında teslim ederim; bilinen kusurları açıkça yazdım.</span></label>' +
    '<p class="hata" id="fHata" role="alert"></p>' +
    '<div class="pencere-alt"><button type="button" class="dug" id="fVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="fKaydet">' + (e ? 'Kaydet' : 'Dolabıma ekle') + '</button></div>' +
    '</div>';
  p.hidden = false;
  document.body.style.overflow = 'hidden';
  const kapat = () => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; };
  $('#fVazgec').onclick = kapat;
  p.onclick = ev => { if (ev.target === p) kapat(); };

  const fotoCiz = () => {
    $('#fotoSec').innerHTML = fotolar.map((f, i) =>
      '<div class="yuva"><img src="' + esc(f.url || f.onizleme) + '" alt=""><button type="button" class="sil" data-i="' + i + '" aria-label="Fotoğrafı kaldır">×</button></div>').join('') +
      (fotolar.length < 4 ? '<button type="button" class="yuva" id="fotoEkle" aria-label="Fotoğraf ekle">+</button>' : '');
  };
  $('#fotoSec').onclick = ev => {
    const s = ev.target.closest('[data-i]');
    if (s) { const [f] = fotolar.splice(+s.dataset.i, 1); if (f.url) kaldirilan.push(f.url); fotoCiz(); return; }
    if (ev.target.closest('#fotoEkle')) $('#fotoDosya').click();
  };
  $('#fotoDosya').onchange = ev => {
    [...ev.target.files].slice(0, 4 - fotolar.length).forEach(d => fotolar.push({ dosya: d, onizleme: URL.createObjectURL(d) }));
    ev.target.value = '';
    fotoCiz();
  };
  fotoCiz();

  $('#fKaydet').onclick = async () => {
    const hata = $('#fHata'); hata.textContent = '';
    if (demoEngel()) return;
    const v = id => $('#' + id).value.trim();
    const ucret = Math.round(+v('fUcret')), depozito = Math.round(+v('fDepozito') || 0);
    if (!fotolar.length) { hata.textContent = 'En az bir fotoğraf ekleyin.'; return; }
    if (v('fBaslik').length < 2) { hata.textContent = 'Başlık yazın.'; return; }
    if (!(ucret >= 1)) { hata.textContent = 'Günlük kira bedeli girin.'; return; }
    if (depozito < 0) { hata.textContent = 'Depozito eksi olamaz.'; return; }
    if (!$('#fSozlesme').checked) { hata.textContent = 'Eşya eklemek için kiraya veren şartlarını kabul edin.'; return; }
    const dug = $('#fKaydet'); dug.disabled = true;
    try {
      const urller = [];
      for (let i = 0; i < fotolar.length; i++) {
        const f = fotolar[i];
        if (f.url) { urller.push(f.url); continue; }
        dug.textContent = 'Fotoğraf yükleniyor ' + (i + 1) + '/' + fotolar.length + '…';
        const blob = await kucult(f.dosya);
        const r = ref(storage, 'dolap/' + kullanici.uid + '/' + Date.now() + '-' + i + '.jpg');
        await uploadBytes(r, blob, { contentType: 'image/jpeg' });
        urller.push(await getDownloadURL(r));
      }
      dug.textContent = 'Kaydediliyor…';
      const veri = {
        baslik: v('fBaslik'), kategori: v('fKat'), marka: v('fMarka'), beden: v('fBeden'), renk: v('fRenk'),
        aciklama: v('fAciklama'), gunlukUcret: ucret, depozito, fotolar: urller, sozlesme: SOZLESME_SURUM,
        sahipAd: (kullanici.displayName || 'Kullanıcı').slice(0, 80), sahipFoto: (kullanici.photoURL || '').slice(0, 600)
      };
      if (e) await updateDoc(doc(db, 'dolapEsyalar', e.id), veri);
      else await addDoc(collection(db, 'dolapEsyalar'), { ...veri, sahipId: kullanici.uid, aktif: true, olusturma: serverTimestamp() });
      kaldirilan.forEach(u => deleteObject(ref(storage, u)).catch(() => {}));
      kapat();
      bildir(e ? 'Kaydedildi.' : 'Dolabına eklendi, Keşfet\'te görünüyor.');
      sayfaCiz();
    } catch (h) {
      hata.textContent = hataMetni(h);
      dug.disabled = false; dug.textContent = e ? 'Kaydet' : 'Dolabıma ekle';
    }
  };
}

/* ---------------------------------------------------------------- KİRALAMALARIM */
async function kiralamalar(gorunum, istek) {
  if (!kullanici) return girisCagrisi('Kiralamaların burada', 'Kiraladığın ve dolabından kiralanan parçaları görmek için giriş yap.');
  const sekme = (k, ad) => '<a class="cip" href="#kiralamalar' + (k === 'kiraci' ? '' : '/' + k) + '" aria-pressed="' + (gorunum === k) + '">' + ad + '</a>';
  icerik.innerHTML = '<div class="bas"><div><h1>Kiralamalarım</h1><p>İsteklerin ve dolabına gelen istekler.</p></div></div>' +
    '<div class="alt-sekme">' + sekme('kiraci', 'Kiraladıklarım') + sekme('sahip', 'Dolabımdan kiralananlar') + (yonetici() ? sekme('yonetim', 'Ödeme onayı') : '') + '</div>' +
    '<div class="liste" id="liste"><p class="yukleniyor">Yükleniyor…</p></div>';

  let alan = 'kiraciId', deger = kullanici.uid;
  if (gorunum === 'sahip') alan = 'sahipId';
  else if (gorunum === 'yonetim' && yonetici()) { alan = 'durum'; deger = 'odeme_bildirildi'; }
  else gorunum = 'kiraci';

  let l;
  try {
    l = (await kiraListesi(alan, deger)).sort((a, b) => zaman(b.guncelleme) - zaman(a.guncelleme));
  } catch (h) {
    if (istek === aktifIstek) $('#liste').innerHTML = '<div class="bos"><h3>Yüklenemedi</h3><p>' + esc(hataMetni(h)) + '</p></div>';
    return;
  }
  if (istek !== aktifIstek) return;
  if (!l.length) {
    $('#liste').innerHTML = '<div class="bos"><h3>' + ({ kiraci: 'Henüz bir şey kiralamadın', sahip: 'Dolabına henüz istek gelmedi', yonetim: 'Onay bekleyen ödeme yok' }[gorunum]) + '</h3>' +
      (gorunum === 'kiraci' ? '<a class="dug dug-vurgu" href="#kesfet">Keşfet\'e göz at</a>' : '') + '</div>';
    return;
  }
  $('#liste').innerHTML = l.map(k => kiraSatiri(k, gorunum)).join('');
  $('#liste').onclick = async ev => {
    const b = ev.target.closest('[data-gecis]'); if (!b) return;
    if (demoEngel()) return;
    const k = l.find(x => x.id === b.dataset.id);
    const y = b.dataset.gecis;
    const veri = { durum: y, guncelleme: serverTimestamp() };
    if (y === 'onaylandi' && gorunum === 'sahip') {
      const tel = await onayPenceresi(k);
      if (!tel) return;
      veri.sahipIletisim = (tel + ' · ' + (kullanici.email || '')).slice(0, 200);
      veri.sahipSozlesme = SOZLESME_SURUM;
    }
    if (['iptal', 'reddedildi'].includes(y) && !confirm(y === 'iptal' ? 'İstek iptal edilsin mi?' : 'İstek reddedilsin mi?')) return;
    b.disabled = true;
    try { await updateDoc(doc(db, 'dolapKiralamalar', k.id), veri); bildir('Güncellendi: ' + DURUM[y]); sayfaCiz(); }
    catch (h) { bildir(hataMetni(h)); b.disabled = false; }
  };
}

/* Sahibin onayı: telefon + kiraya veren şartlarının kabulü. Telefonu ya da null döndürür. */
function onayPenceresi(k) {
  return new Promise(son => {
    const p = $('#pencere');
    p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">İsteği onayla</h2>' +
      '<p class="kucuk" style="margin-bottom:12px">' + esc(k.esyaBaslik) + ' · ' + tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) + ' · ' + esc(k.kiraciAd) + '</p>' +
      '<div class="alan"><label for="oTel">Telefonun <span class="kucuk">(ödeme onaylanınca kiracıya gösterilir)</span></label>' +
      '<input id="oTel" type="tel" autocomplete="tel" value="' + esc(localStorage.getItem(LS_ILETISIM) || '') + '"></div>' +
      '<div class="uyari" style="margin-top:14px">' + SARTLAR_OZET + '</div>' +
      '<label class="onay-kutu"><input type="checkbox" id="oSozlesme"><span><a href="elif-sozlesme.html" target="_blank">Kiralama sözleşmesini</a> kabul ediyorum; eşyayı ilana uygun, temiz ve ' + tarihYaz(k.baslangic) + ' tarihinde teslim edeceğim.</span></label>' +
      '<p class="hata" id="oHata" role="alert"></p>' +
      '<div class="pencere-alt"><button type="button" class="dug" id="oVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="oTamam">Onayla</button></div></div>';
    p.hidden = false; document.body.style.overflow = 'hidden';
    const bitir = deger => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; son(deger); };
    $('#oVazgec').onclick = () => bitir(null);
    p.onclick = ev => { if (ev.target === p) bitir(null); };
    $('#oTamam').onclick = () => {
      const tel = $('#oTel').value.trim();
      if (tel.replace(/\D/g, '').length < 10) { $('#oHata').textContent = 'Geçerli bir telefon numarası yazın.'; return; }
      if (!$('#oSozlesme').checked) { $('#oHata').textContent = 'Onaylamak için sözleşmeyi kabul edin.'; return; }
      localStorage.setItem(LS_ILETISIM, tel);
      bitir(tel);
    };
  });
}

/* İade günü geçmiş ve hâlâ kiracıdaki eşya için gecikme bilgisi */
function gecikmeHTML(k) {
  if (k.durum !== 'teslim_edildi' || bugun() <= k.bitis) return '';
  const gun = gunFarki(k.bitis, bugun());
  const bedel = Math.round(gun * k.gunlukUcret * GECIKME_KAT);
  return '<div class="gecikme">' + (gun >= KAYIP_GUN
    ? '<b>İade ' + gun + ' gün gecikti: eşya teslim edilmemiş sayılır.</b> Depozitonun tamamı (' + tl(k.depozito) + ') kiraya verene ödenir; zarar daha büyükse fark kiracıdan istenir. İşletmeci iki tarafla iletişime geçer.'
    : '<b>İade ' + gun + ' gün gecikti.</b> Gecikme bedeli şu ana kadar ' + tl(bedel) + ' (günlük kiranın 1,5 katı), depozitodan düşülür.' +
      (gun >= 3 ? ' İşletmeci kiracıya ulaşacak.' : '') + ' ' + (KAYIP_GUN - gun) + ' gün içinde iade edilmezse eşya teslim edilmemiş sayılır.') +
    '</div>';
}

function kiraSatiri(k, gorunum) {
  const d = k.durum;
  const gecis = (y, ad, sinif) => '<button type="button" class="dug dug-kucuk ' + (sinif || '') + '" data-id="' + esc(k.id) + '" data-gecis="' + y + '">' + ad + '</button>';
  let eylem = '', ek = '';
  const kesin = ['odendi', 'teslim_edildi', 'iade_edildi'].includes(d);

  if (gorunum === 'kiraci') {
    if (d === 'beklemede') eylem = gecis('iptal', 'İsteği iptal et', 'dug-tehlike');
    if (d === 'onaylandi') {
      eylem = gecis('odeme_bildirildi', 'Ödemeyi yaptım', 'dug-vurgu') + gecis('iptal', 'İptal et', 'dug-tehlike');
      const h = AYAR.havale || {};
      ek = '<div class="odeme-kutu"><b>Ödeme: ' + tl(k.toplam) + '</b> (kira ' + tl(k.kira) + (k.depozito ? ' + iade edilecek depozito ' + tl(k.depozito) : '') + ')<br>' +
        (h.iban ? 'Alıcı: ' + esc(h.hesapSahibi) + (h.banka ? ' · ' + esc(h.banka) : '') + '<br>IBAN: <span class="iban">' + esc(h.iban) + '</span><br>'
          : 'Banka bilgileri için <a href="mailto:' + esc(AYAR.eposta) + '?subject=' + encodeURIComponent('Elif\'in Dolabı ödeme ' + refKod(k.id)) + '" style="text-decoration:underline">' + esc(AYAR.eposta) + '</a> adresine yazın.<br>') +
        'Açıklamaya mutlaka <b>' + refKod(k.id) + '</b> yazın. Ödeme geçince "Ödemeyi yaptım"a basın.</div>';
    }
    if (d === 'odeme_bildirildi') ek = '<div class="odeme-kutu">Ödemen kontrol ediliyor. Onaylanınca eşya sahibinin iletişim bilgisi burada görünecek.</div>';
    if (kesin) ek = '<div class="iletisim">Eşya sahibi: <b>' + esc(k.sahipIletisim) + '</b> · Teslimi birlikte ayarlayın.</div>';
  } else if (gorunum === 'sahip') {
    if (d === 'beklemede') eylem = gecis('onaylandi', 'Onayla', 'dug-vurgu') + gecis('reddedildi', 'Reddet', 'dug-tehlike');
    if (d === 'odendi') eylem = gecis('teslim_edildi', 'Teslim ettim', 'dug-vurgu');
    if (d === 'teslim_edildi') eylem = gecis('iade_edildi', 'İade aldım', 'dug-vurgu');
    if (d === 'onaylandi' || d === 'odeme_bildirildi') ek = '<div class="odeme-kutu">Kiracının ödemesi bekleniyor. Ödeme onaylanınca iletişim bilgisi açılır.</div>';
    if (kesin) ek = '<div class="iletisim">Kiracı: <b>' + esc(k.kiraciAd) + '</b> · ' + esc(k.kiraciIletisim) + '</div>';
  } else if (gorunum === 'yonetim') {
    eylem = gecis('odendi', 'Ödeme geldi', 'dug-vurgu') + gecis('onaylandi', 'Ödeme bulunamadı');
    ek = '<div class="odeme-kutu">Referans: <b>' + refKod(k.id) + '</b> · Beklenen tutar: <b>' + tl(k.toplam) + '</b> · Kiracı: ' + esc(k.kiraciAd) + '</div>';
  }

  return '<div class="satir"><img class="k" src="' + esc(k.esyaFoto) + '" alt="">' +
    '<div><h3><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></h3>' +
      '<p class="kira-detay">' + tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) + ' · ' + k.gun + ' gün · <b>' + tl(k.toplam) + '</b></p>' +
      (gorunum === 'sahip' && k.not ? '<p class="kira-detay">Not: ' + esc(k.not) + '</p>' : '') +
      '<p class="kira-detay"><span class="durum d-' + esc(d) + '">' + esc(DURUM[d] || d) + '</span> <span class="kucuk">' + refKod(k.id) + '</span></p></div>' +
    '<div class="eylem">' + eylem + '</div>' + gecikmeHTML(k) + ek + '</div>';
}

/* ---------------------------------------------------------------- başlat */
if (DEMO) {
  kullanici = { ...DEMO_KULLANICI, photoURL: D.kullanicilar[0].foto };
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="demo-serit">Örnek veri: 20 sahte kullanıcı ve parçaları. Hiçbir şey kaydedilmez. <a href="elif.html">Gerçek siteye dön</a></div>');
  hesapCiz(); sayfaCiz();
} else {
  onAuthStateChanged(auth, u => { kullanici = u; hesapCiz(); sayfaCiz(); });
}
