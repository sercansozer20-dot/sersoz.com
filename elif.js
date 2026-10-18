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
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp, onSnapshot, writeBatch, increment }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { demoVeri, DEMO_KULLANICI } from './elif-demo.js?v=20261019r';

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
const DEMO_BELGELER = ['esyalar', 'kiralamalar', 'uyeler', 'roller', 'sohbetler', 'yorumlar', 'boostlar'];
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

/* Gerçek sayfada örnek ilanlar: veritabanındaki örnek parçalar "Örnek" rozetiyle Keşfet'te
   gerçek ilanların arkasında görünür, kiralanamaz, yorumları örnek olarak işaretlenir.
   Tam yetkili panelden "Örnek veriyi veritabanından sil" deyince kaybolur. */
async function ornekYukle() {
  try {
    const [e, y, g] = await Promise.all([getDoc(doc(db, 'demoVeri', 'esyalar')), getDoc(doc(db, 'demoVeri', 'yorumlar')),
      getDoc(doc(db, 'ayarlarGenel', 'ornekGizli')).catch(() => null)]);
    if (!e.exists()) return null;
    const gizli = new Set(g && g.exists() ? g.data().idler || [] : []);
    return {
      esyalar: demoAc(e.data().veri).filter(x => x.onay === 'onaylandi' && x.aktif && !gizli.has(x.id)).map(x => ({ ...x, ornek: true, oneCikanBitis: null })),
      yorumlar: y.exists() ? demoAc(y.data().veri) : {}
    };
  } catch (h) { return null; }
}
const ORNEK = DEMO ? null : await ornekYukle();

/* ---------------------------------------------------------------- gelir modeli
 * ayarlarGenel/gelir { hizmetYuzde, komisyonYuzde }: yalnız tam yetkili değiştirir (Yönetim → Gelir).
 * Kiracı: kira (sadakat indirimi düşülmüş) + hizmet bedeli + depozito öder.
 * Eşya sahibi: indirimsiz kira − komisyon alır. Sadakat indirimini site karşılar.
 * Site geliri = hizmet bedeli + komisyon − sadakat indirimi (+ öne çıkarma paketleri). */
async function gelirYukle() {
  try { const sn = await getDoc(doc(db, 'ayarlarGenel', 'gelir')); return { hizmetYuzde: 0, komisyonYuzde: 0, ...(sn.exists() ? sn.data() : {}) }; }
  catch (h) { return { hizmetYuzde: 0, komisyonYuzde: 0 }; }
}
let GELIR = DEMO ? { hizmetYuzde: 5, komisyonYuzde: 15 } : await gelirYukle();
function kiraHesap(k) {
  const indirim = k.indirim || 0, brut = (k.kira || 0) + indirim, hizmet = k.hizmetBedeli || 0;
  const komisyon = Math.floor(brut * (k.komisyonYuzde || 0) / 100);
  return { brut, indirim, hizmet, komisyon, sahibe: brut - komisyon, site: hizmet + komisyon - indirim };
}
async function tumKiralamalar() {
  if (D) return D.kiralamalar.map(k => ({ ...k }));
  return (await getDocs(collection(db, 'dolapKiralamalar'))).docs.map(x => ({ id: x.id, ...x.data() }));
}
/* Teslimat adresi ayrı belgede: eşya sahibi ancak ödeme admin tarafından onaylanınca okuyabilir (firestore.rules). */
async function kiraGizliGetir(id) {
  if (D) return (D.kiraGizli || {})[id] || null;
  const sn = await getDoc(doc(db, 'dolapKiraGizli', id));
  return sn.exists() ? sn.data() : null;
}
/* İşlem kaydı: her kiralama değişikliği aynı yazımda dolapKiraLog'a düşer (kim, hangi rolle, ne zaman, ne yaptı). */
function kiraLogVeri(k, olay, metin) {
  return { kiraId: k.id, sahipId: k.sahipId, kiraciId: k.kiraciId, olay, metin: String(metin || '').slice(0, 300),
    kim: kullanici.uid, kimAd: (kullanici.displayName || kullanici.email || '').slice(0, 80),
    rol: olay.startsWith('admin') ? 'admin' : kullanici.uid === k.kiraciId ? 'kiraci' : kullanici.uid === k.sahipId ? 'sahip' : 'admin', zaman: SIMDI() };
}
/* Kiralamayı güncelle + işlem kaydı. ek(bt): aynı yazıma eklenecek diğer işlemler (örnek modda bt = null). */
async function kiraGuncelle(k, veri, olay, metin, ek) {
  if (D) {
    await dbGuncelle('dolapKiralamalar', k.id, veri);
    (D.kiraLog = D.kiraLog || []).push({ id: 'l' + Date.now() + Math.random(), ...kiraLogVeri(k, olay, metin) });
    if (ek) await ek(null);
    return;
  }
  const bt = writeBatch(db);
  bt.update(doc(db, 'dolapKiralamalar', k.id), veri);
  bt.set(doc(collection(db, 'dolapKiraLog')), kiraLogVeri(k, olay, metin));
  if (ek) await ek(bt);
  await bt.commit();
}
async function kiraLoglari(id) {
  if (D) return (D.kiraLog || []).filter(x => x.kiraId === id);
  return (await getDocs(query(collection(db, 'dolapKiraLog'), where('kiraId', '==', id)))).docs.map(x => ({ id: x.id, ...x.data() }));
}
async function kiraEkle(kayit, adres) {
  if (D) {
    const r = await dbEkle('dolapKiralamalar', kayit);
    (D.kiraGizli = D.kiraGizli || {})[r.id] = { adres, kiraciId: kayit.kiraciId, sahipId: kayit.sahipId };
    (D.kiraLog = D.kiraLog || []).push({ id: 'l' + Date.now(), ...kiraLogVeri({ ...kayit, id: r.id }, 'olusturuldu', '') });
    return;
  }
  const kref = doc(collection(db, 'dolapKiralamalar'));
  const bt = writeBatch(db);
  bt.set(kref, kayit);
  bt.set(doc(db, 'dolapKiraGizli', kref.id), { adres, kiraciId: kayit.kiraciId, sahipId: kayit.sahipId });
  bt.set(doc(collection(db, 'dolapKiraLog')), kiraLogVeri({ ...kayit, id: kref.id }, 'olusturuldu', ''));
  await bt.commit();
}
/* Aynı parça için tarih çakışması (onaylanmış ve süren kiralamalar) */
const AKTIF_DURUM = ['onaylandi', 'odeme_bildirildi', 'odendi', 'kargoda', 'teslim_edildi', 'iade_yolda'];
const cakisanlar = (k, l) => l.filter(x => x.id !== k.id && x.esyaId === k.esyaId && AKTIF_DURUM.includes(x.durum) && x.baslangic <= k.bitis && k.baslangic <= x.bitis);
/* Kargo takip bağlantısı (bilinen firmalar numarayla, diğerleri takip sayfasına) */
function takipLink(firma, no) {
  const n = encodeURIComponent(no || '');
  const u = { 'Yurtiçi Kargo': 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=' + n, 'Aras Kargo': 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code=' + n,
    'PTT Kargo': 'https://gonderitakip.ptt.gov.tr/Track/Verify?q=' + n, 'MNG Kargo': 'https://www.mngkargo.com.tr/gonderi-takip', 'Sürat Kargo': 'https://www.suratkargo.com.tr/KargoTakip',
    'HepsiJet': 'https://www.hepsijet.com/gonderi-takibi', 'Kolay Gelsin': 'https://www.kolaygelsin.com/kargo-takip' }[firma];
  return u && no ? ' <a href="' + esc(u) + '" target="_blank" rel="noopener" style="text-decoration:underline">takip et ↗</a>' : '';
}
function adresleriDoldur(kok) {
  kok.querySelectorAll('[data-adres]').forEach(el => kiraGizliGetir(el.dataset.adres)
    .then(g => { el.textContent = g && g.adres ? g.adres : 'belirtilmemiş'; })
    .catch(() => { el.textContent = 'görüntülenemedi'; }));
}

/* Admin: örnek ilanı siteden kaldırır (ayarlarGenel/ornekGizli listesine ekler; örnek verinin kendisi silinmez). */
async function ornekGizle(ids) {
  const r = doc(db, 'ayarlarGenel', 'ornekGizli');
  const sn = await getDoc(r);
  const l = new Set(sn.exists() ? sn.data().idler || [] : []);
  ids.forEach(i => l.add(i));
  await setDoc(r, { idler: [...l].slice(-500) });
  if (ORNEK) ORNEK.esyalar = ORNEK.esyalar.filter(x => !l.has(x.id));
}

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
const demoDizi = kol => ({ dolapEsyalar: D.esyalar, dolapKiralamalar: D.kiralamalar, dolapSohbet: D.sohbetler, dolapRoller: D.roller, dolapUyeler: D.uyeler, dolapBoostlar: (D.boostlar = D.boostlar || []), dolapBorclar: (D.borclar = D.borclar || []), dolapKasa: (D.kasa = D.kasa || []), dolapSorular: (D.sorular = D.sorular || []), dolapKiraNot: (D.kiraNot = D.kiraNot || []) })[kol];
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
  const l = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return ORNEK && alan === 'onay' && deger === 'onaylandi' ? l.concat(ORNEK.esyalar.map(x => ({ ...x }))) : l;
}
async function esyaGetir(id) {
  if (D) {
    const e = D.esyalar.find(x => x.id === id);
    if (!e) throw { message: 'Bu parça bulunamadı ya da kaldırıldı.' };
    return { ...e };
  }
  if (ORNEK && id.startsWith('demo-')) {
    const o = ORNEK.esyalar.find(x => x.id === id);
    if (o) return { ...o };
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
const yorumlar = id => (D && D.yorumlar[id]) || (ORNEK && ORNEK.yorumlar[id]) || [];
function puanOzeti(id) {
  const y = yorumlar(id);
  if (!y.length) return null;
  return { ort: (y.reduce((t, x) => t + x.puan, 0) / y.length).toFixed(1).replace('.', ','), adet: y.length };
}
const yildiz = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

const KATEGORI = { elbise: 'Elbise', ust: 'Üst giyim', alt: 'Alt giyim', 'dis-giyim': 'Dış giyim', ayakkabi: 'Ayakkabı', canta: 'Çanta', aksesuar: 'Aksesuar', diger: 'Diğer' };
const DURUM = {
  beklemede: 'Onay bekliyor', onaylandi: 'Onaylandı · ödeme bekleniyor', odeme_bildirildi: 'Ödeme kontrol ediliyor',
  odendi: 'Ödendi · kargo bekleniyor', kargoda: 'Kargoda', teslim_edildi: 'Kirada · teslim alındı', iade_yolda: 'İade kargoda', iade_edildi: 'İade edildi', reddedildi: 'Reddedildi', iptal: 'İptal edildi'
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

/* ---------------------------------------------------------------- bildirim çanı
 * Sunucu tarafı olmadan, kişinin okuyabildiği kayıtlardan türetilir: kiralamalar, parçalar, borçlar, paketler, mesajlar
 * (adminlere ayrıca onay bekleyenler, ödeme bildirimleri, okunmamış mesajlar). Okundu bilgisi dolapUyeler.bildirimOkuma. */
const ZIL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
let bildirimler = [], bildirimZaman = 0, acikOkuma = null;
const ZARF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
/* Adminler için başlıkta gelen mesaj kısayolu: okunmamış sayısı canlı izlenir. */
let mesajDinle = null;
function mesajIzle() {
  if (mesajDinle) { mesajDinle(); mesajDinle = null; }
  const yaz = n => { const sy = $('#mesajSayi'); if (sy) { sy.textContent = n > 9 ? '9+' : n; sy.hidden = !n; } };
  if (!kullanici || !adminMi()) return;
  if (D) { yaz((D.sohbetler || []).filter(x => !x.adminOkudu).length); return; }
  let ilk = true;
  mesajDinle = onSnapshot(query(collection(db, 'dolapSohbet'), where('adminOkudu', '==', false)), sn => {
    yaz(sn.size);
    if (!ilk && sn.docChanges().some(c => c.type !== 'removed')) bildirimYenile(true);
    ilk = false;
  }, () => {});
}
const KALP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const bOkuma = () => (uye && uye.bildirimOkuma) || 0;
async function benimSohbetlerim() {
  if (D) return (D.sohbetler || []).filter(x => x.uid === kullanici.uid);
  return (await getDocs(query(collection(db, 'dolapSohbet'), where('uid', '==', kullanici.uid)))).docs.map(x => ({ id: x.id, ...x.data() }));
}
async function bildirimleriTopla() {
  const u = kullanici.uid, o = [];
  const ekle = (t, ikon, metin, link) => { const ms = typeof t === 'number' ? t : zaman(t); if (ms) o.push({ t: ms, ikon, metin, link }); };
  const [kc, sh, es, br, bo, so, sq, sc] = await Promise.all([
    kiraListesi('kiraciId', u).catch(() => []), kiraListesi('sahipId', u).catch(() => []), esyaListesi('sahipId', u).catch(() => []),
    borcListesi(u).catch(() => []), boostListesi('sahipId', u).catch(() => []), benimSohbetlerim().catch(() => []),
    soruListesi('sahipId', u).catch(() => []), soruListesi('soranId', u).catch(() => [])]);
  const b = k => '"' + k.esyaBaslik + '"';
  kc.forEach(k => {
    const m = { onaylandi: ['✅', b(k) + ' isteğin onaylandı. Ödeme adımına geçebilirsin.'], reddedildi: ['✖', b(k) + ' isteğin reddedildi.'],
      odendi: ['💳', b(k) + ' için ödemen onaylandı; parça kargoya hazırlanıyor.'],
      kargoda: ['📦', b(k) + ' kargoya verildi' + (k.kargoFirma ? ' (' + k.kargoFirma + (k.kargoTakip ? ' · ' + k.kargoTakip : '') + ')' : '') + '.'],
      iade_edildi: ['↩︎', b(k) + ' iaden teslim alındı.'] }[k.durum];
    if (m) ekle(k.guncelleme, m[0], m[1], '#kiralamalar');
    if (k.depozitoDurum) ekle(k.depozitoZaman, '💰', b(k) + (k.depozitoDurum === 'iade' ? ' depozito iaden yapıldı.' : ' depozitondan ' + tl(k.depozitoKesinti || 0) + ' kesildi.'), '#kiralamalar');
  });
  sh.forEach(k => {
    const m = { beklemede: ['🔔', 'Yeni kiralama isteği: ' + b(k) + ' · ' + k.kiraciAd], iptal: ['✖', k.kiraciAd + ', ' + b(k) + ' isteğini iptal etti.'],
      odendi: ['💳', b(k) + ' ödemesi onaylandı. Gönderi formunu yazdırıp kargoya ver.'],
      teslim_edildi: ['✅', k.kiraciAd + ', ' + b(k) + ' parçasını teslim aldı.'],
      iade_yolda: ['↩︎', b(k) + ' iade kargoda' + (k.iadeTakip ? ' (takip ' + k.iadeTakip + ')' : '') + '.'] }[k.durum];
    if (m) ekle(k.guncelleme, m[0], m[1], '#kiralamalar/sahip');
    if (k.teslimSorun) ekle(k.guncelleme, '⚠️', 'Kiracı sorun bildirdi (' + b(k) + '): ' + k.teslimSorun, '#kiralamalar/sahip');
    if (k.sahipOdeme === 'odendi') ekle(k.sahipOdemeZaman, '💰', b(k) + ' payın (' + tl(kiraHesap(k).sahibe) + ') IBAN\'ına aktarıldı.', '#hesabim/gecmis');
  });
  es.forEach(e => {
    if (e.onayZaman && e.onay !== 'bekliyor') ekle(e.onayZaman, e.onay === 'onaylandi' ? '✅' : '✖',
      '"' + e.baslik + '" ' + (e.onay === 'onaylandi' ? 'onaylandı, Keşfet\'te yayında.' : 'reddedildi: ' + (e.redNeden || '')), '#dolabim');
  });
  br.forEach(x => {
    ekle(x.olusturma, '🧾', (kisiBorclu(x) ? 'Borç kaydı: ' : 'Alacak kaydı: ') + tl(x.tutar) + ' · ' + x.neden, '#kiralamalar');
    if (x.durum === 'kapandi') ekle(x.kapanis, '✅', (kisiBorclu(x) ? 'Borcun kapandı: ' : 'Alacağın ödendi: ') + tl(x.tutar), '#hesabim/gecmis');
  });
  bo.forEach(x => {
    if (x.durum === 'aktif') ekle(x.baslangic, '★', '"' + x.esyaBaslik + '" öne çıkarıldı.', '#dolabim');
    if (x.durum === 'reddedildi') ekle(x.guncelleme, '✖', '"' + x.esyaBaslik + '" öne çıkarma talebi reddedildi.', '#dolabim');
  });
  so.forEach(x => {
    const son = (x.mesajlar || [])[x.mesajlar.length - 1];
    if (son && son.kimden === 'admin') ekle(x.sonZaman, '💬', 'Destek ekibi yanıtladı: ' + String(son.metin).slice(0, 90), 'sohbet');
  });
  const sn = sepetListe().length;
  if (sn) { let t = 0; try { t = +localStorage.getItem(LS_SEPET + '_t') || 0; } catch (h) {} if (t && Date.now() - t > 6 * 36e5) ekle(t + 6 * 36e5, '🛒', 'Sepetinde ' + sn + ' parça bekliyor. Tarihleri kaçırmadan sırayla kiralayabilirsin.', '#sepet'); }
  sq.filter(x => x.durum === 'bekliyor').forEach(x => ekle(x.olusturma, '❓', 'Yeni soru ("' + x.esyaBaslik + '"): ' + String(x.soru).slice(0, 90), '#esya/' + x.esyaId + '/sorular'));
  sc.filter(x => x.durum === 'cevaplandi').forEach(x => ekle(x.cevapZaman, '💬', 'Sorun cevaplandı ("' + x.esyaBaslik + '"): ' + String(x.cevap).slice(0, 90), '#esya/' + x.esyaId + '/sorular'));
  if (adminMi()) {
    const [bek, od, gel] = await Promise.all([esyaListesi('onay', 'bekliyor').catch(() => []), kiraListesi('durum', 'odeme_bildirildi').catch(() => []), sohbetListesi().catch(() => [])]);
    bek.forEach(e => ekle(e.olusturma, '🛂', 'Onay bekleyen parça: "' + e.baslik + '" · ' + e.sahipAd, '#yonetim/onay'));
    od.forEach(k => ekle(k.guncelleme, '💳', 'Ödeme bildirildi: ' + refKod(k.id) + ' · ' + tl(k.toplam) + ' · ' + k.kiraciAd, '#yonetim/odemeler'));
    gel.filter(x => !x.adminOkudu).forEach(x => ekle(x.sonZaman, '💬', 'Yeni mesaj · ' + x.ad + ': ' + String(x.mesajlar[x.mesajlar.length - 1].metin).slice(0, 80), '#yonetim/gelen/' + x.id));
  }
  return o.sort((a, c) => c.t - a.t).slice(0, 40);
}
function onceYaz(t) {
  const sn = Math.round((Date.now() - t) / 1000);
  if (sn < 60) return 'az önce';
  if (sn < 3600) return Math.floor(sn / 60) + ' dk önce';
  if (sn < 86400) return Math.floor(sn / 3600) + ' sa önce';
  if (sn < 7 * 86400) return Math.floor(sn / 86400) + ' gün önce';
  return tarihYaz(yerelGun(t));
}
function canCiz() {
  const m = $('#canMenu'); if (!m) return;
  const ok = acikOkuma ?? bOkuma();
  m.innerHTML = '<div class="can-bas"><b>Bildirimler</b><button type="button" class="dug-metin" id="canYenile">Yenile</button></div>' +
    (bildirimler.length ? bildirimler.map((x, i) => '<button type="button" class="can-oge' + (x.t > ok ? ' yeni' : '') + '" data-bi="' + i + '">' +
      '<span class="can-ikon" aria-hidden="true">' + x.ikon + '</span><span><span class="can-metin">' + esc(x.metin) + '</span><small>' + onceYaz(x.t) + '</small></span></button>').join('')
      : '<p class="kucuk" style="padding:16px 14px">Henüz bildirim yok. Kiralama, onay ve mesaj hareketlerin burada görünür.</p>');
}
async function bildirimYenile(zorla) {
  if (!kullanici) return;
  if (!zorla && Date.now() - bildirimZaman < 60000) return;
  bildirimZaman = Date.now();
  try { bildirimler = await bildirimleriTopla(); } catch (h) { return; }
  const n = bildirimler.filter(x => x.t > bOkuma()).length, sy = $('#canSayi');
  if (sy) { sy.textContent = n > 9 ? '9+' : n; sy.hidden = !n || !$('#canMenu').hidden; }
  const m = $('#canMenu'); if (m && !m.hidden) canCiz();
}
setInterval(() => { if (!document.hidden) bildirimYenile(); }, 90000);
window.addEventListener('hashchange', () => bildirimYenile());

function hesapCiz() {
  const h = $('#hesap');
  const ys = $('#yonetimSekme');
  if (ys) ys.hidden = !adminMi();
  if (!kullanici) {
    h.innerHTML = '<a class="can-dug fav-dug" href="#favoriler" aria-label="Favorilerim" title="Favorilerim">' + KALP + '</a>' +
      '<button type="button" class="dug" id="girisDug">' + G_IKON + 'Google ile giriş</button>';
    $('#girisDug').onclick = girisYap; mesajIzle();
    return;
  }
  const ad = kullanici.displayName || kullanici.email || '';
  h.innerHTML = '<a class="can-dug fav-dug" href="#favoriler" aria-label="Favorilerim" title="Favorilerim">' + KALP + '</a>' +
    (adminMi() ? '<a class="can-dug mesaj-dug" href="#yonetim/gelen" aria-label="Gelen mesajlar" title="Gelen mesajlar">' + ZARF +
      '<span class="can-sayi" id="mesajSayi" hidden></span></a>' : '') +
    '<div class="can-kap"><button type="button" class="can-dug" id="canDug" aria-haspopup="true" aria-expanded="false" aria-controls="canMenu" aria-label="Bildirimler">' +
      ZIL + '<span class="can-sayi" id="canSayi" hidden></span></button><div class="can-menu" id="canMenu" hidden></div></div>' +
    '<div class="menu-kap">' +
    '<button type="button" class="avatar-dug" id="avatarDug" aria-haspopup="menu" aria-expanded="false" aria-controls="hesapMenu">' +
      (kullanici.photoURL ? '<img class="avatar" src="' + esc(kullanici.photoURL) + '" alt="" referrerpolicy="no-referrer">'
        : '<span class="avatar harf">' + esc(ad.slice(0, 1).toUpperCase()) + '</span>') +
      '<span class="ad">' + esc(ad) + '</span>' +
      (rol !== 'uye' ? '<span class="rol-rozet r-' + rol + '">' + ROL_AD[rol] + '</span>' : '') +
      '<span class="ok" aria-hidden="true">▾</span></button>' +
    '<div class="menu" id="hesapMenu" role="menu" hidden>' +
      '<div class="menu-bas"><b>' + esc(ad) + '</b><span>' + esc(kullanici.email || '') + '</span></div>' +
      '<a role="menuitem" href="#hesabim">Hesabım ve ayarlar</a>' +
      '<a role="menuitem" href="#profil/' + esc(kullanici.uid) + '">Profilim</a>' +
      '<a role="menuitem" href="#favoriler">♡ Favorilerim</a>' +
      '<a role="menuitem" href="#hesabim/puan">★ Sadakat puanım</a>' +
      '<a role="menuitem" href="#hesabim/adresler">Kayıtlı adreslerim</a>' +
      '<a role="menuitem" href="#hesabim/kartlar">Kayıtlı kartlarım</a>' +
      '<a role="menuitem" href="#hesabim/filtreler">Kayıtlı filtrelerim</a>' +
      '<a role="menuitem" href="#kiralamalar">Kiralamalarım</a>' +
      (adminMi() ? '<a role="menuitem" href="#yonetim/gelen">✉ Gelen mesajlar</a><a role="menuitem" href="#yonetim">Yönetim paneli</a>' : '') +
      '<button type="button" role="menuitem" id="cikisDug">Çıkış yap</button>' +
    '</div></div>';
  const m = $('#hesapMenu'), d = $('#avatarDug');
  d.onclick = ev => { ev.stopPropagation(); m.hidden = !m.hidden; d.setAttribute('aria-expanded', String(!m.hidden)); $('#canMenu').hidden = true; acikOkuma = null; };
  const cd = $('#canDug'), cm = $('#canMenu');
  cd.onclick = ev => {
    ev.stopPropagation();
    const ac = cm.hidden;
    cm.hidden = !ac; cd.setAttribute('aria-expanded', String(ac)); m.hidden = true;
    if (!ac) { acikOkuma = null; return; }
    acikOkuma = bOkuma();
    canCiz();
    $('#canSayi').hidden = true;
    if (bildirimler.some(x => x.t > acikOkuma)) uyeKaydet({ bildirimOkuma: Date.now() }).catch(() => {});
    bildirimYenile(true);
  };
  cm.onclick = ev => {
    ev.stopPropagation();
    if (ev.target.closest('#canYenile')) { bildirimYenile(true); return; }
    const o = ev.target.closest('[data-bi]'); if (!o) return;
    const x = bildirimler[+o.dataset.bi];
    cm.hidden = true; acikOkuma = null; cd.setAttribute('aria-expanded', 'false');
    if (x.link === 'sohbet') { const a = $('#asistanDug'); if (a && $('#asistan').hidden) a.click(); return; }
    if (location.hash === x.link) sayfaCiz(); else location.hash = x.link;
  };
  bildirimYenile(true);
  mesajIzle();
  m.onclick = () => { m.hidden = true; d.setAttribute('aria-expanded', 'false'); };
  $('#cikisDug').onclick = () => { if (!demoEngel()) signOut(auth); };
}
document.addEventListener('click', ev => {
  const m = $('#hesapMenu');
  if (m && !m.hidden && !ev.target.closest('.menu-kap')) m.hidden = true;
  const c = $('#canMenu');
  if (c && !c.hidden && !ev.target.closest('.can-kap')) { c.hidden = true; acikOkuma = null; }
});
document.addEventListener('keydown', ev => {
  const m = $('#hesapMenu');
  if (ev.key === 'Escape' && m && !m.hidden) { m.hidden = true; $('#avatarDug').focus(); }
  const c = $('#canMenu');
  if (ev.key === 'Escape' && c && !c.hidden) { c.hidden = true; acikOkuma = null; $('#canDug').focus(); }
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
  document.title = (s && s !== 'kesfet' && SAYFA_AD[s] ? SAYFA_AD[s] + ' · ' : '') + 'Elif\'in Dolabı | Kıyafet kirala, dolabını kiraya ver';
  icerik.onclick = icerik.oninput = icerik.onchange = null;   // önceki sayfanın dinleyicileri
  if (s !== 'esya') olay('sayfa', { sayfa: s || 'kesfet' });
  if (s === 'hesabim') return hesabim(p || '', istek);
  if (s === 'yonetim') return yonetim(p || 'ozet', yol()[2], istek);
  if (s === 'esya' && p) return esyaSayfasi(p, istek);
  if (s === 'dolabim') return dolabim(istek);
  if (s === 'sepet') return sepetSayfasi(istek);
  if (s === 'favoriler') return favorilerSayfasi(istek);
  if (s === 'profil' && p) return profilSayfasi(p, istek);
  if (s === 'kiralamalar') return kiralamalar(p || 'kiraci', istek);
  return kesfet(istek);
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); sayfaCiz(); });
sepetSayac();

/* ---------------------------------------------------------------- sadakat puanı
 * Tamamlanan kiralamalardan hesaplanır; ayrıca bir yere yazılmaz, böylece elle şişirilemez.
 * İade sırasında eşya sahibi "sorunsuz / geç / hasarlı" seçer (iadeDurum). */
const PUAN = { sorunsuz: 20, gec: -15, hasar: -30, sahip: 15 };
const SEVIYE = [[0, 'Yeni üye'], [50, 'Bronz'], [150, 'Gümüş'], [300, 'Altın']];
const IADE_AD = { sorunsuz: 'Sorunsuz iade', gec: 'Geç iade', hasar: 'Hasarlı / eksik iade' };
function sadakatHesapla(kiraci, sahip) {
  const satir = [];
  kiraci.filter(k => k.durum === 'iade_edildi').forEach(k => {
    const d = PUAN[k.iadeDurum] !== undefined && k.iadeDurum !== 'sahip' ? k.iadeDurum : 'sorunsuz';
    satir.push({ k, ad: d === 'sorunsuz' ? 'Sorunsuz kiralama' : IADE_AD[d], puan: PUAN[d] });
  });
  sahip.filter(k => k.durum === 'iade_edildi').forEach(k => satir.push({ k, ad: 'Dolabından kiralandı', puan: PUAN.sahip }));
  satir.sort((a, b) => zaman(b.k.guncelleme) - zaman(a.k.guncelleme));
  const puan = Math.max(0, satir.reduce((t, x) => t + x.puan, 0));
  let i = 0; SEVIYE.forEach((x, j) => { if (puan >= x[0]) i = j; });
  return { puan, i, seviye: SEVIYE[i][1], sonraki: SEVIYE[i + 1] || null, satir };
}
/* Puan kaynağı: dolapPuanlar (herkes okur; yalnız gerçekten iade edilen bir kiralama için eşya sahibi yazabilir).
   Örnek modda ve örnek profillerde örnek kiralamalardan hesaplanır. */
let ornekKira = null;
const puanCache = new Map();
async function sadakatGetir(uid) {
  if (D) return sadakatHesapla(D.kiralamalar.filter(k => k.kiraciId === uid), D.kiralamalar.filter(k => k.sahipId === uid));
  if (uid.startsWith('demo-')) {
    if (!ornekKira) { const sn = await getDoc(doc(db, 'demoVeri', 'kiralamalar')); ornekKira = sn.exists() ? demoAc(sn.data().veri) : []; }
    return sadakatHesapla(ornekKira.filter(k => k.kiraciId === uid), ornekKira.filter(k => k.sahipId === uid));
  }
  const c = puanCache.get(uid);
  if (c && Date.now() - c.t < 60000) return c.x;
  const q = alan => getDocs(query(collection(db, 'dolapPuanlar'), where(alan, '==', uid)))
    .then(sn => sn.docs.map(x => ({ id: x.id, ...x.data(), durum: 'iade_edildi', guncelleme: x.data().zaman })));
  const [a, b] = await Promise.all([q('kiraciId'), q('sahipId')]);
  const x = sadakatHesapla(a, b);
  puanCache.set(uid, { t: Date.now(), x });
  return x;
}
/* Seviye indirimi (ayarlar.js → sadakatIndirim). Kira bedeline uygulanır, depozitoya değil. */
const indirimYuzde = x => Math.max(0, Math.min(30, Math.floor(+((AYAR.sadakatIndirim || {})[x.seviye]) || 0)));
const seviyeRozet = x => '<span class="seviye sv-' + x.i + '">★ ' + esc(x.seviye) + '</span>';
function sadakatHTML(x, kendi, gecmis = true) {
  const alt = SEVIYE[x.i][0], ust = x.sonraki ? x.sonraki[0] : alt;
  const yuzde = x.sonraki ? Math.round(100 * (x.puan - alt) / (ust - alt)) : 100;
  return '<div class="sadakat-bas"><span class="sadakat-puan">' + x.puan + '<small> puan</small></span>' + seviyeRozet(x) + '</div>' +
    '<div class="ilerleme"><i style="width:' + yuzde + '%"></i></div>' +
    '<p class="kucuk">' + (x.sonraki ? esc(x.sonraki[1]) + ' seviyesine ' + (x.sonraki[0] - x.puan) + ' puan kaldı.' : 'En üst seviyedesin.') + '</p>' +
    (kendi ? '<div class="puan-kural">' +
      '<div><b>+' + PUAN.sorunsuz + '</b>Zamanında ve sorunsuz iade ettiğin her kiralama</div>' +
      '<div><b>+' + PUAN.sahip + '</b>Dolabından tamamlanan her kiralama</div>' +
      '<div><b>' + PUAN.gec + '</b>Geç iade</div>' +
      '<div><b>' + PUAN.hasar + '</b>Hasarlı ya da eksik iade</div></div>' +
      '<p class="kucuk">Seviyeler: ' + SEVIYE.map(v => v[1] + ' ' + v[0] + '+' + (indirimYuzde({ seviye: v[1] }) ? ' (%' + indirimYuzde({ seviye: v[1] }) + ' indirim)' : '')).join(' · ') + '. İndirim kira bedeline uygulanır.</p>' : '') +
    (indirimYuzde(x) ? '<p class="indirim-not">★ ' + esc(x.seviye) + ' seviyesi: kiralamalarda <b>%' + indirimYuzde(x) + ' sadakat indirimi</b></p>' : '') +
    (!gecmis ? '<p class="kucuk" style="margin-top:10px">' + sadakatOzet(x) + '</p>' :
    '<div class="puan-gecmis">' + (x.satir.length ? x.satir.slice(0, 30).map(r =>
      '<div class="puan-satir"><span>' + esc(r.ad) + ' · <a href="#esya/' + esc(r.k.esyaId) + '">' + esc(r.k.esyaBaslik) + '</a> <span class="kucuk">' + tarihYaz(r.k.bitis) + '</span></span>' +
      '<b class="' + (r.puan >= 0 ? 'arti' : 'eksi') + '">' + (r.puan > 0 ? '+' : '') + r.puan + '</b></div>').join('')
      : '<p class="kucuk" style="margin-top:10px">Henüz tamamlanmış kiralama yok. İlk sorunsuz kiralamanda puanların gelmeye başlar.</p>') + '</div>');
}
function sadakatOzet(x) {
  const say = f => x.satir.filter(f).length;
  const p = [[say(r => r.ad === 'Sorunsuz kiralama'), 'sorunsuz kiralama'], [say(r => r.ad === 'Dolabından kiralandı'), 'kez dolabından kiralandı'],
    [say(r => r.ad === IADE_AD.gec), 'geç iade'], [say(r => r.ad === IADE_AD.hasar), 'hasarlı iade']].filter(v => v[0]);
  return p.length ? p.map(v => v[0] + ' ' + v[1]).join(' · ') : 'Henüz tamamlanmış kiralama yok.';
}
/* Listede [data-seviye="uid"] yerlerine seviye rozetini koyar; data-beyan varsa indirimi doğrular (yönetim). */
function seviyeleriDoldur(kok) {
  const ids = [...new Set([...kok.querySelectorAll('[data-seviye]')].map(x => x.dataset.seviye))];
  ids.forEach(uid => sadakatGetir(uid).then(x => kok.querySelectorAll('[data-seviye="' + CSS.escape(uid) + '"]').forEach(el => {
    let h = seviyeRozet(x) + ' <span class="kucuk">' + x.puan + ' puan</span>';
    if (el.dataset.beyan !== undefined) {
      const b = +el.dataset.beyan, g = indirimYuzde(x);
      if (b) h += b <= g ? ' <span class="kucuk arti">· %' + b + ' indirim doğru</span>' : ' <b class="eksi">· %' + b + ' indirim istendi, seviyesi %' + g + ' veriyor. Tutarı kontrol et.</b>';
    }
    el.innerHTML = h;
  })).catch(() => {}));
}

/* Türkçe tamlayan eki: "Cansu Bulut" → "Cansu Bulut'un", "Elif" → "Elif'in", "Ayşe" → "Ayşe'nin" */
function iyelik(ad) {
  ad = String(ad || '').trim();
  const sesli = (ad.toLocaleLowerCase('tr').match(/[aeıioöuü]/g) || ['e']).pop();
  const ek = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[sesli];
  return ad + "'" + (/[aeıioöuü]$/i.test(ad.toLocaleLowerCase('tr')) ? 'n' : '') + ek;
}

/* ---------------------------------------------------------------- PROFİL (herkese açık) */
async function profilGetir(uid) {
  if (D) { const u = D.kullanicilar.find(x => x.uid === uid); return u ? { ad: u.ad, foto: u.foto, ornek: true } : null; }
  if (uid.startsWith('demo-')) { const e = ORNEK && ORNEK.esyalar.find(x => x.sahipId === uid); return e ? { ad: e.sahipAd, foto: e.sahipFoto, ornek: true } : null; }
  const sn = await getDoc(doc(db, 'dolapProfiller', uid));
  return sn.exists() ? sn.data() : null;
}
async function profilEsyalari(uid) {
  if (D) return D.esyalar.filter(e => e.sahipId === uid && e.onay === 'onaylandi' && e.aktif).map(e => ({ ...e }));
  if (uid.startsWith('demo-')) return ORNEK ? ORNEK.esyalar.filter(e => e.sahipId === uid).map(e => ({ ...e })) : [];
  const sn = await getDocs(query(collection(db, 'dolapEsyalar'), where('sahipId', '==', uid), where('onay', '==', 'onaylandi')));
  return sn.docs.map(x => ({ id: x.id, ...x.data() })).filter(e => e.aktif);
}
async function profilSayfasi(uid, istek) {
  icerik.innerHTML = '<p class="yukleniyor">Yükleniyor…</p>';
  const [pr, esyalar, sad] = await Promise.all([profilGetir(uid).catch(() => null), profilEsyalari(uid).catch(() => []), sadakatGetir(uid).catch(() => null)]);
  if (istek !== aktifIstek) return;
  const p = pr || (esyalar[0] ? { ad: esyalar[0].sahipAd, foto: esyalar[0].sahipFoto, ornek: !!esyalar[0].ornek } : null);
  if (!p) { icerik.innerHTML = '<div class="bos"><h3>Profil bulunamadı</h3><a class="dug" href="#kesfet">Keşfet\'e dön</a></div>'; return; }
  const kendisi = kullanici && kullanici.uid === uid;
  const yl = esyalar.flatMap(e => yorumlar(e.id));
  const ort = yl.length ? (yl.reduce((t, y) => t + y.puan, 0) / yl.length).toFixed(1).replace('.', ',') : null;
  const katilma = p.katilma && zaman(p.katilma) ? new Date(zaman(p.katilma)).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : '';
  const sayac = (ad, v) => '<div class="sayac"><b>' + v + '</b><span>' + ad + '</span></div>';
  icerik.innerHTML = '<div class="profil-bas">' +
      (p.foto ? '<img class="avatar profil-foto" src="' + esc(p.foto) + '" alt="" referrerpolicy="no-referrer">' : '<span class="avatar profil-foto bos-foto">' + esc((p.ad || '?')[0]) + '</span>') +
      '<div><h1>' + esc(p.ad || 'Üye') + '</h1>' +
        '<p class="kucuk">' + [p.sehir && esc(p.sehir), katilma && katilma + '\'den beri üye'].filter(Boolean).join(' · ') + '</p>' +
        '<div class="profil-rozet">' + (sad ? seviyeRozet(sad) : '') + (p.ornek ? '<span class="etiket ornek-etiket" style="position:static">Örnek profil</span>' : '') + '</div>' +
        (kendisi ? '<a class="dug dug-kucuk" href="#hesabim/profil" style="margin-top:10px">Profilimi düzenle</a>' : '') + '</div></div>' +
    (p.hakkimda ? '<p class="profil-hakkimda">' + esc(p.hakkimda) + '</p>' +
      (adminMi() && !p.ornek && !kendisi ? '<button type="button" class="dug dug-kucuk dug-tehlike" id="hakkimdaKaldir">Hakkında yazısını kaldır</button>' : '') : '') +
    '<div class="sayaclar">' + sayac('Sadakat puanı', sad ? sad.puan : '–') + sayac('Seviye', sad ? esc(sad.seviye) : '–') +
      sayac('Tamamlanan kiralama', sad ? sad.satir.length : '–') + sayac('İlan', esyalar.length) + (ort ? sayac('Ort. yorum puanı (' + yl.length + ')', '★ ' + ort) : '') + '</div>' +
    (sad ? '<section class="kutu"><h2>Sadakat</h2>' + sadakatHTML(sad, false, kendisi || adminMi()) + '</section>' : '') +
    '<h2 class="profil-alt-bas">' + (kendisi ? 'Dolabın' : esc(iyelik(p.ad || 'Üye')) + ' dolabı') + '</h2>' +
    (esyalar.length ? '<div class="izgara">' + esyalar.map(e => esyaKarti(e, kendisi)).join('') + '</div>' : '<p class="kucuk">Yayında parça yok.</p>');
  const hk = $('#hakkimdaKaldir');
  if (hk) hk.onclick = async () => {
    if (!confirm('Bu kişinin "Hakkında" yazısı kaldırılsın mı?')) return;
    try { await updateDoc(doc(db, 'dolapProfiller', uid), { hakkimda: '' }); bildir('Kaldırıldı.'); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); }
  };
}

/* ---------------------------------------------------------------- sadakat sıralaması (sağ alt)
 * Herkese açık puan kayıtlarından (dolapPuanlar) hesaplanır; örnek kullanıcılar "örnek" etiketiyle görünür. */
let siralamaOnbellek = null;
async function siralamaHesapla() {
  if (siralamaOnbellek && Date.now() - siralamaOnbellek.t < 300000) return siralamaOnbellek.l;
  const kisiler = new Map();
  const al = uid => { if (!kisiler.has(uid)) kisiler.set(uid, { uid, kiraci: [], sahip: [] }); return kisiler.get(uid); };
  const isle = (liste, ornek) => liste.filter(k => k.durum === 'iade_edildi').forEach(k => {
    const a = al(k.kiraciId); a.kiraci.push(k); a.ad = a.ad || k.kiraciAd; a.ornek = ornek;
    const b = al(k.sahipId); b.sahip.push(k); b.ornek = ornek;
  });
  if (D) isle(D.kiralamalar, true);
  else {
    const sn = await getDocs(collection(db, 'dolapPuanlar'));
    isle(sn.docs.map(x => ({ ...x.data(), durum: 'iade_edildi', guncelleme: x.data().zaman })), false);
    if (ORNEK) {
      if (!ornekKira) { const s2 = await getDoc(doc(db, 'demoVeri', 'kiralamalar')); ornekKira = s2.exists() ? demoAc(s2.data().veri) : []; }
      isle(ornekKira, true);
    }
  }
  const l = [...kisiler.values()].map(k => ({ ...k, x: sadakatHesapla(k.kiraci, k.sahip) })).filter(k => k.x.puan > 0)
    .sort((a, b) => b.x.puan - a.x.puan);
  await Promise.all(l.slice(0, 10).map(async k => {
    if (D) { const u = D.kullanicilar.find(y => y.uid === k.uid); if (u) { k.ad = u.ad; k.foto = u.foto; } return; }
    if (k.ornek) { const e = ORNEK && ORNEK.esyalar.find(y => y.sahipId === k.uid); if (e) { k.ad = e.sahipAd; k.foto = e.sahipFoto; } return; }
    const pr = await profilGetir(k.uid).catch(() => null);
    if (pr) { k.ad = pr.ad || k.ad; k.foto = pr.foto || ''; }
  }));
  siralamaOnbellek = { t: Date.now(), l };
  return l;
}
function siralamaKur() {
  document.body.insertAdjacentHTML('beforeend',
    '<button type="button" class="sirala-dug" id="siralaDug" aria-expanded="false" aria-controls="siralaKutu" title="Sadakat sıralaması">🏆 <span>Sıralama</span></button>' +
    '<div class="sirala-kutu" id="siralaKutu" role="dialog" aria-label="Sadakat sıralaması" hidden></div>');
  const dug = $('#siralaDug'), kutu = $('#siralaKutu');
  const bas = '<div class="sirala-bas"><b>🏆 Sadakat sıralaması</b><button type="button" class="dug-metin" data-kapat>Kapat</button></div>';
  const kapat = () => { kutu.hidden = true; dug.setAttribute('aria-expanded', 'false'); };
  dug.onclick = async () => {
    if (!kutu.hidden) { kapat(); return; }
    const as = $('#asistan'); if (as && !as.hidden) $('#asistanDug').click();
    kutu.hidden = false; dug.setAttribute('aria-expanded', 'true');
    kutu.innerHTML = bas + '<p class="yukleniyor" style="padding:14px 16px">Hesaplanıyor…</p>';
    try {
      const l = await siralamaHesapla();
      const ben = kullanici ? l.findIndex(k => k.uid === kullanici.uid) : -1;
      kutu.innerHTML = bas + (l.length ? '<ol class="sirala-liste">' + l.slice(0, 10).map((k, i) =>
        '<li' + (kullanici && k.uid === kullanici.uid ? ' class="ben"' : '') + '><span class="sira">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span>' +
        (k.foto ? '<img src="' + esc(k.foto) + '" alt="" referrerpolicy="no-referrer">' : '<span class="harf">' + esc((k.ad || '?')[0]) + '</span>') +
        '<a href="#profil/' + esc(k.uid) + '" data-kapat>' + esc(k.ad || 'Üye') + '</a>' + (k.ornek ? '<span class="ornek-k">örnek</span>' : '') +
        seviyeRozet(k.x) + '<b>' + k.x.puan + '</b></li>').join('') + '</ol>'
        : '<p class="kucuk" style="padding:14px 16px">Henüz puan alan yok. İlk sorunsuz kiralamayla sıralamaya gir!</p>') +
        '<p class="sirala-alt kucuk">' + (ben >= 0 ? 'Senin yerin: <b>' + (ben + 1) + '.</b> · ' + l[ben].x.puan + ' puan. '
          : kullanici ? 'Sorunsuz kiralamalarla puan kazan, sıralamaya gir. ' : 'Giriş yap, kiralamalarınla puan kazan. ') +
        '<a href="#hesabim/puan" data-kapat style="text-decoration:underline">Puan nasıl kazanılır?</a></p>';
    } catch (h) { kutu.innerHTML = bas + '<p class="kucuk" style="padding:14px 16px">Yüklenemedi: ' + esc(hataMetni(h)) + '</p>'; }
  };
  kutu.onclick = ev => { if (ev.target.closest('[data-kapat]')) kapat(); };
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !kutu.hidden) kapat(); });
  const ad = $('#asistanDug'); if (ad) ad.addEventListener('click', kapat);
}

