/* sersoz.com — Elif'in Dolabı jeton ve Satıcı Pro (App Store uygulama içi satın alma)
 *
 * iOS uygulaması StoreKit 2 ile satın alır ve Apple'ın imzalı işlem kaydını (JWS) appleSatinAlma'ya
 * gönderir. İmza Apple kök sertifikasına kadar burada doğrulanır, her işlem bir kez işlenir.
 * Abonelik yenilemeleri ve iadeler App Store sunucu bildirimleriyle (V2) appleBildirim'e gelir.
 * Bakiye, işlem defteri ve Pro süresini YALNIZ bu dosya yazar (firestore.rules tarayıcıya kapalı).
 *
 *   appleSatinAlma  (callable) { jws }                 → jeton ya da Pro yükler
 *   appleBildirim   (https)    App Store Server Notifications V2 (URL App Store Connect'e girilir)
 *   jetonlaOneCikar (callable) { esyaId, paket }       → bakiyeden düşer, parçayı öne çıkarır
 *   jetonYonetim    (callable) { kimlik, miktar, aciklama } → admin elle yükler / düşer (havale, iade, hediye)
 *   jetonHesapSil   (callable)                      → hesap silinirken bakiye ve Pro kaydını siler
 *
 * Jeton yalnız dijital hizmete (öne çıkarma) harcanır; kiralama ödemesine kullanılamaz (App Store 3.1.1 / 3.1.3(e)).
 */
const crypto = require('node:crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const BOLGE = 'europe-west1';
const BUNDLE = 'com.sersoz.elifdolabi';
const TAM_YETKILI = 'sercansozer20@gmail.com';

/* App Store Connect'teki ürün kimlikleri */
const JETON_URUN = {
  'com.sersoz.elifdolabi.jeton50': 50,
  'com.sersoz.elifdolabi.jeton150': 150,
  'com.sersoz.elifdolabi.jeton450': 450
};
const PRO_URUN = 'com.sersoz.elifdolabi.pro.aylik';
const PRO_HEDIYE = 150;   // Pro'nun her ayı (ilk alım ve her yenileme) bu kadar jeton verir

/* Öne çıkarma bedeli (jeton). Süreler ayarlar.js → oneCikarma ve firestore.rules ile aynı;
   bedeller oradaki TL fiyatlarına eşit tutulur (1 jeton = 1 TL). Değişirse iki yerde de değiştir. */
const PAKET = {
  saatlik: { ad: '1 saat', saat: 1, jeton: 10 },
  gunluk: { ad: '1 gün', saat: 24, jeton: 39 },
  haftalik: { ad: '1 hafta', saat: 168, jeton: 149 },
  aylik: { ad: '1 ay', saat: 720, jeton: 399 }
};

const db = () => getFirestore();
const ms = v => (v && v.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);
const hata = (kod, metin) => new HttpsError(kod, metin);

/* ---------------------------------------------------------------- Apple imzası (JWS, ES256, x5c zinciri)
 * Zincir: yaprak → ara (Apple WWDR) → kök. Kök, Apple'ın yayımladığı AppleRootCA-G3 ile bayt bayt aynı olmalı;
 * her halka bir üsttekince imzalanmış olmalı; yaprak ve ara sertifikada Apple'ın App Store uzantıları bulunmalı. */
const APPLE_KOK_ADRES = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';
const OID_YAPRAK = Buffer.from('060a2a864886f76364060b01', 'hex');   // 1.2.840.113635.100.6.11.1
const OID_ARA = Buffer.from('060a2a864886f76364060201', 'hex');      // 1.2.840.113635.100.6.2.1
let appleKok = null;
async function kokSertifika() {
  if (appleKok) return appleKok;
  const r = await fetch(APPLE_KOK_ADRES);
  if (!r.ok) throw new Error('Apple kök sertifikası alınamadı: ' + r.status);
  appleKok = Buffer.from(await r.arrayBuffer());
  return appleKok;
}
const b64url = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function jwsCoz(jws) {
  const gecersiz = () => hata('invalid-argument', 'Satın alma kaydı doğrulanamadı.');
  if (typeof jws !== 'string' || jws.length > 30000) throw gecersiz();
  const p = jws.split('.');
  if (p.length !== 3) throw gecersiz();
  let baslik, govde;
  try { baslik = JSON.parse(b64url(p[0]).toString('utf8')); govde = JSON.parse(b64url(p[1]).toString('utf8')); }
  catch (e) { throw gecersiz(); }
  if (baslik.alg !== 'ES256' || !Array.isArray(baslik.x5c) || baslik.x5c.length !== 3) throw gecersiz();
  const [yaprakDer, araDer, kokDer] = baslik.x5c.map(x => Buffer.from(x, 'base64'));
  if (!kokDer.equals(await kokSertifika())) throw gecersiz();
  let yaprak, ara, kok;
  try { yaprak = new crypto.X509Certificate(yaprakDer); ara = new crypto.X509Certificate(araDer); kok = new crypto.X509Certificate(kokDer); }
  catch (e) { throw gecersiz(); }
  if (!ara.checkIssued(kok) || !ara.verify(kok.publicKey)) throw gecersiz();
  if (!yaprak.checkIssued(ara) || !yaprak.verify(ara.publicKey)) throw gecersiz();
  if (!yaprakDer.includes(OID_YAPRAK) || !araDer.includes(OID_ARA)) throw gecersiz();
  const an = govde.signedDate || Date.now();
  for (const s of [yaprak, ara]) if (an < Date.parse(s.validFrom) || an > Date.parse(s.validTo)) throw gecersiz();
  const imzaTamam = crypto.verify('sha256', Buffer.from(p[0] + '.' + p[1]),
    { key: yaprak.publicKey, dsaEncoding: 'ieee-p1363' }, b64url(p[2]));
  if (!imzaTamam) throw gecersiz();
  return govde;
}

/* Satın alımı Firebase hesabına bağlayan kimlik (appAccountToken). Tarayıcı aynısını hesaplar (elif.js → hesapKodu). */
function hesapKodu(uid) {
  const h = crypto.createHash('sha256').update('elif-dolabi:' + uid).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
    ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20), h.slice(20, 32)].join('-');
}

