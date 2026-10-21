/* TOEFL Kart — hesap ve eşitleme (Firebase sersoz-f93c3, Elif'in Dolabı ile aynı proje)
 *
 * Giriş isteğe bağlıdır: girişsiz uygulama eskisi gibi yalnız cihazda çalışır.
 * Giriş yapılınca ilerleme Firestore'da toeflKart/{uid} belgesine yazılır ve
 * her cihazda aynı olur. Belgeyi yalnız sahibi okur/yazar (firestore.rules).
 *
 * Web'de Google açılır penceresi; iPhone uygulamasında (Capacitor) yerel
 * Apple / Google penceresi kullanılır. Apple, Google girişinin yanında
 * "Apple ile giriş"i şart koşar (App Store 4.8).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged, deleteUser }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyBKmrw-nVmuFM7V4HGG0wosdxsVWV1dJ48",
  authDomain: "sersoz-f93c3.firebaseapp.com",
  projectId: "sersoz-f93c3",
  storageBucket: "sersoz-f93c3.firebasestorage.app",
  messagingSenderId: "173131115543",
  appId: "1:173131115543:web:f0313dd00ac0f2d3f80052",
});   // varsayılan uygulama: sersoz.com'daki öbür sayfalarla aynı oturum
const db = getFirestore(app);

const TK = window.TK;
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const yerelAuth = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication;
// iPhone uygulamasında (capacitor://) getAuth açılır pencere altyapısını yüklemeye çalışıp takılır; orada yalnız kalıcılık verilir.
const auth = NATIVE ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);

let kullanici = null;
let hazir = false;       // ilk çekme + birleştirme bitmeden buluta yazılmaz
let zamanlayici = null;

/* ─────────── Birleştirme ─────────── */

// Aynı kelime iki cihazda çalışıldıysa daha çok görüleni (eşitse vadesi ileride olanı) al.
function kelimeSec(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((a.seen || 0) !== (b.seen || 0)) return (a.seen || 0) > (b.seen || 0) ? a : b;
  return (a.due || 0) >= (b.due || 0) ? a : b;
}

function birlestir(yerel, bulut) {
  const s = Object.assign({}, bulut, { words: {}, days: {} });
  for (const k of new Set([...Object.keys(yerel.words || {}), ...Object.keys(bulut.words || {})])) {
    s.words[k] = kelimeSec((yerel.words || {})[k], (bulut.words || {})[k]);
  }
  for (const k of new Set([...Object.keys(yerel.days || {}), ...Object.keys(bulut.days || {})])) {
    const a = (yerel.days || {})[k] || {}, b = (bulut.days || {})[k] || {};
    s.days[k] = {
      studied: Math.max(a.studied || 0, b.studied || 0),
      known: Math.max(a.known || 0, b.known || 0),
      quiz: Math.max(a.quiz || 0, b.quiz || 0),
    };
  }
  s.settings = Object.assign({}, yerel.settings, bulut.settings || {});
  s.profile = Object.assign({}, yerel.profile, bulut.profile || {});
  if (!s.profile.name) s.profile.name = yerel.profile.name;
  if (!s.profile.photo) s.profile.photo = yerel.profile.photo;
  return s;
}

/* ─────────── Bulut ─────────── */

const belge = () => doc(db, "toeflKart", kullanici.uid);

async function cek() {
  const snap = await getDoc(belge());
  if (!snap.exists()) return null;
  try { return JSON.parse(snap.data().veri); } catch (e) { return null; }
}

async function yaz() {
  if (!kullanici || !hazir) return;
  const veri = JSON.stringify(TK.store);
  if (veri.length > 900000) return;   // kural sınırı; olağan kayıt ~100 KB
  await setDoc(belge(), { veri, surum: 1, guncel: serverTimestamp() });
}

function yazSonra() {
  if (!kullanici || !hazir) return;
  clearTimeout(zamanlayici);
  zamanlayici = setTimeout(() => yaz().catch(hataGoster), 2500);
}