/* ---------------------------------------------------------------- kampanya afişleri (ayarlar.js → kampanyalar) */
function afisHTML() {
  const l = (AYAR.kampanyalar || []).filter(k => k && k.baslik);
  if (!l.length) return '';
  return '<section class="afis" id="afis" aria-roledescription="carousel" aria-label="Kampanyalar"><div class="afis-ray">' +
    l.map((k, i) => '<a class="afis-kart" href="' + esc(k.link || '#kesfet') + '" style="--afis-renk:' + esc(k.renk || '#2a1f1e') + '"' + (i ? ' aria-hidden="true" tabindex="-1"' : '') + '>' +
      '<span class="afis-yazi">' + (k.ust ? '<small>' + esc(k.ust) + '</small>' : '') + '<b>' + esc(k.baslik) + '</b>' +
        (k.metin ? '<span>' + esc(k.metin) + '</span>' : '') + (k.dugme ? '<em>' + esc(k.dugme) + ' →</em>' : '') + '</span>' +
      (k.foto ? '<img src="' + esc(k.foto) + '" alt="" loading="' + (i ? 'lazy' : 'eager') + '">' : '') + '</a>').join('') + '</div>' +
    (l.length > 1 ? '<div class="afis-nokta">' + l.map((_, i) => '<button type="button" data-afis="' + i + '" aria-label="' + (i + 1) + '. kampanya"' + (i ? '' : ' aria-current="true"') + '></button>').join('') + '</div>' : '') +
    '</section>';
}
let afisZaman = null;
function afisBaslat() {
  clearInterval(afisZaman);
  const a = $('#afis'); if (!a) return;
  const ray = a.querySelector('.afis-ray'), n = ray.children.length; if (n < 2) return;
  let i = 0, dur = false, x0 = null;
  const git = j => {
    i = (j + n) % n; ray.style.transform = 'translateX(' + (-100 * i) + '%)';
    [...ray.children].forEach((c, x) => { if (x === i) { c.removeAttribute('aria-hidden'); c.removeAttribute('tabindex'); } else { c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; } });
    a.querySelectorAll('[data-afis]').forEach((b, x) => x === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'));
  };
  a.onclick = ev => { const b = ev.target.closest('[data-afis]'); if (b) { ev.preventDefault(); git(+b.dataset.afis); } };
  a.onmouseenter = () => { dur = true; }; a.onmouseleave = () => { dur = false; };
  a.ontouchstart = ev => { x0 = ev.touches[0].clientX; dur = true; };
  a.ontouchend = ev => {
    if (x0 !== null) { const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) git(i + (dx < 0 ? 1 : -1)); }
    x0 = null; dur = false;
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  afisZaman = setInterval(() => {
    if (!a.isConnected) { clearInterval(afisZaman); return; }
    if (!dur && !document.hidden) git(i + 1);
  }, 5000);
}

/* ---------------------------------------------------------------- beğeniler
 * dolapBegeniler/{esyaId_uid} + dolapEsyalar.begeni sayacı aynı yazımda değişir (kurallar eşleşmeyi zorlar).
 * Örnek ilanlarda sayı örnektir; beğeni yalnız bu tarayıcıda tutulur. */
let begenilerim = new Set();
const LS_ORNEK_BEGENI = 'elif_ornek_begeni';
function ornekBegeniler() { try { return new Set(JSON.parse(localStorage.getItem(LS_ORNEK_BEGENI) || '[]')); } catch (h) { return new Set(); } }
function begendimMi(e) { return e.ornek || D ? ornekBegeniler().has(e.id) : begenilerim.has(e.id); }
function begeniSayisi(e) {
  if (typeof e.begeni === 'number') return e.begeni;
  if (e.ornek || D) { let h = 0; for (const c of e.id) h = (h * 31 + c.charCodeAt(0)) % 997; return 3 + h % 38 + yorumlar(e.id).length * 2; }
  return 0;
}
function begeniDugme(e, uzun) {
  const b = begendimMi(e), n = begeniSayisi(e) + (b && (e.ornek || D) ? 1 : 0);
  return '<span class="begeni-dug' + (uzun ? ' uzun' : '') + (b ? ' secili' : '') + '" data-begen="' + esc(e.id) + '" data-n="' + n + '" data-ornek="' + (e.ornek || D ? 1 : 0) + '" role="button" aria-pressed="' + b + '" title="Beğen">' +
    '<i>' + (b ? '♥' : '♡') + '</i> <b>' + n + '</b>' + (uzun ? ' beğeni' : '') + '</span>';
}
async function begenileriYukle() {
  if (!kullanici || D) { begenilerim = new Set(); return; }
  try {
    const sn = await getDocs(query(collection(db, 'dolapBegeniler'), where('uid', '==', kullanici.uid)));
    begenilerim = new Set(sn.docs.map(x => x.data().esyaId));
    document.querySelectorAll('[data-begen][data-ornek="0"]').forEach(el => {
      const b = begenilerim.has(el.dataset.begen); el.classList.toggle('secili', b); el.setAttribute('aria-pressed', b); el.querySelector('i').textContent = b ? '♥' : '♡';
    });
  } catch (h) {}
}
async function begeniDegistir(el) {
  const id = el.dataset.begen, ornek = el.dataset.ornek === '1';
  const tum = document.querySelectorAll('[data-begen="' + CSS.escape(id) + '"]');
  const once = el.classList.contains('secili'), n = +el.dataset.n + (once ? -1 : 1);
  const ciz = (b, m) => tum.forEach(x => { x.classList.toggle('secili', b); x.setAttribute('aria-pressed', b); x.dataset.n = m; x.querySelector('i').textContent = b ? '♥' : '♡'; x.querySelector('b').textContent = m; });
  if (ornek) {
    const s2 = ornekBegeniler(); once ? s2.delete(id) : s2.add(id);
    try { localStorage.setItem(LS_ORNEK_BEGENI, JSON.stringify([...s2])); } catch (h) {}
    ciz(!once, n); return;
  }
  if (!kullanici) { bildir('Beğenmek için giriş yap.'); return; }
  if (rol === 'kisitli') { bildir('Hesabın kısıtlı.'); return; }
  ciz(!once, n);
  try {
    const bt = writeBatch(db), lref = doc(db, 'dolapBegeniler', id + '_' + kullanici.uid), eref = doc(db, 'dolapEsyalar', id);
    if (once) { bt.delete(lref); bt.update(eref, { begeni: increment(-1) }); begenilerim.delete(id); }
    else { bt.set(lref, { esyaId: id, uid: kullanici.uid, zaman: serverTimestamp() }); bt.update(eref, { begeni: increment(1) }); begenilerim.add(id); }
    await bt.commit();
  } catch (h) { ciz(once, n + (once ? 1 : -1)); once ? begenilerim.add(id) : begenilerim.delete(id); bildir(hataMetni(h)); }
}

/* ---------------------------------------------------------------- sepet (bu tarayıcıda saklanır) */
const LS_SEPET = 'elif_sepet';
function sepetListe() { try { return JSON.parse(localStorage.getItem(LS_SEPET) || '[]'); } catch (h) { return []; } }
function sepetKaydet(l) { try { localStorage.setItem(LS_SEPET, JSON.stringify(l)); localStorage.setItem(LS_SEPET + '_t', String(Date.now())); } catch (h) {} sepetSayac(); }
function sepette(id) { return sepetListe().includes(id); }
function sepetCikar(id) { sepetKaydet(sepetListe().filter(x => x !== id)); }
function sepetSayac() { const n = sepetListe().length, el = document.getElementById('sepetSay'); if (el) el.textContent = n ? n : ''; }
document.addEventListener('click', ev => {
  const bg = ev.target.closest('[data-begen]');
  if (bg) { ev.preventDefault(); ev.stopPropagation(); begeniDegistir(bg); return; }
  const ko = ev.target.closest('[data-kopya]');
  if (ko) {
    ev.preventDefault();
    const bitti = () => { const e = ko.textContent; ko.textContent = 'Kopyalandı ✓'; setTimeout(() => { ko.textContent = e; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(ko.dataset.kopya).then(bitti, () => prompt('Kopyala:', ko.dataset.kopya));
    else prompt('Kopyala:', ko.dataset.kopya);
    return;
  }
  const pr = ev.target.closest('[data-profil]');
  if (pr) { ev.preventDefault(); location.hash = '#profil/' + pr.dataset.profil; return; }
  const k = ev.target.closest('[data-kirala]');
  if (k) { ev.preventDefault(); location.hash = '#esya/' + k.dataset.kirala + '/kirala'; return; }
  const b = ev.target.closest('[data-sepet]');
  if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  const id = b.dataset.sepet, l = sepetListe(), vardi = l.includes(id);
  sepetKaydet(vardi ? l.filter(x => x !== id) : l.concat(id));
  document.querySelectorAll('[data-sepet="' + CSS.escape(id) + '"]').forEach(x => {
    x.classList.toggle('secili', !vardi);
    x.textContent = x.dataset.uzun ? (vardi ? '🛒 Sepete ekle' : '✓ Sepette') : (vardi ? '🛒' : '✓');
  });
  bildir(vardi ? 'Sepetten çıkarıldı.' : 'Sepete eklendi. Sepetim\'den sırayla kiralayabilirsin.');
}, true);

/* ---------------------------------------------------------------- FAVORİLERİM (♡ ile beğenilenler) */
async function favorilerSayfasi(istek) {
  icerik.innerHTML = '<div class="bas"><div><h1>Favorilerim</h1><p>♡ ile beğendiğin parçalar burada toplanır.</p></div></div>' +
    '<div class="izgara" id="izgara"><p class="yukleniyor" style="grid-column:1/-1">Yükleniyor…</p></div>';
  if (kullanici && !D) await begenileriYukle();
  const ids = [...new Set([...begenilerim, ...ornekBegeniler()])];
  const l = (await Promise.all(ids.map(id => esyaGetir(id).catch(() => null))))
    .filter(e => e && (e.ornek || (e.aktif && e.onay === 'onaylandi')));
  if (istek !== aktifIstek) return;
  $('#izgara').innerHTML = l.length ? l.map(e => esyaKarti(e, kullanici && e.sahipId === kullanici.uid)).join('')
    : '<div class="bos"><h3>Henüz favorin yok</h3><p>Keşfet\'te beğendiğin parçalarda ♡ işaretine bas; burada toplanır.' +
      (kullanici ? '' : ' Giriş yaparsan favorilerin her cihazda seninle olur.') + '</p><a class="dug" href="#kesfet">Keşfet\'e git</a></div>';
}

/* ---------------------------------------------------------------- SEPETİM */
async function sepetSayfasi(istek) {
  const ids = sepetListe();
  icerik.innerHTML = '<div class="sepet-bas"><h1>Sepetim</h1><p class="kucuk">Beğendiğin parçaları burada topla. Her parçanın sahibi ayrı olduğu için kiralama istekleri tek tek gönderilir; "Sırayla kirala" seni sırayla her parçanın formuna götürür.</p></div>' +
    '<div id="sepetIc"><p class="yukleniyor">Yükleniyor…</p></div>';
  if (!ids.length) {
    $('#sepetIc').innerHTML = '<div class="bos"><h3>Sepetin boş</h3><p>Keşfet\'teki kartlarda 🛒 işaretine basarak parça ekleyebilirsin.</p><a class="dug" href="#kesfet">Keşfet\'e git</a></div>';
    return;
  }
  const esyalar = (await Promise.all(ids.map(id => esyaGetir(id).catch(() => null)))).filter(Boolean);
  if (istek !== aktifIstek) return;
  const bulunan = new Set(esyalar.map(e => e.id));
  if (bulunan.size !== ids.length) sepetKaydet(ids.filter(id => bulunan.has(id)));   // kaldırılmış ilanları temizle
  const kiralanabilir = esyalar.filter(e => !e.ornek && e.aktif && e.onay === 'onaylandi');
  const gunluk = esyalar.reduce((t, e) => t + (+e.gunlukUcret || 0), 0);
  $('#sepetIc').innerHTML = '<div class="sepet-liste">' + esyalar.map(e =>
    '<div class="sepet-satir">' +
      '<a href="#esya/' + esc(e.id) + '"><img src="' + esc(e.fotolar[0]) + '" alt=""></a>' +
      '<div class="sepet-bilgi"><a href="#esya/' + esc(e.id) + '"><b>' + esc(e.baslik) + '</b></a>' +
        '<span class="kucuk">' + esc(e.marka || '') + (e.beden ? ' · ' + esc(e.beden) : '') + ' · ' + esc(iyelik(e.sahipAd)) + ' dolabı</span>' +
        '<span>Günlük ' + esc(e.gunlukUcret) + ' TL · depozito ' + esc(e.depozito) + ' TL</span>' +
        (e.ornek ? '<span class="kucuk" style="color:var(--vurgu)">Örnek ilan · kiralanamaz</span>' : '') + '</div>' +
      '<div class="sepet-islem"><a class="dug dug-kucuk dug-vurgu" href="#esya/' + esc(e.id) + '/kirala">Kirala</a>' +
        '<button type="button" class="dug dug-kucuk" data-cikar="' + esc(e.id) + '">Çıkar</button></div>' +
    '</div>').join('') + '</div>' +
    '<div class="kutu sepet-ozet"><span>' + esyalar.length + ' parça · günlük toplam <b>' + gunluk + ' TL</b></span>' +
      (kiralanabilir.length
        ? '<button type="button" class="dug dug-vurgu" id="sirayla">Sırayla kirala (' + kiralanabilir.length + ')</button>'
        : '<button type="button" class="dug" disabled>Kiralanabilir parça yok</button>') + '</div>';
  icerik.onclick = ev => {
    const c = ev.target.closest('[data-cikar]');
    if (c) { sepetCikar(c.dataset.cikar); sayfaCiz(); return; }
    if (ev.target.id === 'sirayla') location.hash = '#esya/' + kiralanabilir[0].id + '/kirala';
  };
}

/* ---------------------------------------------------------------- satış yardımcıları
 * Vesile (ne için?) ilan metninden çıkarılır; son bakılanlar bu tarayıcıda tutulur; tüm sayılar gerçektir. */
const VESILE = [
  ['dugun', '💍 Düğün & davet', /abiye|gece elb|davet|düğün|dugun|saten|payet|tül|kokteyl|clutch|stiletto|topuklu|kadife/],
  ['nisan', '💐 Nişan & kına', /nişan|nisan|kına|kina|bindallı|bindalli/],
  ['mezuniyet', '🎓 Mezuniyet & balo', /mezuniyet|balo/],
  ['is', '💼 İş & toplantı', /blazer|takım|tüvit|tuvit|trençkot|trenckot|kumaş pantolon|ofis|gömlek elbise|ceket/],
  ['tatil', '🏖 Tatil & yaz', /plaj|tatil|hasır|hasir|keten|bikini|mayo|şapka|sapka|sandalet|yazlık|yazlik|elbise yaz/],
  ['gunluk', '☕ Günlük', /günlük|gunluk|kot|jean|tişört|tisort|sweat|spor|sneaker|hırka|hirka|kazak|babet/]
];
function vesileleri(e) {
  const t = [e.baslik, e.aciklama, e.marka, KATEGORI[e.kategori]].join(' ').toLocaleLowerCase('tr');
  return VESILE.filter(v => v[2].test(t)).map(v => v[0]);
}
const SON_BAKILAN = 'elif_son_bakilan';
function sonBakilanlar() { try { return JSON.parse(localStorage.getItem(SON_BAKILAN) || '[]'); } catch (h) { return []; } }
function sonBakilanEkle(id) { try { localStorage.setItem(SON_BAKILAN, JSON.stringify([id].concat(sonBakilanlar().filter(x => x !== id)).slice(0, 20))); } catch (h) {} }
function rafHTML(baslik, l, ek) {
  if (l.length < 2) return '';
  return '<section class="raf"><div class="raf-bas"><h2>' + baslik + '</h2>' + (ek || '') + '</div><div class="raf-ic">' +
    l.slice(0, 12).map(e => esyaKarti(e, kullanici && e.sahipId === kullanici.uid)).join('') + '</div></section>';
}
const NASIL_HTML = '<section class="nasil" aria-label="Nasıl çalışır"><ol>' +
  '<li><b>Beğen, tarih seç</b><span>İstek göndermek ücretsiz; eşya sahibi onaylar.</span></li>' +
  '<li><b>Güvenle öde</b><span>Paran, sen parçayı teslim alana kadar eşya sahibine geçmez.</span></li>' +
  '<li><b>Kapına gelsin</b><span>Kargo takip numarasıyla gelir, teslim alınca onaylarsın.</span></li>' +
  '<li><b>Kullan, iade et</b><span>Parça sağlam dönünce depozito iade edilir.</span></li></ol></section>';
const GUVENCE_HTML = '<ul class="guvence"><li>🔒 Paran, parçayı teslim alana kadar eşya sahibine geçmez.</li>' +
  '<li>↩︎ Depozito, parça sağlam dönünce iade edilir.</li><li>📄 Sözleşmeli kiralama; sorun olursa ekip devrede.</li></ul>';
let esyaOnbellek = null;
async function yayindakiEsyalar(taze) {
  if (taze || !esyaOnbellek || Date.now() - esyaOnbellek.t > 60000) esyaOnbellek = { t: Date.now(), l: (await esyaListesi('onay', 'onaylandi')).filter(e => e.aktif) };
  return esyaOnbellek.l;
}
/* Gerçek kiralanma sayısı (tamamlanmış kiralamalar) */
async function kiralanmaSayisi(e) {
  if (D) return D.kiralamalar.filter(k => k.esyaId === e.id && k.durum === 'iade_edildi').length;
  if (e.ornek) {
    if (!ornekKira) { const s2 = await getDoc(doc(db, 'demoVeri', 'kiralamalar')); ornekKira = s2.exists() ? demoAc(s2.data().veri) : []; }
    return ornekKira.filter(k => k.esyaId === e.id && k.durum === 'iade_edildi').length;
  }
  return (await getDocs(query(collection(db, 'dolapPuanlar'), where('esyaId', '==', e.id)))).size;
}

/* ---------------------------------------------------------------- eşya kartı */
function esyaKarti(e, kendi) {
  return '<a class="esya" href="#esya/' + esc(e.id) + '">' +
    '<span class="foto"><img src="' + esc(e.fotolar[0]) + '" alt="" loading="lazy">' + (e.aktif ? begeniDugme(e, false) : '') +
      '<span class="etiket' + (e.aktif ? '' : ' pasif-etiket') + '">' + (e.aktif ? esc(KATEGORI[e.kategori] || '') : 'Yayında değil') + '</span>' +
      (e.aktif && oneCikanMi(e) ? '<span class="etiket one-cikan">★ Öne çıkan</span>' : '') +
      (e.ornek ? '<span class="etiket ornek-etiket">Örnek</span>' : (!oneCikanMi(e) && zaman(e.olusturma) > Date.now() - 7 * 864e5 ? '<span class="etiket yeni-etiket">Yeni</span>' : '')) + '</span>' +
    '<h3>' + esc(e.baslik) + '</h3>' +
    (puanOzeti(e.id) ? '<span class="puan">★ ' + puanOzeti(e.id).ort + ' <span>(' + puanOzeti(e.id).adet + ')</span></span>' : '') +
    '<span class="alt"><span>' + esc([e.marka, e.beden].filter(Boolean).join(' · ')) + '</span><span class="fiyat">' + tl(e.gunlukUcret) + ' / gün</span></span>' +
    (kendi ? '' : '<span class="sahip" data-profil="' + esc(e.sahipId) + '" title="Profilini gör">' + (e.sahipFoto ? '<img src="' + esc(e.sahipFoto) + '" alt="" referrerpolicy="no-referrer">' : '') + esc(iyelik(e.sahipAd)) + ' dolabı</span>') +
    (kendi || !e.aktif ? '' : '<span class="kart-dug">' +
      '<span class="kirala-dug" data-kirala="' + esc(e.id) + '">Kirala</span>' +
      '<span class="sepet-dug' + (sepette(e.id) ? ' secili' : '') + '" data-sepet="' + esc(e.id) + '" title="Sepete ekle / çıkar">' + (sepette(e.id) ? '✓' : '🛒') + '</span></span>') +
    '</a>';
}

/* ---------------------------------------------------------------- KEŞFET */
/* Süzgeç durumu: kayıtlı filtreler de bu şekildedir { ad, kategori, ara, beden, maxFiyat } */
const kesfetS = { kategori: 'hepsi', ara: '', beden: '', maxFiyat: 0, sira: 'yeni', vesile: '' };
let aramaSayac;
async function kesfet(istek) {
  const sepetN = sepetListe().length;
  icerik.innerHTML = afisHTML() + NASIL_HTML +
    (sepetN ? '<a class="sepet-hatir" href="#sepet">🛒 Sepetinde ' + sepetN + ' parça bekliyor · <b>Sırayla kirala →</b></a>' : '') +
    '<div class="bas"><div><h1>Keşfet</h1><p>Herkesin dolabından kiralanabilir parçalar. Bir kez giy, dolabını doldurma.</p></div>' +
    '<a class="dug dug-vurgu" href="#dolabim">+ Dolabına eşya ekle</a></div>' +
    '<div class="vesile-sec" id="vesileSec"></div>' +
    '<div class="kayitli-filtre" id="kayitliFiltre"></div>' +
    '<div class="suzgec" id="suzgec"></div>' +
    '<div class="suzgec suzgec-2" id="suzgec2"></div>' +
    '<div id="raflar"></div><h2 class="izgara-bas" id="izgaraBas" hidden>Tüm parçalar</h2>' +
    '<div class="izgara" id="izgara"><p class="yukleniyor" style="grid-column:1/-1">Yükleniyor…</p></div>';
  afisBaslat();
  let esyalar;
  try {
    esyalar = await yayindakiEsyalar(true);
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
    $('#vesileSec').innerHTML = '<span class="kucuk">Ne için arıyorsun?</span>' + VESILE.map(([k, ad]) =>
      '<button type="button" class="cip vesile" data-v="' + k + '" aria-pressed="' + (k === kesfetS.vesile) + '">' + ad + '</button>').join('');
    $('#suzgec').innerHTML = [['hepsi', 'Tümü']].concat(Object.entries(KATEGORI)).map(([k, ad]) =>
      '<button type="button" class="cip" data-k="' + k + '" aria-pressed="' + (k === kesfetS.kategori) + '">' + ad + '</button>').join('') +
      '<input class="ara" id="ara" type="search" placeholder="Marka, renk, parça ara…" value="' + esc(kesfetS.ara) + '" aria-label="Ara">';
    $('#suzgec2').innerHTML =
      '<label class="mini-alan">Beden <select id="sBeden"><option value="">Hepsi</option>' +
        bedenler.map(b => '<option' + (b === kesfetS.beden ? ' selected' : '') + '>' + esc(b) + '</option>').join('') + '</select></label>' +
      '<label class="mini-alan">En çok <input id="sMax" type="number" min="0" step="10" inputmode="numeric" placeholder="TL/gün" value="' + (kesfetS.maxFiyat || '') + '"></label>' +
      '<label class="mini-alan">Sırala <select id="sSira">' +
        [['yeni', 'En yeni'], ['begeni', 'En çok beğenilen'], ['ucuz', 'Fiyat: artan'], ['pahali', 'Fiyat: azalan'], ['puan', 'En yüksek puan']].map(([k, ad]) =>
          '<option value="' + k + '"' + (k === kesfetS.sira ? ' selected' : '') + '>' + ad + '</option>').join('') + '</select></label>' +
      (kullanici ? '<button type="button" class="dug dug-kucuk" id="filtreKaydet">☆ Bu filtreyi kaydet</button>' : '') +
      '<button type="button" class="bag-dug" id="filtreTemizle">Temizle</button>';
  };
  const ciz = () => {
    const q = kesfetS.ara.toLocaleLowerCase('tr-TR');
    let l = esyalar.filter(e => (kesfetS.kategori === 'hepsi' || e.kategori === kesfetS.kategori) &&
      (!kesfetS.vesile || vesileleri(e).includes(kesfetS.vesile)) &&
      (!kesfetS.beden || e.beden === kesfetS.beden) &&
      (!kesfetS.maxFiyat || e.gunlukUcret <= kesfetS.maxFiyat) &&
      (!q || [e.baslik, e.marka, e.renk, e.beden].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
    const puan = e => { const p = puanOzeti(e.id); return p ? parseFloat(p.ort.replace(',', '.')) : 0; };
    l.sort({ yeni: (a, b) => zaman(b.olusturma) - zaman(a.olusturma), ucuz: (a, b) => a.gunlukUcret - b.gunlukUcret,
      pahali: (a, b) => b.gunlukUcret - a.gunlukUcret, puan: (a, b) => puan(b) - puan(a), begeni: (a, b) => begeniSayisi(b) - begeniSayisi(a) }[kesfetS.sira] || (() => 0));
    const filtresiz = kesfetS.kategori === 'hepsi' && !kesfetS.vesile && !q && !kesfetS.beden && !kesfetS.maxFiyat;
    const kart = id => esyalar.find(e => e.id === id);
    $('#raflar').innerHTML = filtresiz ? [
      rafHTML('Son baktıkların', sonBakilanlar().map(kart).filter(Boolean)),
      rafHTML('★ Öne çıkanlar', esyalar.filter(oneCikanMi)),
      rafHTML('En çok beğenilenler', esyalar.slice().sort((a, b) => begeniSayisi(b) - begeniSayisi(a))),
      rafHTML('Yeni gelenler', esyalar.slice().sort((a, b) => (zaman(b.olusturma) || 0) - (zaman(a.olusturma) || 0)))].join('') : '';
    $('#izgaraBas').hidden = !filtresiz || !$('#raflar').innerHTML;
    l = l.filter(oneCikanMi).concat(l.filter(e => !oneCikanMi(e) && !e.ornek), l.filter(e => !oneCikanMi(e) && e.ornek));   // öne çıkan > gerçek > örnek
    $('#izgara').innerHTML = l.length ? l.map(e => esyaKarti(e, kullanici && e.sahipId === kullanici.uid)).join('')
      : '<div class="bos"><h3>' + (esyalar.length ? 'Bu filtreye uyan parça yok' : 'Dolaplar henüz boş') + '</h3><p>' +
        (esyalar.length ? 'Filtreleri gevşetmeyi deneyin.' : 'İlk parçayı sen ekle, kiraya veren ilk kişi ol.') + '</p>' +
        (esyalar.length ? '' : '<a class="dug dug-vurgu" href="#dolabim">Dolabına eşya ekle</a>') + '</div>';
  };
  const hepsi = () => { suzgecCiz(); kayitliCiz(); ciz(); };

  icerik.onclick = async ev => {
    const k = ev.target.closest('#suzgec [data-k]');
    if (k) { kesfetS.kategori = k.dataset.k; hepsi(); return; }
    const vs = ev.target.closest('[data-v]');
    if (vs) { kesfetS.vesile = kesfetS.vesile === vs.dataset.v ? '' : vs.dataset.v; hepsi(); return; }
    const f = ev.target.closest('[data-fi]');
    if (f) { const s = uye.filtreler[+f.dataset.fi]; Object.assign(kesfetS, { kategori: s.kategori || 'hepsi', ara: s.ara || '', beden: s.beden || '', maxFiyat: s.maxFiyat || 0 }); hepsi(); return; }
    if (ev.target.closest('#filtreTemizle')) { Object.assign(kesfetS, { kategori: 'hepsi', vesile: '', ara: '', beden: '', maxFiyat: 0, sira: 'yeni' }); hepsi(); return; }
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
        (e.fotoBelge && e.fotoBelge.length ? (e.fotoBelge.length > 1 ? '<div class="kucukler">' + e.fotoBelge.map((id, i) =>
          '<button type="button" data-belge="' + esc(id) + '"' + (i === 0 ? ' data-f="' + esc(kapakFoto(e)) + '"' : '') + ' aria-current="' + (i === 0) + '" aria-label="Fotoğraf ' + (i + 1) + '">' +
          '<img src="' + (i === 0 ? esc(kapakFoto(e)) : '') + '" alt=""></button>').join('') + '</div>' : '') :
        e.fotolar.length > 1 ? '<div class="kucukler">' + e.fotolar.map((f, i) =>
          '<button type="button" data-f="' + esc(f) + '" aria-current="' + (i === 0) + '" aria-label="Fotoğraf ' + (i + 1) + '"><img src="' + esc(f) + '" alt=""></button>').join('') + '</div>' : '') +
        (e.kaynak ? '<p class="kucuk" style="margin-top:8px">Fotoğraf: <a href="' + esc(e.kaynak.url) + '" target="_blank" rel="noopener" style="text-decoration:underline">' + esc(e.kaynak.yazar) + '</a> · ' + esc(e.kaynak.lisans) + '</p>' : '') +
      '</div>' +
      '<div class="bilgi">' +
        '<span class="kucuk">' + esc(KATEGORI[e.kategori] || '') + '</span>' +
        '<h1>' + esc(e.baslik) + '</h1>' +
        '<p class="marka-beden">' + esc([e.marka, e.beden && 'Beden ' + e.beden, e.renk].filter(Boolean).join(' · ')) + '</p>' +
        (puanOzeti(e.id) ? '<p class="puan" style="margin-top:6px">★ ' + puanOzeti(e.id).ort + ' <span>· ' + puanOzeti(e.id).adet + ' yorum</span></p>' : '') +
        '<p class="sosyal" id="sosyalKanit"></p>' +
        '<p class="ucret">' + tl(e.gunlukUcret) + ' <small>/ gün</small></p>' +
        '<p class="kucuk">3 günlük kiralama ' + tl(3 * e.gunlukUcret) + ' · ' + vesileleri(e).map(v => VESILE.find(x => x[0] === v)[1]).join(' · ') + '</p>' +
        (e.depozito ? '<p class="kucuk">+ ' + tl(e.depozito) + ' depozito (iade edilir)</p>' : '') +
        '<p class="kucuk" style="margin-top:4px"><a href="elif-sozlesme.html" target="_blank" style="text-decoration:underline">Kiralama şartları</a> · geç iade ve teslim etmeme kuralları</p>' +
        (e.aciklama ? '<p class="aciklama">' + esc(e.aciklama) + '</p>' : '') +
        '<a class="sahip sahip-link" href="#profil/' + esc(e.sahipId) + '" style="margin-top:14px">' + (e.sahipFoto ? '<img src="' + esc(e.sahipFoto) + '" alt="" referrerpolicy="no-referrer">' : '') + esc(iyelik(e.sahipAd)) + ' dolabından <span data-seviye="' + esc(e.sahipId) + '"></span></a>' +
        (e.ornek ? (adminMi() && !D ? '<div class="kutu" style="margin-top:14px"><b>Yönetim</b><p class="kucuk" style="margin:4px 0 10px">Bu bir örnek ilan. Kaldırırsan Keşfet\'te ve her yerde görünmez.</p>' +
          '<button type="button" class="dug dug-kucuk dug-tehlike" id="ornekKaldir">Örnek ilanı kaldır</button></div>' : '') : adminEsyaAraclari(e)) +
        (e.aktif ? '<div class="begeni-satir">' + begeniDugme(e, true) +
          '<span class="paylas"><a class="dug dug-kucuk" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(e.baslik + ' · Elif\'in Dolabı\'nda günlük ' + tl(e.gunlukUcret) + ' ' + location.origin + location.pathname + '#esya/' + e.id) + '">WhatsApp\'ta paylaş</a>' +
          '<button type="button" class="dug dug-kucuk" id="linkKopya">Bağlantıyı kopyala</button></span></div>' : '') +
        (kendi || !e.aktif ? '' : '<span class="dug sepet-dug-uzun' + (sepette(e.id) ? ' secili' : '') + '" data-sepet="' + esc(e.id) + '" data-uzun="1">' + (sepette(e.id) ? '✓ Sepette' : '🛒 Sepete ekle') + '</span>') +
        '<div class="kutu" id="kiraKutu"></div>' + (e.aktif && !kendi ? GUVENCE_HTML : '') +
      '</div>' +
    '</div>' +
    (e.aktif && !kendi ? '<div class="yapiskan-kirala"><span><b>' + tl(e.gunlukUcret) + '</b> / gün</span><a class="dug dug-vurgu" href="#esya/' + esc(e.id) + '/kirala">Kirala</a></div>' : '') +
    yorumBolumu(e.id) +
    '<section class="sorular" id="sorular" aria-labelledby="soruBas"><h2 id="soruBas">Satıcıya sor</h2><div id="soruIc"><p class="yukleniyor">Yükleniyor…</p></div></section>' +
    '<div id="benzerler"></div>';
  document.title = e.baslik + ' kirala · ' + tl(e.gunlukUcret) + '/gün · Elif\'in Dolabı';
  sonBakilanEkle(e.id);
  const lk = $('#linkKopya');
  if (lk) lk.onclick = () => {
    const u = location.origin + location.pathname + '#esya/' + e.id;
    if (navigator.share) navigator.share({ title: e.baslik, text: e.baslik + ' · Elif\'in Dolabı', url: u }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => bildir('Bağlantı kopyalandı.'), () => prompt('Bağlantı:', u));
    else prompt('Bağlantı:', u);
  };
  kiralanmaSayisi(e).then(n => {
    const el = $('#sosyalKanit'); if (!el || istek !== aktifIstek) return;
    const b = begeniSayisi(e);
    el.innerHTML = [b ? '♥ ' + b + ' kişi beğendi' : '', n ? '✓ ' + n + ' kez sorunsuz kiralandı' : ''].filter(Boolean).join(' · ');
  }).catch(() => {});
  yayindakiEsyalar().then(l => {
    if (istek !== aktifIstek || !$('#benzerler')) return;
    const b = l.filter(x => x.id !== e.id && x.kategori === e.kategori).sort((a, c) => Math.abs(a.gunlukUcret - e.gunlukUcret) - Math.abs(c.gunlukUcret - e.gunlukUcret));
    $('#benzerler').innerHTML = rafHTML('Benzer parçalar', b) + rafHTML('Son baktıkların', sonBakilanlar().filter(x => x !== e.id).map(id => l.find(y => y.id === id)).filter(Boolean));
  }).catch(() => {});

  icerik.querySelector('.kucukler')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-f]'); if (!b) return;
    $('#buyukFoto').src = b.dataset.f;
    icerik.querySelectorAll('.kucukler button').forEach(x => x.setAttribute('aria-current', String(x === b)));
  });

  const yon = icerik.querySelector('.admin-kutu');
  if (yon) yon.onclick = async ev => {
    const b = ev.target.closest('[data-yon]'); if (!b) return;
    let veri = { onay: 'onaylandi', redNeden: '', onayZaman: SIMDI() };
    if (b.dataset.yon === 'kaldir') {
      const n = prompt('Kaldırma nedeni (ürün sahibine gösterilir):', '');
      if (n === null) return;
      veri = { onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Yönetici tarafından kaldırıldı.', aktif: false, onayZaman: SIMDI() };
    }
    try { await dbGuncelle('dolapEsyalar', e.id, veri); bildir('Güncellendi.'); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); }
  };

  seviyeleriDoldur(icerik);
  sorulariCiz(e, istek);
  const okb = $('#ornekKaldir');
  if (okb) okb.onclick = async () => {
    if (!confirm('"' + e.baslik + '" örnek ilanı siteden kaldırılsın mı?')) return;
    okb.disabled = true;
    try { await ornekGizle([e.id]); sepetCikar(e.id); bildir('Örnek ilan kaldırıldı.'); location.hash = '#kesfet'; }
    catch (h) { okb.disabled = false; bildir(hataMetni(h)); }
  };
  (e.fotoBelge || []).forEach((id, i) => fotoGetir(id).then(v => {
    if (!v || istek !== aktifIstek) return;
    const b = icerik.querySelector('[data-belge="' + CSS.escape(id) + '"]');
    if (b) { b.dataset.f = v; b.querySelector('img').src = v; }
    if (i === 0 && $('#buyukFoto')) $('#buyukFoto').src = v;
  }).catch(() => {}));
  const kutu = $('#kiraKutu');
  const ornekForm = !!e.ornek;   // örnek ilan: form görünür, gönderim kapalı
  if (!ornekForm && (kendi)) {
    kutu.innerHTML = '<h2>Bu parça senin dolabında</h2><p class="kucuk" style="margin-bottom:12px">' +
      (e.onay === 'bekliyor' ? 'Ekip onayı bekliyor; onaylanınca Keşfet\'te görünür.' : e.onay === 'reddedildi' ? 'Reddedildi: ' + esc(e.redNeden) : e.aktif ? 'Keşfet\'te görünüyor.' : 'Şu an yayında değil.') + '</p>' +
      '<a class="dug" href="#dolabim">Dolabıma git</a>';
    return;
  }
  if (!ornekForm && (!e.aktif || e.onay !== 'onaylandi')) { kutu.innerHTML = '<h2>Şu an kiralanamıyor</h2><p class="kucuk">' + (e.onay === 'bekliyor' ? 'Bu parça ekip onayı bekliyor.' : 'Bu parça yayında değil.') + '</p>'; return; }
  if (!ornekForm && (rol === 'kisitli')) { kutu.innerHTML = '<h2>Kiralama yapamıyorsun</h2><p class="kucuk">Hesabın kısıtlandı' + (rolNeden ? ': ' + esc(rolNeden) : '') + '. Yardım için sağ alttaki "Soru sor"u kullan.</p>'; return; }
  if (!ornekForm && (!kullanici)) {
    kutu.innerHTML = '<h2>Kiralamak için giriş yap</h2><p class="kucuk" style="margin-bottom:12px">Google hesabınla saniyeler içinde giriş yapabilirsin.</p>' +
      '<button type="button" class="dug dug-ana dug-tam" id="kiraGiris">' + G_IKON + 'Google ile giriş yap</button>';
    $('#kiraGiris').onclick = girisYap;
    return;
  }
  const ilet = localStorage.getItem(LS_ILETISIM) || '';
  let benimSad = null;
  const kAdresler = (uye && uye.adresler) || [];
  kutu.innerHTML = '<h2>Kiralama isteği</h2>' +
    (ornekForm ? '<p class="uyari" style="margin-bottom:12px"><b>Örnek ilan.</b> Formu deneyebilirsin ama bu parça kiralanamaz; sitenin nasıl çalıştığını göstermek için konuldu. Gerçek ilanlarda "Örnek" rozeti bulunmaz.</p>' : '') +
    '<div class="form-izgara">' +
      '<div class="alan"><label for="kBas">Başlangıç</label><input type="date" id="kBas" min="' + bugun() + '"></div>' +
      '<div class="alan"><label for="kBit">İade</label><input type="date" id="kBit" min="' + bugun() + '"></div>' +
      '<div class="alan tam"><label for="kIlet">Telefonun</label><input id="kIlet" type="tel" placeholder="05xx xxx xx xx" value="' + esc(ilet) + '" autocomplete="tel"></div>' +
      '<div class="alan tam"><label for="kAdres">Teslimat</label><select id="kAdres">' +
        kAdresler.map((a, i) => '<option value="' + i + '">' + esc(a.baslik) + ' · ' + esc(a.ilce) + ' / ' + esc(a.il) + '</option>').join('') +
        '<option value="yeni">Yeni adres yaz</option><option value="elden">Elden teslim alacağım</option></select>' +
        '<textarea id="kAdresYeni" maxlength="400" placeholder="Ad soyad, açık adres, ilçe / il"' + (kAdresler.length ? ' hidden' : '') + '></textarea>' +
        '<span class="kucuk">Adresin yalnız ödemen site tarafından onaylanınca eşya sahibine açılır.</span></div>' +
      '<div class="alan tam"><label for="kNot">Not <span class="kucuk">(isteğe bağlı)</span></label><textarea id="kNot" maxlength="500" placeholder="Örn. düğün için, teslim yeri tercihi…"></textarea></div>' +
    '</div>' +
    '<div id="kOzet" style="margin-top:12px"></div>' +
    '<div class="uyari" style="margin-top:14px">' + SARTLAR_OZET + '</div>' +
    '<label class="onay-kutu"><input type="checkbox" id="kSozlesme"><span><a href="elif-sozlesme.html" target="_blank">Kiralama sözleşmesini</a> okudum; geç iade, teslim etmeme ve hasar maddelerini kabul ediyorum.</span></label>' +
    '<p class="hata" id="kHata" role="alert"></p>' +
    '<button type="button" class="dug dug-vurgu dug-tam" id="kGonder">İstek gönder</button>' +
    '<ol class="adimlar kucuk" style="margin-top:12px"><li><b>İsteği gönder</b>, şimdi ödeme yok.</li>' +
      '<li>Sahibi onaylayınca Kiralamalarım\'da <b>kartla ya da havale/FAST ile öde</b>.</li>' +
      '<li>Parça kargoyla gelir; teslim alınca onayla. Depozito, parça sağlam dönünce iade edilir.</li></ol>' +
    '<p class="kucuk">Telefonun ve adresin yalnız ödemen onaylanınca eşya sahibine açılır.</p>';

  const hesapla = () => {
    const a = $('#kBas').value, b = $('#kBit').value;
    const gun = a && b ? gunFarki(a, b) : 0;
    const yz = benimSad ? indirimYuzde(benimSad) : 0, brut = gun * e.gunlukUcret, ind = Math.floor(brut * yz / 100);
    const hb = Math.floor(brut * (GELIR.hizmetYuzde || 0) / 100);
    $('#kOzet').innerHTML = gun > 0 ?
      '<div class="ozet-satir"><span>' + tl(e.gunlukUcret) + ' × ' + gun + ' gün</span><span>' + tl(brut) + '</span></div>' +
      (ind ? '<div class="ozet-satir indirim"><span>★ ' + esc(benimSad.seviye) + ' sadakat indirimi (%' + yz + ')</span><span>−' + tl(ind) + '</span></div>' : '') +
      (hb ? '<div class="ozet-satir"><span>Hizmet bedeli (%' + GELIR.hizmetYuzde + ')</span><span>' + tl(hb) + '</span></div>' : '') +
      (e.depozito ? '<div class="ozet-satir"><span>Depozito (iade edilir)</span><span>' + tl(e.depozito) + '</span></div>' : '') +
      '<div class="ozet-satir toplam"><span>Toplam</span><span>' + tl(brut - ind + hb + e.depozito) + '</span></div>' : '';
    return { gun, yz, ind, hb };
  };
  if (kullanici) sadakatGetir(kullanici.uid).then(x => { benimSad = x; if (istek === aktifIstek && $('#kOzet')) hesapla(); }).catch(() => {});
  $('#kAdres').onchange = () => { $('#kAdresYeni').hidden = $('#kAdres').value !== 'yeni'; };
  ['kBas', 'kBit'].forEach(i => $('#' + i).addEventListener('change', () => {
    if ($('#kBas').value) $('#kBit').min = $('#kBas').value;
    hesapla();
  }));
  if (ornekForm) { const g = $('#kGonder'); g.disabled = true; g.textContent = 'Örnek ilan · kiralanamaz'; }
  if (yol()[2] === 'kirala') [80, 700].forEach(t => setTimeout(() => { if (istek === aktifIstek) kutu.scrollIntoView({ block: 'start' }); }, t));
  $('#kGonder').onclick = async () => {
    const hata = $('#kHata'); hata.textContent = '';
    const { gun, yz, ind, hb } = hesapla(), tel = $('#kIlet').value.trim();
    const aSec = $('#kAdres').value;
    const adres = (aSec === 'elden' ? 'Elden teslim' : aSec === 'yeni' ? $('#kAdresYeni').value.trim()
      : (a => [a.adSoyad, a.telefon, a.adres, a.ilce + ' / ' + a.il].filter(Boolean).join(' · '))(kAdresler[+aSec])).slice(0, 400);
    if (!(gun >= 1)) { hata.textContent = 'Başlangıç ve iade tarihini seçin (iade, başlangıçtan sonra olmalı).'; return; }
    if (gun > 60) { hata.textContent = 'En fazla 60 günlük kiralama yapılabilir.'; return; }
    if (tel.replace(/\D/g, '').length < 10) { hata.textContent = 'Geçerli bir telefon numarası yazın.'; return; }
    try {
      const benim = await kiraListesi('kiraciId', kullanici.uid);
      const bas = $('#kBas').value, bit = $('#kBit').value;
      if (benim.some(x => x.esyaId === e.id && ['beklemede', ...AKTIF_DURUM].includes(x.durum) && x.baslangic <= bit && bas <= x.bitis)) {
        hata.textContent = 'Bu parça için bu tarihlerde zaten bir isteğin var. Kiralamalarım\'dan takip edebilirsin.'; return;
      }
    } catch (h) {}
    if (adres.length < 10 && aSec !== 'elden') { hata.textContent = 'Teslimat adresini yazın ya da "Elden teslim"i seçin.'; return; }
    const notSorun = icerikSorunu($('#kNot').value); if (notSorun) { hata.textContent = 'Not: ' + notSorun + ' Telefonunu yukarıdaki alana yaz; ödeme onaylanınca açılır.'; return; }
    if (!$('#kSozlesme').checked) { hata.textContent = 'Devam etmek için kiralama sözleşmesini kabul edin.'; return; }
    localStorage.setItem(LS_ILETISIM, tel);
    const dug = $('#kGonder'); dug.disabled = true; dug.textContent = 'Gönderiliyor…';
    try {
      await kiraEkle({
        esyaId: e.id, esyaBaslik: e.baslik, esyaFoto: kapakFoto(e), sahipId: e.sahipId,
        kiraciId: kullanici.uid, kiraciAd: (kullanici.displayName || kullanici.email || '').slice(0, 80),
        kiraciIletisim: (tel + ' · ' + (kullanici.email || '')).slice(0, 200), sahipIletisim: '',
        baslangic: $('#kBas').value, bitis: $('#kBit').value, gun,
        gunlukUcret: e.gunlukUcret, kira: gun * e.gunlukUcret - ind, indirimYuzde: ind ? yz : 0, indirim: ind,
        hizmetYuzde: GELIR.hizmetYuzde || 0, hizmetBedeli: hb, komisyonYuzde: GELIR.komisyonYuzde || 0,
        depozito: e.depozito, toplam: gun * e.gunlukUcret - ind + hb + e.depozito,
        not: $('#kNot').value.trim().slice(0, 500), durum: 'beklemede', sozlesme: SOZLESME_SURUM,
        olusturma: SIMDI(), guncelleme: SIMDI()
      }, adres);
      const sirada = sepette(e.id);
      sepetCikar(e.id);
      const sonraki = sirada && sepetListe()[0];
      if (sonraki) {
        bildir('İsteğin gönderildi ✓ Sepetteki sıradaki parçaya geçiyoruz.');
        location.hash = '#esya/' + sonraki + '/kirala';
      } else {
        bildir('İsteğin gönderildi. Sahibi onaylayınca haber Kiralamalarım\'da.');
        location.hash = '#kiralamalar';
      }
    } catch (h) {
      hata.textContent = hataMetni(h);
      dug.disabled = false; dug.textContent = 'İstek gönder';
    }
  };
}

/* ---------------------------------------------------------------- içerik denetimi
 * Kullanıcı metinlerinde telefon, e-posta, sosyal medya/mesajlaşma yönlendirmesi, site dışında anlaşma girişimi
 * ve küfür/hakaret engellenir. Telefon, e-posta, ağır küfür ve temel yönlendirmeler firestore.rules'ta da reddedilir. */
const TR_ASCII = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };
const trAscii = x => String(x || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => TR_ASCII[c]);
const SAYI_KELIME = { sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90 };
/* küfür denetimi ş ve ı'yı korur: "şık" ile küfür karışmasın */
const yariAscii = x => String(x || '').toLocaleLowerCase('tr').replace(/[çğöü]/g, c => TR_ASCII[c]);
const KUFUR_KOK = ['orospu', 'siktir', 'sikerim', 'sikeyim', 'siktig', 'sikik', 'sikiş', 'sikis', 'yarak', 'amına', 'amina', 'amcık', 'amcik', 'pezevenk', 'kahpe',
  'şerefsiz', 'serefsiz', 'gerizekal', 'yavşak', 'yavsak', 'kaltak', 'surtuk', 'dalyarak', 'gotveren', 'avradın', 'avradin', 'ananı', 'anani', 'ananız', 'ananiz', 'bok'];
const KUFUR_TAM = ['amk', 'aq', 'amq', 'mk', 'ibne', 'got', 'oc', 'puşt', 'pust', 'gavat', 'salak', 'aptal', 'dangalak', 'ebeni', 'pic'];
const ILETISIM_IFADE = [
  'whats ?app', 'watsap', 'vatsap', 'wats?ap', 'wp ?(den|dan|ye|ya|e|a)\\b', '\\bwp\\b', 'telegram', 'instagram', '\\binsta\\b', 'tiktok', 'facebook', 'snapchat', 'twitter',
  '\\bdm\\b', '\\bdm ?(den|at|ye|e)\\b', 'ozel ?(den|mesaj)', '\\bpm\\b', 'mesaj ?at', 'bana ?yaz', 'bana ?ulas', 'beni ?ara', 'ara ?beni', 'arayin', 'arayabilir',
  'numaram', 'numaran', 'numarasini', 'numara ?(ver|at|yaz|paylas)', 'telefon ?(no|num|numara)', 'telefonum', '\\btel ?no', 'cep ?(no|num|tel)', '\\bgsm\\b', 'iletisim ?(bilgi|numara|adres|kur|e gec|e gecin)',
  'mail ?(at|adres|le|e|den)', '\\be-?posta', 'gmail', 'hotmail', 'outlook', 'yahoo', 'icloud', 'yandex', 'nokta ?com', '\\.com\\b',
  '\\biban\\b', 'hesap ?(no|numara)', 'elden ?ode', 'elden ?para', 'site ?disi', 'siteden ?bagimsiz', 'komisyon(suz| ?ode(me|meden))', 'aramizda ?anlas', 'kendi ?aramizda', 'direkt ?anlas'
].map(x => new RegExp(x));
function icerikSorunu(metin) {
  const ham = String(metin || '');
  if (!ham.trim()) return null;
  const a = trAscii(ham);
  // telefon: rakamlar (yazıyla yazılanlar dahil) arada boşluk, nokta, tire olsa da 9+ hane
  const rakam = a.replace(/[a-z]+/g, w => (w in SAYI_KELIME ? String(SAYI_KELIME[w]) : ' ' + w + ' '))
    .replace(/(\d)[\s.\-\/()+_*,]+(?=\d)/g, '$1');
  if (/\d{9,}/.test(rakam) || /\+\s*9\s*0/.test(ham)) return 'Telefon numarası paylaşılamaz.';
  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|nokta|dot)\s*[a-z]{2,}/i.test(a) || /(^|\s)@[a-z0-9_.]{3,}/.test(a)) return 'E-posta ya da kullanıcı adı paylaşılamaz.';
  if (ILETISIM_IFADE.some(r => r.test(a))) return 'İletişim bilgisi vermeye ya da site dışında anlaşmaya yönelik ifadeler yazılamaz.';
  const sade = yariAscii(ham).replace(/[013457@$]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' })[c]);
  const ham2 = sade.split(/[^a-zşı]+/).filter(Boolean), tok = [];
  for (let i = 0; i < ham2.length; i++) {          // "s i k t i r" gibi harf harf yazılanları birleştir
    if (ham2[i].length === 1) { let j = i, w = ''; while (j < ham2.length && ham2[j].length === 1) w += ham2[j++]; tok.push(w); i = j - 1; }
    else tok.push(ham2[i]);
  }
  const kufur = tok.map(t => t.replace(/(.)\1+/g, '$1')).some(t => KUFUR_TAM.includes(t) || KUFUR_KOK.some(k => t.startsWith(k) && !(k === 'bok' && /^bok(ser|s)/.test(t))));
  if (kufur) return 'Küfür ya da hakaret içeren ifadeler yazılamaz.';
  return null;
}
const DENETIM_NOT = ' İletişim bilgileri ödeme onaylanınca site üzerinden açılır.';

/* ---------------------------------------------------------------- satıcıya sor (dolapSorular, herkese açık) */
async function soruListesi(alan, deger) {
  if (D) return (D.sorular || []).filter(x => x[alan] === deger).map(x => ({ ...x }));
  return (await getDocs(query(collection(db, 'dolapSorular'), where(alan, '==', deger)))).docs.map(x => ({ id: x.id, ...x.data() }));
}
const kisaAd = ad => { const p = String(ad || 'Üye').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0]; };
async function sorulariCiz(e, istek) {
  if (!$('#soruIc')) return;
  let l = [];
  if (!e.ornek) { try { l = await soruListesi('esyaId', e.id); } catch (h) { l = []; } }
  const ic = $('#soruIc');
  if (istek !== aktifIstek || !ic) return;
  const sahibi = kullanici && kullanici.uid === e.sahipId;
  l.sort((a, b) => (zaman(b.olusturma) || Date.now()) - (zaman(a.olusturma) || Date.now()));
  const form = e.ornek ? '<p class="kucuk">Bu bir örnek ilan; satıcıya soru sorulamaz. Gerçek ilanlarda sorunu buradan sorabilirsin.</p>'
    : sahibi ? '<p class="kucuk">Bu senin parçan. Gelen soruları aşağıdan cevaplayabilirsin; cevabın herkese görünür.</p>'
    : !kullanici ? '<p class="kucuk">Satıcıya soru sormak için <button type="button" class="dug-metin" id="soruGiris">giriş yap</button>.</p>'
    : rol === 'kisitli' ? '<p class="kucuk">Hesabın kısıtlı; soru soramazsın.</p>'
    : '<div class="soru-form"><textarea id="soruMetin" maxlength="500" placeholder="Örn. Bel ölçüsü kaç? Bir gün erken teslim alabilir miyim?"></textarea>' +
      '<div class="soru-alt"><span class="kucuk">Soru ve cevap herkese görünür; telefon ya da adres paylaşma.</span>' +
      '<button type="button" class="dug dug-vurgu dug-kucuk" id="soruGonderDug">Soruyu gönder</button></div><p class="hata" id="soruHata" role="alert"></p></div>';
  ic.innerHTML = form + (l.length ? '<div class="soru-liste">' + l.map(x =>
    '<article class="soru"><p class="soru-s"><b>S:</b> ' + esc(x.soru) + ' <span class="kucuk">· ' + esc(x.soranAd) + ' · ' + onceYaz(zaman(x.olusturma) || Date.now()) + '</span></p>' +
    (x.cevap ? '<p class="soru-c"><b>C:</b> ' + esc(x.cevap) + ' <span class="kucuk">· satıcı · ' + onceYaz(zaman(x.cevapZaman) || Date.now()) + '</span></p>'
      : sahibi ? '<div class="soru-cevapla"><textarea data-cevap-alan="' + esc(x.id) + '" maxlength="1000" placeholder="Cevabını yaz"></textarea>' +
          '<button type="button" class="dug dug-kucuk dug-vurgu" data-cevapla="' + esc(x.id) + '">Cevapla</button></div>'
      : '<p class="kucuk soru-c">Satıcının cevabı bekleniyor.</p>') +
    ((kullanici && x.soranId === kullanici.uid && !x.cevap) || adminMi() ? '<button type="button" class="dug-metin" data-soru-sil="' + esc(x.id) + '">Sil</button>' : '') +
    '</article>').join('') + '</div>' : (e.ornek ? '' : '<p class="kucuk" style="margin-top:10px">Henüz soru yok. İlk soran sen ol.</p>'));
  const g = $('#soruGiris'); if (g) g.onclick = girisYap;
  const gd = $('#soruGonderDug');
  if (gd) gd.onclick = async () => {
    const metin = $('#soruMetin').value.trim();
    if (metin.length < 3) { $('#soruHata').textContent = 'Sorunu yaz.'; return; }
    const sorun = icerikSorunu(metin); if (sorun) { $('#soruHata').textContent = sorun + DENETIM_NOT; return; }
    gd.disabled = true;
    try {
      await dbEkle('dolapSorular', { esyaId: e.id, esyaBaslik: e.baslik.slice(0, 80), sahipId: e.sahipId, soranId: kullanici.uid,
        soranAd: kisaAd(kullanici.displayName).slice(0, 40), soru: metin.slice(0, 500), cevap: '', durum: 'bekliyor', olusturma: SIMDI() });
      bildir('Sorun satıcıya iletildi; cevaplayınca bildirim gelir.'); sorulariCiz(e, istek);
    } catch (h) { gd.disabled = false; $('#soruHata').textContent = hataMetni(h); }
  };
  ic.onclick = async ev => {
    const c = ev.target.closest('[data-cevapla]'), sl = ev.target.closest('[data-soru-sil]');
    if (!c && !sl) return;
    try {
      if (c) {
        const v = ic.querySelector('[data-cevap-alan="' + CSS.escape(c.dataset.cevapla) + '"]').value.trim();
        if (!v) return;
        const sorun = icerikSorunu(v); if (sorun) { bildir(sorun + DENETIM_NOT); return; }
        c.disabled = true;
        await dbGuncelle('dolapSorular', c.dataset.cevapla, { cevap: v.slice(0, 1000), durum: 'cevaplandi', cevapZaman: SIMDI() });
        bildir('Cevabın yayında.');
      } else {
        if (!confirm('Soru silinsin mi?')) return;
        await dbSil('dolapSorular', sl.dataset.soruSil);
      }
      sorulariCiz(e, istek);
    } catch (h) { bildir(hataMetni(h)); if (c) c.disabled = false; }
  };
  if (yol()[2] === 'sorular') $('#sorular').scrollIntoView({ block: 'start' });
}