function defter(tx, kayit) {
  tx.set(db().collection('dolapJetonIslem').doc(), { ...kayit, zaman: FieldValue.serverTimestamp() });
}

/* Doğrulanmış Apple işlemini hesaba işler. Aynı transactionId ikinci kez gelirse hiçbir şey yapmaz. */
async function islemUygula(uid, t) {
  const islemRef = db().doc('dolapAppleIslem/' + t.transactionId);
  const cuzdanRef = db().doc('dolapJetonlar/' + uid);
  return db().runTransaction(async tx => {
    const [islem, cuzdan] = await Promise.all([tx.get(islemRef), tx.get(cuzdanRef)]);
    const c = cuzdan.exists ? cuzdan.data() : {};
    let bakiye = c.bakiye || 0, proBitis = ms(c.proBitis);
    if (islem.exists) return { bakiye, proBitis, miktar: 0, zaten: true };
    if (t.revocationDate) throw hata('failed-precondition', 'Bu satın alma iade edilmiş.');
    let miktar, tur, aciklama;
    if (JETON_URUN[t.productId]) {
      miktar = JETON_URUN[t.productId] * (t.quantity || 1); tur = 'satin_alma'; aciklama = miktar + ' jeton (App Store)';
    } else if (t.productId === PRO_URUN) {
      miktar = PRO_HEDIYE; tur = 'pro'; aciklama = 'Satıcı Pro · aylık jeton';
      if ((t.expiresDate || 0) > proBitis) proBitis = t.expiresDate;
      tx.set(db().doc('dolapAppleAbonelik/' + t.originalTransactionId), { uid, urun: t.productId, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(db().doc('dolapPro/' + uid), { bitis: Timestamp.fromMillis(proBitis) });
    } else throw hata('invalid-argument', 'Bilinmeyen ürün: ' + t.productId);
    bakiye += miktar;
    tx.set(islemRef, { uid, urun: t.productId, miktar, ortam: t.environment || '', zaman: FieldValue.serverTimestamp() });
    tx.set(cuzdanRef, { bakiye, proBitis: proBitis ? Timestamp.fromMillis(proBitis) : null, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
    defter(tx, { uid, tur, miktar, bakiyeSonra: bakiye, kaynak: 'apple', urun: t.productId, islemId: String(t.transactionId),
      ortam: t.environment || '', aciklama });
    return { bakiye, proBitis, miktar, zaten: false };
  });
}

/* İade / geri alma: yüklenen jeton geri düşer (eksiye inmez), Pro iade anında biter. */
async function iadeUygula(t) {
  const islemRef = db().doc('dolapAppleIslem/' + t.transactionId);
  await db().runTransaction(async tx => {
    const islem = await tx.get(islemRef);
    if (!islem.exists || islem.data().iade) return;
    const uid = islem.data().uid;
    const cuzdanRef = db().doc('dolapJetonlar/' + uid);
    const c = (await tx.get(cuzdanRef)).data() || {};
    const dus = Math.min(c.bakiye || 0, islem.data().miktar || 0);
    const guncel = { bakiye: (c.bakiye || 0) - dus, guncelleme: FieldValue.serverTimestamp() };
    if (t.productId === PRO_URUN) {
      const bitis = Math.min(ms(c.proBitis) || Date.now(), t.revocationDate || Date.now());
      guncel.proBitis = Timestamp.fromMillis(bitis);
      tx.set(db().doc('dolapPro/' + uid), { bitis: Timestamp.fromMillis(bitis) });
    }
    tx.set(cuzdanRef, guncel, { merge: true });
    tx.update(islemRef, { iade: true });
    defter(tx, { uid, tur: 'iade', miktar: -dus, bakiyeSonra: guncel.bakiye, kaynak: 'apple', urun: t.productId,
      islemId: String(t.transactionId), aciklama: 'App Store iadesi' });
  });
}

exports.appleSatinAlma = onCall({ region: BOLGE }, async req => {
  if (!req.auth) throw hata('unauthenticated', 'Önce giriş yap.');
  const t = await jwsCoz(req.data && req.data.jws);
  if (t.bundleId !== BUNDLE) throw hata('invalid-argument', 'Bu satın alma bu uygulamaya ait değil.');
  if (!t.appAccountToken || String(t.appAccountToken).toLowerCase() !== hesapKodu(req.auth.uid))
    throw hata('permission-denied', 'Bu satın alma başka bir hesaba ait.');
  const r = await islemUygula(req.auth.uid, t);
  return { bakiye: r.bakiye, proBitis: r.proBitis || null, miktar: r.miktar, zaten: r.zaten, islemId: String(t.transactionId) };
});

exports.appleBildirim = onRequest({ region: BOLGE }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send(''); return; }
  try {
    const b = await jwsCoz(req.body && req.body.signedPayload);
    const veri = b.data || {};
    if (veri.bundleId !== BUNDLE || !veri.signedTransactionInfo) { res.status(200).send('ok'); return; }
    const t = await jwsCoz(veri.signedTransactionInfo);
    if (b.notificationType === 'SUBSCRIBED' || b.notificationType === 'DID_RENEW') {
      const a = await db().doc('dolapAppleAbonelik/' + t.originalTransactionId).get();
      // İlk alımda kayıt henüz yoksa uygulama appleSatinAlma ile işler; aynı işlem iki kez sayılmaz.
      if (a.exists) await islemUygula(a.data().uid, t);
    } else if (b.notificationType === 'REFUND' || b.notificationType === 'REVOKE') {
      await iadeUygula(t);
    }
    res.status(200).send('ok');
  } catch (h) {
    console.error('appleBildirim', h);
    res.status(400).send('hata');
  }
});

async function yetkiliMi(token) {
  if (!token || token.email_verified !== true || !token.email) return false;
  if (token.email === TAM_YETKILI) return true;
  const r = await db().doc('dolapRoller/' + token.email).get();
  return r.exists && r.data().rol === 'admin';
}

exports.jetonlaOneCikar = onCall({ region: BOLGE }, async req => {
  if (!req.auth) throw hata('unauthenticated', 'Önce giriş yap.');
  const { esyaId, paket } = req.data || {};
  const p = PAKET[paket];
  if (!p || typeof esyaId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(esyaId)) throw hata('invalid-argument', 'Geçersiz paket.');
  const uid = req.auth.uid, eposta = req.auth.token.email;
  if (eposta) {
    const r = await db().doc('dolapRoller/' + eposta).get();
    if (r.exists && r.data().rol === 'kisitli') throw hata('permission-denied', 'Hesabın kısıtlandı; öne çıkarma yapamazsın.');
  }
  return db().runTransaction(async tx => {
    const esyaRef = db().doc('dolapEsyalar/' + esyaId), cuzdanRef = db().doc('dolapJetonlar/' + uid);
    const [es, cz] = await Promise.all([tx.get(esyaRef), tx.get(cuzdanRef)]);
    if (!es.exists) throw hata('not-found', 'Parça bulunamadı.');
    const e = es.data();
    if (e.sahipId !== uid) throw hata('permission-denied', 'Bu parça senin değil.');
    if (e.onay !== 'onaylandi' || !e.aktif || e.ornek) throw hata('failed-precondition', 'Yalnız yayındaki parçalar öne çıkarılabilir.');
    const bakiye = cz.exists ? (cz.data().bakiye || 0) : 0;
    if (bakiye < p.jeton) throw hata('failed-precondition', 'Yeterli jetonun yok (' + p.jeton + ' gerekli, ' + bakiye + ' var).');
    const bas = Math.max(Date.now(), ms(e.oneCikanBitis));   // süren öne çıkarmanın üstüne eklenir
    const bitis = Timestamp.fromMillis(bas + p.saat * 36e5);
    const kalan = bakiye - p.jeton;
    const foto = (Array.isArray(e.fotolar) && typeof e.fotolar[0] === 'string' && e.fotolar[0].length <= 120000) ? e.fotolar[0] : '';
    tx.update(esyaRef, { oneCikanBitis: bitis });
    tx.set(cuzdanRef, { bakiye: kalan, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db().collection('dolapBoostlar').doc(), {
      esyaId, esyaBaslik: String(e.baslik || '').slice(0, 80), esyaFoto: foto, sahipId: uid, sahipAd: String(e.sahipAd || '').slice(0, 80),
      paket, saat: p.saat, fiyat: p.jeton, odeme: 'jeton', durum: 'aktif',
      baslangic: Timestamp.fromMillis(bas), bitis, olusturma: FieldValue.serverTimestamp(), guncelleme: FieldValue.serverTimestamp()
    });
    defter(tx, { uid, tur: 'harcama', miktar: -p.jeton, bakiyeSonra: kalan, kaynak: 'one_cikar', esyaId, paket,
      aciklama: String(e.baslik || '').slice(0, 60) + ' · ' + p.ad + ' öne çıkarma' });
    return { bakiye: kalan, bitis: bitis.toMillis() };
  });
});

exports.jetonYonetim = onCall({ region: BOLGE }, async req => {
  if (!(await yetkiliMi(req.auth && req.auth.token))) throw hata('permission-denied', 'Bu işlem yalnız yönetim içindir.');
  const { kimlik, miktar, aciklama } = req.data || {};
  if (!Number.isInteger(miktar) || miktar === 0 || Math.abs(miktar) > 100000) throw hata('invalid-argument', 'Miktar 0 olmayan bir tam sayı olmalı.');
  if (typeof aciklama !== 'string' || aciklama.trim().length < 3 || aciklama.length > 200) throw hata('invalid-argument', 'Açıklama yaz (3–200 karakter).');
  const k = String(kimlik || '').trim();
  let uid = k;
  if (k.includes('@')) {
    try { uid = (await getAuth().getUserByEmail(k.toLowerCase())).uid; }
    catch (e) { throw hata('not-found', 'Bu e-postayla kayıtlı kullanıcı yok.'); }
  } else if (!/^[A-Za-z0-9]{10,64}$/.test(k)) throw hata('invalid-argument', 'E-posta ya da kullanıcı kimliği gir.');
  return db().runTransaction(async tx => {
    const ref = db().doc('dolapJetonlar/' + uid);
    const c = (await tx.get(ref)).data() || {};
    const bakiye = (c.bakiye || 0) + miktar;
    if (bakiye < 0) throw hata('failed-precondition', 'Bakiye eksiye düşemez (şu an ' + (c.bakiye || 0) + ').');
    tx.set(ref, { bakiye, guncelleme: FieldValue.serverTimestamp() }, { merge: true });
    defter(tx, { uid, tur: miktar > 0 ? 'yukleme' : 'dusum', miktar, bakiyeSonra: bakiye, kaynak: 'yonetim',
      aciklama: aciklama.trim(), yapan: req.auth.token.email });
    return { uid, bakiye };
  });
});

/* Hesap silinirken (elif.js → hesabiTamamenSil) bakiye ve Pro kaydı silinir; hareket defteri yasal kayıt olarak kalır.
   App Store aboneliğini Apple yönetir; kullanıcı onu App Store'dan iptal eder. */
exports.jetonHesapSil = onCall({ region: BOLGE }, async req => {
  if (!req.auth) throw hata('unauthenticated', 'Önce giriş yap.');
  const uid = req.auth.uid;
  await db().runTransaction(async tx => {
    const ref = db().doc('dolapJetonlar/' + uid);
    const c = (await tx.get(ref)).data();
    if (c && c.bakiye) defter(tx, { uid, tur: 'hesap_silindi', miktar: -c.bakiye, bakiyeSonra: 0, kaynak: 'hesap', aciklama: 'Hesap silindi, kalan jeton sona erdi' });
    tx.delete(ref);
    tx.delete(db().doc('dolapPro/' + uid));
  });
  return { tamam: true };
});

exports._test = { jwsCoz, hesapKodu };
