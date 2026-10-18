/* Elif'in Dolabı — kişiden kişiye kıyafet kiralama
 *
 * Firebase (sersoz-f93c3): Google ile giriş, Firestore (dolapEsyalar,
 * dolapKiralamalar), Storage (dolap/{uid}/ fotoğrafları).
 * Güvenlik kuralları: firestore.rules ve storage.rules — konsoldan ELLE yayımlanır.
 * Durum akışı ve kim neyi değiştirebilir: firestore.rules içindeki şemaya bakın.
 *
 * Sayfalar (adres çubuğundaki #):
 *   #kesfet · #esya/{id} · #dolabim · #kiralamalar · #kiralamalar/sahip · #kiralamalar/yonetim
 *   #hesabim/{profil|adresler|kartlar|filtreler|tercihler|hesap}
 *   #yonetim/{ozet|onay|gelen/{id}|kullanicilar|kisi/{uid}|yoneticiler|odemeler}  (yalnız admin)
 * Roller: tam yetkili (TAM_YETKILI) admin atar; admin onaylar/kısıtlar; kısıtlı yalnız gezer.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp, onSnapshot, writeBatch }
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

const TAM_YETKILI = 'sercansozer20@gmail.com';
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

/* Örnek veri veritabanında (demoVeri koleksiyonu) paketlenmiş belgelerde durur: bir ziyaret ≈ 8 okuma.
   Zamanlar { __ms } olarak saklanır, okununca toMillis() olan nesneye çevrilir.
   Veritabanında yoksa tarayıcıda üretilir (elif-demo.js). Tam yetkili panelden yükler/siler. */
const DEMO_BELGELER = ['esyalar', 'kiralamalar', 'uyeler', 'roller', 'sohbetler', 'yorumlar'];
function demoPaketle(x) {
  if (x && typeof x.toMillis === 'function') return { __ms: x.toMillis() };
  if (Array.isArray(x)) return x.map(demoPaketle);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, demoPaketle(v)]));
  return x;
}
function demoAc(x) {
  if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1 && '__ms' in x) { const t = x.__ms; return { toMillis: () => t }; }
  if (Array.isArray(x)) return x.map(demoAc);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, demoAc(v)]));
  return x;
}
async function demoYukle() {
  try {
    const snap = await getDocs(collection(db, 'demoVeri'));
    if (!snap.size) throw new Error('bos');
    const b = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    const v = { olaylar: [] };
    DEMO_BELGELER.forEach(k => { v[k] = demoAc((b[k] || {}).veri) || (k === 'yorumlar' ? {} : []); });
    Object.keys(b).filter(k => k.startsWith('olaylar-')).sort().forEach(k => { v.olaylar = v.olaylar.concat(demoAc(b[k].veri)); });
    v.olaylar.sort((x, y) => y.zaman.toMillis() - x.zaman.toMillis());
    v.kullanicilar = v.uyeler.map(u => ({ uid: u.uid, ad: u.ad, foto: u.foto }));
    v.kaynak = 'veritabanı';
    return v;
  } catch (e) {
    return { ...demoVeri(), kaynak: 'tarayıcı' };
  }
}
const D = DEMO ? await demoYukle() : null;

/* tam yetkili: örnek veriyi veritabanına yükle / sil */
async function demoVeritabaninaYukle() {
  const v = demoVeri();
  const b = writeBatch(db);
  DEMO_BELGELER.forEach(k => b.set(doc(db, 'demoVeri', k), { veri: demoPaketle(v[k]) }));
  for (let i = 0; i * 300 < v.olaylar.length; i++) b.set(doc(db, 'demoVeri', 'olaylar-' + i), { veri: demoPaketle(v.olaylar.slice(i * 300, i * 300 + 300)) });
  await b.commit();
}
async function demoVeritabanindanSil() {
  const snap = await getDocs(collection(db, 'demoVeri'));
  const b = writeBatch(db);
  snap.docs.forEach(d => b.delete(d.ref));
  await b.commit();
  return snap.size;
}
function demoEngel() {
  if (!DEMO) return false;
  bildir('Örnek modda bu işlem kapalı.');
  return true;
}

/* Yazma katmanı: örnek modda bellekteki veriyi değiştirir (sayfa yenilenince sıfırlanır),
   normalde Firestore'a yazar. Sunucu zamanı örnek modda tarayıcı saatidir. */
const SIMDI = () => (DEMO ? (t => ({ toMillis: () => t }))(Date.now()) : serverTimestamp());
const demoDizi = kol => ({ dolapEsyalar: D.esyalar, dolapKiralamalar: D.kiralamalar, dolapSohbet: D.sohbetler, dolapRoller: D.roller, dolapUyeler: D.uyeler })[kol];
const demoAnahtar = kol => (kol === 'dolapRoller' ? 'eposta' : kol === 'dolapUyeler' ? 'uid' : 'id');
async function dbEkle(kol, veri) {
  if (!DEMO) return addDoc(collection(db, kol), veri);
  if (!demoDizi(kol)) return { id: '' };
  const id = 'demo-' + Date.now().toString(36);
  demoDizi(kol).unshift({ id, ...veri });
  return { id };
}
async function dbGuncelle(kol, id, veri) {
  if (!DEMO) return updateDoc(doc(db, kol, id), veri);
  const a = demoAnahtar(kol), x = demoDizi(kol).find(o => o[a] === id);
  if (x) Object.assign(x, veri);
}
async function dbYaz(kol, id, veri, birlestir) {
  if (!DEMO) return setDoc(doc(db, kol, id), veri, birlestir ? { merge: true } : {});
  const a = demoAnahtar(kol), l = demoDizi(kol), i = l.findIndex(o => o[a] === id);
  if (i >= 0) l[i] = birlestir ? Object.assign(l[i], veri) : { [a]: id, ...veri };
  else l.push({ [a]: id, ...veri });
}
async function dbSil(kol, id) {
  if (!DEMO) return deleteDoc(doc(db, kol, id));
  const a = demoAnahtar(kol), l = demoDizi(kol), i = l.findIndex(o => o[a] === id);
  if (i >= 0) l.splice(i, 1);
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

/* ---------------------------------------------------------------- roller ve üye kaydı
 * tam: sercansozer20@gmail.com (admin atar) · admin: dolapRoller/{gmail}.rol == 'admin'
 * kisitli: siteyi gezer, ürün ekleyemez/kiralayamaz · uye: normal kullanıcı */
let rol = 'misafir';
let rolNeden = '';
let uye = null;                 // dolapUyeler/{uid}: telefon, adresler, filtreler, tercihler
const adminMi = () => rol === 'tam' || rol === 'admin';
const tamMi = () => rol === 'tam';
const ROL_AD = { tam: 'Tam yetkili', admin: 'Admin', kisitli: 'Kısıtlı', uye: 'Üye', misafir: 'Misafir' };

async function uyeGetir(uid) {
  if (D) return D.uyeler.find(u => u.uid === uid) || null;
  const s = await getDoc(doc(db, 'dolapUyeler', uid));
  return s.exists() ? s.data() : null;
}
async function uyeKaydet(veri) {
  await dbYaz('dolapUyeler', kullanici.uid, { uid: kullanici.uid, eposta: kullanici.email, ...veri }, true);
  Object.assign(uye, veri);
}
async function uyeListesi() {
  if (D) return D.uyeler.map(u => ({ ...u }));
  return (await getDocs(collection(db, 'dolapUyeler'))).docs.map(d => d.data());
}
async function tumEsyalar() {
  if (D) return D.esyalar.map(e => ({ ...e }));
  return (await getDocs(collection(db, 'dolapEsyalar'))).docs.map(d => ({ id: d.id, ...d.data() }));
}
async function rolGetir(eposta) {
  if (D) return D.roller.find(x => x.eposta === eposta) || null;
  const s = await getDoc(doc(db, 'dolapRoller', eposta));
  return s.exists() ? { eposta, ...s.data() } : null;
}
async function rolListesi() {
  if (D) return D.roller.map(x => ({ ...x }));
  return (await getDocs(collection(db, 'dolapRoller'))).docs.map(d => ({ eposta: d.id, ...d.data() }));
}
const rolYaz = (eposta, r, neden) => dbYaz('dolapRoller', eposta,
  { rol: r, neden: neden || '', atayan: kullanici.email, zaman: SIMDI() });
const rolSil = eposta => dbSil('dolapRoller', eposta);

/* ---------------------------------------------------------------- gezinti kaydı (KVKK: yalnız izinle) */
const LS_IZIN = 'elif_gezinti_izni';
const oturumId = (() => {
  try {
    let o = sessionStorage.getItem('elif_oturum');
    if (!o) { o = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('elif_oturum', o); }
    return o;
  } catch (e) { return 'yok'; }
})();
function izinVar() { try { return localStorage.getItem(LS_IZIN) === 'evet'; } catch (e) { return false; } }
function olay(tur, ek = {}) {
  if (DEMO || !izinVar()) return;
  const k = (v, n) => String(v || '').slice(0, n);
  dbEkle('dolapOlaylar', {
    tur, sayfa: k(ek.sayfa, 60), esyaId: k(ek.esyaId, 60), marka: k(ek.marka, 40), kategori: k(ek.kategori, 20),
    baslik: k(ek.baslik, 80), ara: k(ek.ara, 60), oturum: oturumId,
    uid: kullanici ? kullanici.uid : '', ad: kullanici ? k(kullanici.displayName, 80) : '', zaman: SIMDI()
  }).catch(() => {});
}
async function olayListesi(gun) {
  if (D) { D.olaylar.forEach((o, i) => { if (!o.id) o.id = 'demo-ol-' + i; }); return D.olaylar.filter(o => zaman(o.zaman) >= Date.now() - gun * 864e5); }
  const sinir = Timestamp.fromMillis(Date.now() - gun * 864e5);
  return (await getDocs(query(collection(db, 'dolapOlaylar'), where('zaman', '>=', sinir))))
    .docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => zaman(b.zaman) - zaman(a.zaman));
}
async function tumOlaylar() {
  if (D) { D.olaylar.forEach((o, i) => { if (!o.id) o.id = 'demo-ol-' + i; }); return D.olaylar.slice(); }
  return (await getDocs(collection(db, 'dolapOlaylar'))).docs.map(d => ({ id: d.id, ...d.data() }));
}
/* Tam yetkili veri temizliği. Örnek modda bellekten siler (sayfa yenilenince geri gelir). */
async function olaylariSil(kimlikler) {
  if (!kimlikler.length) return 0;
  if (D) { const k = new Set(kimlikler); D.olaylar = D.olaylar.filter(o => !k.has(o.id)); return kimlikler.length; }
  for (let i = 0; i < kimlikler.length; i += 450) {
    const b = writeBatch(db);
    kimlikler.slice(i, i + 450).forEach(id => b.delete(doc(db, 'dolapOlaylar', id)));
    await b.commit();
  }
  return kimlikler.length;
}
function izinSeridi() {
  let v; try { v = localStorage.getItem(LS_IZIN); } catch (e) { return; }
  if (v) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="izin-serit" id="izinSerit" role="dialog" aria-label="Gezinti kaydı izni"><p><b>Gezinti kaydı.</b> Hangi sayfalara ve parçalara baktığınızı, siteyi ve önerileri geliştirmek için kaydetmemize izin veriyor musunuz? ' +
    'Kararınızı Hesabım\'dan istediğiniz zaman değiştirebilirsiniz. <a href="kosullar.html#gizlilik">Ayrıntılar</a></p>' +
    '<div><button type="button" class="dug dug-kucuk" data-izin="hayir">İzin verme</button><button type="button" class="dug dug-kucuk dug-ana" data-izin="evet">İzin ver</button></div></div>');
  $('#izinSerit').onclick = ev => {
    const b = ev.target.closest('[data-izin]'); if (!b) return;
    try { localStorage.setItem(LS_IZIN, b.dataset.izin); } catch (e) {}
    $('#izinSerit').remove();
    if (b.dataset.izin === 'evet') olay('sayfa', { sayfa: yol()[0] || 'kesfet' });
  };
}

