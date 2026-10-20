/* sersoz.com — Elif'in Dolabı e-posta bildirimleri (Firebase Cloud Functions, 2. nesil)
 *
 * Postayı kendisi göndermez: "mail" koleksiyonuna belge yazar; Firebase'in
 * "Trigger Email from Firestore" eklentisi (firebase/firestore-send-email) gönderir.
 * Tarayıcı "mail" koleksiyonuna yazamaz (firestore.rules), böylece site üzerinden
 * başkasına istenmeyen posta attırılamaz.
 *
 *   urunOnayaDustu : ürün "onay bekliyor"a düştü  → panelden atanmış adminler (yoksa tam yetkili)
 *   soruGeldi      : soru-cevaptan yeni kullanıcı mesajı → panelden atanmış adminler (yoksa tam yetkili)
 *   yanitGeldi     : admin yanıtladı → soruyu soran (e-posta bildirimi açıksa)
 *   appleSatinAlma, appleBildirim, jetonlaOneCikar, jetonYonetim: jeton.js
 *
 * Kurulum: functions/BENIOKU.md
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const TAM_YETKILI = 'sercansozer20@gmail.com';
const SITE = 'https://sersoz.com/elif.html';
const BOLGE = 'europe-west1';   // Firestore konumu eur3 (Avrupa)

const kac = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Alıcılar: panelden atanmış adminler. Hiç admin yoksa mesaj kaybolmasın diye tam yetkili. */
async function yetkililer() {
  const s = await db.collection('dolapRoller').where('rol', '==', 'admin').get();
  const adminler = s.docs.map(d => d.id);
  return adminler.length ? adminler : [TAM_YETKILI];
}
function sablon(baslik, govde, dugmeYazi, adres) {
  return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2a1f1e">' +
    '<p style="font-family:Georgia,serif;font-style:italic;font-size:22px;margin:0 0 16px">Elif\'in <b style="font-style:normal">Dolabı</b></p>' +
    '<h2 style="font-size:18px;margin:0 0 10px">' + baslik + '</h2>' + govde +
    '<p style="margin:24px 0"><a href="' + adres + '" style="background:#2a1f1e;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none">' + dugmeYazi + '</a></p>' +
    '<p style="font-size:12px;color:#7a6c69">Bu e-posta sersoz.com yönetim bildirimidir.</p></div>';
}
const postala = (to, subject, html) => db.collection('mail').add({ to, message: { subject, html } });

exports.urunOnayaDustu = onDocumentWritten({ document: 'dolapEsyalar/{id}', region: BOLGE }, async ev => {
  const once = ev.data.before.exists ? ev.data.before.data() : null;
  const sonra = ev.data.after.exists ? ev.data.after.data() : null;
  if (!sonra || sonra.onay !== 'bekliyor') return;
  if (once && once.onay === 'bekliyor') return;          // zaten kuyruktaydı
  const govde = '<p><b>' + kac(sonra.baslik) + '</b> · ' + kac(sonra.marka) + ' · ' + kac(sonra.beden) + '</p>' +
    '<p>' + kac(sonra.sahipAd) + ' ' + (once ? 'parçasını düzenledi' : 'yeni parça ekledi') + '. Günlük ' + kac(sonra.gunlukUcret) + ' TL, depozito ' + kac(sonra.depozito) + ' TL.</p>' +
    (sonra.fotolar && sonra.fotolar[0] ? '<img src="' + kac(sonra.fotolar[0]) + '" alt="" style="width:180px;border-radius:12px">' : '');
  await postala(await yetkililer(), 'Onay bekleyen parça: ' + sonra.baslik,
    sablon('Onay bekleyen parça var', govde, 'Onay kuyruğunu aç', SITE + '#yonetim/onay'));
});

exports.soruGeldi = onDocumentWritten({ document: 'dolapSohbet/{id}', region: BOLGE }, async ev => {
  const once = ev.data.before.exists ? ev.data.before.data() : null;
  const sonra = ev.data.after.exists ? ev.data.after.data() : null;
  if (!sonra || !Array.isArray(sonra.mesajlar) || !sonra.mesajlar.length) return;
  const n = sonra.mesajlar.length, son = sonra.mesajlar[n - 1];
  if (once && Array.isArray(once.mesajlar) && once.mesajlar.length === n) return;   // yeni mesaj yok

  if (son.kimden === 'kullanici') {
    await postala(await yetkililer(), 'Yeni soru: ' + sonra.ad,
      sablon(kac(sonra.ad) + ' bir soru sordu', '<blockquote style="margin:0;padding:12px 14px;background:#f8ebe7;border-radius:12px">' + kac(son.metin) + '</blockquote>',
        'Gelen kutusunda yanıtla', SITE + '#yonetim/gelen/' + ev.params.id));
  } else if (son.kimden === 'admin') {
    const uye = await db.collection('dolapUyeler').doc(sonra.uid).get();
    if (uye.exists && uye.data().bildirimEposta === false) return;
    await postala([sonra.eposta], 'Sorunuz yanıtlandı · Elif\'in Dolabı',
      sablon('Sorunuz yanıtlandı', '<blockquote style="margin:0;padding:12px 14px;background:#e8eefc;border-radius:12px">' + kac(son.metin) + '</blockquote>',
        'Siteye git', SITE));
  }
});

/* Jeton ve Satıcı Pro (App Store uygulama içi satın alma): jeton.js */
const jeton = require('./jeton');
for (const ad of ['appleSatinAlma', 'appleBildirim', 'jetonlaOneCikar', 'jetonYonetim', 'jetonHesapSil']) exports[ad] = jeton[ad];