function hemenYaz() {
  if (!zamanlayici) return;
  clearTimeout(zamanlayici);
  zamanlayici = null;
  yaz().catch(() => {});
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") hemenYaz(); });

async function esitle() {
  hazir = false;
  const bulut = await cek();
  const p = TK.store.profile;
  const s = bulut ? birlestir(TK.store, bulut) : TK.store;
  s.profile = Object.assign({}, s.profile, {
    google: true,
    email: kullanici.email || p.email || "",
    name: s.profile.name || kullanici.displayName || "",
    photo: s.profile.photo || kullanici.photoURL || "",
  });
  TK.replace(s);
  hazir = true;
  await yaz();
}

/* ─────────── Giriş / çıkış ─────────── */

function hataGoster(e) {
  const k = (e && e.code) || "";
  if (k === "auth/popup-closed-by-user" || k === "auth/cancelled-popup-request") return;
  if (/cancel|iptal|1001/i.test(String((e && (e.message || e.code)) || ""))) return;
  if (k === "auth/unauthorized-domain") return TK.toast("Bu adres Firebase'de yetkili değil");
  if (k === "permission-denied") return TK.toast("Eşitleme izni yok (veritabanı kuralı yüklenmemiş olabilir)");
  if (k === "auth/network-request-failed" || k === "unavailable") return TK.toast("İnternet bağlantısı yok");
  TK.toast("Giriş tamamlanamadı");
  console.warn(e);
}

async function giris(saglayici) {
  try {
    if (NATIVE) {
      const fa = yerelAuth();
      if (!fa) throw new Error("Yerel giriş eklentisi yok");
      if (saglayici === "apple") {
        const r = await fa.signInWithApple({ skipNativeAuth: true });
        await signInWithCredential(auth, new OAuthProvider("apple.com").credential({ idToken: r.credential.idToken, rawNonce: r.credential.nonce }));
      } else {
        const r = await fa.signInWithGoogle({ skipNativeAuth: true });
        await signInWithCredential(auth, GoogleAuthProvider.credential(r.credential.idToken, r.credential.accessToken));
      }
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
    TK.toast("Giriş yapıldı, ilerlemen eşitleniyor");
  } catch (e) { hataGoster(e); }
}

async function cikis() {
  hemenYaz();
  hazir = false;
  await signOut(auth).catch(() => {});
  if (NATIVE && yerelAuth()) await yerelAuth().signOut().catch(() => {});
}

// Hesabı ve buluttaki ilerlemeyi siler (App Store 5.1.1(v)). Cihazdaki ilerleme kalır.
async function hesabiSil() {
  if (!kullanici) return;
  const son = Date.parse(kullanici.metadata.lastSignInTime || 0);
  if (Date.now() - son > 4 * 60000) {
    TK.toast("Güvenlik için önce çıkış yapıp yeniden giriş yap, sonra tekrar dene");
    return;
  }
  hazir = false;
  clearTimeout(zamanlayici);
  try {
    await deleteDoc(belge());
    await deleteUser(kullanici);
    if (NATIVE && yerelAuth()) await yerelAuth().signOut().catch(() => {});
    TK.toast("Hesabın ve buluttaki ilerlemen silindi");
  } catch (e) { hataGoster(e); }
}

onAuthStateChanged(auth, async (u) => {
  kullanici = u;
  if (!u) {
    hazir = false;
    if (TK.store.profile.google) {
      TK.store.profile = Object.assign({}, TK.store.profile, { google: false, email: "" });
      TK.save();
    }
    TK.setAuthState({ girisli: false, native: NATIVE });
    return;
  }
  TK.setAuthState({ girisli: true, native: NATIVE, bekliyor: true });
  try {
    await esitle();
  } catch (e) { hataGoster(e); }
  TK.setAuthState({ girisli: true, native: NATIVE });
});

window.TKHesap = { giris, cikis, hesabiSil, degisti: yazSonra };
// Uygulamada yerel giriş eklentisi yoksa giriş düğmeleri gizli kalır (uygulama girişsiz çalışır)
TK.setAuthState({ girisli: false, native: NATIVE, hazir: !NATIVE || !!yerelAuth() });