/* ---------------------------------------------------------------- küçük grafik yardımcıları */
function say(liste, f) {
  const m = new Map();
  liste.forEach(x => { const k = f(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m].sort((a, b) => b[1] - a[1]);
}
function cubuklar(liste, n = 8) {
  const ust = liste.slice(0, n);
  if (!ust.length) return '<p class="kucuk">Henüz veri yok.</p>';
  const mx = Math.max(1, ...ust.map(x => x[1]));
  return ust.map(([ad, s]) => '<div class="cubuk-satir"><span class="cubuk-ad" title="' + esc(ad) + '">' + esc(ad) + '</span>' +
    '<span class="cubuk"><i style="width:' + (s / mx * 100).toFixed(1) + '%"></i></span><b>' + s + '</b></div>').join('');
}
const tarihSaat = t => new Date(zaman(t) || t || 0).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ---------------------------------------------------------------- yardımcılar */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const tl = n => TL.format(n || 0);
const yonetici = () => adminMi();
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
  const ys = $('#yonetimSekme');
  if (ys) ys.hidden = !adminMi();
  if (!kullanici) {
    h.innerHTML = '<button type="button" class="dug" id="girisDug">' + G_IKON + 'Google ile giriş</button>';
    $('#girisDug').onclick = girisYap;
    return;
  }
  const ad = kullanici.displayName || kullanici.email || '';
  h.innerHTML = '<div class="menu-kap">' +
    '<button type="button" class="avatar-dug" id="avatarDug" aria-haspopup="menu" aria-expanded="false" aria-controls="hesapMenu">' +
      (kullanici.photoURL ? '<img class="avatar" src="' + esc(kullanici.photoURL) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="avatar harf">' + esc(ad.slice(0, 1).toUpperCase()) + '</span>') +
      '<span class="ad">' + esc(ad) + '</span>' +
      (rol !== 'uye' ? '<span class="rol-rozet r-' + rol + '">' + ROL_AD[rol] + '</span>' : '') +
      '<span class="ok" aria-hidden="true">▾</span></button>' +
    '<div class="menu" id="hesapMenu" role="menu" hidden>' +
      '<div class="menu-bas"><b>' + esc(ad) + '</b><span>' + esc(kullanici.email || '') + '</span></div>' +
      '<a role="menuitem" href="#hesabim">Hesabım ve ayarlar</a>' +
      '<a role="menuitem" href="#hesabim/adresler">Kayıtlı adreslerim</a>' +
      '<a role="menuitem" href="#hesabim/kartlar">Kayıtlı kartlarım</a>' +
      '<a role="menuitem" href="#hesabim/filtreler">Kayıtlı filtrelerim</a>' +
      '<a role="menuitem" href="#kiralamalar">Kiralamalarım</a>' +
      (adminMi() ? '<a role="menuitem" href="#yonetim">Yönetim paneli</a>' : '') +
      '<button type="button" role="menuitem" id="cikisDug">Çıkış yap</button>' +
    '</div></div>';
  const m = $('#hesapMenu'), d = $('#avatarDug');
  d.onclick = ev => { ev.stopPropagation(); m.hidden = !m.hidden; d.setAttribute('aria-expanded', String(!m.hidden)); };
  m.onclick = () => { m.hidden = true; d.setAttribute('aria-expanded', 'false'); };
  $('#cikisDug').onclick = () => { if (!demoEngel()) signOut(auth); };
}
document.addEventListener('click', ev => {
  const m = $('#hesapMenu');
  if (m && !m.hidden && !ev.target.closest('.menu-kap')) m.hidden = true;
});
document.addEventListener('keydown', ev => {
  const m = $('#hesapMenu');
  if (ev.key === 'Escape' && m && !m.hidden) { m.hidden = true; $('#avatarDug').focus(); }
});
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
  icerik.onclick = icerik.oninput = icerik.onchange = null;   // önceki sayfanın dinleyicileri
  if (s !== 'esya') olay('sayfa', { sayfa: s || 'kesfet' });
  if (s === 'hesabim') return hesabim(p || '', istek);
  if (s === 'yonetim') return yonetim(p || 'ozet', yol()[2], istek);
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
/* Süzgeç durumu: kayıtlı filtreler de bu şekildedir { ad, kategori, ara, beden, maxFiyat } */
const kesfetS = { kategori: 'hepsi', ara: '', beden: '', maxFiyat: 0, sira: 'yeni' };
let aramaSayac;
async function kesfet(istek) {
  icerik.innerHTML = '<div class="bas"><div><h1>Keşfet</h1><p>Herkesin dolabından kiralanabilir parçalar.</p></div>' +
    '<a class="dug dug-vurgu" href="#dolabim">+ Dolabına eşya ekle</a></div>' +
    '<div class="kayitli-filtre" id="kayitliFiltre"></div>' +
    '<div class="suzgec" id="suzgec"></div>' +
    '<div class="suzgec suzgec-2" id="suzgec2"></div>' +
    '<div class="izgara" id="izgara"><p class="yukleniyor" style="grid-column:1/-1">Yükleniyor…</p></div>';
  let esyalar;
  try {
    esyalar = (await esyaListesi('onay', 'onaylandi')).filter(e => e.aktif);
  } catch (e) {
    if (istek !== aktifIstek) return;
    $('#izgara').innerHTML = '<div class="bos"><h3>Liste yüklenemedi</h3><p>' + esc(hataMetni(e)) + '</p></div>';
    return;
  }
  if (istek !== aktifIstek) return;

  const bedenler = [...new Set(esyalar.map(e => e.beden).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  const kayitliCiz = () => {
    const l = (uye && uye.filtreler) || [];
    $('#kayitliFiltre').innerHTML = kullanici && l.length
      ? '<span class="kucuk">Kayıtlı filtrelerin:</span>' + l.map((f, i) => '<button type="button" class="cip cip-kayitli" data-fi="' + i + '">★ ' + esc(f.ad) + '</button>').join('')
      : '';
  };
  const suzgecCiz = () => {
    $('#suzgec').innerHTML = [['hepsi', 'Tümü']].concat(Object.entries(KATEGORI)).map(([k, ad]) =>
      '<button type="button" class="cip" data-k="' + k + '" aria-pressed="' + (k === kesfetS.kategori) + '">' + ad + '</button>').join('') +
      '<input class="ara" id="ara" type="search" placeholder="Marka, renk, parça ara…" value="' + esc(kesfetS.ara) + '" aria-label="Ara">';
    $('#suzgec2').innerHTML =
      '<label class="mini-alan">Beden <select id="sBeden"><option value="">Hepsi</option>' +
        bedenler.map(b => '<option' + (b === kesfetS.beden ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select></label>' +
      '<label class="mini-alan">En çok <input id="sMax" type="number" min="0" step="10" inputmode="numeric" placeholder="TL/gün" value="' + (kesfetS.maxFiyat || '') + '"></label>' +
      '<label class="mini-alan">Sırala <select id="sSira">' +
        [['yeni', 'En yeni'], ['ucuz', 'Fiyat: artan'], ['pahali', 'Fiyat: azalan'], ['puan', 'En yüksek puan']].map(([k, ad]) =>
          '<option value="' + k + '"' + (k === kesfetS.sira ? ' selected' : '') + '>' + ad + '</option>').join('') + '</select></label>' +
      (kullanici ? '<button type="button" class="dug dug-kucuk" id="filtreKaydet">☆ Bu filtreyi kaydet</button>' : '') +
      '<button type="button" class="bag-dug" id="filtreTemizle">Temizle</button>';
  };
  const ciz = () => {
    const q = kesfetS.ara.toLocaleLowerCase('tr-TR');
    let l = esyalar.filter(e => (kesfetS.kategori === 'hepsi' || e.kategori === kesfetS.kategori) &&
      (!kesfetS.beden || e.beden === kesfetS.beden) &&
      (!kesfetS.maxFiyat || e.gunlukUcret <= kesfetS.maxFiyat) &&
      (!q || [e.baslik, e.marka, e.renk, e.beden].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
    const puan = e => { const p = puanOzeti(e.id); return p ? parseFloat(p.ort.replace(',', '.')) : 0; };
    l.sort({ yeni: (a, b) => zaman(b.olusturma) - zaman(a.olusturma), ucuz: (a, b) => a.gunlukUcret - b.gunlukUcret,
      pahali: (a, b) => b.gunlukUcret - a.gunlukUcret, puan: (a, b) => puan(b) - puan(a) }[kesfetS.sira]);
    $('#izgara').innerHTML = l.length ? l.map(e => esyaKarti(e, kullanici && e.sahipId === kullanici.uid)).join('')
      : '<div class="bos"><h3>' + (esyalar.length ? 'Bu filtreye uyan parça yok' : 'Dolaplar henüz boş') + '</h3><p>' +
        (esyalar.length ? 'Filtreleri gevşetmeyi deneyin.' : 'İlk parçayı sen ekle, kiraya veren ilk kişi ol.') + '</p>' +
        (esyalar.length ? '' : '<a class="dug dug-vurgu" href="#dolabim">Dolabına eşya ekle</a>') + '</div>';
  };
  const hepsi = () => { suzgecCiz(); kayitliCiz(); ciz(); };

  icerik.onclick = async ev => {
    const k = ev.target.closest('#suzgec [data-k]');
    if (k) { kesfetS.kategori = k.dataset.k; hepsi(); return; }
    const f = ev.target.closest('[data-fi]');
    if (f) { const s = uye.filtreler[+f.dataset.fi]; Object.assign(kesfetS, { kategori: s.kategori || 'hepsi', ara: s.ara || '', beden: s.beden || '', maxFiyat: s.maxFiyat || 0 }); hepsi(); return; }
    if (ev.target.closest('#filtreTemizle')) { Object.assign(kesfetS, { kategori: 'hepsi', ara: '', beden: '', maxFiyat: 0, sira: 'yeni' }); hepsi(); return; }
    if (ev.target.closest('#filtreKaydet')) {
      const l = uye.filtreler || [];
      if (l.length >= 20) { bildir('En fazla 20 filtre kaydedebilirsin. Hesabım\'dan eskileri sil.'); return; }
      const oneri = [KATEGORI[kesfetS.kategori], kesfetS.beden && kesfetS.beden + ' beden', kesfetS.maxFiyat && kesfetS.maxFiyat + ' TL altı', kesfetS.ara].filter(Boolean).join(', ') || 'Tüm parçalar';
      const ad = prompt('Filtreye bir ad ver:', oneri);
      if (!ad) return;
      const yeni = { ad: ad.trim().slice(0, 40), kategori: kesfetS.kategori, ara: kesfetS.ara.slice(0, 60), beden: kesfetS.beden, maxFiyat: kesfetS.maxFiyat || 0 };
      try { await uyeKaydet({ filtreler: l.concat([yeni]) }); kayitliCiz(); bildir(DEMO ? 'Örnek modda yalnız bu oturumda saklandı.' : 'Filtre kaydedildi.'); }
      catch (h) { bildir(hataMetni(h)); }
    }
  };
  icerik.oninput = ev => {
    if (ev.target.id === 'ara') {
      kesfetS.ara = ev.target.value; ciz();
      clearTimeout(aramaSayac);
      aramaSayac = setTimeout(() => { if (kesfetS.ara.trim().length >= 2) olay('arama', { sayfa: 'kesfet', ara: kesfetS.ara.trim() }); }, 1200);
    }
    if (ev.target.id === 'sMax') { kesfetS.maxFiyat = Math.max(0, Math.round(+ev.target.value || 0)); ciz(); }
  };
  icerik.onchange = ev => {
    if (ev.target.id === 'sBeden') { kesfetS.beden = ev.target.value; ciz(); }
    if (ev.target.id === 'sSira') { kesfetS.sira = ev.target.value; ciz(); }
  };
  hepsi();
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
  olay('esya', { sayfa: 'esya', esyaId: e.id, marka: e.marka, kategori: e.kategori, baslik: e.baslik });

  icerik.innerHTML = '<p class="kucuk" style="margin-bottom:14px"><a href="#kesfet">← Keşfet</a></p>' +
    '<div class="ayrinti">' +
      '<div class="galeri"><div class="buyuk"><img id="buyukFoto" src="' + esc(e.fotolar[0]) + '" alt="' + esc(e.baslik) + '"></div>' +
        (e.fotolar.length > 1 ? '<div class="kucukler">' + e.fotolar.map((f, i) =>
          '<button type="button" data-f="' + esc(f) + '" aria-current="' + (i === 0) + '" aria-label="Fotoğraf ' + (i + 1) + '"><img src="' + esc(f) + '" alt=""></button>').join('') + '</div>' : '') +
        (e.kaynak ? '<p class="kucuk" style="margin-top:8px">Fotoğraf: <a href="' + esc(e.kaynak.url) + '" target="_blank" rel="noopener" style="text-decoration:underline">' + esc(e.kaynak.yazar) + '</a> · ' + esc(e.kaynak.lisans) + '</p>' : '') +
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
        adminEsyaAraclari(e) +
        '<div class="kutu" id="kiraKutu"></div>' +
      '</div>' +
    '</div>' +
    yorumBolumu(e.id);

  icerik.querySelector('.kucukler')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    $('#buyukFoto').src = b.dataset.f;
    icerik.querySelectorAll('.kucukler button').forEach(x => x.setAttribute('aria-current', String(x === b)));
  });

  const yon = icerik.querySelector('.admin-kutu');
  if (yon) yon.onclick = async ev => {
    const b = ev.target.closest('[data-yon]'); if (!b) return;
    let veri = { onay: 'onaylandi', redNeden: '' };
    if (b.dataset.yon === 'kaldir') {
      const n = prompt('Kaldırma nedeni (ürün sahibine gösterilir):', '');
      if (n === null) return;
      veri = { onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Yönetici tarafından kaldırıldı.', aktif: false };
    }
    try { await dbGuncelle('dolapEsyalar', e.id, veri); bildir('Güncellendi.'); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); }
  };

  const kutu = $('#kiraKutu');
  if (kendi) {
    kutu.innerHTML = '<h2>Bu parça senin dolabında</h2><p class="kucuk" style="margin-bottom:12px">' +
      (e.onay === 'bekliyor' ? 'Ekip onayı bekliyor; onaylanınca Keşfet\'te görünür.' : e.onay === 'reddedildi' ? 'Reddedildi: ' + esc(e.redNeden) : e.aktif ? 'Keşfet\'te görünüyor.' : 'Şu an yayında değil.') + '</p>' +
      '<a class="dug" href="#dolabim">Dolabıma git</a>';
    return;
  }
  if (!e.aktif || e.onay !== 'onaylandi') { kutu.innerHTML = '<h2>Şu an kiralanamıyor</h2><p class="kucuk">' + (e.onay === 'bekliyor' ? 'Bu parça ekip onayı bekliyor.' : 'Bu parça yayında değil.') + '</p>'; return; }
  if (rol === 'kisitli') { kutu.innerHTML = '<h2>Kiralama yapamıyorsun</h2><p class="kucuk">Hesabın kısıtlandı' + (rolNeden ? ': ' + esc(rolNeden) : '') + '. Yardım için sağ alttaki "Soru sor"u kullan.</p>'; return; }
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
    const gun = hesapla(), tel = $('#kIlet').value.trim();
    if (!(gun >= 1)) { hata.textContent = 'Başlangıç ve iade tarihini seçin (iade, başlangıçtan sonra olmalı).'; return; }
    if (gun > 60) { hata.textContent = 'En fazla 60 günlük kiralama yapılabilir.'; return; }
    if (tel.replace(/\D/g, '').length < 10) { hata.textContent = 'Geçerli bir telefon numarası yazın.'; return; }
    if (!$('#kSozlesme').checked) { hata.textContent = 'Devam etmek için kiralama sözleşmesini kabul edin.'; return; }
    localStorage.setItem(LS_ILETISIM, tel);
    const dug = $('#kGonder'); dug.disabled = true; dug.textContent = 'Gönderiliyor…';
    try {
      await dbEkle('dolapKiralamalar', {
        esyaId: e.id, esyaBaslik: e.baslik, esyaFoto: e.fotolar[0], sahipId: e.sahipId,
        kiraciId: kullanici.uid, kiraciAd: (kullanici.displayName || kullanici.email || '').slice(0, 80),
        kiraciIletisim: (tel + ' · ' + (kullanici.email || '')).slice(0, 200), sahipIletisim: '',
        baslangic: $('#kBas').value, bitis: $('#kBit').value, gun,
        gunlukUcret: e.gunlukUcret, kira: gun * e.gunlukUcret, depozito: e.depozito, toplam: gun * e.gunlukUcret + e.depozito,
        not: $('#kNot').value.trim().slice(0, 500), durum: 'beklemede', sozlesme: SOZLESME_SURUM,
        olusturma: SIMDI(), guncelleme: SIMDI()
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
  if (rol === 'kisitli') $('#yeniEsya').outerHTML = '<p class="uyari">Hesabın kısıtlandı' + (rolNeden ? ': ' + esc(rolNeden) : '') + '. Yeni parça ekleyemezsin.</p>';
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
        '<p class="kira-detay">' + (e.onay === 'bekliyor' ? '<span class="durum d-beklemede">Onay bekliyor</span>'
          : e.onay === 'reddedildi' ? '<span class="durum d-reddedildi">Reddedildi</span> <span class="kucuk">' + esc(e.redNeden) + '</span>'
          : e.aktif ? '<span class="durum d-onaylandi">Yayında</span>' : '<span class="durum">Yayında değil</span>') + '</p></div>' +
      '<div class="eylem">' +
        '<button type="button" class="dug dug-kucuk" data-duzenle="' + esc(e.id) + '">Düzenle</button>' +
        '<button type="button" class="dug dug-kucuk" data-yayin="' + esc(e.id) + '">' + (e.aktif ? 'Yayından kaldır' : 'Yayınla') + '</button>' +
        '<button type="button" class="dug dug-kucuk dug-tehlike" data-sil="' + esc(e.id) + '">Sil</button>' +
      '</div></div>').join('');
  $('#liste').onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const e = l.find(x => x.id === (b.dataset.duzenle || b.dataset.yayin || b.dataset.sil));
    if (!e) return;
    
    try {
      if (b.dataset.duzenle) return esyaFormu(e);
      if (b.dataset.yayin) { b.disabled = true; await dbGuncelle('dolapEsyalar', e.id, { aktif: !e.aktif }); bildir(e.aktif ? 'Yayından kaldırıldı.' : 'Yayında.'); }
      if (b.dataset.sil) {
        if (!confirm('"' + e.baslik + '" dolabından silinsin mi? Bu geri alınamaz.')) return;
        await dbSil('dolapEsyalar', e.id);
        if (!DEMO) e.fotolar.forEach(f => deleteObject(ref(storage, f)).catch(() => {}));
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
  if (rol === 'kisitli') { bildir('Hesabın kısıtlandı; parça ekleyemez ya da düzenleyemezsin.'); return; }
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
        if (DEMO) { urller.push(f.onizleme); continue; }    // örnek mod: fotoğraf tarayıcıda kalır
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
        onay: 'bekliyor', redNeden: '',
        sahipAd: (kullanici.displayName || 'Kullanıcı').slice(0, 80), sahipFoto: (kullanici.photoURL || '').slice(0, 600)
      };
      if (e) await dbGuncelle('dolapEsyalar', e.id, veri);
      else await dbEkle('dolapEsyalar', { ...veri, sahipId: kullanici.uid, aktif: true, olusturma: SIMDI() });
      if (!DEMO) kaldirilan.forEach(u => deleteObject(ref(storage, u)).catch(() => {}));
      kapat();
      bildir('Ekip onayına gönderildi. Onaylanınca Keşfet\'te görünecek.');
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
    const k = l.find(x => x.id === b.dataset.id);
    const y = b.dataset.gecis;
    const veri = { durum: y, guncelleme: SIMDI() };
    if (y === 'onaylandi' && gorunum === 'sahip') {
      const tel = await onayPenceresi(k);
      if (!tel) return;
      veri.sahipIletisim = (tel + ' · ' + (kullanici.email || '')).slice(0, 200);
      veri.sahipSozlesme = SOZLESME_SURUM;
    }
    if (['iptal', 'reddedildi'].includes(y) && !confirm(y === 'iptal' ? 'İstek iptal edilsin mi?' : 'İstek reddedilsin mi?')) return;
    b.disabled = true;
    try { await dbGuncelle('dolapKiralamalar', k.id, veri); bildir('Güncellendi: ' + DURUM[y]); sayfaCiz(); }
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

/* ---------------------------------------------------------------- YÖNETİM PANELİ (#yonetim/...) */
const SAYFA_AD = { kesfet: 'Keşfet', esya: 'Parça sayfası', dolabim: 'Dolabım', kiralamalar: 'Kiralamalarım', hesabim: 'Hesabım', yonetim: 'Yönetim' };

async function yonetim(sekme, ek, istek) {
  if (!kullanici) return girisCagrisi('Yönetim paneli', 'Panel için yetkili hesabınla giriş yap.');
  if (!adminMi()) {
    icerik.innerHTML = '<div class="bos"><h3>Bu sayfaya erişim yetkin yok</h3><p>Yönetim paneli yalnız adminlere açıktır.</p><a class="dug" href="#kesfet">Keşfet\'e dön</a></div>';
    return;
  }
  const sekmeler = [['ozet', 'Özet'], ['onay', 'Onay bekleyenler'], ['gelen', 'Gelen kutusu'], ['kullanicilar', 'Kullanıcılar']]
    .concat(tamMi() ? [['yoneticiler', 'Admin atama']] : []).concat([['odemeler', 'Ödemeler']]);
  icerik.innerHTML = '<div class="bas"><div><h1>Yönetim paneli</h1><p>' + ROL_AD[rol] + ' olarak giriş yaptın.</p></div></div>' +
    '<div class="alt-sekme">' + sekmeler.map(([k, ad]) =>
      '<a class="cip" href="#yonetim/' + k + '" aria-pressed="' + (sekme === k || (sekme === 'kisi' && k === 'kullanicilar')) + '">' + ad +
      (k === 'onay' || k === 'gelen' ? ' <span class="sayi" id="sayi-' + k + '" hidden></span>' : '') + '</a>').join('') + '</div>' +
    '<div id="panel"><p class="yukleniyor">Yükleniyor…</p></div>';
  const panel = $('#panel');
  rozetSayilari();
  try {
    if (sekme === 'onay') await panelOnay(panel, istek);
    else if (sekme === 'gelen') await panelGelen(panel, ek, istek);
    else if (sekme === 'kullanicilar') await panelKullanicilar(panel, istek);
    else if (sekme === 'kisi' && ek) await panelKisi(panel, ek, istek);
    else if (sekme === 'yoneticiler' && tamMi()) await panelYoneticiler(panel, istek);
    else if (sekme === 'odemeler') location.hash = '#kiralamalar/yonetim';
    else await panelOzet(panel, istek);
  } catch (h) {
    if (istek === aktifIstek) panel.innerHTML = '<div class="bos"><h3>Yüklenemedi</h3><p>' + esc(hataMetni(h)) + '</p></div>';
  }
}
async function rozetSayilari() {
  try {
    const [bek, soh] = await Promise.all([esyaListesi('onay', 'bekliyor'), sohbetListesi()]);
    const yaz = (id, n) => { const s = $('#sayi-' + id); if (s) { s.textContent = n; s.hidden = !n; } };
    yaz('onay', bek.length);
    yaz('gelen', soh.filter(x => !x.adminOkudu).length);
  } catch (e) {}
}

async function panelOzet(panel, istek) {
  const ol = await olayListesi(30);
  if (istek !== aktifIstek) return;
  const esyaO = ol.filter(o => o.tur === 'esya'), aramaO = ol.filter(o => o.tur === 'arama');
  const gunler = [];
  for (let i = 13; i >= 0; i--) {
    const g = new Date(Date.now() - i * 864e5);
    gunler.push([g.toISOString().slice(0, 10), g.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })]);
  }
  const gunSay = new Map();
  ol.forEach(o => { const k = new Date(zaman(o.zaman)).toISOString().slice(0, 10); (gunSay.get(k) || gunSay.set(k, new Set()).get(k)).add(o.oturum); });
  const maxG = Math.max(1, ...gunler.map(([k]) => (gunSay.get(k) || new Set()).size));
  const sayac = (ad, s) => '<div class="sayac"><b>' + s.toLocaleString('tr-TR') + '</b><span>' + ad + '</span></div>';
  panel.innerHTML =
    '<p class="kucuk" style="margin-bottom:12px">Son 30 gün · yalnız gezinti kaydına izin veren ziyaretçiler sayılır.</p>' +
    '<div class="sayaclar">' + sayac('Ziyaret (oturum)', new Set(ol.map(o => o.oturum)).size) +
      sayac('Giriş yapmış kişi', new Set(ol.filter(o => o.uid).map(o => o.uid)).size) +
      sayac('Parça görüntüleme', esyaO.length) + sayac('Arama', aramaO.length) + '</div>' +
    '<div class="panel-izgara">' +
      '<section class="kutu"><h2>Günlük ziyaret · 14 gün</h2><div class="gunluk">' + gunler.map(([k, ad]) => {
        const s = (gunSay.get(k) || new Set()).size;
        return '<div class="gun" title="' + ad + ': ' + s + ' ziyaret"><i style="height:' + (s / maxG * 100).toFixed(1) + '%"></i><span>' + ad.split(' ')[0] + '</span></div>';
      }).join('') + '</div></section>' +
      '<section class="kutu"><h2>En çok bakılan markalar</h2>' + cubuklar(say(esyaO, o => o.marka)) + '</section>' +
      '<section class="kutu"><h2>En çok bakılan parçalar</h2>' + cubuklar(say(esyaO, o => o.baslik)) + '</section>' +
      '<section class="kutu"><h2>Kategoriler</h2>' + cubuklar(say(esyaO, o => KATEGORI[o.kategori] || o.kategori)) + '</section>' +
      '<section class="kutu"><h2>Aramalar</h2>' + cubuklar(say(aramaO, o => o.ara)) + '</section>' +
      '<section class="kutu"><h2>Sayfalar</h2>' + cubuklar(say(ol.filter(o => o.tur === 'sayfa'), o => SAYFA_AD[o.sayfa] || o.sayfa)) + '</section>' +
    '</div>' +
    '<section class="kutu"><h2>Son hareketler</h2>' + olayTablosu(ol.slice(0, 40), true) + '</section>' +
    (tamMi() ? '<section class="kutu tehlike-kutu"><h2>Veri yönetimi</h2>' +
      '<p class="kucuk" style="margin-bottom:12px">Yalnız tam yetkili görür. Silinen gezinti kayıtları geri getirilemez.</p>' +
      '<div class="satir-form"><label class="mini-alan">Şundan eski kayıtlar: <select id="silGun"><option value="7">7 gün</option><option value="30" selected>30 gün</option><option value="90">90 gün</option><option value="180">180 gün</option></select></label>' +
        '<button type="button" class="dug dug-kucuk" id="eskiSil">Eski kayıtları sil</button>' +
        '<button type="button" class="dug dug-kucuk dug-tehlike" id="hepsiniSil">Tüm gezinti kayıtlarını sıfırla</button></div>' +
      (DEMO ? '' : '<h3 style="font-size:15px;margin:18px 0 6px">Örnek veri</h3><p class="kucuk" style="margin-bottom:10px">Demo (elif.html?demo=1) bu veriyi veritabanından okur. Gerçek kullanıcı verilerine karışmaz; ayrı <b>demoVeri</b> koleksiyonundadır.</p>' +
        '<div class="satir-form"><button type="button" class="dug dug-kucuk dug-vurgu" id="demoYukle">Örnek veriyi veritabanına yükle</button>' +
        '<button type="button" class="dug dug-kucuk" id="demoSil">Örnek veriyi veritabanından sil</button>' +
        '<a class="dug dug-kucuk" href="elif.html?demo=1" target="_blank">Demoyu aç</a></div>') + '</section>' : '');
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-olay-sil],#eskiSil,#hepsiniSil,#demoYukle,#demoSil'); if (!b || !tamMi()) return;
    try {
      if (b.id === 'demoYukle') {
        if (!confirm('Örnek veri (parçalar, kiralamalar, üyeler, sohbetler, gezinti kayıtları) veritabanına yüklensin mi? Varsa üzerine yazılır.')) return;
        b.disabled = true; b.textContent = 'Yükleniyor…';
        await demoVeritabaninaYukle(); bildir('Örnek veri veritabanına yüklendi. Demo artık buradan okuyor.'); b.disabled = false; b.textContent = 'Örnek veriyi veritabanına yükle';
        return;
      }
      if (b.id === 'demoSil') {
        if (!confirm('Veritabanındaki örnek veri silinsin mi? Demo tarayıcıda üretilen veriyle çalışmaya devam eder.')) return;
        bildir((await demoVeritabanindanSil()) + ' örnek veri belgesi silindi.');
        return;
      }
      let n = 0;
      if (b.dataset.olaySil) n = await olaylariSil([b.dataset.olaySil]);
      if (b.id === 'eskiSil') {
        const gun = +$('#silGun').value, sinir = Date.now() - gun * 864e5;
        const l = (await tumOlaylar()).filter(o => zaman(o.zaman) < sinir);
        if (!l.length) { bildir(gun + ' günden eski kayıt yok.'); return; }
        if (!confirm(gun + ' günden eski ' + l.length + ' kayıt silinsin mi?')) return;
        n = await olaylariSil(l.map(o => o.id));
      }
      if (b.id === 'hepsiniSil') {
        const onay = prompt('Bütün gezinti kayıtları silinecek ve panel sıfırlanacak. Onaylamak için SIFIRLA yazın:');
        if (onay !== 'SIFIRLA') { if (onay !== null) bildir('Onay metni eşleşmedi, hiçbir şey silinmedi.'); return; }
        n = await olaylariSil((await tumOlaylar()).map(o => o.id));
      }
      bildir(n + ' kayıt silindi.' + (DEMO ? ' (Örnek mod: sayfa yenilenince geri gelir.)' : ''));
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}
function olayMetni(o) {
  if (o.tur === 'esya') return 'Parçaya baktı: <a href="#esya/' + esc(o.esyaId) + '">' + esc(o.baslik) + '</a> <span class="kucuk">' + esc(o.marka) + '</span>';
  if (o.tur === 'arama') return 'Aradı: “' + esc(o.ara) + '”';
  if (o.tur === 'giris') return 'Giriş yaptı';
  return 'Sayfa: ' + esc(SAYFA_AD[o.sayfa] || o.sayfa);
}
function olayTablosu(l, kisiGoster) {
  if (!l.length) return '<p class="kucuk">Kayıt yok.</p>';
  const sil = tamMi();
  return '<div class="tablo-kap"><table class="tablo"><thead><tr><th>Zaman</th>' + (kisiGoster ? '<th>Kişi</th>' : '') + '<th>Hareket</th>' + (sil ? '<th></th>' : '') + '</tr></thead><tbody>' +
    l.map(o => '<tr><td class="nw">' + tarihSaat(o.zaman) + '</td>' +
      (kisiGoster ? '<td>' + (o.uid ? '<a href="#yonetim/kisi/' + esc(o.uid) + '">' + esc(o.ad || 'Üye') + '</a>'
        : '<span class="kucuk">Ziyaretçi · ' + esc(String(o.oturum).slice(-4)) + '</span>') + '</td>' : '') +
      '<td>' + olayMetni(o) + '</td>' +
      (sil ? '<td><button type="button" class="sil-dug" data-olay-sil="' + esc(o.id) + '" aria-label="Kaydı sil" title="Kaydı sil">×</button></td>' : '') + '</tr>').join('') + '</tbody></table></div>';
}

async function panelOnay(panel, istek) {
  const l = (await esyaListesi('onay', 'bekliyor')).sort((a, b) => zaman(a.olusturma) - zaman(b.olusturma));
  if (istek !== aktifIstek) return;
  if (!l.length) { panel.innerHTML = '<div class="bos"><h3>Onay bekleyen ürün yok</h3><p>Yeni eklenen ya da düzenlenen ürünler buraya düşer.</p></div>'; return; }
  panel.innerHTML = '<div class="liste">' + l.map(e => '<div class="satir"><img class="k" src="' + esc(e.fotolar[0]) + '" alt="">' +
    '<div><h3><a href="#esya/' + esc(e.id) + '">' + esc(e.baslik) + '</a></h3>' +
      '<p class="kira-detay">' + esc([KATEGORI[e.kategori], e.marka, e.beden].filter(Boolean).join(' · ')) + ' · <b>' + tl(e.gunlukUcret) + '/gün</b> · depozito ' + tl(e.depozito) + '</p>' +
      '<p class="kira-detay">' + esc(e.sahipAd) + (e.aciklama ? ' · ' + esc(e.aciklama.slice(0, 140)) : '') + '</p></div>' +
    '<div class="eylem"><button type="button" class="dug dug-kucuk dug-vurgu" data-onay="' + esc(e.id) + '">Onayla</button>' +
      '<button type="button" class="dug dug-kucuk dug-tehlike" data-red="' + esc(e.id) + '">Reddet</button></div></div>').join('') + '</div>';
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-onay],[data-red]'); if (!b) return;
    let veri = { onay: 'onaylandi', redNeden: '' };
    if (b.dataset.red) {
      const n = prompt('Red nedeni (ürün sahibine gösterilir):', '');
      if (n === null) return;
      veri = { onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Uygun bulunmadı.' };
    }
    b.disabled = true;
    try { await dbGuncelle('dolapEsyalar', b.dataset.onay || b.dataset.red, veri); bildir(veri.onay === 'onaylandi' ? 'Onaylandı, Keşfet\'te yayında.' : 'Reddedildi.'); sayfaCiz(); }
    catch (h) { bildir(hataMetni(h)); b.disabled = false; }
  };
}

async function panelKullanicilar(panel, istek) {
  const [uyeler, roller, esyalar] = await Promise.all([uyeListesi(), rolListesi(), tumEsyalar()]);
  if (istek !== aktifIstek) return;
  const rolMap = new Map(roller.map(r => [r.eposta, r]));
  const ilan = new Map();
  esyalar.forEach(e => ilan.set(e.sahipId, (ilan.get(e.sahipId) || 0) + 1));
  const rolu = u => (u.eposta === TAM_YETKILI ? 'tam' : (rolMap.get(u.eposta) || {}).rol || 'uye');
  let ara = '';
  const ciz = () => {
    const q = ara.toLocaleLowerCase('tr-TR');
    const l = uyeler.filter(u => !q || (u.ad + ' ' + u.eposta).toLocaleLowerCase('tr-TR').includes(q)).sort((a, b) => zaman(b.sonGiris) - zaman(a.sonGiris));
    $('#uyeTablo').innerHTML = '<table class="tablo"><thead><tr><th>Kişi</th><th>Rol</th><th>İlan</th><th>Son giriş</th><th></th></tr></thead><tbody>' +
      l.map(u => {
        const r = rolu(u), kayit = rolMap.get(u.eposta), n = ilan.get(u.uid) || 0;
        const yonetilebilir = r === 'uye' || r === 'kisitli';
        return '<tr><td><b>' + esc(u.ad) + '</b><br><span class="kucuk">' + esc(u.eposta) + '</span></td>' +
          '<td><span class="rol-rozet r-' + r + '">' + ROL_AD[r] + '</span>' + (r === 'kisitli' && kayit && kayit.neden ? '<br><span class="kucuk">' + esc(kayit.neden) + '</span>' : '') + '</td>' +
          '<td>' + n + '</td><td class="nw">' + (u.sonGiris ? tarihSaat(u.sonGiris) : '') + '</td>' +
          '<td class="eylem-hucre"><a class="dug dug-kucuk" href="#yonetim/kisi/' + esc(u.uid) + '">Gezinti</a>' +
            (tamMi() && r === 'uye' ? '<button type="button" class="dug dug-kucuk dug-vurgu" data-adminyap="' + esc(u.eposta) + '">Admin yap</button>' : '') +
            (tamMi() && r === 'admin' ? '<button type="button" class="dug dug-kucuk" data-adminal="' + esc(u.eposta) + '">Adminliği al</button>' : '') +
            (r === 'uye' ? '<button type="button" class="dug dug-kucuk dug-tehlike" data-kisitla="' + esc(u.eposta) + '">Kısıtla</button>' : '') +
            (r === 'kisitli' ? '<button type="button" class="dug dug-kucuk" data-ac="' + esc(u.eposta) + '">Kısıtı kaldır</button>' : '') +
            (yonetilebilir && n ? '<button type="button" class="dug dug-kucuk dug-tehlike" data-urunkaldir="' + esc(u.uid) + '">Ürünlerini kaldır</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table>';
  };
  panel.innerHTML = '<input class="ara" id="uyeAra" type="search" placeholder="Ad veya e-posta ara…" style="margin:0 0 14px">' +
    '<div class="tablo-kap" id="uyeTablo"></div>' +
    '<p class="kucuk" style="margin-top:10px">Kısıtlanan kullanıcı siteyi gezebilir ama ürün ekleyemez ve kiralama yapamaz. Admin yapma ve adminliği alma yalnız tam yetkilide görünür' +
    (tamMi() ? '; listede olmayan biri için <a href="#yonetim/yoneticiler" style="text-decoration:underline">Admin atama</a> sekmesine Gmail adresini yazabilirsin' : '') + '.</p>';
  $('#uyeAra').oninput = ev => { ara = ev.target.value; ciz(); };
  ciz();
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-kisitla],[data-ac],[data-urunkaldir],[data-adminyap],[data-adminal]'); if (!b) return;
    try {
      if (b.dataset.adminyap && tamMi()) {
        if (!confirm(b.dataset.adminyap + ' admin yapılsın mı? Ürün onayı, kullanıcı kısıtlama, gelen kutusu ve ödeme onayı yetkisi alır.')) return;
        await rolYaz(b.dataset.adminyap, 'admin', ''); bildir(b.dataset.adminyap + ' artık admin.');
      }
      if (b.dataset.adminal && tamMi()) {
        if (!confirm(b.dataset.adminal + ' kişisinin admin yetkisi alınsın mı?')) return;
        await rolSil(b.dataset.adminal); bildir('Admin yetkisi alındı.');
      }
      if (b.dataset.kisitla) {
        const n = prompt('Kısıtlama nedeni (kullanıcıya gösterilir):', '');
        if (n === null) return;
        await rolYaz(b.dataset.kisitla, 'kisitli', n.trim().slice(0, 200));
        bildir('Kullanıcı kısıtlandı.');
      }
      if (b.dataset.ac) { await rolSil(b.dataset.ac); bildir('Kısıt kaldırıldı.'); }
      if (b.dataset.urunkaldir) {
        const n = prompt('Ürünleri kaldırma nedeni (ürün sahibine gösterilir):', 'Topluluk kurallarına aykırı içerik.');
        if (n === null) return;
        for (const e of esyalar.filter(x => x.sahipId === b.dataset.urunkaldir)) {
          await dbGuncelle('dolapEsyalar', e.id, { onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Yönetici tarafından kaldırıldı.', aktif: false });
        }
        bildir('Kullanıcının ürünleri yayından kaldırıldı.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

async function panelKisi(panel, uid, istek) {
  const [u, ol, esyalar] = await Promise.all([uyeGetir(uid), olayListesi(30), esyaListesi('sahipId', uid)]);
  if (istek !== aktifIstek) return;
  const kendi = ol.filter(o => o.uid === uid);
  const esyaO = kendi.filter(o => o.tur === 'esya');
  const sayac = (ad, s) => '<div class="sayac"><b>' + s + '</b><span>' + ad + '</span></div>';
  panel.innerHTML = '<p class="kucuk" style="margin-bottom:12px"><a href="#yonetim/kullanicilar">← Kullanıcılar</a></p>' +
    '<div class="kisi-bas">' + (u && u.foto ? '<img class="avatar buyuk" src="' + esc(u.foto) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div><h2>' + esc(u ? u.ad : 'Kullanıcı') + '</h2><p class="kucuk">' + esc([u && u.eposta, u && u.telefon].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="kucuk">' + (u && u.ilkGiris ? 'Üyelik: ' + tarihSaat(u.ilkGiris) + ' · ' : '') + (u && u.sonGiris ? 'Son giriş: ' + tarihSaat(u.sonGiris) : '') + '</p></div></div>' +
    '<div class="sayaclar">' + sayac('Oturum', new Set(kendi.map(o => o.oturum)).size) + sayac('Parça görüntüleme', esyaO.length) +
      sayac('Arama', kendi.filter(o => o.tur === 'arama').length) + sayac('İlan', esyalar.length) + '</div>' +
    '<div class="panel-izgara"><section class="kutu"><h2>Baktığı markalar</h2>' + cubuklar(say(esyaO, o => o.marka)) + '</section>' +
      '<section class="kutu"><h2>Baktığı parçalar</h2>' + cubuklar(say(esyaO, o => o.baslik)) + '</section></div>' +
    '<section class="kutu"><h2>Gezinti geçmişi · 30 gün</h2>' + olayTablosu(kendi.slice(0, 120), false) + '</section>' +
    (tamMi() ? '<section class="kutu tehlike-kutu"><h2>Veri yönetimi</h2><p class="kucuk" style="margin-bottom:10px">Kişi verisinin silinmesini isterse (KVKK) ya da hatalı kayıtlar için.</p>' +
      '<button type="button" class="dug dug-kucuk dug-tehlike" id="kisiSil">Bu kişinin tüm gezinti kayıtlarını sil</button></section>' : '');
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-olay-sil],#kisiSil'); if (!b || !tamMi()) return;
    try {
      let n;
      if (b.dataset.olaySil) n = await olaylariSil([b.dataset.olaySil]);
      else {
        const l = (await tumOlaylar()).filter(o => o.uid === uid);
        if (!confirm((u ? u.ad : 'Bu kişi') + ' için ' + l.length + ' gezinti kaydı silinsin mi?')) return;
        n = await olaylariSil(l.map(o => o.id));
      }
      bildir(n + ' kayıt silindi.' + (DEMO ? ' (Örnek mod: sayfa yenilenince geri gelir.)' : ''));
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

async function panelYoneticiler(panel, istek) {
  const adminler = (await rolListesi()).filter(r => r.rol === 'admin');
  if (istek !== aktifIstek) return;
  panel.innerHTML = '<div class="kutu" style="margin-top:0"><h2>Admin ata</h2>' +
    '<p class="kucuk" style="margin-bottom:10px">Kişinin Google (Gmail) adresini yazın. Bu hesapla giriş yaptığında admin olur: ürün onayı, kullanıcı kısıtlama, gelen kutusu ve ödeme onayı. Admin atamayı yalnız tam yetkili yapabilir.</p>' +
    '<div class="satir-form"><input class="ara" id="yeniAdmin" type="email" placeholder="ornek@gmail.com" autocomplete="off"><button type="button" class="dug dug-vurgu" id="adminEkle">Admin yap</button></div>' +
    '<p class="hata" id="adminHata" role="alert"></p></div>' +
    '<div class="kutu"><h2>Yetkililer</h2><div class="tablo-kap"><table class="tablo"><tbody>' +
      '<tr><td><b>' + TAM_YETKILI + '</b></td><td><span class="rol-rozet r-tam">Tam yetkili</span></td><td></td></tr>' +
      adminler.map(r => '<tr><td><b>' + esc(r.eposta) + '</b><br><span class="kucuk">' + esc(r.atayan) + ' atadı' + (r.zaman ? ' · ' + tarihSaat(r.zaman) : '') + '</span></td>' +
        '<td><span class="rol-rozet r-admin">Admin</span></td><td class="eylem-hucre"><button type="button" class="dug dug-kucuk dug-tehlike" data-adminsil="' + esc(r.eposta) + '">Yetkiyi al</button></td></tr>').join('') +
    '</tbody></table></div></div>';
  $('#adminEkle').onclick = async () => {
    const e = $('#yeniAdmin').value.trim().toLowerCase(), h = $('#adminHata');
    h.textContent = '';
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) { h.textContent = 'Geçerli bir e-posta adresi yazın.'; return; }
    if (e === TAM_YETKILI) { h.textContent = 'Bu hesap zaten tam yetkili.'; return; }
    try { await rolYaz(e, 'admin', ''); bildir(e + ' admin yapıldı.'); sayfaCiz(); } catch (x) { h.textContent = hataMetni(x); }
  };
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-adminsil]'); if (!b) return;
    if (!confirm(b.dataset.adminsil + ' kişisinin admin yetkisi alınsın mı?')) return;
    try { await rolSil(b.dataset.adminsil); bildir('Yetki alındı.'); sayfaCiz(); } catch (x) { bildir(hataMetni(x)); }
  };
}

/* ---------------------------------------------------------------- SOHBET: soru-cevap asistanı + admin gelen kutusu
 * dolapSohbet/{id}: { uid, ad, eposta, konu, durum, mesajlar[{kimden, ad, metin, zaman}], sonZaman, adminOkudu, kullaniciOkudu }
 * Asistan sık sorulanları kendisi yanıtlar; yanıt yoksa soru giriş yapılarak ekibe (adminlere) iletilir. */
const SSS = [
  { s: 'Nasıl kiralarım?', k: ['kirala', 'nasıl', 'istek'], c: 'Keşfet\'te beğendiğin parçayı aç, başlangıç ve iade tarihini seç, sözleşmeyi onaylayıp "İstek gönder"e bas. Sahibi onaylayınca ödeme bilgileri Kiralamalarım\'da görünür.' },
  { s: 'Depozito nedir, ne zaman iade edilir?', k: ['depozito', 'teminat', 'iade edil'], c: 'Depozito, parçanın güvencesi olarak kira bedeliyle birlikte ödenir. Parça zamanında ve hasarsız iade edilince, sahibi iadeyi onayladıktan sonra en geç 3 iş günü içinde sana geri ödenir.' },
  { s: 'Geç iade edersem ne olur?', k: ['geç', 'gecik', 'teslim etmez', 'kayıp'], c: 'Geciken her gün için günlük kiranın 1,5 katı depozitodan düşülür. İade gününden 7 gün geçerse parça teslim edilmemiş sayılır ve depozitonun tamamı sahibine ödenir. Ayrıntılar kiralama sözleşmesinde.' },
  { s: 'Ödemeyi nasıl yaparım?', k: ['öde', 'havale', 'eft', 'iban', 'kart'], c: 'Sahibi isteği onaylayınca Kiralamalarım\'da IBAN ve referans kodu çıkar. Havale/EFT açıklamasına referans kodunu yazıp "Ödemeyi yaptım"a basman yeterli. Kartla ödeme yakında.' },
  { s: 'Dolabıma nasıl parça eklerim?', k: ['ekle', 'ilan', 'dolabım', 'kiraya ver'], c: 'Dolabım\'dan "+ Eşya ekle"ye bas; 1-4 fotoğraf, beden, günlük kira ve depozitoyu gir. Parça ekibimiz onayladıktan sonra Keşfet\'te görünür.' },
  { s: 'Parçam neden Keşfet\'te görünmüyor?', k: ['görünmüyor', 'onay', 'yayında değil', 'reddedil'], c: 'Yeni eklenen ya da düzenlenen parçalar ekip onayından sonra yayına girer. Dolabım\'da "Onay bekliyor" ya da red nedeni yazıyorsa durum oradan görünür.' },
  { s: 'Hasar ya da leke olursa?', k: ['hasar', 'leke', 'yırt', 'bozul'], c: 'Onarım ya da profesyonel temizlik bedeli depozitodan düşülür. Teslim ve iadede parçanın fotoğrafını çekmeni öneririz; anlaşmazlıkta bu fotoğraflar esas alınır.' },
  { s: 'İptal edebilir miyim?', k: ['iptal', 'vazgeç'], c: 'Kiralama başlangıcına 48 saat kalana kadar ücretsiz iptal edebilirsin. Sonrasında kira bedelinin %50\'si sahibine ödenir.' }
];
function sssBul(metin) {
  const m = metin.toLocaleLowerCase('tr-TR');
  let en = null, puan = 0;
  SSS.forEach(x => { const p = x.k.filter(k => m.includes(k)).length; if (p > puan) { puan = p; en = x; } });
  return en;
}
async function sohbetListesi() {
  if (D) return D.sohbetler.map(x => ({ ...x }));
  return (await getDocs(collection(db, 'dolapSohbet'))).docs.map(d => ({ id: d.id, ...d.data() }));
}
async function benimSohbetim() {
  if (!kullanici) return null;
  if (D) return D.sohbetler.find(x => x.uid === kullanici.uid) || null;
  const l = (await getDocs(query(collection(db, 'dolapSohbet'), where('uid', '==', kullanici.uid)))).docs.map(d => ({ id: d.id, ...d.data() }));
  return l.sort((a, b) => zaman(b.sonZaman) - zaman(a.sonZaman))[0] || null;
}
/* Destek postası: sunucu gerektirmeyen form hizmetiyle site sahibinin adresine gider.
   ayarlar.js'te web3formsKey varsa Web3Forms, yoksa FormSubmit (ilk gönderimde adrese bir kez
   "Activate Form" postası gelir; tıklanınca sonraki tüm iletiler doğrudan düşer). */
async function destekPostasi(v) {
  const konu = 'Elif\'in Dolabı destek: ' + v.konu;
  const govde = { name: v.ad, email: v.eposta, Konu: v.konu, Mesaj: v.mesaj, 'Sohbet geçmişi': v.gecmis || '-',
    Sayfa: location.origin + location.pathname, 'Giriş yapmış hesap': kullanici ? (kullanici.email || '') : 'Giriş yapılmamış' };
  let url;
  if (AYAR.web3formsKey) {
    url = 'https://api.web3forms.com/submit';
    Object.assign(govde, { access_key: AYAR.web3formsKey, subject: konu, from_name: v.ad, replyto: v.eposta });
  } else {
    url = 'https://formsubmit.co/ajax/' + encodeURIComponent(AYAR.eposta || TAM_YETKILI);
    Object.assign(govde, { _subject: konu, _replyto: v.eposta, _template: 'table', _captcha: 'false' });
  }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(govde) });
  const d = await r.json().catch(() => ({}));
  const tamam = r.ok && String(d.success) !== 'false';
  if (!tamam) {
    const e = new Error(d.message || 'E-posta gönderilemedi.');
    e.aktivasyon = /activat/i.test(d.message || '');
    throw e;
  }
}
async function soruGonder(metin) {
  const mesaj = { kimden: 'kullanici', ad: (kullanici.displayName || '').slice(0, 80), metin: metin.slice(0, 2000), zaman: Date.now() };
  const mevcut = await benimSohbetim();
  if (mevcut && mevcut.durum !== 'kapali') {
    await dbGuncelle('dolapSohbet', mevcut.id, { mesajlar: mevcut.mesajlar.concat([mesaj]), durum: 'acik', sonZaman: SIMDI(), adminOkudu: false });
  } else {
    await dbEkle('dolapSohbet', { uid: kullanici.uid, ad: mesaj.ad, eposta: kullanici.email, konu: metin.slice(0, 120),
      durum: 'acik', mesajlar: [mesaj], sonZaman: SIMDI(), adminOkudu: false, kullaniciOkudu: true });
  }
}

let sohbetDinle = null;
function asistanKur() {
  document.body.insertAdjacentHTML('beforeend',
    '<button type="button" class="asistan-dug" id="asistanDug" aria-expanded="false" aria-controls="asistan">Soru sor <span class="sayi" id="asistanSayi" hidden>1</span></button>' +
    '<section class="asistan" id="asistan" hidden aria-label="Soru sor"><header><b>Elif\'in Dolabı · Yardım</b><button type="button" id="asistanKapat" aria-label="Kapat">×</button></header>' +
    '<div class="asistan-akis" id="asistanAkis"></div>' +
    '<form class="asistan-form" id="asistanForm"><input id="asistanMetin" maxlength="2000" placeholder="Sorunu yaz…" autocomplete="off" aria-label="Sorun"><button type="submit" class="dug dug-kucuk dug-ana">Gönder</button></form></section>');
  const akis = $('#asistanAkis'), kutu = $('#asistan'), dug = $('#asistanDug');
  const balon = (kimden, html, metin) => {
    akis.insertAdjacentHTML('beforeend', '<div class="mesaj m-' + kimden + '">' + html + '</div>');
    akis.scrollTop = akis.scrollHeight;
    if (metin) gunluk.push((kimden === 'kullanici' ? 'Ziyaretçi: ' : 'Asistan: ') + metin);
  };
  let gecmisCizildi = false, sonSoru = '';
  const gunluk = [];   // e-postaya eklenecek sohbet özeti
  const ilet = '<button type="button" class="bag-dug" data-ilet="1">Ekibe ilet →</button>';
  const iletFormu = () => {
    const ad = kullanici ? (kullanici.displayName || '') : '', ep = kullanici ? (kullanici.email || '') : '';
    return '<form class="ilet-form" data-ilet-form="1"><b>Ekibe ilet</b>' +
      '<label>Adın<input name="ad" required maxlength="80" autocomplete="name" value="' + esc(ad) + '"></label>' +
      '<label>E-posta adresin<input name="eposta" type="email" required maxlength="120" autocomplete="email" value="' + esc(ep) + '"></label>' +
      '<label>Konu<input name="konu" required maxlength="120" value="' + esc(sonSoru.slice(0, 70)) + '"></label>' +
      '<label>Mesaj<textarea name="mesaj" required maxlength="2000" rows="4">' + esc(sonSoru) + '</textarea></label>' +
      '<button type="submit" class="dug dug-kucuk dug-ana">Gönder</button>' +
      '<span class="kucuk">Yanıt e-posta adresine gelir' + (kullanici ? ', burada da görürsün' : '') + '.</span></form>';
  };
  const giris = () => {
    akis.innerHTML = '';
    balon('bot', 'Merhaba! Kiralama, depozito, ödeme ya da dolabına parça ekleme hakkında sorabilirsin.');
    balon('bot', '<div class="sss-cipler">' + SSS.map((x, i) => '<button type="button" class="cip" data-sss="' + i + '">' + esc(x.s) + '</button>').join('') + '</div>');
  };
  const gecmis = async () => {
    const s = await benimSohbetim().catch(() => null);
    if (!s) return;
    balon('bot', '<span class="kucuk">Ekiple yazışman</span>');
    s.mesajlar.forEach(m => balon(m.kimden === 'admin' ? 'admin' : 'kullanici', (m.kimden === 'admin' ? '<b>' + esc(m.ad || 'Ekip') + ':</b> ' : '') + esc(m.metin)));
    if (s.durum === 'yanitlandi' && !s.kullaniciOkudu) dbGuncelle('dolapSohbet', s.id, { kullaniciOkudu: true }).catch(() => {});
  };
  dug.onclick = async () => {
    kutu.hidden = !kutu.hidden; dug.setAttribute('aria-expanded', String(!kutu.hidden));
    $('#asistanSayi').hidden = true;
    if (!kutu.hidden && !gecmisCizildi) { gecmisCizildi = true; giris(); await gecmis(); }
    if (!kutu.hidden) $('#asistanMetin').focus();
  };
  $('#asistanKapat').onclick = () => { kutu.hidden = true; dug.setAttribute('aria-expanded', 'false'); dug.focus(); };
  akis.onclick = async ev => {
    const s = ev.target.closest('[data-sss]');
    if (s) { const x = SSS[+s.dataset.sss]; balon('kullanici', esc(x.s), x.s); balon('bot', esc(x.c) + '<br>' + ilet, x.c); sonSoru = x.s; return; }
    if (ev.target.closest('[data-ilet]')) {
      if (akis.querySelector('[data-ilet-form]')) { akis.querySelector('[data-ilet-form] input').focus(); return; }
      balon('bot', iletFormu());
      akis.querySelector('[data-ilet-form] input:invalid, [data-ilet-form] input')?.focus();
    }
  };
  akis.onsubmit = async ev => {
    const f = ev.target.closest('[data-ilet-form]'); if (!f) return;
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    Object.keys(v).forEach(k => { v[k] = String(v[k]).trim(); });
    if (!v.ad || !v.konu || !v.mesaj || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.eposta)) { balon('bot', 'Ad, geçerli bir e-posta, konu ve mesaj gerekli.'); return; }
    v.gecmis = gunluk.slice(-12).join('\n');
    const dug = f.querySelector('button'); dug.disabled = true; dug.textContent = 'Gönderiliyor…';
    try {
      await destekPostasi(v);
      if (kullanici) soruGonder(v.konu + ' — ' + v.mesaj).catch(() => {});   // giriş yapılmışsa gelen kutusuna da
      f.closest('.mesaj').remove();
      balon('kullanici', '<b>' + esc(v.konu) + '</b><br>' + esc(v.mesaj));
      balon('bot', 'İletildi ✓ Ekibimiz ' + esc(v.eposta) + ' adresine yanıt verecek.');
      sonSoru = '';
    } catch (h) {
      dug.disabled = false; dug.textContent = 'Gönder';
      balon('bot', h.aktivasyon
        ? 'Destek e-postası ilk kez kuruluyor: site sahibinin adresine bir doğrulama postası gitti. Doğrulandıktan sonra gönderebileceksin; acilse ' + esc(AYAR.eposta) + ' adresine doğrudan yazabilirsin.'
        : 'Gönderilemedi: ' + esc(h.message) + '. Doğrudan ' + esc(AYAR.eposta) + ' adresine yazabilirsin.');
    }
  };
  $('#asistanForm').onsubmit = ev => {
    ev.preventDefault();
    const m = $('#asistanMetin').value.trim();
    if (!m) return;
    $('#asistanMetin').value = '';
    balon('kullanici', esc(m), m);
    sonSoru = m;
    const x = sssBul(m);
    balon('bot', x ? esc(x.c) + '<br><span class="kucuk">Yanıt sorunu çözmediyse:</span> ' + ilet
      : 'Bunun yanıtını bilmiyorum, ama ekibimiz yanıtlayabilir. ' + ilet, x ? x.c : 'Yanıt bilinmiyor, ekibe iletme önerildi.');
  };
}
/* giriş yapan kullanıcıya gelen yeni yanıtı balonda rozetle göster */
function sohbetIzle() {
  if (sohbetDinle) { sohbetDinle(); sohbetDinle = null; }
  if (!kullanici || DEMO) return;
  sohbetDinle = onSnapshot(query(collection(db, 'dolapSohbet'), where('uid', '==', kullanici.uid)), snap => {
    const yeni = snap.docs.some(d => d.data().durum === 'yanitlandi' && !d.data().kullaniciOkudu);
    const r = $('#asistanSayi'); if (r && $('#asistan').hidden) r.hidden = !yeni;
  }, () => {});
}

async function panelGelen(panel, secili, istek) {
  const l = (await sohbetListesi()).sort((a, b) => (a.adminOkudu - b.adminOkudu) || (zaman(b.sonZaman) - zaman(a.sonZaman)));
  if (istek !== aktifIstek) return;
  if (!l.length) { panel.innerHTML = '<div class="bos"><h3>Gelen kutusu boş</h3><p>Ziyaretçilerin soru-cevap asistanından ilettiği sorular buraya düşer.</p></div>'; return; }
  const s = l.find(x => x.id === secili) || null;
  const DURUM_AD = { acik: 'Yanıt bekliyor', yanitlandi: 'Yanıtlandı', kapali: 'Kapandı' };
  panel.innerHTML = '<div class="gelen">' +
    '<div class="gelen-liste">' + l.map(x => '<a class="gelen-oge' + (x.id === secili ? ' secili' : '') + (x.adminOkudu ? '' : ' okunmadi') + '" href="#yonetim/gelen/' + esc(x.id) + '">' +
      '<b>' + esc(x.ad) + '</b><span>' + esc(x.mesajlar[x.mesajlar.length - 1].metin.slice(0, 70)) + '</span>' +
      '<small>' + DURUM_AD[x.durum] + ' · ' + tarihSaat(x.sonZaman) + '</small></a>').join('') + '</div>' +
    '<div class="gelen-detay">' + (s ?
      '<div class="gelen-bas"><div><b>' + esc(s.ad) + '</b> <span class="kucuk">' + esc(s.eposta) + '</span></div>' +
        '<div class="eylem">' + (s.durum !== 'kapali' ? '<button type="button" class="dug dug-kucuk" id="sohbetKapat">Konuyu kapat</button>' : '') +
        (tamMi() ? '<button type="button" class="dug dug-kucuk dug-tehlike" id="sohbetSil">Konuyu sil</button>' : '') + '</div></div>' +
      '<div class="gelen-akis">' + s.mesajlar.map(m => '<div class="mesaj m-' + (m.kimden === 'admin' ? 'admin' : 'kullanici') + '"><small>' +
        esc(m.kimden === 'admin' ? (m.ad || 'Ekip') : s.ad) + ' · ' + tarihSaat(m.zaman) + '</small>' + esc(m.metin) + '</div>').join('') + '</div>' +
      '<form class="asistan-form" id="yanitForm"><textarea id="yanitMetin" maxlength="2000" placeholder="Yanıtını yaz…" aria-label="Yanıt"></textarea><button type="submit" class="dug dug-vurgu">Yanıtla</button></form>'
      : '<p class="kucuk" style="padding:20px">Soldan bir konu seç.</p>') + '</div></div>';
  if (!s) return;
  if (!s.adminOkudu) dbGuncelle('dolapSohbet', s.id, { adminOkudu: true }).catch(() => {});
  $('#yanitForm').onsubmit = async ev => {
    ev.preventDefault();
    const m = $('#yanitMetin').value.trim();
    if (!m) return;
    const mesaj = { kimden: 'admin', ad: (kullanici.displayName || 'Ekip').slice(0, 80), metin: m.slice(0, 2000), zaman: Date.now() };
    try {
      await dbGuncelle('dolapSohbet', s.id, { mesajlar: s.mesajlar.concat([mesaj]), durum: 'yanitlandi', sonZaman: SIMDI(), adminOkudu: true, kullaniciOkudu: false });
      bildir('Yanıt gönderildi.'); sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
  const silDug = $('#sohbetSil');
  if (silDug) silDug.onclick = async () => {
    if (!confirm('Bu konu ve tüm mesajları silinsin mi? Geri alınamaz.')) return;
    try {
      if (D) D.sohbetler = D.sohbetler.filter(x => x.id !== s.id);
      else await dbSil('dolapSohbet', s.id);
      bildir('Konu silindi.'); location.hash = '#yonetim/gelen';
    } catch (h) { bildir(hataMetni(h)); }
  };
  const kapat = $('#sohbetKapat');
  if (kapat) kapat.onclick = async () => {
    try { await dbGuncelle('dolapSohbet', s.id, { durum: 'kapali', sonZaman: SIMDI() }); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); }
  };
}

/* ---------------------------------------------------------------- HESABIM (#hesabim/{bolum}) */
async function hesabim(bolum, istek) {
  if (!kullanici) return girisCagrisi('Hesabın', 'Bilgilerini, adreslerini ve kayıtlı filtrelerini görmek için giriş yap.');
  if (!uye) uye = { telefon: '', adresler: [], filtreler: [], bildirimEposta: true };
  const adresler = uye.adresler || [], filtreler = uye.filtreler || [];
  const bolumler = [['profil', 'Profil'], ['adresler', 'Adreslerim'], ['kartlar', 'Kartlarım'], ['filtreler', 'Filtrelerim'], ['tercihler', 'Gizlilik ve bildirim'], ['hesap', 'Hesap']];
  icerik.innerHTML = '<div class="bas"><div><h1>Hesabım</h1><p>Bilgilerin ve ayarların.</p></div></div>' +
    '<div class="hesap-duzen"><nav class="hesap-menu" aria-label="Hesap bölümleri">' +
      bolumler.map(([k, ad]) => '<a href="#hesabim/' + k + '"' + ((bolum || 'profil') === k ? ' aria-current="true"' : '') + '>' + ad + '</a>').join('') + '</nav><div>' +
    /* profil */
    '<section class="kutu" id="b-profil"><h2>Profil</h2><div class="kisi-bas">' +
      (kullanici.photoURL ? '<img class="avatar buyuk" src="' + esc(kullanici.photoURL) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div><b>' + esc(kullanici.displayName || '') + '</b><p class="kucuk">' + esc(kullanici.email || '') + ' · <span class="rol-rozet r-' + rol + '">' + ROL_AD[rol] + '</span></p>' +
      (rol === 'kisitli' ? '<p class="uyari" style="margin-top:8px">Hesabın kısıtlandı' + (rolNeden ? ': ' + esc(rolNeden) : '') + '. Siteyi gezebilirsin ama parça ekleyemez ve kiralama yapamazsın. Yardım için sağ alttaki "Soru sor"u kullan.</p>' : '') +
      '</div></div>' +
      '<div class="form-izgara" style="margin-top:14px"><div class="alan"><label for="hTel">Telefon</label><input id="hTel" type="tel" autocomplete="tel" value="' + esc(uye.telefon || '') + '"></div></div>' +
      '<p class="kucuk" style="margin-top:6px">Ad ve fotoğraf Google hesabından gelir.</p>' +
      '<button type="button" class="dug dug-ana" id="profilKaydet" style="margin-top:12px">Kaydet</button></section>' +
    /* adresler */
    '<section class="kutu" id="b-adresler"><h2>Kayıtlı adreslerim</h2><div class="adresler">' +
      (adresler.length ? adresler.map((a, i) => '<div class="adres"><b>' + esc(a.baslik) + '</b><p>' + esc(a.adSoyad) + ' · ' + esc(a.telefon) + '</p><p>' + esc(a.adres) + '</p><p>' + esc(a.ilce) + ' / ' + esc(a.il) + '</p>' +
        '<div class="eylem"><button type="button" class="dug dug-kucuk" data-adres-duzenle="' + i + '">Düzenle</button><button type="button" class="dug dug-kucuk dug-tehlike" data-adres-sil="' + i + '">Sil</button></div></div>').join('')
        : '<p class="kucuk">Kayıtlı adresin yok. Teslimatlarda hızlıca seçebilmek için ekleyebilirsin.</p>') +
      '</div>' + (adresler.length < 10 ? '<button type="button" class="dug" id="adresEkle" style="margin-top:12px">+ Adres ekle</button>' : '') + '</section>' +
    /* kartlar */
    '<section class="kutu" id="b-kartlar"><h2>Kayıtlı kartlarım</h2>' +
      '<p class="uyari">Güvenliğin için kart numaraları bu sitede <b>saklanmaz</b>. Kartla ödeme altyapısı bağlandığında kartını ödeme kuruluşunun güvenli kasasına (PCI DSS uyumlu) kaydedebilecek, sonraki kiralamalarda tek dokunuşla ödeyebileceksin. Şimdilik ödemeler havale/EFT ile yapılıyor.</p></section>' +
    /* filtreler */
    '<section class="kutu" id="b-filtreler"><h2>Kayıtlı filtrelerim</h2>' +
      (filtreler.length ? '<div class="liste">' + filtreler.map((f, i) => '<div class="filtre-satir"><div><b>' + esc(f.ad) + '</b><p class="kucuk">' +
        esc([f.kategori && f.kategori !== 'hepsi' ? KATEGORI[f.kategori] : 'Tüm kategoriler', f.beden && 'Beden ' + f.beden, f.maxFiyat && 'En çok ' + tl(f.maxFiyat) + '/gün', f.ara && '“' + f.ara + '”'].filter(Boolean).join(' · ')) + '</p></div>' +
        '<div class="eylem"><button type="button" class="dug dug-kucuk dug-vurgu" data-filtre-uygula="' + i + '">Uygula</button><button type="button" class="dug dug-kucuk dug-tehlike" data-filtre-sil="' + i + '">Sil</button></div></div>').join('') + '</div>'
        : '<p class="kucuk">Henüz kayıtlı filtren yok. Keşfet\'te süzgeçleri ayarlayıp "☆ Bu filtreyi kaydet"e bas.</p>') + '</section>' +
    /* tercihler */
    '<section class="kutu" id="b-tercihler"><h2>Gizlilik ve bildirim</h2>' +
      '<label class="onay-kutu"><input type="checkbox" id="tIzin"' + (izinVar() ? ' checked' : '') + '><span><b>Gezinti kaydı.</b> Baktığım sayfaların ve parçaların, siteyi geliştirmek için kaydedilmesine izin veriyorum.</span></label>' +
      '<label class="onay-kutu"><input type="checkbox" id="tEposta"' + (uye.bildirimEposta !== false ? ' checked' : '') + '><span><b>E-posta bildirimleri.</b> Kiralama istekleri, onaylar ve yanıtlar için e-posta al.</span></label>' +
      '<button type="button" class="dug dug-ana" id="tercihKaydet" style="margin-top:12px">Kaydet</button></section>' +
    /* hesap */
    '<section class="kutu" id="b-hesap"><h2>Hesap</h2><div class="eylem" style="justify-content:flex-start">' +
      '<button type="button" class="dug" id="hCikis">Çıkış yap</button><button type="button" class="dug dug-tehlike" id="hSil">Üyelik kaydımı sil</button></div>' +
      '<p class="kucuk" style="margin-top:10px">Üyelik kaydını silmek telefon, adres ve filtrelerini siler. İlanların ve kiralama kayıtların için "Soru sor"dan bize yazabilirsin.</p></section>' +
    '</div></div>';
  if (bolum) { const h = $('#b-' + bolum); if (h) h.scrollIntoView({ block: 'start' }); }

  const kaydet = async (veri, mesaj) => { try { await uyeKaydet(veri); bildir(mesaj); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); } };
  $('#profilKaydet').onclick = () => kaydet({ telefon: $('#hTel').value.trim().slice(0, 30) }, 'Profil kaydedildi.');
  $('#tercihKaydet').onclick = () => {
    try { localStorage.setItem(LS_IZIN, $('#tIzin').checked ? 'evet' : 'hayir'); } catch (e) {}
    kaydet({ istatistikIzni: $('#tIzin').checked, bildirimEposta: $('#tEposta').checked }, 'Tercihler kaydedildi.');
  };
  $('#hCikis').onclick = () => { if (!demoEngel()) signOut(auth); };
  $('#hSil').onclick = async () => {
    if (demoEngel()) return;
    if (!confirm('Üyelik kaydın (telefon, adresler, filtreler) silinsin mi?')) return;
    try { await dbSil('dolapUyeler', kullanici.uid); uye = null; bildir('Üyelik kaydın silindi.'); signOut(auth); } catch (h) { bildir(hataMetni(h)); }
  };
  const adresBtn = $('#adresEkle');
  if (adresBtn) adresBtn.onclick = () => adresFormu(-1);
  icerik.querySelector('.hesap-duzen').onclick = async ev => {
    const b = ev.target.closest('[data-adres-duzenle],[data-adres-sil],[data-filtre-uygula],[data-filtre-sil]'); if (!b) return;
    if (b.dataset.adresDuzenle) return adresFormu(+b.dataset.adresDuzenle);
    if (b.dataset.adresSil) { if (confirm('Adres silinsin mi?')) kaydet({ adresler: adresler.filter((_, i) => i !== +b.dataset.adresSil) }, 'Adres silindi.'); return; }
    if (b.dataset.filtreSil) { kaydet({ filtreler: filtreler.filter((_, i) => i !== +b.dataset.filtreSil) }, 'Filtre silindi.'); return; }
    if (b.dataset.filtreUygula) {
      const f = filtreler[+b.dataset.filtreUygula];
      Object.assign(kesfetS, { kategori: f.kategori || 'hepsi', ara: f.ara || '', beden: f.beden || '', maxFiyat: f.maxFiyat || 0 });
      location.hash = '#kesfet';
    }
  };
}
function adresFormu(i) {
  const a = i >= 0 ? uye.adresler[i] : { baslik: '', adSoyad: kullanici.displayName || '', telefon: uye.telefon || '', adres: '', ilce: '', il: '' };
  const p = $('#pencere');
  const alan = (id, ad, v, tam) => '<div class="alan' + (tam ? ' tam' : '') + '"><label for="a' + id + '">' + ad + '</label>' +
    (id === 'Adres' ? '<textarea id="aAdres" maxlength="300">' + esc(v) + '</textarea>' : '<input id="a' + id + '" maxlength="80" value="' + esc(v) + '">') + '</div>';
  p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">' + (i >= 0 ? 'Adresi düzenle' : 'Adres ekle') + '</h2><div class="form-izgara">' +
    alan('Baslik', 'Adres başlığı (Ev, İş…)', a.baslik) + alan('AdSoyad', 'Ad soyad', a.adSoyad) + alan('Telefon', 'Telefon', a.telefon) +
    alan('Il', 'İl', a.il) + alan('Ilce', 'İlçe', a.ilce) + alan('Adres', 'Açık adres', a.adres, true) + '</div>' +
    '<p class="hata" id="aHata" role="alert"></p><div class="pencere-alt"><button type="button" class="dug" id="aVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="aKaydet">Kaydet</button></div></div>';
  p.hidden = false; document.body.style.overflow = 'hidden';
  const kapat = () => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; };
  $('#aVazgec').onclick = kapat;
  p.onclick = ev => { if (ev.target === p) kapat(); };
  $('#aKaydet').onclick = async () => {
    const v = id => $('#a' + id).value.trim();
    const yeni = { baslik: v('Baslik') || 'Adres', adSoyad: v('AdSoyad'), telefon: v('Telefon'), adres: v('Adres'), ilce: v('Ilce'), il: v('Il') };
    if (!yeni.adres || !yeni.il) { $('#aHata').textContent = 'Açık adres ve il zorunlu.'; return; }
    const l = (uye.adresler || []).slice();
    if (i >= 0) l[i] = yeni; else l.push(yeni);
    try { await uyeKaydet({ adresler: l }); kapat(); bildir('Adres kaydedildi.'); sayfaCiz(); } catch (h) { $('#aHata').textContent = hataMetni(h); }
  };
}

/* yönetici araçları: parça sayfasında onay / red / kaldır */
function adminEsyaAraclari(e) {
  if (!adminMi()) return '';
  const DURUM_AD = { bekliyor: 'Onay bekliyor', onaylandi: 'Onaylı', reddedildi: 'Reddedildi' };
  return '<div class="kutu admin-kutu"><h2>Yönetici</h2><p class="kucuk" style="margin-bottom:10px">Durum: <b>' + DURUM_AD[e.onay] + '</b>' +
    (e.redNeden ? ' · ' + esc(e.redNeden) : '') + ' · ' + (e.aktif ? 'yayın açık' : 'yayın kapalı') + '</p><div class="eylem" style="justify-content:flex-start">' +
    (e.onay !== 'onaylandi' ? '<button type="button" class="dug dug-kucuk dug-vurgu" data-yon="onayla">Onayla</button>' : '') +
    (e.onay !== 'reddedildi' ? '<button type="button" class="dug dug-kucuk dug-tehlike" data-yon="kaldir">Yayından kaldır</button>' : '') +
    '</div></div>';
}

/* ---------------------------------------------------------------- başlat */
/* Girişte: rolü (tam / admin / kısıtlı / üye) belirle, üye kaydını oluştur ya da güncelle. */
async function oturumHazirla(u) {
  const ilkKez = !kullanici && !!u;
  kullanici = u; rol = u ? 'uye' : 'misafir'; rolNeden = ''; uye = null;
  if (u) {
    if (u.email === TAM_YETKILI && u.emailVerified) rol = 'tam';
    else {
      try {
        const r = await rolGetir(u.email);
        if (r && (r.rol === 'admin' || r.rol === 'kisitli')) { rol = r.rol; rolNeden = r.neden || ''; }
      } catch (e) {}
    }
    try { uye = await uyeGetir(u.uid); } catch (e) {}
    const temel = { ad: (u.displayName || '').slice(0, 80), foto: (u.photoURL || '').slice(0, 600), sonGiris: SIMDI() };
    if (!uye) {
      uye = { telefon: '', adresler: [], filtreler: [], bildirimEposta: true, istatistikIzni: izinVar() };
      Object.assign(temel, uye, { ilkGiris: SIMDI() });
    }
    setDoc(doc(db, 'dolapUyeler', u.uid), { uid: u.uid, eposta: u.email, ...temel }, { merge: true }).catch(() => {});
    if (ilkKez) olay('giris', { sayfa: yol()[0] || 'kesfet' });
  }
  hesapCiz(); sayfaCiz(); sohbetIzle();
}

asistanKur();
izinSeridi();
if (DEMO) {
  kullanici = { ...DEMO_KULLANICI, photoURL: D.kullanicilar[0].foto };
  rol = 'tam';
  uye = D.uyeler[0];
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="demo-serit">Örnek veri (' + D.kaynak + '): 20 sahte kullanıcı, parçalar, kiralamalar ve gezinti kayıtları. Seni tam yetkili gösteriyor; değişiklikler kaydedilmez. <a href="elif.html">Gerçek siteye dön</a></div>');
  hesapCiz(); sayfaCiz();
} else {
  onAuthStateChanged(auth, u => { oturumHazirla(u); });
}