function yorumBolumu(id) {
  const y = yorumlar(id);
  const tarih = t => new Date(t.toMillis()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  const ornekMi = ORNEK && String(id).startsWith('demo-');
  return '<section class="yorumlar" aria-labelledby="yorumBas"><h2 id="yorumBas">Yorumlar' + (ornekMi ? ' <span class="kucuk">(örnek)</span>' : '') +
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
  const ocHtml = await boostlarimHTML();
  if (istek !== aktifIstek) return;
  if (ocHtml) $('#liste').insertAdjacentHTML('beforebegin', '<div id="ocBolum">' + ocHtml + '</div>');
  const ocB = $('#ocBolum');
  if (ocB) ocB.onclick = ev => { const b = ev.target.closest('[data-oc]'); if (b) boostDurum(b.dataset.ocId, b.dataset.oc); };
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
        (e.onay === 'onaylandi' && e.aktif && !oneCikanMi(e) ? '<button type="button" class="dug dug-kucuk dug-vurgu" data-onecikar="' + esc(e.id) + '">★ Öne çıkar</button>' : '') +
        (oneCikanMi(e) ? '<span class="durum d-onaylandi">★ ' + kalanSure(zaman(e.oneCikanBitis)) + ' kaldı</span>' : '') +
        '<button type="button" class="dug dug-kucuk" data-duzenle="' + esc(e.id) + '">Düzenle</button>' +
        '<button type="button" class="dug dug-kucuk" data-yayin="' + esc(e.id) + '">' + (e.aktif ? 'Yayından kaldır' : 'Yayınla') + '</button>' +
        '<button type="button" class="dug dug-kucuk dug-tehlike" data-sil="' + esc(e.id) + '">Sil</button>' +
      '</div></div>').join('');
  $('#liste').onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.oc) return boostDurum(b.dataset.ocId, b.dataset.oc);
    const e = l.find(x => x.id === (b.dataset.duzenle || b.dataset.yayin || b.dataset.sil || b.dataset.onecikar));
    if (!e) return;
    if (b.dataset.onecikar) return oneCikarFormu(e);
    
    try {
      if (b.dataset.duzenle) return esyaFormu(e);
      if (b.dataset.yayin) { b.disabled = true; await dbGuncelle('dolapEsyalar', e.id, { aktif: !e.aktif }); bildir(e.aktif ? 'Yayından kaldırıldı.' : 'Yayında.'); }
      if (b.dataset.sil) {
        if (!confirm('"' + e.baslik + '" dolabından silinsin mi? Bu geri alınamaz.')) return;
        await dbSil('dolapEsyalar', e.id);
        if (!DEMO) (e.fotoBelge || []).forEach(id => dbSil('dolapFotolar', id).catch(() => {}));
        bildir('Silindi.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); b.disabled = false; }
  };
}

/* fotoğrafı tarayıcıda küçült: uzun kenar en fazla 1400 px, JPEG */
/* Fotoğraflar Firestore'da (Storage/Blaze gerekmez):
 *   dolapEsyalar.fotolar[0] = küçük kapak (data URL, ~30-60 KB) → kartlar ve listeler hızlı
 *   dolapEsyalar.fotoBelge  = tam boy fotoğrafların dolapFotolar/{id} kimlikleri → yalnız parça sayfasında yüklenir */
function kucultVeri(kaynak, enCok, kalite) {
  return new Promise((ok, hata) => {
    const img = new Image();
    img.onload = () => {
      const o = Math.min(1, enCok / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * o); c.height = Math.round(img.height * o);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      if (kaynak instanceof Blob) URL.revokeObjectURL(img.src);
      let q = kalite, v = c.toDataURL('image/jpeg', q);
      while (v.length > 900000 && q > 0.35) { q -= 0.1; v = c.toDataURL('image/jpeg', q); }
      ok(v);
    };
    img.onerror = () => hata(new Error('Bu dosya açılamadı. JPG veya PNG seçin.'));
    img.src = kaynak instanceof Blob ? URL.createObjectURL(kaynak) : kaynak;
  });
}
const fotoOnbellek = new Map();
function fotoGetir(id) {
  if (!fotoOnbellek.has(id)) fotoOnbellek.set(id, getDoc(doc(db, 'dolapFotolar', id)).then(sn => (sn.exists() ? sn.data().veri : '')));
  return fotoOnbellek.get(id);
}
const kapakFoto = e => { const f = (e.fotolar && e.fotolar[0]) || ''; return f.length <= 120000 ? f : ''; };
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
  /* {belge, onizleme} veritabanındaki fotoğraf · {url} eski tip/örnek · {dosya, onizleme} yeni */
  let fotolar = !e ? [] : e.fotoBelge && e.fotoBelge.length
    ? e.fotoBelge.map((id, i) => ({ belge: id, onizleme: i === 0 ? kapakFoto(e) : '' }))
    : e.fotolar.map(u => ({ url: u }));
  const kaldirilan = [], kaldirilanBelge = [];
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
    if (s) { const [f] = fotolar.splice(+s.dataset.i, 1); if (f.url) kaldirilan.push(f.url); if (f.belge) kaldirilanBelge.push(f.belge); fotoCiz(); return; }
    if (ev.target.closest('#fotoEkle')) $('#fotoDosya').click();
  };
  $('#fotoDosya').onchange = ev => {
    [...ev.target.files].slice(0, 4 - fotolar.length).forEach(d => fotolar.push({ dosya: d, onizleme: URL.createObjectURL(d) }));
    ev.target.value = '';
    fotoCiz();
  };
  fotoCiz();
  fotolar.forEach(f => { if (f.belge) fotoGetir(f.belge).then(v => { if (v) { f.onizleme = v; fotoCiz(); } }).catch(() => {}); });

  $('#fKaydet').onclick = async () => {
    const hata = $('#fHata'); hata.textContent = '';
    const v = id => $('#' + id).value.trim();
    const ucret = Math.round(+v('fUcret')), depozito = Math.round(+v('fDepozito') || 0);
    if (!fotolar.length) { hata.textContent = 'En az bir fotoğraf ekleyin.'; return; }
    if (v('fBaslik').length < 2) { hata.textContent = 'Başlık yazın.'; return; }
    const sorun = icerikSorunu(v('fBaslik') + ' \n ' + v('fMarka') + ' \n ' + v('fAciklama')); if (sorun) { hata.textContent = 'Başlık / açıklama: ' + sorun + DENETIM_NOT; return; }
    if (!(ucret >= 1)) { hata.textContent = 'Günlük kira bedeli girin.'; return; }
    if (depozito < 0) { hata.textContent = 'Depozito eksi olamaz.'; return; }
    if (!$('#fSozlesme').checked) { hata.textContent = 'Eşya eklemek için kiraya veren şartlarını kabul edin.'; return; }
    const dug = $('#fKaydet'); dug.disabled = true;
    try {
      const urller = [], belgeler = [];
      let kapak = '';
      for (let i = 0; i < fotolar.length; i++) {
        const f = fotolar[i];
        if (DEMO) { urller.push(f.url || f.onizleme); continue; }    // örnek mod: fotoğraf tarayıcıda kalır
        if (f.url) { urller.push(f.url); continue; }
        dug.textContent = 'Fotoğraf hazırlanıyor ' + (i + 1) + '/' + fotolar.length + '…';
        if (f.belge) {
          belgeler.push(f.belge);
          if (!kapak) kapak = await kucultVeri(f.onizleme || await fotoGetir(f.belge), 480, 0.72);
          continue;
        }
        const tam = await kucultVeri(f.dosya, 1280, 0.8);
        const r = await dbEkle('dolapFotolar', { sahipId: kullanici.uid, veri: tam, olusturma: SIMDI() });
        belgeler.push(r.id);
        fotoOnbellek.set(r.id, Promise.resolve(tam));
        if (!kapak) kapak = await kucultVeri(tam, 480, 0.72);
      }
      const fotoAlanlari = belgeler.length ? { fotolar: [kapak], fotoBelge: belgeler } : { fotolar: urller, fotoBelge: [] };
      dug.textContent = 'Kaydediliyor…';
      const veri = {
        baslik: v('fBaslik'), kategori: v('fKat'), marka: v('fMarka'), beden: v('fBeden'), renk: v('fRenk'),
        aciklama: v('fAciklama'), gunlukUcret: ucret, depozito, ...fotoAlanlari, sozlesme: SOZLESME_SURUM,
        onay: 'bekliyor', redNeden: '',
        sahipAd: (kullanici.displayName || 'Kullanıcı').slice(0, 80), sahipFoto: (kullanici.photoURL || '').slice(0, 600)
      };
      if (e) await dbGuncelle('dolapEsyalar', e.id, veri);
      else await dbEkle('dolapEsyalar', { ...veri, sahipId: kullanici.uid, aktif: true, olusturma: SIMDI() });
      if (!DEMO) kaldirilanBelge.forEach(id => dbSil('dolapFotolar', id).catch(() => {}));
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
  if (gorunum === 'yonetim') { location.replace('#yonetim/odemeler'); return; }   // ödeme onayları Yönetim panelinde
  if (!kullanici) return girisCagrisi('Kiralamaların burada', 'Kiraladığın ve dolabından kiralanan parçaları görmek için giriş yap.');
  const sekme = (k, ad) => '<a class="cip" href="#kiralamalar' + (k === 'kiraci' ? '' : '/' + k) + '" aria-pressed="' + (gorunum === k) + '">' + ad + '</a>';
  icerik.innerHTML = '<div class="bas"><div><h1>Kiralamalarım</h1><p>İsteklerin ve dolabına gelen istekler.</p></div></div>' +
    '<div class="alt-sekme">' + sekme('kiraci', 'Kiraladıklarım') + sekme('sahip', 'Dolabımdan kiralananlar') + '</div>' +
    '<div class="liste" id="liste"><p class="yukleniyor">Yükleniyor…</p></div>';

  let alan = 'kiraciId', deger = kullanici.uid;
  if (gorunum === 'sahip') alan = 'sahipId';
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
  const borclar = await borcListesi(kullanici.uid).catch(() => []);
  if (istek !== aktifIstek) return;
  $('#liste').innerHTML = l.map(k => kiraSatiri(k, gorunum, borclar.filter(b => b.kiraId === k.id))).join('');
  seviyeleriDoldur($('#liste'));
  adresleriDoldur($('#liste'));
  $('#liste').onclick = async ev => {
    const bo = ev.target.closest('[data-borc-odedim]');
    if (bo) {
      if (!confirm('Borcu ödediğini bildirmek istiyor musun? Ekip hesabı kontrol edip kapatacak.')) return;
      try { await dbGuncelle('dolapBorclar', bo.dataset.borcOdedim, { bildirildi: true, guncelleme: SIMDI() }); bildir('Bildirildi; kontrol edilecek.'); sayfaCiz(); }
      catch (h) { bildir(hataMetni(h)); }
      return;
    }
    const fb = ev.target.closest('[data-form]');
    if (fb) { gonderiFormu(l.find(x => x.id === fb.dataset.form), fb.dataset.yon || 'gidis'); return; }
    const ib = ev.target.closest('[data-iade-gonder]');
    if (ib) {
      const k = l.find(x => x.id === ib.dataset.iadeGonder);
      const r = await iadeGonderPenceresi(k);
      if (!r) return;
      try {
        await kiraGuncelle(k, { durum: 'iade_yolda', iadeFirma: r.firma, iadeTakip: r.takip, iadeZaman: SIMDI(), guncelleme: SIMDI() }, 'durum:iade_yolda', r.firma + ' ' + r.takip);
        bildir('İade kaydedildi. Eşya sahibi teslim alınca depozito süreci başlar.'); sayfaCiz();
      } catch (h) { bildir(hataMetni(h)); }
      return;
    }
    const sb = ev.target.closest('[data-sorun]');
    if (sb) {
      const metin = (prompt('Sorunu kısaca yaz (ör. parça gelmedi, lekeli, yanlış beden). Ekip ve eşya sahibi görür:') || '').trim().slice(0, 300);
      if (!metin) return;
      try { await kiraGuncelle(l.find(x => x.id === sb.dataset.sorun), { teslimSorun: metin, sorunDurum: 'acik', guncelleme: SIMDI() }, 'sorun', metin); bildir('Sorun bildirildi; ekip inceleyecek.'); sayfaCiz(); }
      catch (h) { bildir(hataMetni(h)); }
      return;
    }
    const b = ev.target.closest('[data-gecis]'); if (!b) return;
    const k = l.find(x => x.id === b.dataset.id);
    const y = b.dataset.gecis;
    const veri = { durum: y, guncelleme: SIMDI() };
    if (y === 'onaylandi' && gorunum === 'sahip') {
      const cak = cakisanlar(k, l);
      if (cak.length) {
        alert('Bu tarihler aynı parçanın başka bir kiralamasıyla çakışıyor:\n' + cak.map(x => tarihYaz(x.baslangic) + ' → ' + tarihYaz(x.bitis) + ' · ' + x.kiraciAd + ' (' + DURUM[x.durum] + ')').join('\n') +
          '\n\nBu isteği reddet ya da kiracıyla farklı tarih için anlaşın.');
        return;
      }
      const tel = await onayPenceresi(k);
      if (!tel) return;
      veri.sahipIletisim = (tel + ' · ' + (kullanici.email || '')).slice(0, 200);
      veri.sahipSozlesme = SOZLESME_SURUM;
    }
    let iadeAdresi = null;
    if (y === 'kargoda') {
      const kg = await kargoPenceresi(k);
      if (!kg) return;
      veri.kargoFirma = kg.firma; veri.kargoTakip = kg.takip; veri.kargoZaman = SIMDI();
      iadeAdresi = kg.iadeAdres;
    }
    if (y === 'teslim_edildi') {
      if (!confirm('Parçayı teslim aldın ve sorunsuz mu? Onaylayınca eşya sahibinin ödemesi serbest kalır.')) return;
      veri.teslimOnay = 'kiraci';
    }
    if (y === 'iade_edildi' && gorunum === 'sahip') {
      const d = await iadePenceresi(k);
      if (!d) return;
      veri.iadeDurum = d;
    }
    let not = '';
    if (['iptal', 'reddedildi'].includes(y)) {
      const n = prompt(y === 'iptal' ? 'İptal nedeni (karşı taraf görür):' : 'Red nedeni (kiracı görür, ör. o tarihlerde müsait değil):', '');
      if (n === null) return;
      not = n.trim().slice(0, 200);
      const so = icerikSorunu(not); if (so) { bildir(so); return; }
      veri.iptalNeden = not;
    }
    if (veri.kargoFirma) not = veri.kargoFirma + ' ' + (veri.kargoTakip || '');
    if (veri.iadeDurum) not = IADE_AD[veri.iadeDurum];
    b.disabled = true;
    try {
      const ek = iadeAdresi !== null
        ? bt => { if (bt) bt.set(doc(db, 'dolapIadeAdres', k.id), { adres: iadeAdresi, sahipId: k.sahipId, kiraciId: k.kiraciId }); else (D.iadeAdres = D.iadeAdres || {})[k.id] = { adres: iadeAdresi }; }
        : veri.iadeDurum ? bt => { if (bt) bt.set(doc(db, 'dolapPuanlar', k.id), { kiraciId: k.kiraciId, kiraciAd: k.kiraciAd, sahipId: k.sahipId, esyaId: k.esyaId,
            esyaBaslik: k.esyaBaslik, bitis: k.bitis, iadeDurum: veri.iadeDurum, zaman: serverTimestamp() }); }
        : null;
      await kiraGuncelle(k, veri, 'durum:' + y, not, ek);
      if (veri.iadeDurum) { puanCache.delete(k.kiraciId); puanCache.delete(k.sahipId); }
      bildir('Güncellendi: ' + DURUM[y]); sayfaCiz();
    }
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

function iadePenceresi(k) {
  return new Promise(son => {
    const p = $('#pencere');
    p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">Parça nasıl geri geldi?</h2>' +
      '<p class="kucuk" style="margin-bottom:12px">' + esc(k.esyaBaslik) + ' · iade günü ' + tarihYaz(k.bitis) + ' · ' + esc(k.kiraciAd) + '</p>' +
      (k.iadeZaman && zaman(k.iadeZaman) ? '<p class="kucuk" style="margin-bottom:10px">Kiracı ' + tarihYaz(yerelGun(zaman(k.iadeZaman))) + ' tarihinde ' + esc(k.iadeFirma || '') + ' ile gönderdi' +
        (yerelGun(zaman(k.iadeZaman)) > k.bitis ? ' — <b class="eksi">iade gününden sonra</b>.' : ' — zamanında.') + '</p>' : '') +
      '<div class="iade-secim">' + Object.keys(IADE_AD).map(d =>
        '<label><input type="radio" name="iDurum" value="' + d + '"' + (d === (k.iadeZaman && zaman(k.iadeZaman) && yerelGun(zaman(k.iadeZaman)) > k.bitis ? 'gec' : 'sorunsuz') ? ' checked' : '') + '><span><b>' + IADE_AD[d] + '</b> <span class="kucuk">kiracıya ' + (PUAN[d] > 0 ? '+' : '') + PUAN[d] + ' sadakat puanı</span></span></label>').join('') + '</div>' +
      '<p class="kucuk" style="margin-top:10px">Geç ya da hasarlı iadede sözleşmedeki ücretler ayrıca geçerlidir; sorun yaşadıysan "Soru sor" ile ekibe de yaz.</p>' +
      '<div class="pencere-alt"><button type="button" class="dug" id="iVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="iTamam">İade aldım</button></div></div>';
    p.hidden = false; document.body.style.overflow = 'hidden';
    const bitir = deger => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; son(deger); };
    $('#iVazgec').onclick = () => bitir(null);
    p.onclick = ev => { if (ev.target === p) bitir(null); };
    $('#iTamam').onclick = () => bitir($('input[name="iDurum"]:checked').value);
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

/* İade adresi: eşya sahibi kargoya verirken girer (dolapIadeAdres/{kiraId}); kiracı parça kargoya çıkınca görür. */
async function iadeAdresGetir(id) {
  if (D) return (D.iadeAdres || {})[id] || null;
  const sn = await getDoc(doc(db, 'dolapIadeAdres', id));
  return sn.exists() ? sn.data() : null;
}
const adresYazi = a => [a.adSoyad, a.telefon, a.adres, a.ilce + ' / ' + a.il].filter(Boolean).join(' · ');
const yerelGun = t => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function iadeKargoHTML(k) {
  if (!k.iadeFirma) return '';
  return '<div class="kazanc">↩︎ İade: ' + esc(k.iadeFirma) + (k.iadeTakip ? ' · takip no <b>' + esc(k.iadeTakip) + '</b>' + takipLink(k.iadeFirma, k.iadeTakip) : '') +
    (k.iadeZaman && zaman(k.iadeZaman) ? ' · ' + tarihYaz(yerelGun(zaman(k.iadeZaman))) + ' gönderildi' : '') + '</div>';
}
/* Kiracı: işi bitince (erken de olabilir) iadeyi başlatır */
function iadeGonderPenceresi(k) {
  return new Promise(async son => {
    const p = $('#pencere');
    p.innerHTML = '<div class="pencere-ic"><p class="yukleniyor">Yükleniyor…</p></div>';
    p.hidden = false; document.body.style.overflow = 'hidden';
    let ia = null;
    try { ia = await iadeAdresGetir(k.id); } catch (h) {}
    const erken = bugun() < k.bitis;
    p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">Parçayı iade et</h2>' +
      '<p class="kucuk" style="margin-bottom:12px">' + esc(k.esyaBaslik) + ' · iade günü ' + tarihYaz(k.bitis) + '</p>' +
      (erken ? '<p class="uyari" style="margin-bottom:12px">İşin erken bittiyse iade edebilirsin. Kullanmadığın günlerin kira bedeli iade edilmez; depozito parça sağlam ulaşınca iade edilir.</p>' : '') +
      '<div class="kazanc" style="margin:0 0 12px"><b>İade adresi</b><br>' + esc(ia && ia.adres ? ia.adres : 'Eşya sahibi adres girmemiş; elden teslim için iletişim bilgisinden ulaş.') + '</div>' +
      '<div class="form-izgara"><div class="alan"><label for="iaFirma">Nasıl gönderiyorsun?</label><select id="iaFirma">' + KARGO_FIRMALARI.map(f => '<option>' + f + '</option>').join('') + '</select></div>' +
      '<div class="alan"><label for="iaTakip">Takip numarası</label><input id="iaTakip" maxlength="40" autocomplete="off"></div></div>' +
      '<p class="kucuk" style="margin-top:6px">Paketi kargoya verdikten sonra takip numarasıyla kaydet. Kargoya verdiğin gün iade günün sayılır; gecikme bedeli işlemez.</p>' +
      '<p class="hata" id="iaHata" role="alert"></p>' +
      '<div class="pencere-alt"><button type="button" class="dug" id="iaForm">İade gönderi formu</button><button type="button" class="dug" id="iaVazgec">Vazgeç</button>' +
        '<button type="button" class="dug dug-vurgu" id="iaTamam">İadeyi gönderdim</button></div></div>';
    const bitir = v => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; son(v); };
    $('#iaVazgec').onclick = () => bitir(null);
    $('#iaForm').onclick = () => gonderiFormu(k, 'iade');
    p.onclick = ev => { if (ev.target === p) bitir(null); };
    $('#iaTamam').onclick = () => {
      const firma = $('#iaFirma').value, takip = $('#iaTakip').value.trim().slice(0, 40);
      if (firma !== 'Elden teslim' && takip.length < 4) { $('#iaHata').textContent = 'Takip numarasını yaz (kargo fişinde yazar).'; return; }
      bitir({ firma, takip });
    };
  });
}
const KARGO_FIRMALARI = ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'PTT Kargo', 'Sürat Kargo', 'HepsiJet', 'Kolay Gelsin', 'Elden teslim', 'Diğer'];
function kargoBilgiHTML(k) {
  if (!k.kargoFirma) return '';
  return '<div class="kazanc">📦 ' + esc(k.kargoFirma) + (k.kargoTakip ? ' · takip no <b>' + esc(k.kargoTakip) + '</b>' + takipLink(k.kargoFirma, k.kargoTakip) : '') +
    (k.teslimOnay ? ' · <b class="arti">teslim alındı ✓' + (k.teslimOnay === 'admin' ? ' (site doğruladı)' : '') + '</b>' : '') + '</div>';
}
function kargoPenceresi(k) {
  return new Promise(son => {
    const p = $('#pencere');
    p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">Kargoya verdim</h2>' +
      '<p class="kucuk" style="margin-bottom:12px">' + esc(k.esyaBaslik) + ' · ' + refKod(k.id) + '</p>' +
      '<div class="form-izgara"><div class="alan"><label for="kgFirma">Kargo firması</label><select id="kgFirma">' + KARGO_FIRMALARI.map(f => '<option>' + f + '</option>').join('') + '</select></div>' +
      '<div class="alan"><label for="kgTakip">Takip numarası</label><input id="kgTakip" maxlength="40" autocomplete="off"></div>' +
      '<div class="alan tam"><label for="kgIade">İade adresin <span class="kucuk">(kiracı parçayı buraya geri gönderir; yalnız o görür)</span></label><select id="kgIade">' +
        ((uye && uye.adresler) || []).map((a, i) => '<option value="' + i + '">' + esc(a.baslik) + ' · ' + esc(a.ilce) + ' / ' + esc(a.il) + '</option>').join('') +
        '<option value="yeni">Yeni adres yaz</option><option value="elden">Elden teslim alacağım</option></select>' +
        '<textarea id="kgIadeYeni" maxlength="400" placeholder="Ad soyad, telefon, açık adres, ilçe / il"' + (((uye && uye.adresler) || []).length ? ' hidden' : '') + '></textarea></div></div>' +
      '<p class="hata" id="kgHata" role="alert"></p>' +
      '<div class="pencere-alt"><button type="button" class="dug" id="kgVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="kgTamam">Kaydet</button></div></div>';
    p.hidden = false; document.body.style.overflow = 'hidden';
    const bitir = v => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; son(v); };
    $('#kgVazgec').onclick = () => bitir(null);
    p.onclick = ev => { if (ev.target === p) bitir(null); };
    $('#kgIade').onchange = () => { $('#kgIadeYeni').hidden = $('#kgIade').value !== 'yeni'; };
    $('#kgTamam').onclick = () => {
      const firma = $('#kgFirma').value, takip = $('#kgTakip').value.trim().slice(0, 40), sec = $('#kgIade').value;
      const iadeAdres = (sec === 'elden' ? 'Elden teslim' : sec === 'yeni' ? $('#kgIadeYeni').value.trim() : adresYazi(uye.adresler[+sec])).slice(0, 400);
      if (firma !== 'Elden teslim' && takip.length < 4) { $('#kgHata').textContent = 'Takip numarasını yaz (kargo fişinde yazar).'; return; }
      if (sec === 'yeni' && iadeAdres.length < 10) { $('#kgHata').textContent = 'İade adresini yaz.'; return; }
      bitir({ firma, takip, iadeAdres });
    };
  });
}
/* Yazdırılabilir kargo gönderi formu: gönderen (eşya sahibi) ve alıcı (kiracı) adresiyle. Ödeme onaylandıktan sonra açılır. */
async function gonderiFormu(k, yon = 'gidis') {
  const pen = window.open('', '_blank');
  if (!pen) { bildir('Açılır pencere engellendi; tarayıcıda izin ver.'); return; }
  pen.document.write('<p style="font-family:Arial">Hazırlanıyor…</p>');
  let g = null, ia = null;
  try { g = await kiraGizliGetir(k.id); } catch (h) {}
  if (yon === 'iade') { try { ia = await iadeAdresGetir(k.id); } catch (h) {} }
  const a = ((uye && uye.adresler) || [])[0];
  const benimAdres = a ? [a.adSoyad, a.adres, a.ilce + ' / ' + a.il, 'Tel: ' + a.telefon] : [kullanici.displayName || '', '(Adresini elle yaz — Hesabım → Adreslerim\'e eklersen otomatik dolar)', ''];
  let gonderen = benimAdres, alici, tel;
  if (yon === 'iade') {
    if (g && g.adres && g.adres !== 'Elden teslim') gonderen = [k.kiraciAd, g.adres];
    alici = ia && ia.adres ? ia.adres : '(iade adresi girilmemiş)';
    tel = (k.sahipIletisim || '').split(' · ')[0];
  } else {
    alici = g && g.adres ? g.adres : '(adres görüntülenemedi)';
    tel = (k.kiraciIletisim || '').split(' · ')[0];
  }
  const x = v => esc(v || '');
  pen.document.open();
  pen.document.write('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Gönderi formu ' + refKod(k.id) + '</title><style>' +
    'body{font-family:Arial,sans-serif;margin:24px;color:#000}.etiket{border:2px solid #000;padding:20px;max-width:680px}' +
    'h1{font-size:17px;margin:0 0 6px}.ref{font-size:30px;font-weight:700;letter-spacing:3px;margin:6px 0 12px}' +
    '.k{border:1px solid #000;padding:10px 12px;margin:10px 0;font-size:15px;line-height:1.5}.k b.b{display:block;font-size:12px;letter-spacing:.1em}' +
    '.alt{font-size:12px;color:#333}button{margin-top:16px;padding:10px 18px;font-size:15px}@media print{button{display:none}body{margin:0}}</style></head><body>' +
    '<div class="etiket"><h1>Elif\'in Dolabı · ' + (yon === 'iade' ? 'İade gönderi formu' : 'Kargo gönderi formu') + '</h1><div class="alt">sersoz.com · Kiralık giyim eşyası gönderimi (satış değildir)</div>' +
    '<div class="ref">' + refKod(k.id) + '</div>' +
    '<div class="k"><b class="b">GÖNDEREN</b>' + gonderen.map(x).join('<br>') + '</div>' +
    '<div class="k"><b class="b">ALICI</b>' + x(alici) + (yon === 'iade' ? '' : '<br>' + x(k.kiraciAd)) + (tel ? ' · Tel: ' + x(tel) : '') + '</div>' +
    '<div class="k"><b class="b">İÇERİK</b>1 adet: ' + x(k.esyaBaslik) + '<br>Kiralama: ' + tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) +
      (yon === 'iade' ? ' · iade gönderisi' : ' · en geç ' + tarihYaz(k.baslangic) + ' tarihinde teslim edilmeli') + '</div>' +
    '<div class="alt">Bu formu kargo şubesinde gösterin ya da paketin üstüne yapıştırın. Gönderiden sonra takip numarasını sitede "Kargoya verdim" ile girin. ' +
    'Ödemeniz, kiracı parçayı sorunsuz teslim aldıktan sonra hesabınıza aktarılır.</div></div>' +
    '<button onclick="print()">Yazdır</button></body></html>');
  pen.document.close();
}
/* Kiracının ödeme kutusu: varsa kartla ödeme (Shopier linki, admin ekler), yoksa/ayrıca kopyala-yapıştır havale/FAST. */
function odemeKutusuHTML(k) {
  const h = AYAR.havale || {}, iban = (h.iban || '').replace(/\s+/g, '');
  const satir = (ad, deger, goster) => '<div class="kopya-satir"><span>' + ad + '</span><b>' + esc(goster || deger) + '</b>' +
    '<button type="button" class="dug dug-kucuk" data-kopya="' + esc(deger) + '">Kopyala</button></div>';
  const dokum = 'kira ' + tl(k.kira) + (k.indirim ? ' (sadakat indirimi düşüldü)' : '') + (k.hizmetBedeli ? ' + hizmet bedeli ' + tl(k.hizmetBedeli) : '') +
    (k.depozito ? ' + depozito ' + tl(k.depozito) + ' (parça sağlam dönünce iade edilir)' : '');
  return '<div class="odeme-kutu odeme-adim"><p class="odeme-baslik">Ödenecek tutar <b>' + tl(k.toplam) + '</b></p><p class="kucuk">' + dokum + '</p>' +
    (k.kartLink ? '<a class="dug dug-vurgu dug-tam" href="' + esc(k.kartLink) + '" target="_blank" rel="noopener" style="margin-top:12px">💳 Kartla öde</a>' +
      '<p class="kucuk" style="margin-top:6px">Güvenli ödeme sayfası Shopier\'de açılır; ödeyince buraya dönüp "Ödemeyi yaptım"a bas.</p>' +
      (iban ? '<p class="ayrac"><span>ya da havale / FAST</span></p>' : '') : '') +
    (iban ? '<ol class="adimlar"><li>Banka uygulamanda <b>Para gönder → IBAN\'a</b> seç.</li><li>Aşağıdakileri <b>Kopyala</b> ile alıp yapıştır.</li>' +
        '<li>Açıklamaya kodu yazmayı unutma, sonra burada <b>"Ödemeyi yaptım"</b> düğmesine bas.</li></ol>' +
        satir('Alıcı', h.hesapSahibi || '') + satir('IBAN', iban, h.iban) + satir('Tutar', String(k.toplam), tl(k.toplam)) + satir('Açıklama', refKod(k.id)) +
        '<p class="kucuk" style="margin-top:8px">FAST ile 7/24 birkaç saniyede ulaşır' + (h.banka ? ' · ' + esc(h.banka) : '') + '.</p>'
      : (k.kartLink ? '' : '<p style="margin-top:10px">Ödeme bilgilerini birazdan buraya ekleyeceğiz. Acelen varsa <a href="mailto:' + esc(AYAR.eposta) + '?subject=' +
          encodeURIComponent('Elif\'in Dolabı ödeme ' + refKod(k.id)) + '" style="text-decoration:underline">' + esc(AYAR.eposta) + '</a> adresine yaz.</p>')) +
    '<p class="kucuk" style="margin-top:8px">Ödemen kontrol edilince eşya sahibine haber verilir, parça kargoya çıkar. Eşya sahibine para, sen parçayı teslim aldığını onaylayınca geçer.</p></div>';
}
/* Kiralamanın hangi adımda olduğu */
const ADIMLAR = ['İstek', 'Ödeme', 'Hazırlanıyor', 'Kargoda', 'Sende', 'İade'];
function adimCubugu(d) {
  if (['reddedildi', 'iptal'].includes(d)) return '';
  const sira = { beklemede: 0, onaylandi: 1, odeme_bildirildi: 1, odendi: 2, kargoda: 3, teslim_edildi: 4, iade_yolda: 5, iade_edildi: 6 }[d] ?? 0;
  return '<ol class="adim-cubuk" aria-label="Kiralama adımları">' + ADIMLAR.map((a, i) =>
    '<li class="' + (i < sira ? 'bitti' : i === sira ? 'simdi' : '') + '"' + (i === sira ? ' aria-current="step"' : '') + '>' + a + '</li>').join('') + '</ol>';
}
/* ---------------------------------------------------------------- borç / alacak kayıtları (dolapBorclar)
 * Eksik/fazla ödeme, eksik komisyon, eksik aktarım gibi farklar. Yalnız admin açar/kapatır; kişi kendisininkini görür
 * ve borcunu ödediğini bildirebilir. */
const BORC_TUR = {
  kiraci_site: ['Kiracı → site', 'Kiracının siteye borcu'],
  sahip_site: ['Eşya sahibi → site', 'Eşya sahibinin siteye borcu'],
  site_sahip: ['Site → eşya sahibi', 'Sitenin eşya sahibine borcu'],
  site_kiraci: ['Site → kiracı', 'Sitenin kiracıya borcu']
};
const borcKod = id => 'BR-' + String(id).slice(0, 6).toUpperCase();
const kisiBorclu = b => b.tur === 'kiraci_site' || b.tur === 'sahip_site';
async function borcListesi(uid) {
  if (D) return (D.borclar || []).filter(b => !uid || b.kisiId === uid).map(b => ({ ...b }));
  const q = uid ? query(collection(db, 'dolapBorclar'), where('kisiId', '==', uid)) : collection(db, 'dolapBorclar');
  return (await getDocs(q)).docs.map(x => ({ id: x.id, ...x.data() }));
}
function borcKutuHTML(b) {
  const h = AYAR.havale || {};
  if (b.durum === 'kapandi') return '<div class="kazanc"><span class="kucuk">' + (kisiBorclu(b) ? 'Borcun' : 'Alacağın') + ' ' + tl(b.tutar) + ' (' + esc(b.neden) + ') kapandı ✓</span></div>';
  if (kisiBorclu(b)) return '<div class="gecikme"><b>Ödenmemiş borcun: ' + tl(b.tutar) + '</b> · ' + esc(b.neden) + '<br>' +
    (h.iban ? 'IBAN <b>' + esc(h.iban) + '</b> (' + esc(h.hesapSahibi || '') + ') · açıklamaya <b>' + borcKod(b.id) + '</b> yaz. '
      : 'Ödeme bilgisi için ' + esc(AYAR.eposta) + ' adresine yaz. ') +
    (b.bildirildi ? '<b>Ödediğini bildirdin; kontrol ediliyor.</b>' : '<button type="button" class="dug dug-kucuk" data-borc-odedim="' + esc(b.id) + '">Ödedim</button>') + '</div>';
  return '<div class="kazanc"><b>Sitenin sana borcu: ' + tl(b.tutar) + '</b> · ' + esc(b.neden) + ' · IBAN\'ına gönderilecek.' +
    (uye && uye.iban ? '' : ' <a href="#hesabim/odeme" style="text-decoration:underline">IBAN ekle</a>') + '</div>';
}
/* Kiracı ödemesini onayla: gelen tutar farklıysa aynı yazımda borç/alacak kaydı açılır. */
async function odemeOnayla(k, gelen) {
  const fark0 = k.toplam - gelen;
  const fark = k.toplam - gelen;
  const veri = { durum: 'odendi', odemeZaman: SIMDI(), alinanTutar: gelen, guncelleme: SIMDI() };
  const borc = fark ? { kiraId: k.id, esyaBaslik: k.esyaBaslik, tur: fark > 0 ? 'kiraci_site' : 'site_kiraci', kisiId: k.kiraciId, kisiAd: k.kiraciAd,
    tutar: Math.abs(fark), neden: (fark > 0 ? 'Eksik ödeme' : 'Fazla ödeme') + ' (beklenen ' + k.toplam + ' TL, gelen ' + gelen + ' TL)',
    durum: 'acik', bildirildi: false, olusturma: SIMDI(), yazan: kullanici.email } : null;
  await kiraGuncelle(k, veri, 'admin:odeme_onay', 'Gelen ' + gelen + ' TL' + (fark0 ? ' (fark ' + fark0 + ' TL)' : ''),
    borc ? (bt => (bt ? bt.set(doc(collection(db, 'dolapBorclar')), borc) : dbEkle('dolapBorclar', borc))) : null);
}
/* Ödeme geçmişi: kim boşsa yönetimin (site hesabı) bakışı, doluysa o kişinin bakışı. */
/* ---------------------------------------------------------------- kasa
 * Kasa = kasaya alınan site payları (hizmet + komisyon − indirim) + öne çıkarma gelirleri
 *        + kapanan borçlar − kapanan alacaklar + elle giriş − elle çıkış (dolapKasa, yalnız tam yetkili). */
async function kasaListesi() {
  if (D) return (D.kasa || []).map(x => ({ ...x }));
  return (await getDocs(collection(db, 'dolapKasa'))).docs.map(x => ({ id: x.id, ...x.data() }));
}
function kasaHesap(kl, borclar, boostlar, kasa) {
  const t = (dz, f) => dz.reduce((a, x) => a + (f(x) || 0), 0);
  const kom = t(kl.filter(k => k.komisyonAlindi), k => k.komisyonTutar ?? kiraHesap(k).site);
  const boost = t((boostlar || []).filter(b => b.durum === 'aktif'), b => b.fiyat);
  const borc = t(borclar.filter(b => b.durum === 'kapandi'), b => (kisiBorclu(b) ? b.tutar : -b.tutar));
  const elle = t(kasa, x => (x.tur === 'giris' ? x.tutar : -x.tutar));
  return { kom, boost, borc, elle, toplam: kom + boost + borc + elle };
}

function odemeOlaylari(kl, borclar, boostlar, kim, kasa = []) {
  const o = [];
  const ekle = (t, ad, tutar, yon, ref, not) => o.push({ t: t && zaman(t) ? zaman(t) : 0, ad, tutar, yon, ref, not });
  kl.forEach(k => {
    const kiraci = !kim || k.kiraciId === kim, sahip = !kim || k.sahipId === kim, ref = { baslik: k.esyaBaslik, kod: refKod(k.id) };
    if (kiraci && ['odendi', 'kargoda', 'teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(k.durum))
      ekle(k.odemeZaman, kim ? 'Kiralama ödemesi yaptın' : 'Kiracıdan ödeme alındı · ' + k.kiraciAd, k.alinanTutar || k.toplam, kim ? '-' : '+', ref);
    if (sahip && k.sahipOdeme === 'odendi')
      ekle(k.sahipOdemeZaman, kim ? 'Payın IBAN\'ına aktarıldı' : 'Eşya sahibine aktarıldı', kiraHesap(k).sahibe, kim ? '+' : '-', ref);
    if (kiraci && k.depozitoDurum) {
      const iade = (k.depozito || 0) - (k.depozitoKesinti || 0);
      if (iade > 0) ekle(k.depozitoZaman, kim ? 'Depozito iaden yapıldı' : 'Depozito iade edildi · ' + k.kiraciAd, iade, kim ? '+' : '-', ref);
      if (k.depozitoKesinti) ekle(k.depozitoZaman, 'Depozitodan kesildi', k.depozitoKesinti, '·', ref, k.depozitoNot);
    }
  });
  borclar.filter(b => b.durum === 'kapandi').forEach(b => {
    const kisiOdedi = kisiBorclu(b);
    ekle(b.kapanis, kim ? (kisiOdedi ? 'Borcunu ödedin' : 'Alacağın ödendi') : BORC_TUR[b.tur][0] + ' kapandı · ' + (b.kisiAd || ''),
      b.tutar, kim ? (kisiOdedi ? '-' : '+') : (kisiOdedi ? '+' : '-'), { baslik: b.esyaBaslik, kod: borcKod(b.id) }, b.neden);
  });
  (boostlar || []).filter(b => b.durum === 'aktif').forEach(b =>
    ekle(b.baslangic, kim ? 'Öne çıkarma paketi aldın' : 'Öne çıkarma geliri · ' + (b.sahipAd || ''), b.fiyat || 0, kim ? '-' : '+', { baslik: b.esyaBaslik, kod: '' }));
  if (!kim) {
    kl.filter(k => k.komisyonAlindi).forEach(k => ekle(k.komisyonZaman, 'Site payı kasaya alındı', k.komisyonTutar ?? kiraHesap(k).site, '·', { baslik: k.esyaBaslik, kod: refKod(k.id) }));
    kasa.forEach(x => ekle(x.olusturma, x.tur === 'giris' ? 'Kasaya elle giriş' : 'Kasadan çıkış', x.tutar, x.tur === 'giris' ? '+' : '-', { baslik: '', kod: '' }, x.aciklama));
  }
  return o.sort((a, b) => b.t - a.t);
}
function gecmisHTML(o) {
  if (!o.length) return '<p class="kucuk">Henüz ödeme hareketi yok.</p>';
  return '<div class="gecmis">' + o.slice(0, 200).map(x => '<div class="gecmis-satir"><span class="kucuk">' + (x.t ? tarihYaz(yerelGun(x.t)) : 'eski kayıt') + '</span>' +
    '<span>' + esc(x.ad) + '<span class="kucuk"> · ' + esc(x.ref.baslik || '') + (x.ref.kod ? ' · ' + x.ref.kod : '') + (x.not ? ' · ' + esc(x.not) : '') + '</span></span>' +
    '<b class="' + (x.yon === '+' ? 'arti' : x.yon === '-' ? 'eksi' : '') + '">' + (x.yon === '·' ? '' : x.yon) + tl(x.tutar) + '</b></div>').join('') + '</div>';
}

/* Eşya sahibinin payı. Kiracının ödemesi önce site hesabına gelir; sahibin payı ayrıca, teslimattan sonra aktarılır. */
function kazancHTML(k) {
  const h = kiraHesap(k), d = k.durum;
  const odemeGeldi = ['odendi', 'kargoda', 'teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(d);
  const teslimSonrasi = ['teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(d);
  const ibanYok = uye && uye.iban ? '' : ' <a href="#hesabim/odeme" style="text-decoration:underline">IBAN ekle</a>';
  const durum = k.sahipOdeme === 'odendi'
    ? '<b class="arti">✓ IBAN\'ına aktarıldı' + (k.sahipOdemeZaman && zaman(k.sahipOdemeZaman) ? ' · ' + tarihYaz(yerelGun(zaman(k.sahipOdemeZaman))) : '') + '</b>'
    : !odemeGeldi ? 'Kiracı ödeyince para site hesabında tutulur; parça kiracıya ulaşınca sana aktarılır.'
    : !teslimSonrasi ? 'Kiracının ödemesi site hesabında güvende. Kiracı parçayı teslim alınca sana aktarılır.'
    : k.komisyonAlindi ? '<b>Komisyon kesildi;</b> payın IBAN\'ına gönderilmek üzere.' + ibanYok
    : '<b>Henüz aktarılmadı.</b> Teslimat onaylandı; site komisyonu ayrıldıktan sonra payın IBAN\'ına gönderilecek.' + ibanYok;
  return '<div class="kazanc"><b>Senin payın: ' + tl(h.sahibe) + '</b> <span class="kucuk">(kira ' + tl(h.brut) +
    (h.komisyon ? ' − %' + k.komisyonYuzde + ' site komisyonu ' + tl(h.komisyon) : '') + ')</span><br><span class="kucuk">' + durum + '</span></div>';
}
function kiraSatiri(k, gorunum, borclar = []) {
  const d = k.durum;
  const gecis = (y, ad, sinif) => '<button type="button" class="dug dug-kucuk ' + (sinif || '') + '" data-id="' + esc(k.id) + '" data-gecis="' + y + '">' + ad + '</button>';
  let eylem = '', ek = '';
  const kesin = ['odendi', 'kargoda', 'teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(d);

  if (gorunum === 'kiraci') {
    if (d === 'beklemede') eylem = gecis('iptal', 'İsteği iptal et', 'dug-tehlike');
    if (d === 'onaylandi') {
      eylem = gecis('odeme_bildirildi', 'Ödemeyi yaptım', 'dug-vurgu') + gecis('iptal', 'İptal et', 'dug-tehlike');
      ek = odemeKutusuHTML(k);
    }
    if (d === 'odeme_bildirildi') ek = '<div class="odeme-kutu">Ödemen kontrol ediliyor. Onaylanınca eşya sahibinin iletişim bilgisi burada görünecek.</div>';
    if (kesin) ek = '<div class="iletisim">Eşya sahibi: <b>' + esc(k.sahipIletisim) + '</b> · Teslimi birlikte ayarlayın.</div>';
    if (d === 'kargoda') {
      eylem = gecis('teslim_edildi', 'Teslim aldım, sorunsuz', 'dug-vurgu') + '<button type="button" class="dug dug-kucuk dug-tehlike" data-sorun="' + esc(k.id) + '">Sorun bildir</button>';
      ek += kargoBilgiHTML(k) + '<div class="odeme-kutu">Parça eline ulaşınca kontrol et ve "Teslim aldım"a bas. Eşya sahibine ödeme ancak sen onaylayınca (ya da site teslimatı doğrulayınca) yapılır.</div>';
    }
    if (d === 'teslim_edildi') {
      eylem = '<button type="button" class="dug dug-kucuk dug-vurgu" data-iade-gonder="' + esc(k.id) + '">İade et</button>';
      ek += kargoBilgiHTML(k) + '<div class="odeme-kutu">İade günü <b>' + tarihYaz(k.bitis) + '</b>. İşin daha erken biterse hemen iade edebilirsin: "İade et"e bas, iade adresini ve gönderi formunu gör, kargoya verince takip numarasını gir.</div>';
    }
    if (d === 'iade_yolda') {
      eylem = '<button type="button" class="dug dug-kucuk" data-form="' + esc(k.id) + '" data-yon="iade">İade gönderi formu</button>';
      ek += iadeKargoHTML(k) + '<div class="odeme-kutu">İade yolda. Eşya sahibi teslim alınca depozito iadesi başlar.</div>';
    }
    if (k.teslimSorun) ek += '<div class="gecikme"><b>Bildirdiğin sorun:</b> ' + esc(k.teslimSorun) + ' · ' +
      (k.sorunDurum === 'cozuldu' ? '<b>Çözüldü</b>' + (k.sorunNot ? ': ' + esc(k.sorunNot) : '') : 'Ekip inceliyor.') + '</div>';
    if (d === 'iade_edildi' && k.depozito) ek += '<div class="kazanc">Depozito ' + tl(k.depozito) + ': ' +
      (k.depozitoDurum === 'iade' ? '<b class="arti">iade edildi ✓</b>'
        : k.depozitoDurum === 'kesinti' ? tl(k.depozito - (k.depozitoKesinti || 0)) + ' iade edildi, ' + tl(k.depozitoKesinti || 0) + ' kesildi' + (k.depozitoNot ? ' (' + esc(k.depozitoNot) + ')' : '')
        : 'iade sırada (Hesabım → Ödeme alacağım hesap\'a IBAN eklediğinden emin ol)') + '</div>';
  } else if (gorunum === 'sahip') {
    if (d === 'beklemede') eylem = gecis('onaylandi', 'Onayla', 'dug-vurgu') + gecis('reddedildi', 'Reddet', 'dug-tehlike');
    if (d === 'odendi') eylem = '<button type="button" class="dug dug-kucuk" data-form="' + esc(k.id) + '">Kargo gönderi formu</button>' + gecis('kargoda', 'Kargoya verdim', 'dug-vurgu');
    if (d === 'kargoda') eylem = '<button type="button" class="dug dug-kucuk" data-form="' + esc(k.id) + '">Gönderi formu</button>';
    if (d === 'teslim_edildi') eylem = gecis('iade_edildi', 'İade aldım', 'dug-vurgu');
    if (d === 'onaylandi') eylem = gecis('iptal', 'İptal et', 'dug-tehlike');
    if (d === 'onaylandi' || d === 'odeme_bildirildi') ek = '<div class="odeme-kutu">Kiracının ödemesi bekleniyor. Ödeme onaylanınca iletişim bilgisi ve teslimat adresi açılır.</div>';
    if (kesin) ek = '<div class="iletisim">Kiracı: <b>' + esc(k.kiraciAd) + '</b> · ' + esc(k.kiraciIletisim) +
      '<br>Teslimat adresi: <b data-adres="' + esc(k.id) + '">yükleniyor…</b></div>';
    if (d === 'odendi') ek += '<div class="odeme-kutu">Ödeme site hesabına geldi. Gönderi formunu yazdırıp parçayı kargoya ver, sonra "Kargoya verdim"e takip numarasıyla bas. Kazancın, kiracı parçayı sorunsuz teslim aldıktan sonra hesabına aktarılır.</div>';
    if (d === 'kargoda' || d === 'teslim_edildi') ek += kargoBilgiHTML(k);
    if (d === 'iade_yolda') { eylem = gecis('iade_edildi', 'İade aldım', 'dug-vurgu'); ek += iadeKargoHTML(k) + '<div class="odeme-kutu">Kiracı parçayı geri gönderdi. Eline ulaşınca kontrol et ve "İade aldım"a bas.</div>'; }
    if (k.teslimSorun) ek += '<div class="gecikme"><b>Kiracı sorun bildirdi:</b> ' + esc(k.teslimSorun) + ' · ' +
      (k.sorunDurum === 'cozuldu' ? '<b>Çözüldü</b>' + (k.sorunNot ? ': ' + esc(k.sorunNot) : '') : 'Ekip inceliyor; ödeme bu sırada bekletilir.') + '</div>';
    if (!['reddedildi', 'iptal'].includes(d)) ek += kazancHTML(k);
  } else if (gorunum === 'yonetim') {
    const taraf = kullanici && (k.kiraciId === kullanici.uid || k.sahipId === kullanici.uid);
    eylem = taraf && !tamMi() ? '<span class="kucuk eksi">Bu kiralamada tarafsın; onayı başka bir admin vermeli.</span>'
      : gecis('odendi', 'Ödeme geldi', 'dug-vurgu') + gecis('onaylandi', 'Ödeme bulunamadı');
    ek = '<div class="odeme-kutu">Referans: <b>' + refKod(k.id) + '</b> · Beklenen tutar: <b>' + tl(k.toplam) + '</b>' +
      (k.indirim ? ' (−' + tl(k.indirim) + ' sadakat indirimi dahil)' : '') +
      ' · Kiracı: <a href="#profil/' + esc(k.kiraciId) + '">' + esc(k.kiraciAd) + '</a> <span data-seviye="' + esc(k.kiraciId) + '" data-beyan="' + (+k.indirimYuzde || 0) + '"></span></div>';
  }

  ek += borclar.map(borcKutuHTML).join('');
  if (['reddedildi', 'iptal'].includes(d) && k.iptalNeden) ek += '<p class="kira-detay kucuk" style="grid-column:1/-1">Neden: ' + esc(k.iptalNeden) + '</p>';
  if (k.yonetimNot) ek += '<p class="kira-detay kucuk" style="grid-column:1/-1">Yönetim notu: ' + esc(k.yonetimNot) + '</p>';
  if (gorunum === 'yonetim') ek += '<p class="kira-detay kucuk" style="grid-column:1/-1"><a href="#yonetim/siparis/' + esc(k.id) + '" style="text-decoration:underline">Sipariş detayı ve işlem geçmişi →</a></p>';
  return '<div class="satir"><img class="k" src="' + esc(k.esyaFoto) + '" alt="">' +
    '<div><h3><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></h3>' + adimCubugu(d) +
      '<p class="kira-detay">' + tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) + ' · ' + k.gun + ' gün · <b>' + tl(k.toplam) + '</b></p>' +
      (gorunum === 'sahip' ? '<p class="kira-detay">Kiracı: <a href="#profil/' + esc(k.kiraciId) + '">' + esc(k.kiraciAd) + '</a> <span data-seviye="' + esc(k.kiraciId) + '"></span></p>' : '') +
      (gorunum === 'sahip' && k.indirim ? '<p class="kira-detay kucuk">Kiracıya %' + k.indirimYuzde + ' sadakat indirimi uygulandı; indirimi site karşılar, kazancın değişmez.</p>' : '') +
      (gorunum === 'kiraci' ? '<p class="kira-detay"><a href="#profil/' + esc(k.sahipId) + '">Eşya sahibinin profili</a></p>' : '') +
      (gorunum === 'sahip' && k.not ? '<p class="kira-detay">Not: ' + esc(k.not) + '</p>' : '') +
      '<p class="kira-detay"><span class="durum d-' + esc(d) + '">' + esc(DURUM[d] || d) + '</span> <span class="kucuk">' + refKod(k.id) +
        (d === 'iade_edildi' && IADE_AD[k.iadeDurum] ? ' · ' + IADE_AD[k.iadeDurum] : '') + '</span></p></div>' +
    '<div class="eylem">' + eylem + '</div>' + gecikmeHTML(k) + ek + '</div>';
}

/* ---------------------------------------------------------------- ÖNE ÇIKARMA (boost)
 * dolapBoostlar/{id}: { esyaId, esyaBaslik, esyaFoto, sahipId, sahipAd, paket, saat, fiyat,
 *   durum: odeme_bekliyor → odeme_bildirildi → aktif | reddedildi | iptal, baslangic, bitis, olusturma, guncelleme }
 * Admin ödemeyi onaylayınca süre başlar ve parçaya oneCikanBitis yazılır; Keşfet bunu en üste alır. */
const PAKETLER = (AYAR.oneCikarma && AYAR.oneCikarma.length ? AYAR.oneCikarma : [
  { paket: 'saatlik', ad: '1 saat', saat: 1, fiyat: 10 },
  { paket: 'gunluk', ad: '1 gün', saat: 24, fiyat: 39 },
  { paket: 'haftalik', ad: '1 hafta', saat: 168, fiyat: 149 },
  { paket: 'aylik', ad: '1 ay', saat: 720, fiyat: 399 }
]);
const BOOST_DURUM = { odeme_bekliyor: 'Ödeme bekleniyor', odeme_bildirildi: 'Ödeme kontrol ediliyor', aktif: 'Öne çıkarıldı', reddedildi: 'Reddedildi', iptal: 'İptal edildi' };
const oneCikanMi = e => !e.ornek && zaman(e.oneCikanBitis) > Date.now();
function kalanSure(ms) {
  const dk = Math.max(0, Math.round((ms - Date.now()) / 6e4));
  if (dk >= 1440) return Math.round(dk / 1440) + ' gün';
  if (dk >= 60) return Math.round(dk / 60) + ' saat';
  return dk + ' dk';
}
const ocKod = id => 'OC-' + String(id).replace(/^demo-/, '').slice(0, 6).toUpperCase();
async function boostListesi(alan, deger) {
  if (D) return (D.boostlar || []).filter(b => !alan || b[alan] === deger).map(b => ({ ...b }));
  const q = alan ? query(collection(db, 'dolapBoostlar'), where(alan, '==', deger)) : collection(db, 'dolapBoostlar');
  return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}
function odemeBilgisiHTML(tutar, kod) {
  const h = AYAR.havale || {};
  return '<b>Ödeme: ' + tl(tutar) + '</b><br>' +
    (h.iban ? 'Alıcı: ' + esc(h.hesapSahibi) + (h.banka ? ' · ' + esc(h.banka) : '') + '<br>IBAN: <span class="iban">' + esc(h.iban) + '</span><br>'
      : 'Banka bilgileri için <a href="mailto:' + esc(AYAR.eposta) + '?subject=' + encodeURIComponent('Öne çıkarma ödemesi ' + kod) + '" style="text-decoration:underline">' + esc(AYAR.eposta) + '</a> adresine yazın.<br>') +
    'Açıklamaya mutlaka <b>' + kod + '</b> yazın, ödeme geçince "Ödemeyi yaptım"a basın.';
}

/* Paket seçimi penceresi */
function oneCikarFormu(e) {
  if (rol === 'kisitli') { bildir('Hesabın kısıtlandı; öne çıkarma satın alamazsın.'); return; }
  const p = $('#pencere');
  p.innerHTML = '<div class="pencere-ic"><h2 id="pencereBas">★ Öne çıkar</h2>' +
    '<p class="kucuk" style="margin-bottom:14px"><b>' + esc(e.baslik) + '</b> Keşfet\'te en üstte, "Öne çıkan" rozetiyle gösterilir. Süre, ödemen onaylandığı anda başlar.</p>' +
    '<div class="paketler">' + PAKETLER.map((k, i) =>
      '<label class="paket"><input type="radio" name="paket" value="' + i + '"' + (i === 1 ? ' checked' : '') + '><span class="paket-ad">' + esc(k.ad) + '</span>' +
      '<span class="paket-fiyat">' + tl(k.fiyat) + '</span><span class="kucuk">' + (k.saat >= 24 ? tl(Math.round(k.fiyat / (k.saat / 24))) + ' / gün' : 'Kısa kampanya') + '</span></label>').join('') + '</div>' +
    '<p class="hata" id="ocHata" role="alert"></p>' +
    '<div class="pencere-alt"><button type="button" class="dug" id="ocVazgec">Vazgeç</button><button type="button" class="dug dug-vurgu" id="ocTamam">Devam et</button></div></div>';
  p.hidden = false; document.body.style.overflow = 'hidden';
  const kapat = () => { p.hidden = true; p.innerHTML = ''; document.body.style.overflow = ''; };
  $('#ocVazgec').onclick = kapat;
  p.onclick = ev => { if (ev.target === p) kapat(); };
  $('#ocTamam').onclick = async () => {
    const k = PAKETLER[+p.querySelector('input[name=paket]:checked').value];
    const dug = $('#ocTamam'); dug.disabled = true;
    try {
      await dbEkle('dolapBoostlar', {
        esyaId: e.id, esyaBaslik: e.baslik.slice(0, 80), esyaFoto: kapakFoto(e), sahipId: kullanici.uid,
        sahipAd: (kullanici.displayName || '').slice(0, 80), paket: k.paket, saat: k.saat, fiyat: k.fiyat,
        durum: 'odeme_bekliyor', baslangic: null, bitis: null, olusturma: SIMDI(), guncelleme: SIMDI()
      });
      kapat();
      bildir('Talep oluşturuldu. Ödeme bilgileri Dolabım\'ın üstünde.');
      sayfaCiz();
    } catch (h) { $('#ocHata').textContent = hataMetni(h); dug.disabled = false; }
  };
}

/* Dolabım'ın üstünde: öne çıkarma taleplerim */
async function boostlarimHTML() {
  let l;
  try { l = (await boostListesi('sahipId', kullanici.uid)).filter(b => b.durum !== 'iptal' && !(b.durum === 'aktif' && zaman(b.bitis) < Date.now() - 864e5)); }
  catch (e) { return ''; }
  if (!l.length) return '';
  l.sort((a, b) => zaman(b.guncelleme) - zaman(a.guncelleme));
  return '<section class="kutu" style="margin:0 0 18px"><h2>★ Öne çıkarmalarım</h2><div class="liste">' + l.map(b => {
    const aktif = b.durum === 'aktif' && zaman(b.bitis) > Date.now();
    return '<div class="satir"><img class="k" src="' + esc(b.esyaFoto) + '" alt=""><div><h3>' + esc(b.esyaBaslik) + '</h3>' +
      '<p class="kira-detay">' + esc((PAKETLER.find(k => k.paket === b.paket) || {}).ad || b.paket) + ' · <b>' + tl(b.fiyat) + '</b> · <span class="kucuk">' + ocKod(b.id) + '</span></p>' +
      '<p class="kira-detay"><span class="durum ' + (aktif ? 'd-onaylandi' : b.durum === 'reddedildi' ? 'd-reddedildi' : b.durum === 'aktif' ? '' : 'd-beklemede') + '">' +
        (aktif ? '★ Öne çıkan · ' + kalanSure(zaman(b.bitis)) + ' kaldı' : b.durum === 'aktif' ? 'Süresi doldu' : BOOST_DURUM[b.durum]) + '</span></p></div>' +
      '<div class="eylem">' + (b.durum === 'odeme_bekliyor' ? '<button type="button" class="dug dug-kucuk dug-vurgu" data-oc="odeme_bildirildi" data-oc-id="' + esc(b.id) + '">Ödemeyi yaptım</button>' +
        '<button type="button" class="dug dug-kucuk dug-tehlike" data-oc="iptal" data-oc-id="' + esc(b.id) + '">İptal</button>' : '') + '</div>' +
      (b.durum === 'odeme_bekliyor' ? '<div class="odeme-kutu">' + odemeBilgisiHTML(b.fiyat, ocKod(b.id)) + '</div>' : '') +
      (b.durum === 'odeme_bildirildi' ? '<div class="odeme-kutu">Ödemen kontrol ediliyor. Onaylandığı anda süre başlar.</div>' : '') +
      '</div>';
  }).join('') + '</div></section>';
}
async function boostDurum(id, y) {
  try { await dbGuncelle('dolapBoostlar', id, { durum: y, guncelleme: SIMDI() }); bildir(BOOST_DURUM[y]); sayfaCiz(); }
  catch (h) { bildir(hataMetni(h)); }
}

/* Panel: öne çıkarma ödemeleri ve aktif paketler */
async function panelOneCikar(panel, istek) {
  const l = await boostListesi();
  if (istek !== aktifIstek) return;
  const bekleyen = l.filter(b => b.durum === 'odeme_bildirildi').sort((a, b) => zaman(a.guncelleme) - zaman(b.guncelleme));
  const aktif = l.filter(b => b.durum === 'aktif' && zaman(b.bitis) > Date.now()).sort((a, b) => zaman(a.bitis) - zaman(b.bitis));
  const odemeYok = l.filter(b => b.durum === 'odeme_bekliyor');
  const ciro = l.filter(b => b.durum === 'aktif').reduce((t, b) => t + (b.fiyat || 0), 0);
  const satir = (b, eylem, alt) => '<div class="satir"><img class="k" src="' + esc(b.esyaFoto) + '" alt=""><div><h3><a href="#esya/' + esc(b.esyaId) + '">' + esc(b.esyaBaslik) + '</a></h3>' +
    '<p class="kira-detay">' + esc(b.sahipAd) + ' · ' + esc((PAKETLER.find(k => k.paket === b.paket) || {}).ad || b.paket) + ' · <b>' + tl(b.fiyat) + '</b> · <span class="kucuk">' + ocKod(b.id) + '</span></p>' +
    (alt ? '<p class="kira-detay">' + alt + '</p>' : '') + '</div><div class="eylem">' + eylem + '</div></div>';
  panel.innerHTML =
    '<div class="sayaclar">' + [['Ödeme onayı bekleyen', bekleyen.length], ['Şu an öne çıkan', aktif.length], ['Ödeme yapılmamış', odemeYok.length], ['Toplam gelir', tl(ciro)]]
      .map(([a, s]) => '<div class="sayac"><b>' + s + '</b><span>' + a + '</span></div>').join('') + '</div>' +
    '<section class="kutu"><h2>Ödeme onayı bekleyenler</h2>' + (bekleyen.length ? '<div class="liste">' + bekleyen.map(b => satir(b,
      '<button type="button" class="dug dug-kucuk dug-vurgu" data-baslat="' + esc(b.id) + '">Ödeme geldi, başlat</button>' +
      '<button type="button" class="dug dug-kucuk" data-odemeyok="' + esc(b.id) + '">Ödeme bulunamadı</button>' +
      '<button type="button" class="dug dug-kucuk dug-tehlike" data-boostred="' + esc(b.id) + '">Reddet</button>')).join('') + '</div>'
      : '<p class="kucuk">Bekleyen ödeme yok.</p>') + '</section>' +
    '<section class="kutu"><h2>Şu an öne çıkan parçalar</h2>' + (aktif.length ? '<div class="liste">' + aktif.map(b => satir(b, '',
      '<span class="durum d-onaylandi">★ ' + kalanSure(zaman(b.bitis)) + ' kaldı</span> <span class="kucuk">bitiş ' + tarihSaat(b.bitis) + '</span>')).join('') + '</div>'
      : '<p class="kucuk">Şu an öne çıkarılmış parça yok.</p>') + '</section>' +
    '<p class="kucuk" style="margin-top:12px">Paket fiyatları ayarlar.js → oneCikarma. Referans kodu (OC-…) havale açıklamasında olmalı.</p>';
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-baslat],[data-odemeyok],[data-boostred]'); if (!b) return;
    const k = l.find(x => x.id === (b.dataset.baslat || b.dataset.odemeyok || b.dataset.boostred));
    try {
      if (b.dataset.baslat) {
        const bitisMs = Date.now() + k.saat * 36e5;
        const bitis = DEMO ? { toMillis: () => bitisMs } : Timestamp.fromMillis(bitisMs);
        if (DEMO) {
          await dbGuncelle('dolapBoostlar', k.id, { durum: 'aktif', baslangic: SIMDI(), bitis, guncelleme: SIMDI() });
          await dbGuncelle('dolapEsyalar', k.esyaId, { oneCikanBitis: bitis });
        } else {
          const t = writeBatch(db);
          t.update(doc(db, 'dolapBoostlar', k.id), { durum: 'aktif', baslangic: serverTimestamp(), bitis, guncelleme: serverTimestamp() });
          t.update(doc(db, 'dolapEsyalar', k.esyaId), { oneCikanBitis: bitis });
          await t.commit();
        }
        bildir('Başlatıldı: ' + k.esyaBaslik + ' · ' + kalanSure(bitisMs));
      }
      if (b.dataset.odemeyok) await dbGuncelle('dolapBoostlar', k.id, { durum: 'odeme_bekliyor', guncelleme: SIMDI() });
      if (b.dataset.boostred) { if (!confirm('Talep reddedilsin mi?')) return; await dbGuncelle('dolapBoostlar', k.id, { durum: 'reddedildi', guncelleme: SIMDI() }); }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

/* ---------------------------------------------------------------- YÖNETİM PANELİ (#yonetim/...) */
const SAYFA_AD = { kesfet: 'Keşfet', esya: 'Parça sayfası', dolabim: 'Dolabım', kiralamalar: 'Kiralamalarım', hesabim: 'Hesabım', yonetim: 'Yönetim', profil: 'Profil', sepet: 'Sepetim', favoriler: 'Favorilerim' };

/* ---------------------------------------------------------------- SİPARİŞ YÖNETİMİ (yönetim) */
const KONTROL_LISTESI = [
  ['İstek', ['Fiyat, depozito, gün ve toplam veritabanı kuralıyla ilanla karşılaştırılır; kiracı tutarı değiştiremez.',
    'Kiracı aynı parça ve tarihler için ikinci istek açamaz.', 'Sözleşme her iki tarafa ayrı ayrı onaylatılır (v1).',
    'Kiralama notunda telefon, e-posta, yönlendirme ve küfür engellenir.', 'Kısıtlı hesaplar istek açamaz.']],
  ['Onay', ['Eşya sahibi, aynı parçanın onaylı/süren kiralamasıyla çakışan tarihleri onaylayamaz.', 'Red ve iptal gerekçesiyle yapılır, karşı taraf görür.',
    'Eşya sahibi ödeme öncesi, kiracı ödeme öncesi iptal edebilir; sonrası yalnız yönetim.']],
  ['Ödeme', ['Ödemeyi yalnız yönetim onaylar; gelen tutar girilir, fark otomatik borç/alacak kaydı olur.',
    'Kiralamaya taraf olan admin kendi ödemesini onaylayamaz (tam yetkili hariç).', 'İletişim bilgisi ve teslimat adresi yalnız ödeme onayından sonra eşya sahibine açılır.',
    'Kart ödemesi için Shopier linki yalnız yönetimden eklenir.']],
  ['Kargo ve teslim', ['Eşya sahibi kargo firması ve takip numarasıyla kargoya verir; iade adresini girer.',
    'Kiracı "Teslim aldım" der ya da sorun bildirir; yönetim kargo takibinden doğrulayabilir.', 'Takip numarasından kargo firmasının sayfasına bağlantı.']],
  ['İade', ['Kiracı iadeyi kendisi başlatır (erken iade olabilir); gönderim günü iade günü sayılır.', 'Geç gönderimde "Geç iade" otomatik seçilir, depozito kesintisinde gecikme bedeli önerilir.',
    'İade durumu (sorunsuz / geç / hasarlı) sadakat puanını belirler.']],
  ['Para', ['Eşya sahibine ödeme: teslim onayı + komisyonun kasaya alınması + açık sorun olmaması şartı (kural düzeyinde).',
    'Depozito iadesi/kesintisi gerekçesiyle yönetimden; kiracı nedeni görür.', 'Kasa: site payları, öne çıkarma, borç/alacak, elle giriş/çıkış.',
    'Tüm para hareketleri ödeme geçmişinde; CSV dışa aktarım.']],
  ['Yönetim denetimi', ['Her değişiklik kim/rol/zaman ile işlem geçmişine yazılır; silinemez.', 'Yönetim gerekçe yazarak durumu değiştirebilir, siparişi iptal edebilir (ödenmişse iade alacağı açılır).',
    'Sorunlar yönetimce "çözüldü" kapatılır; taraflar çözüm notunu görür.', 'Siparişe yalnız yönetimin gördüğü iç notlar.',
    'Dikkat listesi: yanıtsız istek, ödenmeyen onay, geciken onay/kargo/teslim/iade, açık sorun, bekleyen ödeme ve depozito, tarih çakışması.']]
];
const KONTROL_LISTESI_HTML = '<div class="kontrol-liste">' + KONTROL_LISTESI.map(([b, l]) => '<div><b>' + b + '</b><ul>' + l.map(x => '<li>✓ ' + x + '</li>').join('') + '</ul></div>').join('') + '</div>';
function siparisUyarilari(k, l) {
  const u = [], saat = t => (Date.now() - (zaman(t) || Date.now())) / 36e5, d = k.durum, bg = bugun();
  if (d === 'beklemede' && saat(k.olusturma) > 48) u.push('Eşya sahibi 2 gündür yanıt vermedi');
  if (d === 'onaylandi' && saat(k.guncelleme) > 48) u.push('Kiracı 2 gündür ödeme yapmadı');
  if (d === 'odeme_bildirildi' && saat(k.guncelleme) > 24) u.push('Ödeme onayı 24 saati geçti');
  if (['beklemede', 'onaylandi', 'odeme_bildirildi'].includes(d) && k.baslangic < bg) u.push('Başlangıç tarihi geçti');
  if (d === 'odendi' && saat(k.odemeZaman || k.guncelleme) > 48) u.push('2 gündür kargoya verilmedi');
  if (d === 'kargoda' && saat(k.kargoZaman || k.guncelleme) > 120) u.push('5 gündür kargoda, teslim onayı yok');
  if (d === 'teslim_edildi' && bg > k.bitis) u.push('İade ' + gunFarki(k.bitis, bg) + ' gün gecikti');
  if (d === 'iade_yolda' && saat(k.iadeZaman || k.guncelleme) > 120) u.push('İade 5 gündür yolda');
  if (k.teslimSorun && k.sorunDurum !== 'cozuldu') u.push('Açık sorun: ' + String(k.teslimSorun).slice(0, 60));
  if (['teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(d) && k.sahipOdeme !== 'odendi') u.push(k.komisyonAlindi ? 'Eşya sahibine ödeme bekliyor' : 'Komisyon kasaya alınmadı');
  if (d === 'iade_edildi' && k.depozito && !k.depozitoDurum) u.push('Depozito iadesi bekliyor');
  if (AKTIF_DURUM.includes(d) && cakisanlar(k, l).length) u.push('Aynı parça için tarih çakışması');
  return u;
}
function csvIndir(l, ad) {
  const bas = ['Ref', 'Durum', 'Parça', 'Kiracı', 'Eşya sahibi', 'Başlangıç', 'Bitiş', 'Gün', 'Kira (indirimsiz)', 'Sadakat indirimi', 'Hizmet bedeli', 'Depozito', 'Toplam',
    'Gelen tutar', 'Site payı', 'Sahibe', 'Komisyon kasada', 'Sahibe ödendi', 'Depozito durumu', 'Depozito kesintisi', 'Kargo', 'İade kargo', 'Sorun', 'Oluşturma'];
  const rows = l.map(k => { const h = kiraHesap(k); return [refKod(k.id), DURUM[k.durum] || k.durum, k.esyaBaslik, k.kiraciAd, ad[k.sahipId] || '', k.baslangic, k.bitis, k.gun,
    h.brut, h.indirim, h.hizmet, k.depozito || 0, k.toplam, k.alinanTutar || '', h.site, h.sahibe, k.komisyonAlindi ? 'evet' : 'hayır', k.sahipOdeme === 'odendi' ? 'evet' : 'hayır',
    k.depozitoDurum || '', k.depozitoKesinti || 0, [k.kargoFirma, k.kargoTakip].filter(Boolean).join(' '), [k.iadeFirma, k.iadeTakip].filter(Boolean).join(' '), k.teslimSorun || '',
    zaman(k.olusturma) ? new Date(zaman(k.olusturma)).toLocaleString('tr-TR') : '']; });
  const csv = '﻿' + [bas].concat(rows).map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'siparisler-' + bugun() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
let sipFiltre = { durum: 'dikkat', ara: '' };
async function panelSiparisler(panel, istek) {
  const [l, uyeler] = await Promise.all([tumKiralamalar(), uyeListesi().catch(() => [])]);
  if (istek !== aktifIstek) return;
  const ad = Object.fromEntries(uyeler.map(u => [u.uid, u.ad]));
  l.sort((a, b) => (zaman(b.guncelleme) || zaman(b.olusturma) || 0) - (zaman(a.guncelleme) || zaman(a.olusturma) || 0));
  const uy = new Map(l.map(k => [k.id, siparisUyarilari(k, l)]));
  const sayi = x => x === 'tumu' ? l.length : x === 'dikkat' ? l.filter(k => uy.get(k.id).length).length : l.filter(k => k.durum === x).length;
  const filtreler = [['dikkat', '⚠ Dikkat'], ['tumu', 'Tümü']].concat(Object.keys(DURUM).map(x => [x, DURUM[x]])).filter(([x]) => x === 'dikkat' || x === 'tumu' || sayi(x));
  panel.innerHTML = '<div class="sip-ust"><input id="sipAra" type="search" placeholder="Ref kodu, parça, kiracı ya da eşya sahibi ara" value="' + esc(sipFiltre.ara) + '">' +
      '<button type="button" class="dug dug-kucuk" id="sipCsv">CSV indir</button></div>' +
    '<div class="sip-filtre">' + filtreler.map(([x, a]) => '<button type="button" class="cip" data-sf="' + x + '">' + a + ' <span class="kucuk">' + sayi(x) + '</span></button>').join('') + '</div>' +
    '<p class="kucuk" id="sipSay" style="margin:8px 0"></p><div class="sip-liste" id="sipListe"></div>' +
    '<details class="sip-kontrol kutu"><summary><b>Kontrol listesi</b> · sistem siparişte neleri denetliyor?</summary>' + KONTROL_LISTESI_HTML + '</details>';
  const ciz = () => {
    const q = trAscii(sipFiltre.ara.trim());
    const f = l.filter(k => (sipFiltre.durum === 'tumu' || (sipFiltre.durum === 'dikkat' ? uy.get(k.id).length : k.durum === sipFiltre.durum))
      && (!q || trAscii([refKod(k.id), k.esyaBaslik, k.kiraciAd, ad[k.sahipId] || ''].join(' ')).includes(q)));
    $('#sipListe').innerHTML = f.length ? f.map(k => '<a class="sip-satir" href="#yonetim/siparis/' + esc(k.id) + '">' +
      '<span><b>' + refKod(k.id) + '</b><small>' + esc(k.esyaBaslik) + '</small></span>' +
      '<span>' + esc(k.kiraciAd) + '<small>→ ' + esc(ad[k.sahipId] || 'Eşya sahibi') + '</small></span>' +
      '<span>' + tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) + '<small>' + k.gun + ' gün · ' + tl(k.toplam) + '</small></span>' +
      '<span><span class="durum d-' + esc(k.durum) + '">' + esc(DURUM[k.durum] || k.durum) + '</span>' +
        (uy.get(k.id).length ? '<small class="eksi">⚠ ' + esc(uy.get(k.id).join(' · ')) + '</small>' : '') + '</span></a>').join('')
      : '<p class="kucuk" style="padding:12px 0">' + (sipFiltre.durum === 'dikkat' ? '✓ Dikkat isteyen sipariş yok.' : 'Bu filtreye uyan sipariş yok.') + '</p>';
    $('#sipSay').textContent = f.length + ' sipariş';
    panel.querySelectorAll('[data-sf]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sf === sipFiltre.durum)));
  };
  ciz();
  $('#sipAra').oninput = ev => { sipFiltre.ara = ev.target.value; ciz(); };
  panel.onclick = ev => {
    const b = ev.target.closest('[data-sf]'); if (b) { sipFiltre.durum = b.dataset.sf; ciz(); return; }
    if (ev.target.id === 'sipCsv') csvIndir(l, ad);
  };
}
const LOG_AD = { olusturuldu: 'İstek oluşturuldu', sorun: 'Sorun bildirildi', 'admin:odeme_onay': 'Ödeme onaylandı', 'admin:odeme_bulunamadi': 'Ödeme bulunamadı',
  'admin:kart_link': 'Kart ödeme linki', 'admin:komisyon': 'Site payı kasaya alındı', 'admin:teslim': 'Teslim yönetimce doğrulandı', 'admin:sahip_odeme': 'Eşya sahibine ödendi',
  'admin:depozito_iade': 'Depozito iade edildi', 'admin:depozito_kesinti': 'Depozitodan kesinti', 'admin:durum': 'Durum yönetimce değiştirildi',
  'admin:iptal': 'Sipariş yönetimce iptal edildi', 'admin:sorun_cozuldu': 'Sorun çözüldü' };
const ROL_TR = { kiraci: 'kiracı', sahip: 'eşya sahibi', admin: 'yönetim' };
const logAd = x => (LOG_AD[x.olay] || (String(x.olay).startsWith('durum:') ? (DURUM[x.olay.slice(6)] || x.olay) : x.olay)) + (x.metin ? ' · ' + x.metin : '');
async function kiraNotlari(id) {
  if (D) return (D.kiraNot || []).filter(x => x.kiraId === id);
  return (await getDocs(query(collection(db, 'dolapKiraNot'), where('kiraId', '==', id)))).docs.map(x => ({ id: x.id, ...x.data() }));
}
async function panelSiparis(panel, id, istek) {
  let k = null;
  if (D) { const x = D.kiralamalar.find(y => y.id === id); k = x ? { ...x } : null; }
  else { const sn = await getDoc(doc(db, 'dolapKiralamalar', id)); k = sn.exists() ? { id: sn.id, ...sn.data() } : null; }
  if (istek !== aktifIstek) return;
  if (!k) { panel.innerHTML = '<div class="bos"><h3>Sipariş bulunamadı</h3><a class="dug" href="#yonetim/siparisler">Siparişlere dön</a></div>'; return; }
  const [loglar, notlar, gizli, iadeA, sahip, kiraci, borclar, ayni] = await Promise.all([
    kiraLoglari(id).catch(() => []), kiraNotlari(id).catch(() => []), kiraGizliGetir(id).catch(() => null), iadeAdresGetir(id).catch(() => null),
    uyeGetir(k.sahipId).catch(() => null), uyeGetir(k.kiraciId).catch(() => null), borcListesi().then(b => b.filter(x => x.kiraId === id)).catch(() => []),
    kiraListesi('esyaId', k.esyaId).catch(() => [])]);
  if (istek !== aktifIstek) return;
  const h = kiraHesap(k), uyar = siparisUyarilari(k, ayni), cak = cakisanlar(k, ayni);
  const taraf = kullanici.uid === k.kiraciId || kullanici.uid === k.sahipId, yetki = tamMi() || !taraf;
  const satir = (a, b) => '<div class="sd-satir"><span>' + a + '</span><b>' + b + '</b></div>';
  const iban = u => u && u.iban ? esc(u.ibanAd || '') + ' · <span class="iban">' + esc(u.iban) + '</span>' : '<span class="eksi">eklenmemiş</span>';
  let olaylar = loglar.map(x => ({ t: zaman(x.zaman), metin: logAd(x), kim: (x.kimAd || '') + ' (' + (ROL_TR[x.rol] || x.rol) + ')' }));
  if (!loglar.length) {
    [['olusturma', 'İstek oluşturuldu'], ['odemeZaman', 'Ödeme onaylandı'], ['kargoZaman', 'Kargoya verildi'], ['iadeZaman', 'İade kargoya verildi'],
     ['komisyonZaman', 'Site payı kasaya alındı'], ['sahipOdemeZaman', 'Eşya sahibine ödendi'], ['depozitoZaman', 'Depozito işlemi']]
      .forEach(([f, a]) => { if (zaman(k[f])) olaylar.push({ t: zaman(k[f]), metin: a, kim: '' }); });
    olaylar.push({ t: 0, metin: 'Bu sipariş işlem kaydı tutulmaya başlamadan önce oluşturuldu; yukarıdakiler kayıttaki tarihlerden türetildi.', kim: '' });
  }
  olaylar.sort((a, b) => (a.t || 9e15) - (b.t || 9e15));
  const tarihSaatKisa = t => t ? new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  panel.innerHTML = '<p class="kucuk" style="margin-bottom:12px"><a href="#yonetim/siparisler">← Siparişler</a></p>' +
    '<div class="sd-bas"><div><h2>' + refKod(k.id) + ' · <a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></h2>' + adimCubugu(k.durum) + '</div>' +
      '<span class="durum d-' + esc(k.durum) + '">' + esc(DURUM[k.durum] || k.durum) + '</span></div>' +
    (uyar.length ? '<div class="gecikme" style="margin-bottom:14px"><b>Dikkat:</b> ' + uyar.map(esc).join(' · ') + '</div>' : '<p class="kucuk arti" style="margin-bottom:14px">✓ Bu siparişte bekleyen bir sorun yok.</p>') +
    '<div class="sd-izgara">' +
      '<section class="kutu"><h3>Taraflar</h3>' +
        satir('Kiracı', '<a href="#profil/' + esc(k.kiraciId) + '">' + esc(k.kiraciAd) + '</a> · <a href="#yonetim/kisi/' + esc(k.kiraciId) + '">kişi kaydı</a> <span data-seviye="' + esc(k.kiraciId) + '"></span>') +
        satir('Kiracı iletişim', esc(k.kiraciIletisim || '—')) + satir('Teslimat adresi', esc((gizli && gizli.adres) || '—')) + satir('Kiracı IBAN (depozito)', iban(kiraci)) +
        satir('Eşya sahibi', '<a href="#profil/' + esc(k.sahipId) + '">' + esc((sahip && sahip.ad) || 'Eşya sahibi') + '</a> · <a href="#yonetim/kisi/' + esc(k.sahipId) + '">kişi kaydı</a>') +
        satir('Sahip iletişim', esc(k.sahipIletisim || '—')) + satir('İade adresi', esc((iadeA && iadeA.adres) || '—')) + satir('Sahip IBAN', iban(sahip)) + '</section>' +
      '<section class="kutu"><h3>Tutarlar</h3>' +
        satir('Tarihler', tarihYaz(k.baslangic) + ' → ' + tarihYaz(k.bitis) + ' · ' + k.gun + ' gün') + satir('Kira (indirimsiz)', tl(h.brut)) +
        (h.indirim ? satir('Sadakat indirimi (site öder)', '−' + tl(h.indirim)) : '') + satir('Hizmet bedeli', tl(h.hizmet)) + satir('Depozito', tl(k.depozito || 0)) +
        satir('Kiracının ödeyeceği', tl(k.toplam)) + satir('Gelen tutar', k.alinanTutar ? tl(k.alinanTutar) : '—') +
        satir('Site payı', tl(h.site) + (k.komisyonAlindi ? ' <span class="arti">✓ kasada</span>' : '')) +
        satir('Eşya sahibine', tl(h.sahibe) + (k.sahipOdeme === 'odendi' ? ' <span class="arti">✓ ödendi</span>' : '')) +
        satir('Depozito durumu', k.depozitoDurum ? (k.depozitoDurum === 'iade' ? 'tamamı iade edildi' : tl(k.depozitoKesinti || 0) + ' kesildi · ' + esc(k.depozitoNot || '')) : '—') +
        borclar.map(b => satir(BORC_TUR[b.tur][0], tl(b.tutar) + ' · ' + esc(b.neden) + ' · ' + (b.durum === 'kapandi' ? 'kapandı' : '<b class="eksi">açık</b>'))).join('') + '</section>' +
      '<section class="kutu"><h3>Kargo, teslim, iade</h3>' +
        satir('Gidiş kargosu', k.kargoFirma ? esc(k.kargoFirma) + ' ' + esc(k.kargoTakip || '') + takipLink(k.kargoFirma, k.kargoTakip) : '—') +
        satir('Teslim', k.teslimOnay ? (k.teslimOnay === 'admin' ? 'yönetim doğruladı' : 'kiracı onayladı') : '—') +
        satir('İade kargosu', k.iadeFirma ? esc(k.iadeFirma) + ' ' + esc(k.iadeTakip || '') + takipLink(k.iadeFirma, k.iadeTakip) : '—') +
        satir('İade durumu', IADE_AD[k.iadeDurum] || '—') +
        satir('Sorun', k.teslimSorun ? esc(k.teslimSorun) + ' · ' + (k.sorunDurum === 'cozuldu' ? '<span class="arti">çözüldü</span>' + (k.sorunNot ? ': ' + esc(k.sorunNot) : '') : '<b class="eksi">açık</b>') : '—') +
        satir('Kiracının notu', esc(k.not || '—')) + (k.iptalNeden ? satir('İptal / red nedeni', esc(k.iptalNeden)) : '') + (k.yonetimNot ? satir('Yönetim notu', esc(k.yonetimNot)) : '') +
        (cak.length ? satir('Çakışan kiralamalar', cak.map(x => '<a href="#yonetim/siparis/' + esc(x.id) + '">' + refKod(x.id) + '</a> ' + tarihYaz(x.baslangic) + '→' + tarihYaz(x.bitis)).join('<br>')) : '') + '</section>' +
    '</div>' +
    '<section class="kutu"><h3>Yönetim işlemleri</h3>' + (yetki ? '<div class="sd-islem">' +
        (k.teslimSorun && k.sorunDurum !== 'cozuldu' ? '<button type="button" class="dug dug-kucuk dug-vurgu" id="sdSorun">Sorunu çözüldü olarak kapat</button>' : '') +
        (!['iptal', 'reddedildi', 'iade_edildi'].includes(k.durum) ? '<button type="button" class="dug dug-kucuk dug-tehlike" id="sdIptal">Siparişi iptal et</button>' : '') +
        '<span class="sd-durum"><label for="sdDurum">Durumu değiştir</label><select id="sdDurum">' + Object.keys(DURUM).map(x => '<option value="' + x + '"' + (x === k.durum ? ' selected' : '') + '>' + DURUM[x] + '</option>').join('') + '</select>' +
          '<button type="button" class="dug dug-kucuk" id="sdDurumKaydet">Uygula</button></span>' +
        '<a class="dug dug-kucuk" href="#yonetim/odemeler">Ödeme onayları</a><a class="dug dug-kucuk" href="#yonetim/gelir">Gelir ve ödemeler</a></div>' +
        '<p class="kucuk" style="margin-top:8px">Müdahaleler gerekçesiyle işlem geçmişine yazılır; gerekçe taraflara da görünür.</p>'
      : '<p class="kucuk eksi">Bu kiralamada tarafsın; müdahaleyi başka bir admin yapmalı.</p>') + '</section>' +
    '<div class="sd-izgara iki"><section class="kutu"><h3>İşlem geçmişi</h3><ol class="sd-zaman">' + olaylar.map(o => '<li><span class="kucuk">' + tarihSaatKisa(o.t) + '</span> ' +
        esc(o.metin) + (o.kim ? ' <span class="kucuk">· ' + esc(o.kim) + '</span>' : '') + '</li>').join('') + '</ol></section>' +
      '<section class="kutu"><h3>İç notlar <span class="kucuk">(yalnız yönetim görür)</span></h3>' +
        (notlar.length ? '<ul class="sd-notlar">' + notlar.sort((a, b) => (zaman(a.zaman) || 0) - (zaman(b.zaman) || 0)).map(x => '<li>' + esc(x.metin) + ' <span class="kucuk">· ' + esc(x.yazanAd || x.yazan) + ' · ' + tarihSaatKisa(zaman(x.zaman)) + '</span></li>').join('') + '</ul>' : '<p class="kucuk">Not yok.</p>') +
        '<textarea id="sdNot" maxlength="1000" placeholder="Örn. kiracıyla görüşüldü, yarın kargolanacak"></textarea><button type="button" class="dug dug-kucuk" id="sdNotEkle" style="margin-top:8px">Not ekle</button></section></div>';
  seviyeleriDoldur(panel);
  const gerekce = soru => { const g = prompt(soru, ''); if (g === null) return null; const x = g.trim().slice(0, 300); if (x.length < 3) { bildir('Gerekçe yazmalısın.'); return null; } return x; };
  panel.onclick = async ev => {
    const b = ev.target.closest('#sdSorun,#sdIptal,#sdDurumKaydet,#sdNotEkle'); if (!b) return;
    try {
      if (b.id === 'sdNotEkle') {
        const m = $('#sdNot').value.trim(); if (m.length < 2) return;
        await dbEkle('dolapKiraNot', { kiraId: id, metin: m.slice(0, 1000), yazan: kullanici.email, yazanAd: (kullanici.displayName || '').slice(0, 80), zaman: SIMDI() });
        bildir('Not eklendi.');
      } else if (b.id === 'sdSorun') {
        const g = gerekce('Çözüm notu (taraflar görür):'); if (!g) return;
        await kiraGuncelle(k, { sorunDurum: 'cozuldu', sorunNot: g, guncelleme: SIMDI() }, 'admin:sorun_cozuldu', g);
        bildir('Sorun kapatıldı.');
      } else if (b.id === 'sdIptal') {
        const g = gerekce('İptal gerekçesi (taraflar görür):'); if (!g) return;
        const odenmis = ['odendi', 'kargoda', 'teslim_edildi', 'iade_yolda'].includes(k.durum);
        const iade = odenmis ? (k.alinanTutar || k.toplam) : 0;
        const alacak = odenmis && confirm('Kiracı ' + tl(iade) + ' ödemiş. İade için kiracıya alacak kaydı açılsın mı?\n(Havaleyi yapınca Gelir ve ödemeler → Borç ve alacaklar\'dan kapatırsın.)');
        if (!confirm(refKod(k.id) + ' siparişi iptal edilsin mi?')) return;
        await kiraGuncelle(k, { durum: 'iptal', iptalNeden: g, yonetimNot: 'Yönetim iptal etti: ' + g, guncelleme: SIMDI() }, 'admin:iptal', g,
          alacak ? (bt => { const br = { kiraId: k.id, esyaBaslik: k.esyaBaslik, tur: 'site_kiraci', kisiId: k.kiraciId, kisiAd: k.kiraciAd, tutar: iade,
            neden: 'Sipariş iptali iadesi: ' + g.slice(0, 150), durum: 'acik', bildirildi: false, olusturma: SIMDI(), yazan: kullanici.email };
            return bt ? bt.set(doc(collection(db, 'dolapBorclar')), br) : dbEkle('dolapBorclar', br); }) : null);
        bildir('Sipariş iptal edildi.');
      } else {
        const y = $('#sdDurum').value; if (y === k.durum) return;
        const g = gerekce(DURUM[k.durum] + ' → ' + DURUM[y] + '\nGerekçe (taraflar görür):'); if (!g) return;
        const veri = { durum: y, yonetimNot: g, guncelleme: SIMDI() };
        if (y === 'teslim_edildi' && !k.teslimOnay) veri.teslimOnay = 'admin';
        await kiraGuncelle(k, veri, 'admin:durum', DURUM[k.durum] + ' → ' + DURUM[y] + ' · ' + g);
        bildir('Durum değiştirildi.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

async function panelOdemeler(panel, istek) {
  const [bildirilen, odemeBekleyen] = await Promise.all([kiraListesi('durum', 'odeme_bildirildi'), kiraListesi('durum', 'onaylandi')]);
  if (istek !== aktifIstek) return;
  bildirilen.sort((a, b) => zaman(a.guncelleme) - zaman(b.guncelleme));
  panel.innerHTML = '<section class="kutu"><h2>Ödemesi bildirilenler</h2><p class="kucuk" style="margin-bottom:10px">Kiracı "Ödemeyi yaptım" dedi. ' +
      'Banka hesabında (ya da Shopier\'de) referans kodlu ödemeyi gör, sonra <b>"Ödeme geldi"</b> düğmesine bas: eşya sahibine kiracının telefonu ve teslimat adresi ancak o zaman açılır. ' +
      'Ödeme yoksa <b>"Ödeme bulunamadı"</b> de; kiracı ödeme adımına geri döner.</p>' +
      '<div class="liste">' + (bildirilen.length ? bildirilen.map(k => kiraSatiri(k, 'yonetim')).join('') : '<p class="kucuk">Onay bekleyen ödeme yok.</p>') + '</div></section>' +
    '<section class="kutu"><h2>Kiracı ödemesi bekleyenler</h2><p class="kucuk" style="margin-bottom:10px">Kartla ödeme için Shopier\'de tutarı bu kadar olan bir ürün/ödeme linki oluştur ve buraya yapıştır; kiracı "Kartla öde" düğmesini görür. Link eklemezsen kiracı havale/FAST ile öder.</p>' +
      (odemeBekleyen.length ? odemeBekleyen.map(k => '<div class="gelir-satir">' +
        '<div><b><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></b><span class="kucuk">' + refKod(k.id) + ' · ' + esc(DURUM[k.durum]) + '</span></div>' +
        '<div><a href="#profil/' + esc(k.kiraciId) + '">' + esc(k.kiraciAd) + '</a></div>' +
        '<div><b>' + tl(k.toplam) + '</b></div>' +
        '<div class="eylem"><input class="kart-link" data-kart-alan="' + esc(k.id) + '" placeholder="https://www.shopier.com/…" value="' + esc(k.kartLink || '') + '">' +
          '<button type="button" class="dug dug-kucuk" data-kart-kaydet="' + esc(k.id) + '">Kaydet</button></div></div>').join('')
        : '<p class="kucuk">Ödeme bekleyen yok.</p>') + '</section>';
  seviyeleriDoldur(panel);
  panel.onclick = async ev => {
    const g = ev.target.closest('[data-gecis]'), kb = ev.target.closest('[data-kart-kaydet]');
    if (!g && !kb) return;
    try {
      if (g) {
        const k = bildirilen.find(x => x.id === g.dataset.id), y = g.dataset.gecis;
        if (y === 'odendi') {
          const girdi = prompt('Hesaba gelen tutar (TL)? ' + refKod(k.id) + ' için beklenen ' + k.toplam + ' TL.', String(k.toplam));
          if (girdi === null) return;
          const gelen = Math.round(+String(girdi).replace(/\./g, '').replace(',', '.'));
          if (!(gelen > 0)) { bildir('Geçerli bir tutar yaz.'); return; }
          const fark = k.toplam - gelen;
          if (!confirm(fark > 0 ? 'Eksik ödeme: ' + tl(fark) + '.\nKiracıya bu tutarda borç kaydı açılacak; kiralama devam edecek. Onaylıyor musun?'
            : fark < 0 ? 'Fazla ödeme: ' + tl(-fark) + '.\nKiracıya iade edilecek alacak kaydı açılacak. Onaylıyor musun?'
            : tl(gelen) + ' geldi. Onaylayınca eşya sahibine kiracının telefonu ve adresi açılır.')) return;
          g.disabled = true;
          await odemeOnayla(k, gelen);
        } else {
          if (!confirm('Ödeme bulunamadı olarak işaretlensin mi? Kiracı tekrar ödeme adımına döner.')) return;
          g.disabled = true;
          await kiraGuncelle(k, { durum: y, guncelleme: SIMDI() }, 'admin:odeme_bulunamadi', '');
        }
        bildir(y === 'odendi' ? 'Ödeme onaylandı; eşya sahibi kargoya hazırlanabilir.' : 'Kiracı ödeme adımına geri döndü.');
      } else {
        const link = panel.querySelector('[data-kart-alan="' + CSS.escape(kb.dataset.kartKaydet) + '"]').value.trim();
        if (link && !/^https:\/\/(www\.)?shopier\.com\/\S+$/.test(link)) { bildir('Link https://www.shopier.com/ ile başlamalı.'); return; }
        await kiraGuncelle(odemeBekleyen.find(x => x.id === kb.dataset.kartKaydet), { kartLink: link, guncelleme: SIMDI() }, 'admin:kart_link', link);
        bildir(link ? 'Kart ödeme linki eklendi; kiracı görüyor.' : 'Link kaldırıldı.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); g && (g.disabled = false); }
  };
}

async function panelGelir(panel, istek) {
  const [l, boostlar, borclar, kasa] = await Promise.all([tumKiralamalar(), boostListesi(), borcListesi().catch(() => []), kasaListesi().catch(() => [])]);
  const K = kasaHesap(l, borclar, boostlar, kasa);
  const acikBorc = borclar.filter(b => b.durum !== 'kapandi');
  if (istek !== aktifIstek) return;
  const kesin = l.filter(k => ['odendi', 'kargoda', 'teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(k.durum));
  const top = (dizi, f) => dizi.reduce((t, k) => t + f(k), 0);
  const H = f => top(kesin, k => kiraHesap(k)[f]);
  const boost = boostlar.filter(b => b.durum === 'aktif').reduce((t, b) => t + (b.fiyat || 0), 0);
  const sahipBekleyen = kesin.filter(k => ['teslim_edildi', 'iade_yolda', 'iade_edildi'].includes(k.durum) && k.sahipOdeme !== 'odendi');
  const kargodakiler = l.filter(k => k.durum === 'kargoda' || (k.durum === 'odendi'));
  const depBekleyen = kesin.filter(k => k.durum === 'iade_edildi' && !k.depozitoDurum && k.depozito > 0);
  const elde = top(kesin.filter(k => !k.depozitoDurum), k => k.depozito || 0);
  const uidler = [...new Set(sahipBekleyen.map(k => k.sahipId).concat(depBekleyen.map(k => k.kiraciId)))];
  const uyeler = Object.fromEntries(await Promise.all(uidler.map(async u => [u, await uyeGetir(u).catch(() => null)])));
  if (istek !== aktifIstek) return;
  const hesap = uid => { const u = uyeler[uid]; return u && u.iban ? esc(u.ibanAd || '') + '<br><span class="iban">' + esc(u.iban) + '</span>' : '<b class="eksi">IBAN eklememiş</b>'; };
  const sayac = (ad, v, alt) => '<div class="sayac"><b>' + v + '</b><span>' + ad + '</span>' + (alt ? '<small>' + alt + '</small>' : '') + '</div>';
  const ornek = Math.floor(1000 * GELIR.hizmetYuzde / 100), ornekK = Math.floor(1000 * GELIR.komisyonYuzde / 100);
  const kilit = tamMi() ? '' : ' disabled';
  panel.innerHTML =
    '<section class="kutu kasa-kutu"><div class="kasa-ust"><span>Kasa</span><b>' + tl(K.toplam) + '</b></div>' +
      '<div class="kasa-dokum">' +
        '<span>Kasaya alınan site payları <b>' + tl(K.kom) + '</b></span>' +
        '<span>Öne çıkarma gelirleri <b>' + tl(K.boost) + '</b></span>' +
        '<span>Kapanan borç / alacak <b>' + (K.borc < 0 ? '−' + tl(-K.borc) : tl(K.borc)) + '</b></span>' +
        '<span>Elle giriş / çıkış <b>' + (K.elle < 0 ? '−' + tl(-K.elle) : tl(K.elle)) + '</b></span></div>' +
      '<p class="kucuk" style="margin-top:8px">Site payı, eşya sahibine ödeme yapılmadan önce "Komisyonu kasaya aldım" ile onaylanınca kasaya eklenir.</p>' +
      (tamMi() ? '<details class="borc-yeni"><summary>Kasaya giriş / çıkış yaz</summary><div class="form-izgara" style="margin-top:10px">' +
        '<div class="alan"><label for="kTur">Tür</label><select id="kTur"><option value="cikis">Çıkış (gider, para çekme)</option><option value="giris">Giriş</option></select></div>' +
        '<div class="alan"><label for="kTutar">Tutar (TL)</label><input id="kTutar" type="number" min="1" step="1"></div>' +
        '<div class="alan tam"><label for="kAciklama">Açıklama</label><input id="kAciklama" maxlength="200" placeholder="Örn. kargo gideri, kasadan çekilen"></div></div>' +
        '<button type="button" class="dug dug-ana" id="kasaEkle" style="margin-top:10px">Kaydet</button></details>' : '') + '</section>' +
    '<div class="sayaclar">' +
      sayac('Site geliri · kiralama', tl(H('site')), 'hizmet ' + tl(H('hizmet')) + ' + komisyon ' + tl(H('komisyon')) + ' − indirim ' + tl(H('indirim'))) +
      sayac('Öne çıkarma geliri', tl(boost)) + sayac('Toplam gelir', tl(H('site') + boost)) +
      sayac('Sahiplere ödenecek', tl(top(sahipBekleyen, k => kiraHesap(k).sahibe)), sahipBekleyen.length + ' kiralama') +
      sayac('Elde tutulan depozito', tl(elde)) +
      sayac('Kişilerden alacak', tl(top(acikBorc.filter(kisiBorclu), b => b.tutar))) +
      sayac('Kişilere borç', tl(top(acikBorc.filter(b => !kisiBorclu(b)), b => b.tutar))) + '</div>' +
    '<section class="kutu"><h2>Gelir oranları</h2>' +
      '<p class="kucuk">Yeni kiralama isteklerine uygulanır; mevcut kiralamalar istek anındaki oranla kalır. Veritabanı kuralları her isteği bu oranlarla doğrular.</p>' +
      '<div class="form-izgara" style="margin-top:12px">' +
        '<div class="alan"><label for="gHizmet">Kiracıdan hizmet bedeli (%)</label><input id="gHizmet" type="number" min="0" max="30" step="1" value="' + GELIR.hizmetYuzde + '"' + kilit + '></div>' +
        '<div class="alan"><label for="gKom">Eşya sahibinden komisyon (%)</label><input id="gKom" type="number" min="0" max="30" step="1" value="' + GELIR.komisyonYuzde + '"' + kilit + '></div></div>' +
      '<p class="kucuk" style="margin-top:8px">Örnek, 1.000 TL kira: kiracı ' + tl(1000 + ornek) + ' öder (+ depozito), eşya sahibi ' + tl(1000 - ornekK) + ' alır, site ' + tl(ornek + ornekK) + ' kazanır (sadakat indirimi varsa o kadar az).</p>' +
      (tamMi() ? '<button type="button" class="dug dug-ana" id="gKaydet" style="margin-top:10px">Oranları kaydet</button>' : '<p class="kucuk">Oranları yalnız tam yetkili değiştirebilir.</p>') + '</section>' +
    '<section class="kutu"><h2>Teslimat bekleyenler</h2><p class="kucuk" style="margin-bottom:10px">Ödemesi onaylanmış, kiracıya henüz ulaşmamış parçalar. Kiracı "Teslim aldım" demeyi unutursa kargo takibinden teslimatı kontrol edip buradan onaylayabilirsin.</p>' +
      (kargodakiler.length ? kargodakiler.map(k => '<div class="gelir-satir">' +
        '<div><b><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></b><span class="kucuk">' + refKod(k.id) + ' · ' + esc(DURUM[k.durum]) + '</span></div>' +
        '<div>' + (k.kargoFirma ? esc(k.kargoFirma) + (k.kargoTakip ? '<br><span class="iban">' + esc(k.kargoTakip) + '</span>' : '') : '<span class="kucuk">Henüz kargoya verilmedi</span>') + '</div>' +
        '<div>' + (k.teslimSorun ? '<b class="eksi">Sorun: ' + esc(k.teslimSorun) + '</b>' : '<span class="kucuk">' + tarihYaz(k.baslangic) + ' teslim</span>') + '</div>' +
        '<div>' + (k.durum === 'kargoda' ? '<button type="button" class="dug dug-kucuk" data-teslim="' + esc(k.id) + '">Teslim edildi</button>' : '') + '</div></div>').join('')
        : '<p class="kucuk">Yolda parça yok.</p>') + '</section>' +
    '<section class="kutu"><h2>Eşya sahiplerine ödenecekler</h2><p class="kucuk" style="margin-bottom:10px">Yalnız kiracının teslim aldığı (ya da senin doğruladığın) kiralamalar burada. Sorun bildirilmişse önce çöz. Teslimat sorunsuzsa önce <b>"Komisyonu kasaya aldım"</b> ile site payını kasaya al, sonra eşya sahibine havaleyi yapıp <b>"Ödendi"</b>ye bas.</p>' +
      (sahipBekleyen.length ? sahipBekleyen.map(k => { const h = kiraHesap(k), u = uyeler[k.sahipId]; return '<div class="gelir-satir">' +
        '<div><b><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></b><span class="kucuk"><a href="#yonetim/siparis/' + esc(k.id) + '">' + refKod(k.id) + '</a> · ' + esc(DURUM[k.durum]) + ' · ' + tarihYaz(k.bitis) + '</span></div>' +
        '<div><a href="#profil/' + esc(k.sahipId) + '">' + esc(u ? u.ad : 'Eşya sahibi') + '</a><br>' + hesap(k.sahipId) + '</div>' +
        '<div><b>' + tl(h.sahibe) + '</b><span class="kucuk">kira ' + tl(h.brut) + ' − komisyon ' + tl(h.komisyon) + ' · site payı ' + tl(h.site) + '</span>' +
          (k.teslimSorun ? '<b class="eksi" style="display:block">Sorun: ' + esc(k.teslimSorun) + '</b>' : (k.teslimOnay ? '<span class="kucuk arti">teslim ' + (k.teslimOnay === 'admin' ? 'site tarafından doğrulandı' : 'kiracı onayladı') + ' ✓</span>' : '<span class="kucuk">eski kayıt · teslim onayı yok, kontrol et</span>')) + '</div>' +
        '<div class="eylem">' + (k.komisyonAlindi
          ? '<span class="kucuk arti">✓ ' + tl(k.komisyonTutar ?? h.site) + ' kasada</span><button type="button" class="dug dug-kucuk dug-vurgu" data-sahip-ode="' + esc(k.id) + '">Ödendi</button>'
          : '<button type="button" class="dug dug-kucuk dug-vurgu" data-kom-al="' + esc(k.id) + '">Komisyonu kasaya aldım</button>' +
            '<button type="button" class="dug dug-kucuk" disabled title="Önce komisyonu kasaya al">Ödendi</button>') + '</div></div>'; }).join('')
        : '<p class="kucuk">Bekleyen ödeme yok.</p>') + '</section>' +
    '<section class="kutu"><h2>Depozito iadeleri</h2><p class="kucuk" style="margin-bottom:10px">Parça iade edildikten sonra. Hasar ya da gecikme varsa sözleşmeye göre kesinti yapılabilir; kiracı nedeni görür.</p>' +
      (depBekleyen.length ? depBekleyen.map(k => '<div class="gelir-satir">' +
        '<div><b><a href="#esya/' + esc(k.esyaId) + '">' + esc(k.esyaBaslik) + '</a></b><span class="kucuk">' + refKod(k.id) + ' · ' + esc(IADE_AD[k.iadeDurum] || 'İade edildi') + '</span></div>' +
        '<div><a href="#profil/' + esc(k.kiraciId) + '">' + esc(k.kiraciAd) + '</a><br>' + hesap(k.kiraciId) + '</div>' +
        '<div><b>' + tl(k.depozito) + '</b><span class="kucuk">depozito</span></div>' +
        '<div class="eylem"><button type="button" class="dug dug-kucuk dug-vurgu" data-dep-iade="' + esc(k.id) + '">Tamamını iade ettim</button>' +
          '<button type="button" class="dug dug-kucuk" data-dep-kes="' + esc(k.id) + '">Kesinti yap</button></div></div>').join('')
        : '<p class="kucuk">Bekleyen depozito iadesi yok.</p>') + '</section>' +
    '<section class="kutu"><h2>Borç ve alacaklar</h2><p class="kucuk" style="margin-bottom:10px">Eksik ya da fazla ödeme, eksik komisyon, eksik aktarım gibi farklar. Kişi kendi kiralamasında görür ve borcunu ödediğini bildirebilir.</p>' +
      (acikBorc.length ? acikBorc.map(b => '<div class="gelir-satir">' +
        '<div><b>' + BORC_TUR[b.tur][0] + '</b><span class="kucuk">' + esc(b.neden) + '</span></div>' +
        '<div><a href="#profil/' + esc(b.kisiId) + '">' + esc(b.kisiAd || 'Kişi') + '</a><span class="kucuk">' + esc(b.esyaBaslik || '') + ' · ' + borcKod(b.id) + '</span></div>' +
        '<div><b>' + tl(b.tutar) + '</b>' + (b.bildirildi ? '<span class="kucuk arti">kişi "ödedim" dedi</span>' : '') + '</div>' +
        '<div><button type="button" class="dug dug-kucuk dug-vurgu" data-borc-kapat="' + esc(b.id) + '">Ödendi, kapat</button></div></div>').join('')
        : '<p class="kucuk">Açık kayıt yok.</p>') +
      '<details class="borc-yeni"><summary>+ Yeni borç / alacak kaydı</summary><div class="form-izgara" style="margin-top:10px">' +
        '<div class="alan tam"><label for="bKira">Kiralama</label><select id="bKira">' +
          l.filter(k => !['beklemede', 'reddedildi', 'iptal'].includes(k.durum)).map(k => '<option value="' + esc(k.id) + '">' + refKod(k.id) + ' · ' + esc(k.esyaBaslik) + ' · ' + esc(k.kiraciAd) + '</option>').join('') + '</select></div>' +
        '<div class="alan"><label for="bTur">Kim kime borçlu?</label><select id="bTur">' + Object.entries(BORC_TUR).map(([a, v]) => '<option value="' + a + '">' + v[1] + '</option>').join('') + '</select></div>' +
        '<div class="alan"><label for="bTutar">Tutar (TL)</label><input id="bTutar" type="number" min="1" step="1"></div>' +
        '<div class="alan tam"><label for="bNeden">Neden</label><input id="bNeden" maxlength="200" placeholder="Örn. eksik komisyon; kiracı eşya sahibine elden ödedi"></div></div>' +
        '<button type="button" class="dug dug-ana" id="borcEkle" style="margin-top:10px">Kaydı aç</button></details></section>' +
    '<section class="kutu"><h2>Ödeme geçmişi</h2><p class="kucuk" style="margin-bottom:6px">Site hesabının bakışıyla: + giren, − çıkan para.</p>' + gecmisHTML(odemeOlaylari(l, borclar, boostlar, null, kasa)) + '</section>' +
    '<p class="kucuk">Kiracı ödemelerini onaylamak için <a href="#yonetim/odemeler" style="text-decoration:underline">Ödeme onayları</a>.</p>';
  panel.onclick = async ev => {
    const b = ev.target.closest('[data-sahip-ode],[data-kom-al],[data-dep-iade],[data-dep-kes],[data-teslim],[data-kart-kaydet],[data-borc-kapat],#borcEkle,#kasaEkle,#gKaydet'); if (!b) return;
    try {
      if (b.dataset.komAl) {
        const k = l.find(x => x.id === b.dataset.komAl), h = kiraHesap(k);
        if (!confirm('Site payı ' + tl(h.site) + ' (hizmet ' + tl(h.hizmet) + ' + komisyon ' + tl(h.komisyon) + (h.indirim ? ' − indirim ' + tl(h.indirim) : '') + ') kasaya alındı mı?\n' +
          'Onaylayınca kasaya eklenir ve eşya sahibine ' + tl(h.sahibe) + ' ödeyebilirsin.')) return;
        await kiraGuncelle(k, { komisyonAlindi: true, komisyonTutar: h.site, komisyonZaman: SIMDI(), guncelleme: SIMDI() }, 'admin:komisyon', tl(h.site) + ' kasaya');
        bildir('Site payı kasaya eklendi.'); sayfaCiz(); return;
      }
      if (b.id === 'kasaEkle') {
        if (demoEngel()) return;
        const tur = $('#kTur').value, tutar = Math.round(+$('#kTutar').value), aciklama = $('#kAciklama').value.trim().slice(0, 200);
        if (!(tutar > 0) || aciklama.length < 3) { bildir('Tutar ve açıklama gerekli.'); return; }
        await dbEkle('dolapKasa', { tur, tutar, aciklama, olusturma: SIMDI(), yazan: kullanici.email });
        bildir('Kasa hareketi kaydedildi.'); sayfaCiz(); return;
      }
      if (b.id === 'borcEkle') {
        const k = l.find(x => x.id === $('#bKira').value), tur = $('#bTur').value;
        const tutar = Math.round(+$('#bTutar').value), neden = $('#bNeden').value.trim().slice(0, 200);
        if (!k || !(tutar > 0) || neden.length < 3) { bildir('Kiralama, tutar ve neden gerekli.'); return; }
        const kiraciTarafi = tur === 'kiraci_site' || tur === 'site_kiraci';
        const kisiAd = kiraciTarafi ? k.kiraciAd : (((await uyeGetir(k.sahipId).catch(() => null)) || {}).ad || 'Eşya sahibi');
        await dbEkle('dolapBorclar', { kiraId: k.id, esyaBaslik: k.esyaBaslik, tur, kisiId: kiraciTarafi ? k.kiraciId : k.sahipId, kisiAd,
          tutar, neden, durum: 'acik', bildirildi: false, olusturma: SIMDI(), yazan: kullanici.email });
        bildir('Kayıt açıldı; kişi kendi kiralamasında görür.'); sayfaCiz(); return;
      }
      if (b.dataset.borcKapat) {
        const x = borclar.find(y => y.id === b.dataset.borcKapat);
        if (!confirm(tl(x.tutar) + ' (' + BORC_TUR[x.tur][1] + ') ödendi olarak kapatılsın mı?')) return;
        await dbGuncelle('dolapBorclar', x.id, { durum: 'kapandi', kapanis: SIMDI() });
        bildir('Kapatıldı; ödeme geçmişine yazıldı.'); sayfaCiz(); return;
      }
      if (b.dataset.kartKaydet) {
        const link = panel.querySelector('[data-kart-alan="' + CSS.escape(b.dataset.kartKaydet) + '"]').value.trim();
        if (link && !/^https:\/\/(www\.)?shopier\.com\/\S+$/.test(link)) { bildir('Link https://www.shopier.com/ ile başlamalı.'); return; }
        await kiraGuncelle(l.find(x => x.id === b.dataset.kartKaydet), { kartLink: link, guncelleme: SIMDI() }, 'admin:kart_link', link);
        bildir(link ? 'Kart ödeme linki eklendi; kiracı görüyor.' : 'Link kaldırıldı.');
      } else if (b.dataset.teslim) {
        if (!confirm('Kargo takibinden teslimatı kontrol ettin mi? Teslim edildi olarak işaretlenecek.')) return;
        await kiraGuncelle(l.find(x => x.id === b.dataset.teslim), { durum: 'teslim_edildi', teslimOnay: 'admin', guncelleme: SIMDI() }, 'admin:teslim', 'Kargo takibinden doğrulandı');
        bildir('Teslim edildi olarak işaretlendi.');
      } else if (b.id === 'gKaydet') {
        if (demoEngel()) return;
        const h = Math.round(+$('#gHizmet').value), kk = Math.round(+$('#gKom').value);
        if (!(h >= 0 && h <= 30 && kk >= 0 && kk <= 30)) { bildir('Oranlar 0 ile 30 arasında olmalı.'); return; }
        await setDoc(doc(db, 'ayarlarGenel', 'gelir'), { hizmetYuzde: h, komisyonYuzde: kk });
        GELIR = { hizmetYuzde: h, komisyonYuzde: kk };
        bildir('Oranlar kaydedildi.');
      } else if (b.dataset.sahipOde) {
        const k = l.find(x => x.id === b.dataset.sahipOde);
        if (!k.komisyonAlindi) { bildir('Önce komisyonu kasaya al.'); return; }
        if (k.teslimSorun && k.sorunDurum !== 'cozuldu') { bildir('Açık sorun var; önce sipariş detayından çöz.'); location.hash = '#yonetim/siparis/' + k.id; return; }
        if (!confirm((k.teslimSorun ? 'DİKKAT: kiracı sorun bildirdi (' + k.teslimSorun + ').\n' : '') + tl(kiraHesap(k).sahibe) + ' eşya sahibine ödendi olarak işaretlensin mi?')) return;
        await kiraGuncelle(k, { sahipOdeme: 'odendi', sahipOdemeZaman: SIMDI(), guncelleme: SIMDI() }, 'admin:sahip_odeme', tl(kiraHesap(k).sahibe));
        bildir('Ödendi olarak işaretlendi.');
      } else if (b.dataset.depIade) {
        const k = l.find(x => x.id === b.dataset.depIade);
        if (!confirm(tl(k.depozito) + ' depozito kiracıya iade edildi olarak işaretlensin mi?')) return;
        await kiraGuncelle(k, { depozitoDurum: 'iade', depozitoKesinti: 0, depozitoZaman: SIMDI(), guncelleme: SIMDI() }, 'admin:depozito_iade', tl(k.depozito));
        bildir('Depozito iadesi kaydedildi.');
      } else {
        const k = l.find(x => x.id === b.dataset.depKes);
        const gGun = k.iadeZaman && zaman(k.iadeZaman) ? Math.max(0, gunFarki(k.bitis, yerelGun(zaman(k.iadeZaman)))) : 0;
        const oneri = Math.min(k.depozito, Math.round(gGun * k.gunlukUcret * GECIKME_KAT));
        const n = Math.round(+String(prompt('Depozitodan kesilecek tutar (TL, en çok ' + k.depozito + ')' +
          (gGun ? '\nİade ' + gGun + ' gün geç gönderildi; sözleşmeye göre gecikme bedeli ' + oneri + ' TL.' : ''), oneri ? String(oneri) : '') || '').replace(',', '.'));
        if (!(n > 0 && n <= k.depozito)) { if (n) bildir('Geçersiz tutar.'); return; }
        const neden = (prompt('Kesinti nedeni (kiracı görecek):') || '').trim().slice(0, 200);
        if (!neden) { bildir('Kesinti için neden yazmalısın.'); return; }
        await kiraGuncelle(k, { depozitoDurum: 'kesinti', depozitoKesinti: n, depozitoNot: neden, depozitoZaman: SIMDI(), guncelleme: SIMDI() }, 'admin:depozito_kesinti', tl(n) + ' · ' + neden);
        bildir('Kesinti kaydedildi; kalan ' + tl(k.depozito - n) + ' kiracıya iade edilmeli.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

async function yonetim(sekme, ek, istek) {
  if (!kullanici) return girisCagrisi('Yönetim paneli', 'Panel için yetkili hesabınla giriş yap.');
  if (!adminMi()) {
    icerik.innerHTML = '<div class="bos"><h3>Bu sayfaya erişim yetkin yok</h3><p>Yönetim paneli yalnız adminlere açıktır.</p><a class="dug" href="#kesfet">Keşfet\'e dön</a></div>';
    return;
  }
  const sekmeler = [['ozet', 'Özet'], ['siparisler', 'Siparişler'], ['onay', 'Onay bekleyenler'], ['onecikar', 'Öne çıkarma'], ['gelen', 'Gelen kutusu'], ['kullanicilar', 'Kullanıcılar']]
    .concat(tamMi() ? [['yoneticiler', 'Admin atama']] : []).concat([['odemeler', 'Ödeme onayları'], ['gelir', 'Gelir ve ödemeler']]);
  icerik.innerHTML = '<div class="bas"><div><h1>Yönetim paneli</h1><p>' + ROL_AD[rol] + ' olarak giriş yaptın.</p></div></div>' +
    '<div class="alt-sekme">' + sekmeler.map(([k, ad]) =>
      '<a class="cip" href="#yonetim/' + k + '" aria-pressed="' + (sekme === k || (sekme === 'kisi' && k === 'kullanicilar') || (sekme === 'siparis' && k === 'siparisler')) + '">' + ad +
      (k === 'onay' || k === 'gelen' || k === 'onecikar' || k === 'odemeler' ? ' <span class="sayi" id="sayi-' + k + '" hidden></span>' : '') + '</a>').join('') + '</div>' +
    '<div id="panel"><p class="yukleniyor">Yükleniyor…</p></div>';
  const panel = $('#panel');
  rozetSayilari();
  try {
    if (sekme === 'onay') await panelOnay(panel, istek);
    else if (sekme === 'onecikar') await panelOneCikar(panel, istek);
    else if (sekme === 'gelen') await panelGelen(panel, ek, istek);
    else if (sekme === 'kullanicilar') await panelKullanicilar(panel, istek);
    else if (sekme === 'kisi' && ek) await panelKisi(panel, ek, istek);
    else if (sekme === 'yoneticiler' && tamMi()) await panelYoneticiler(panel, istek);
    else if (sekme === 'gelir') await panelGelir(panel, istek);
    else if (sekme === 'siparisler') await panelSiparisler(panel, istek);
    else if (sekme === 'siparis' && ek) await panelSiparis(panel, ek, istek);
    else if (sekme === 'odemeler') await panelOdemeler(panel, istek);
    else await panelOzet(panel, istek);
  } catch (h) {
    if (istek === aktifIstek) panel.innerHTML = '<div class="bos"><h3>Yüklenemedi</h3><p>' + esc(hataMetni(h)) + '</p></div>';
  }
}
async function rozetSayilari() {
  try {
    const [bek, soh, oc, od] = await Promise.all([esyaListesi('onay', 'bekliyor'), sohbetListesi(), boostListesi('durum', 'odeme_bildirildi'), kiraListesi('durum', 'odeme_bildirildi')]);
    const yaz = (id, n) => { const s = $('#sayi-' + id); if (s) { s.textContent = n; s.hidden = !n; } };
    yaz('odemeler', od.length);
    yaz('onay', bek.length);
    yaz('gelen', soh.filter(x => !x.adminOkudu).length);
    yaz('onecikar', oc.length);
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
    let veri = { onay: 'onaylandi', redNeden: '', onayZaman: SIMDI() };
    if (b.dataset.red) {
      const n = prompt('Red nedeni (ürün sahibine gösterilir):', '');
      if (n === null) return;
      veri = { onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Uygun bulunmadı.', onayZaman: SIMDI() };
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
        await rolYaz(b.dataset.adminyap, 'admin', ''); await adminDestegeEkle(b.dataset.adminyap).catch(() => {});
        bildir(b.dataset.adminyap + ' artık admin. Destek mesajları için adresine doğrulama postası gitti.');
      }
      if (b.dataset.adminal && tamMi()) {
        if (!confirm(b.dataset.adminal + ' kişisinin admin yetkisi alınsın mı?')) return;
        await rolSil(b.dataset.adminal); await adminDestektenCikar(b.dataset.adminal).catch(() => {}); bildir('Admin yetkisi alındı.');
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
          await dbGuncelle('dolapEsyalar', e.id, { onayZaman: SIMDI(), onay: 'reddedildi', redNeden: n.trim().slice(0, 200) || 'Yönetici tarafından kaldırıldı.', aktif: false });
        }
        bildir('Kullanıcının ürünleri yayından kaldırıldı.');
      }
      sayfaCiz();
    } catch (h) { bildir(hataMetni(h)); }
  };
}

async function panelKisi(panel, uid, istek) {
  const [u, ol, esyalar, sad] = await Promise.all([uyeGetir(uid), olayListesi(30), esyaListesi('sahipId', uid), sadakatGetir(uid).catch(() => null)]);
  if (istek !== aktifIstek) return;
  const kendi = ol.filter(o => o.uid === uid);
  const esyaO = kendi.filter(o => o.tur === 'esya');
  const sayac = (ad, s) => '<div class="sayac"><b>' + s + '</b><span>' + ad + '</span></div>';
  panel.innerHTML = '<p class="kucuk" style="margin-bottom:12px"><a href="#yonetim/kullanicilar">← Kullanıcılar</a></p>' +
    '<div class="kisi-bas">' + (u && u.foto ? '<img class="avatar buyuk" src="' + esc(u.foto) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div><h2>' + esc(u ? u.ad : 'Kullanıcı') + ' <a class="kucuk" href="#profil/' + esc(uid) + '" style="text-decoration:underline;font-weight:400">herkese açık profil</a></h2><p class="kucuk">' + esc([u && u.eposta, u && u.telefon].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="kucuk">' + (u && u.ilkGiris ? 'Üyelik: ' + tarihSaat(u.ilkGiris) + ' · ' : '') + (u && u.sonGiris ? 'Son giriş: ' + tarihSaat(u.sonGiris) : '') + '</p></div></div>' +
    '<div class="sayaclar">' + sayac('Oturum', new Set(kendi.map(o => o.oturum)).size) + sayac('Parça görüntüleme', esyaO.length) +
      sayac('Arama', kendi.filter(o => o.tur === 'arama').length) + sayac('İlan', esyalar.length) + '</div>' +
    (sad ? '<section class="kutu"><h2>Sadakat puanı</h2>' + sadakatHTML(sad, false) + '</section>' : '') +
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
  let alicilar = [];
  try { alicilar = await destekAlicilari(); } catch (e) {}
  if (istek !== aktifIstek) return;
  const hedefi = ep => (alicilar.find(x => x.eposta === ep) || {}).hedef;
  panel.innerHTML = '<div class="kutu" style="margin-top:0"><h2>Admin ata</h2>' +
    '<p class="kucuk" style="margin-bottom:10px">Kişinin Google (Gmail) adresini yazın. Bu hesapla giriş yaptığında admin olur: ürün onayı, kullanıcı kısıtlama, gelen kutusu ve ödeme onayı. Admin atamayı yalnız tam yetkili yapabilir.</p>' +
    '<div class="satir-form"><input class="ara" id="yeniAdmin" type="email" placeholder="ornek@gmail.com" autocomplete="off"><button type="button" class="dug dug-vurgu" id="adminEkle">Admin yap</button></div>' +
    '<p class="hata" id="adminHata" role="alert"></p></div>' +
    '<div class="kutu"><h2>Yetkililer</h2><div class="tablo-kap"><table class="tablo"><tbody>' +
      '<tr><td><b>' + TAM_YETKILI + '</b></td><td><span class="rol-rozet r-tam">Tam yetkili</span></td><td></td></tr>' +
      adminler.map(r => {
        const h = hedefi(r.eposta);
        return '<tr><td><b>' + esc(r.eposta) + '</b><br><span class="kucuk">' + esc(r.atayan) + ' atadı' + (r.zaman ? ' · ' + tarihSaat(r.zaman) : '') + '</span><br>' +
          '<span class="kucuk">Destek postası: ' + (h ? 'listede ✓ (doğrulama postasındaki “Activate Form”a basıldıysa mesajlar gelir)' : '<b style="color:var(--kirmizi)">listede değil</b>') + '</span></td>' +
          '<td><span class="rol-rozet r-admin">Admin</span></td><td class="eylem-hucre">' +
          '<button type="button" class="dug dug-kucuk" data-aktivasyon="' + esc(r.eposta) + '">Doğrulama postası gönder</button>' +
          '<button type="button" class="dug dug-kucuk dug-tehlike" data-adminsil="' + esc(r.eposta) + '">Yetkiyi al</button></td></tr>';
      }).join('') +
    '</tbody></table></div>' +
    '<p class="kucuk" style="margin-top:10px">"Ekibe ilet" mesajları yalnız buradaki adminlere gider (hiç admin yoksa site sahibine). Her admin, FormSubmit\'ten gelen doğrulama postasındaki <b>Activate Form</b>\'a bir kez basmalı; başka bir şey gerekmez. ' +
    'Doğrulama postası gelmediyse "Doğrulama postası gönder" ile yeniden gönderebilirsin.</p>' +
    '<button type="button" class="dug dug-kucuk" id="alicilarEsitle" style="margin-top:10px">Destek alıcılarını admin listesiyle eşitle</button></div>';
  $('#adminEkle').onclick = async () => {
    const e = $('#yeniAdmin').value.trim().toLowerCase(), h = $('#adminHata');
    h.textContent = '';
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) { h.textContent = 'Geçerli bir e-posta adresi yazın.'; return; }
    if (e === TAM_YETKILI) { h.textContent = 'Bu hesap zaten tam yetkili.'; return; }
    try { await rolYaz(e, 'admin', ''); await adminDestegeEkle(e).catch(() => {}); bildir(e + ' admin yapıldı. Destek mesajları için adresine doğrulama postası gitti.'); sayfaCiz(); } catch (x) { h.textContent = hataMetni(x); }
  };
  panel.onclick = async ev => {
    const a = ev.target.closest('[data-aktivasyon],[data-gizlikod],#alicilarEsitle');
    if (a) {
      try {
        if (a.dataset.aktivasyon) { await adminDestegeEkle(a.dataset.aktivasyon); bildir(a.dataset.aktivasyon + ' adresine doğrulama postası gönderildi.'); }
        if (a.dataset.gizlikod) {
          const kod = prompt('FormSubmit\'in bu admin için verdiği gizli kod (etkinleştirme sonrası sayfada/postada yazar, ör. 1a2b3c4d…). Boş bırakılırsa e-posta kullanılır:', '');
          if (kod === null) return;
          const l = await destekAlicilari(), k = kod.trim();
          const yeni = l.filter(x => x.eposta !== a.dataset.gizlikod).concat([{ eposta: a.dataset.gizlikod, hedef: /^[A-Za-z0-9]{6,64}$/.test(k) ? k : a.dataset.gizlikod }]);
          await destekAlicilariYaz(yeni); bildir('Kaydedildi.');
        }
        if (a.id === 'alicilarEsitle') {
          const l = await destekAlicilari(), adr = adminler.map(r => r.eposta);
          const yeni = l.filter(x => adr.includes(x.eposta));
          const eksik = adr.filter(e => !yeni.some(x => x.eposta === e));
          eksik.forEach(e => yeni.push({ eposta: e, hedef: e }));
          await destekAlicilariYaz(yeni);
          await Promise.all(eksik.map(formsubmitAktivasyon));
          bildir('Eşitlendi: ' + yeni.length + ' alıcı' + (eksik.length ? ', ' + eksik.length + ' yeni admine doğrulama postası gitti.' : '.'));
        }
        sayfaCiz();
      } catch (x) { bildir(hataMetni(x)); }
      return;
    }
    const b = ev.target.closest('[data-adminsil]'); if (!b) return;
    if (!confirm(b.dataset.adminsil + ' kişisinin admin yetkisi alınsın mı?')) return;
    try { await rolSil(b.dataset.adminsil); await adminDestektenCikar(b.dataset.adminsil).catch(() => {}); bildir('Yetki alındı, destek alıcılarından çıkarıldı.'); sayfaCiz(); } catch (x) { bildir(hataMetni(x)); }
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
/* Destek alıcıları (Blaze gerektirmez): mesajlar FormSubmit ile panelden atanmış ADMİNLERE gider.
 *   ayarlarGenel/destek  { hedefler: [..] }        herkes okur: tarayıcı buraya gönderir
 *   ayarlarGizli/destek  { alicilar: [{eposta, hedef}] }  yalnız adminler: hangi hedef kimin
 * hedef: FormSubmit gizli kodu (girildiyse; e-posta görünmez) ya da adminin e-postası.
 * Admin atanınca adresine FormSubmit doğrulama postası gider; "Activate Form"a basınca mailler düşmeye başlar.
 * Hiç admin yoksa mesaj kaybolmasın diye site sahibine (ayarlar.js eposta) gider. */
async function destekHedefleri() {
  try { const s = await getDoc(doc(db, 'ayarlarGenel', 'destek')); return (s.exists() && s.data().hedefler) || []; } catch (e) { return []; }
}
async function destekAlicilari() {
  if (DEMO) return [];
  const s = await getDoc(doc(db, 'ayarlarGizli', 'destek'));
  return (s.exists() && s.data().alicilar) || [];
}
async function destekAlicilariYaz(l) {
  const b = writeBatch(db);
  b.set(doc(db, 'ayarlarGizli', 'destek'), { alicilar: l });
  b.set(doc(db, 'ayarlarGenel', 'destek'), { hedefler: [...new Set(l.map(x => x.hedef))] });
  await b.commit();
}
function formsubmitAktivasyon(eposta) {
  return fetch('https://formsubmit.co/ajax/' + encodeURIComponent(eposta), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ _subject: 'Elif\'in Dolabı destek kanalı: e-postanızı etkinleştirin', _template: 'table', _captcha: 'false',
      Bilgi: 'Elif\'in Dolabı (sersoz.com) yönetimine admin olarak eklendiniz. Ziyaretçilerin destek mesajlarını bu adreste alabilmek için FormSubmit\'ten gelen "Activate Form" düğmesine basın.' })
  }).then(r => r.json()).catch(() => ({}));
}
async function adminDestegeEkle(eposta) {
  if (DEMO) return;
  const l = await destekAlicilari();
  if (!l.some(x => x.eposta === eposta)) { l.push({ eposta, hedef: eposta }); await destekAlicilariYaz(l); }
  await formsubmitAktivasyon(eposta);
}
async function adminDestektenCikar(eposta) {
  if (DEMO) return;
  await destekAlicilariYaz((await destekAlicilari()).filter(x => x.eposta !== eposta));
}

/* Destek postası: sunucu gerektirmeyen form hizmetiyle site sahibinin adresine gider.
   ayarlar.js'te web3formsKey varsa Web3Forms, yoksa FormSubmit (ilk gönderimde adrese bir kez
   "Activate Form" postası gelir; tıklanınca sonraki tüm iletiler doğrudan düşer). */
async function destekPostasi(v) {
  const konu = 'Elif\'in Dolabı destek: ' + v.konu;
  const govde = { name: v.ad, email: v.eposta, Konu: v.konu, Mesaj: v.mesaj, 'Sohbet geçmişi': v.gecmis || '-',
    Sayfa: location.origin + location.pathname, 'Giriş yapmış hesap': kullanici ? (kullanici.email || '') : 'Giriş yapılmamış' };
  Object.assign(govde, { _subject: konu, _replyto: v.eposta, _template: 'table', _captcha: 'false' });
  let hedefler = await destekHedefleri();
  if (!hedefler.length) hedefler = [AYAR.eposta || TAM_YETKILI];   // hiç admin yoksa site sahibi
  const sonuclar = await Promise.all(hedefler.map(h =>
    fetch('https://formsubmit.co/ajax/' + encodeURIComponent(h), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(govde) })
      .then(async r => { const d = await r.json().catch(() => ({})); return { tamam: r.ok && String(d.success) !== 'false', mesaj: d.message || '' }; })
      .catch(e => ({ tamam: false, mesaj: e.message }))));
  if (!sonuclar.some(x => x.tamam)) {
    const e = new Error(sonuclar[0].mesaj || 'E-posta gönderilemedi.');
    e.aktivasyon = sonuclar.some(x => /activat/i.test(x.mesaj));
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
      '<div class="kime"><span>Kime</span><b>Destek ekibi</b></div>' +
      '<label>Gönderen adı<input name="ad" required maxlength="80" autocomplete="name" value="' + esc(ad) + '"></label>' +
      '<label>Gönderen e-postası <span class="kucuk">(yanıt buraya gelir)</span><input name="eposta" type="email" required maxlength="120" autocomplete="email" value="' + esc(ep) + '"></label>' +
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
    /* Giriş yapılmışsa önce panelin gelen kutusuna kaydet; e-posta bundan bağımsız gider. */
    let kutuda = false;
    if (kullanici) { try { await soruGonder(v.konu + ' — ' + v.mesaj); kutuda = true; } catch (h) {} }
    let postaHatasi = null;
    try { await destekPostasi(v); } catch (h) { postaHatasi = h; }
    if (kutuda || !postaHatasi) {
      f.closest('.mesaj').remove();
      balon('kullanici', '<b>' + esc(v.konu) + '</b><br>' + esc(v.mesaj));
      balon('bot', 'İletildi ✓ Ekibimiz ' + (kutuda ? 'yanıtı burada ve ' : '') + esc(v.eposta) + ' adresinde verecek.');
      sonSoru = '';
    } else {
      dug.disabled = false; dug.textContent = 'Gönder';
      balon('bot', postaHatasi.aktivasyon
        ? 'Destek ekibi kanalı henüz hazır değil. Destek ekibi kanalı etkinleştirilince gönderebileceksin; lütfen biraz sonra tekrar dene.'
        : 'Mesajın şu an destek ekibine iletilemedi; lütfen biraz sonra tekrar dene.');
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
    if (yeni) bildirimYenile(true);
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
  const bolumler = [['profil', 'Profil'], ['puan', 'Sadakat puanım'], ['adresler', 'Adreslerim'], ['kartlar', 'Kartlarım'], ['odeme', 'Ödeme alacağım hesap'], ['gecmis', 'Ödeme geçmişim'], ['filtreler', 'Filtrelerim'], ['tercihler', 'Gizlilik ve bildirim'], ['hesap', 'Hesap']];
  icerik.innerHTML = '<div class="bas"><div><h1>Hesabım</h1><p>Bilgilerin ve ayarların.</p></div></div>' +
    '<div class="hesap-duzen"><nav class="hesap-menu" aria-label="Hesap bölümleri">' +
      bolumler.map(([k, ad]) => '<a href="#hesabim/' + k + '"' + ((bolum || 'profil') === k ? ' aria-current="true"' : '') + '>' + ad + '</a>').join('') + '</nav><div>' +
    /* profil */
    '<section class="kutu" id="b-profil"><h2>Profil</h2><div class="kisi-bas">' +
      (kullanici.photoURL ? '<img class="avatar buyuk" src="' + esc(kullanici.photoURL) + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<div><b>' + esc(kullanici.displayName || '') + '</b><p class="kucuk">' + esc(kullanici.email || '') + ' · <span class="rol-rozet r-' + rol + '">' + ROL_AD[rol] + '</span></p>' +
      (rol === 'kisitli' ? '<p class="uyari" style="margin-top:8px">Hesabın kısıtlandı' + (rolNeden ? ': ' + esc(rolNeden) : '') + '. Siteyi gezebilirsin ama parça ekleyemez ve kiralama yapamazsın. Yardım için sağ alttaki "Soru sor"u kullan.</p>' : '') +
      '</div></div>' +
      '<div class="form-izgara" style="margin-top:14px"><div class="alan"><label for="hTel">Telefon <span class="kucuk">(gizli)</span></label><input id="hTel" type="tel" autocomplete="tel" value="' + esc(uye.telefon || '') + '"></div>' +
        '<div class="alan"><label for="hSehir">Şehir <span class="kucuk">(profilinde görünür)</span></label><input id="hSehir" maxlength="40" autocomplete="address-level1"></div>' +
        '<div class="alan tam"><label for="hHakkimda">Hakkımda <span class="kucuk">(profilinde görünür, en çok 300 karakter)</span></label><textarea id="hHakkimda" maxlength="300" placeholder="Örn. Ölçülerim, tarzım, teslim tercihlerim…"></textarea></div></div>' +
      '<p class="kucuk" style="margin-top:6px">Ad ve fotoğraf Google hesabından gelir. Profilinde adın, fotoğrafın, şehrin, hakkında yazın, sadakat seviyen ve yayındaki parçaların görünür; telefon, adres ve e-posta görünmez. <a href="#profil/' + esc(kullanici.uid) + '" style="text-decoration:underline">Profilimi gör</a></p>' +
      '<button type="button" class="dug dug-ana" id="profilKaydet" style="margin-top:12px">Kaydet</button></section>' +
    /* sadakat */
    '<section class="kutu" id="b-puan"><h2>Sadakat puanım</h2><div id="sadakatIc"><p class="yukleniyor">Hesaplanıyor…</p></div></section>' +
    /* adresler */
    '<section class="kutu" id="b-adresler"><h2>Kayıtlı adreslerim</h2><div class="adresler">' +
      (adresler.length ? adresler.map((a, i) => '<div class="adres"><b>' + esc(a.baslik) + '</b><p>' + esc(a.adSoyad) + ' · ' + esc(a.telefon) + '</p><p>' + esc(a.adres) + '</p><p>' + esc(a.ilce) + ' / ' + esc(a.il) + '</p>' +
        '<div class="eylem"><button type="button" class="dug dug-kucuk" data-adres-duzenle="' + i + '">Düzenle</button><button type="button" class="dug dug-kucuk dug-tehlike" data-adres-sil="' + i + '">Sil</button></div></div>').join('')
        : '<p class="kucuk">Kayıtlı adresin yok. Teslimatlarda hızlıca seçebilmek için ekleyebilirsin.</p>') +
      '</div>' + (adresler.length < 10 ? '<button type="button" class="dug" id="adresEkle" style="margin-top:12px">+ Adres ekle</button>' : '') + '</section>' +
    /* kartlar */
    '<section class="kutu" id="b-odeme"><h2>Ödeme alacağım hesap</h2>' +
      '<p class="kucuk">Dolabından kiralanan parçaların kira ödemesi (site komisyonu düşülerek) ve kiraladığın parçaların depozito iadesi bu hesaba yapılır. Yalnız sen ve site yöneticileri görür.</p>' +
      '<div class="form-izgara" style="margin-top:12px"><div class="alan"><label for="hIbanAd">Hesap sahibinin adı</label><input id="hIbanAd" maxlength="80" value="' + esc(uye.ibanAd || '') + '"></div>' +
      '<div class="alan"><label for="hIban">IBAN</label><input id="hIban" maxlength="40" placeholder="TR00 0000 0000 0000 0000 0000 00" value="' + esc(uye.iban || '') + '"></div></div>' +
      '<p class="hata" id="ibanHata" role="alert"></p>' +
      '<button type="button" class="dug dug-ana" id="ibanKaydet" style="margin-top:8px">Kaydet</button></section>' +
    '<section class="kutu" id="b-gecmis"><h2>Ödeme geçmişim</h2><div id="gecmisIc"><p class="yukleniyor">Yükleniyor…</p></div></section>' +
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
  sadakatGetir(kullanici.uid).then(x => { if (istek === aktifIstek && $('#sadakatIc')) $('#sadakatIc').innerHTML = sadakatHTML(x, true); })
    .catch(h => { if ($('#sadakatIc')) $('#sadakatIc').innerHTML = '<p class="kucuk">Hesaplanamadı: ' + esc(hataMetni(h)) + '</p>'; });
  Promise.all([kiraListesi('kiraciId', kullanici.uid), kiraListesi('sahipId', kullanici.uid), borcListesi(kullanici.uid).catch(() => []), boostListesi('sahipId', kullanici.uid).catch(() => [])])
    .then(([a, b, br, bo]) => {
      if (istek !== aktifIstek || !$('#gecmisIc')) return;
      const kl = a.concat(b.filter(x => !a.some(y => y.id === x.id)));
      const acik = br.filter(x => x.durum !== 'kapandi');
      $('#gecmisIc').innerHTML = (acik.length ? '<div style="margin-bottom:12px">' + acik.map(x => '<p class="' + (kisiBorclu(x) ? 'eksi' : 'arti') + '"><b>' +
          (kisiBorclu(x) ? 'Açık borcun: ' : 'Açık alacağın: ') + tl(x.tutar) + '</b> <span class="kucuk">· ' + esc(x.neden) + ' · ' + esc(x.esyaBaslik || '') +
          (kisiBorclu(x) ? ' · <a href="#kiralamalar" style="text-decoration:underline">Kiralamalarım\'dan öde</a>' : '') + '</span></p>').join('') + '</div>' : '') +
        gecmisHTML(odemeOlaylari(kl, br, bo, kullanici.uid));
    }).catch(h => { if ($('#gecmisIc')) $('#gecmisIc').innerHTML = '<p class="kucuk">Yüklenemedi: ' + esc(hataMetni(h)) + '</p>'; });

  const kaydet = async (veri, mesaj) => { try { await uyeKaydet(veri); bildir(mesaj); sayfaCiz(); } catch (h) { bildir(hataMetni(h)); } };
  profilGetir(kullanici.uid).then(pf => { if (pf && $('#hSehir')) { $('#hSehir').value = pf.sehir || ''; $('#hHakkimda').value = pf.hakkimda || ''; } }).catch(() => {});
  $('#ibanKaydet').onclick = () => {
    const iban = $('#hIban').value.replace(/\s+/g, '').toUpperCase(), ad = $('#hIbanAd').value.trim().slice(0, 80);
    if (iban && !/^TR\d{24}$/.test(iban)) { $('#ibanHata').textContent = 'IBAN TR ile başlayan 26 karakter olmalı.'; return; }
    if (iban && ad.length < 3) { $('#ibanHata').textContent = 'Hesap sahibinin adını yazın.'; return; }
    kaydet({ iban, ibanAd: ad }, 'Ödeme bilgilerin kaydedildi.');
  };
  $('#profilKaydet').onclick = async () => {
    const sorun = icerikSorunu($('#hHakkimda').value + ' \n ' + $('#hSehir').value); if (sorun) { bildir('Hakkımda: ' + sorun); return; }
    if (!D) {
      try {
        await setDoc(doc(db, 'dolapProfiller', kullanici.uid), { sehir: $('#hSehir').value.trim().slice(0, 40),
          hakkimda: $('#hHakkimda').value.trim().slice(0, 300), guncelleme: serverTimestamp() }, { merge: true });
      } catch (h) { bildir(hataMetni(h)); return; }
    }
    kaydet({ telefon: $('#hTel').value.trim().slice(0, 30) }, 'Profil kaydedildi.');
  };
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
    setDoc(doc(db, 'dolapProfiller', u.uid), { ad: temel.ad, foto: temel.foto, katilma: (uye && uye.ilkGiris && uye.ilkGiris.toMillis) ? uye.ilkGiris : SIMDI() }, { merge: true }).catch(() => {});
    if (ilkKez) olay('giris', { sayfa: yol()[0] || 'kesfet' });
  }
  hesapCiz(); sayfaCiz(); sohbetIzle(); begenileriYukle();
}

asistanKur();
siralamaKur();
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
