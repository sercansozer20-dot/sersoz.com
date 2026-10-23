// VisionCap uygulaması: dersler (GLSL), ilerleme, kartlar, ekranlar ve Pro aboneliği.
// iOS kabuğu (visioncap-ios) bu sayfayı açar; yerel eklenti yoksa ilgili özellik gizlenir.

import { BILGI_KARTLARI, MAKALE_KARTLARI } from './visioncap-kartlar.js?v=20261021a';

const ORTAK = `precision mediump float;
uniform sampler2D u_img;
uniform vec2 u_px;
varying vec2 v_uv;
vec3 t(vec2 o) { return texture2D(u_img, v_uv + o * u_px).rgb; }
float gri(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

export const DERSLER = [
  {
    id: 'kanallar',
    baslik: 'Piksel ve renk kanalları',
    anlatim: 'Dijital görüntü piksellerden oluşan bir ızgaradır. Her piksel kırmızı (R), yeşil (G) ve mavi (B) olmak üzere üç sayı taşır; 0 karanlık, 255 tam parlak demektir. Bir kanalı tek başına görmek, o rengin görüntüde nerede yoğun olduğunu gösterir.',
    formul: 'piksel = (R, G, B), her biri 0–255',
    ipucu: 'Kırmızı bir nesne göster ve R kanalına geç: nesne parlak, çevresi koyu görünür.',
    glsl: `uniform float kanal;
void main() {
  vec3 c = t(vec2(0.0));
  float v = kanal < 1.5 ? c.r : (kanal < 2.5 ? c.g : c.b);
  gl_FragColor = kanal < 0.5 ? vec4(c, 1.0) : vec4(vec3(v), 1.0);
}`,
    parametreler: [{ anahtar: 'kanal', ad: 'Kanal', min: 0, max: 3, adim: 1, varsayilan: 0, etiketler: ['Tümü', 'R', 'G', 'B'] }],
  },
  {
    id: 'gri',
    baslik: 'Gri tonlama',
    anlatim: 'Gri tonlama her pikseli tek bir parlaklık değerine indirir. Basit ortalama üç kanalı eşit sayar. İnsan gözü yeşile daha duyarlı olduğu için ağırlıklı formül daha doğal sonuç verir.',
    formul: 'gri = 0.299·R + 0.587·G + 0.114·B',
    ipucu: 'İki yöntem arasında geçiş yap ve yeşil, mavi alanların parlaklığının nasıl değiştiğine bak.',
    glsl: `uniform float yontem;
void main() {
  vec3 c = t(vec2(0.0));
  float v = yontem < 0.5 ? (c.r + c.g + c.b) / 3.0 : gri(c);
  gl_FragColor = vec4(vec3(v), 1.0);
}`,
    parametreler: [{ anahtar: 'yontem', ad: 'Yöntem', min: 0, max: 1, adim: 1, varsayilan: 1, etiketler: ['Ortalama', 'Ağırlıklı'] }],
  },
  {
    id: 'parlaklik',
    baslik: 'Parlaklık ve kontrast',
    anlatim: 'En basit nokta işlemi doğrusal dönüşümdür: her piksel aynı formülle değiştirilir. Kontrast (a) farkları büyütür ya da küçültür, parlaklık (b) tüm görüntüyü kaydırır. 1’i aşan değerler kırpılır, ayrıntı kaybolur.',
    formul: 'çıkış = a·(giriş − 0.5) + 0.5 + b',
    ipucu: 'Kontrastı 3’e çıkar: açık alanlar beyaza, koyular siyaha yapışır. Buna doygunluk denir.',
    glsl: `uniform float kontrast;
uniform float parlaklik;
void main() {
  vec3 c = t(vec2(0.0));
  gl_FragColor = vec4(clamp((c - 0.5) * kontrast + 0.5 + parlaklik, 0.0, 1.0), 1.0);
}`,
    parametreler: [
      { anahtar: 'kontrast', ad: 'Kontrast (a)', min: 0, max: 3, adim: 0.05, varsayilan: 1 },
      { anahtar: 'parlaklik', ad: 'Parlaklık (b)', min: -0.5, max: 0.5, adim: 0.01, varsayilan: 0 },
    ],
  },
  {
    id: 'gama',
    baslik: 'Gama düzeltmesi',
    anlatim: 'Gama, doğrusal olmayan bir nokta işlemidir. γ < 1 koyu tonları açar ve gölgedeki ayrıntıyı ortaya çıkarır; γ > 1 açık tonları koyulaştırır. Ekranlar ve kameralar bu eğriyi sürekli kullanır.',
    formul: 'çıkış = giriş^γ   (değerler 0–1 arası)',
    ipucu: 'Karanlık bir köşeye çevir, γ’yı 0.4’e indir: gölgedeki nesneler belirir.',
    glsl: `uniform float gama;
void main() {
  gl_FragColor = vec4(pow(t(vec2(0.0)), vec3(gama)), 1.0);
}`,
    parametreler: [{ anahtar: 'gama', ad: 'γ', min: 0.2, max: 5, adim: 0.05, varsayilan: 1 }],
  },
  {
    id: 'esik',
    baslik: 'Eşikleme',
    anlatim: 'Eşikleme gri görüntüyü ikili (siyah-beyaz) görüntüye çevirir: eşikten parlak pikseller beyaz, diğerleri siyah olur. Metin okuma ve nesne ayırma gibi işlerin ilk adımıdır.',
    formul: 'çıkış = gri > T ise 1, değilse 0',
    ipucu: 'Kâğıttaki bir yazıyı göster ve eşiği 0.5 civarında oynat: yazının en net olduğu T’yi bul.',
    glsl: `uniform float esik;
void main() {
  float v = gri(t(vec2(0.0))) > esik ? 1.0 : 0.0;
  gl_FragColor = vec4(vec3(v), 1.0);
}`,
    parametreler: [{ anahtar: 'esik', ad: 'Eşik (T)', min: 0, max: 1, adim: 0.01, varsayilan: 0.5 }],
  },
  {
    id: 'bulaniklik',
    baslik: 'Bulanıklaştırma',
    anlatim: 'Bulanıklaştırma bir komşuluk işlemidir: her piksel, çevresindeki piksellerin ağırlıklı ortalaması olur. Gauss filtresinde ağırlıklar merkezden uzaklaştıkça azalır; σ büyüdükçe bulanıklık artar. Gürültüyü azaltmak için kullanılır.',
    formul: 'G(x, y) = e^(−(x² + y²) / 2σ²)',
    ipucu: 'σ’yı yavaşça artır: önce gürültü, sonra ince ayrıntılar kaybolur.',
    glsl: `uniform float sigma;
void main() {
  if (sigma < 0.1) { gl_FragColor = vec4(t(vec2(0.0)), 1.0); return; }
  vec3 toplam = vec3(0.0);
  float agirlik = 0.0;
  for (int i = -6; i <= 6; i++) {
    for (int j = -6; j <= 6; j++) {
      float w = exp(-float(i * i + j * j) / 18.0);
      toplam += t(vec2(float(i), float(j)) * sigma * 0.5) * w;
      agirlik += w;
    }
  }
  gl_FragColor = vec4(toplam / agirlik, 1.0);
}`,
    parametreler: [{ anahtar: 'sigma', ad: 'σ', min: 0, max: 8, adim: 0.1, varsayilan: 2 }],
  },
  {
    id: 'keskin',
    baslik: 'Keskinleştirme',
    anlatim: 'Keskinleştirme, görüntüden bulanık halini çıkararak ayrıntıyı bulur ve bunu görüntüye geri ekler (keskinleştirme maskesi). Güç arttıkça kenarlar belirginleşir, ama gürültü de büyür.',
    formul: 'çıkış = giriş + k·(giriş − bulanık)',
    ipucu: 'Bir kitap kapağı göster, k’yı 3’e çıkar: harflerin çevresinde ışıltı (halo) oluşur.',
    glsl: `uniform float guc;
void main() {
  vec3 c = t(vec2(0.0));
  vec3 b = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      b += t(vec2(float(i), float(j)) * 1.5);
    }
  }
  b /= 9.0;
  gl_FragColor = vec4(clamp(c + guc * (c - b), 0.0, 1.0), 1.0);
}`,
    parametreler: [{ anahtar: 'guc', ad: 'Güç (k)', min: 0, max: 5, adim: 0.1, varsayilan: 1 }],
  },
  {
    id: 'kenar',
    baslik: 'Kenar bulma (Sobel)',
    anlatim: 'Kenar, parlaklığın hızla değiştiği yerdir. Sobel operatörü 3×3 iki çekirdekle yatay (Gx) ve dikey (Gy) değişimi ölçer. İkisinin büyüklüğü kenarın ne kadar güçlü olduğunu verir.',
    formul: 'G = √(Gx² + Gy²)',
    ipucu: 'Bir kapı çerçevesine çevir: dikey kenarlar Gx’ten, yatay kenarlar Gy’den gelir.',
    glsl: `uniform float hassasiyet;
float p(float dx, float dy) { return gri(t(vec2(dx, dy) * 1.5)); }
void main() {
  float gx = -p(-1.0, -1.0) - 2.0 * p(-1.0, 0.0) - p(-1.0, 1.0) + p(1.0, -1.0) + 2.0 * p(1.0, 0.0) + p(1.0, 1.0);
  float gy = -p(-1.0, -1.0) - 2.0 * p(0.0, -1.0) - p(1.0, -1.0) + p(-1.0, 1.0) + 2.0 * p(0.0, 1.0) + p(1.0, 1.0);
  gl_FragColor = vec4(vec3(clamp(sqrt(gx * gx + gy * gy) * hassasiyet, 0.0, 1.0)), 1.0);
}`,
    parametreler: [{ anahtar: 'hassasiyet', ad: 'Hassasiyet', min: 0.5, max: 8, adim: 0.1, varsayilan: 2 }],
  },
  {
    id: 'negatif',
    baslik: 'Negatif ve renk nicemleme',
    anlatim: 'Negatif, her değeri tersine çevirir: siyah beyaz, kırmızı camgöbeği olur. Nicemleme ise sürekli tonları birkaç basamağa indirir. Basamak azaldıkça yumuşak geçişler yerini düz renk bantlarına bırakır; buna posterleştirme denir.',
    formul: 'negatif = 1 − giriş;  nicem = ⌊giriş·n⌋ / (n − 1)',
    ipucu: 'Basamak sayısını 3’e indir ve gökyüzüne ya da bir duvara bak: yumuşak geçiş bantlara bölünür.',
    glsl: `uniform float seviye;
uniform float negatif;
void main() {
  vec3 c = t(vec2(0.0));
  if (negatif > 0.5) c = 1.0 - c;
  if (seviye < 15.5) c = floor(c * seviye) / (seviye - 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
    parametreler: [
      { anahtar: 'seviye', ad: 'Basamak (n)', min: 2, max: 16, adim: 1, varsayilan: 16, ondalik: 0 },
      { anahtar: 'negatif', ad: 'Negatif', min: 0, max: 1, adim: 1, varsayilan: 0, etiketler: ['Kapalı', 'Açık'] },
    ],
  },
  {
    id: 'hsv',
    baslik: 'Renk tonu ve doygunluk (HSV)',
    anlatim: 'HSV rengi üç parçaya ayırır: ton (H, renk çemberindeki açı), doygunluk (S, rengin canlılığı) ve değer (V, parlaklık). Tonu kaydırmak tüm renkleri çember üzerinde döndürür; doygunluğu sıfırlamak görüntüyü griye çevirir.',
    formul: 'H: 0–360°,  S: 0–1,  V = max(R, G, B)',
    ipucu: 'Görünümü “Ton”a al ve farklı renkte nesneler göster: aynı renkteki nesneler aynı griyle görünür.',
    glsl: `uniform float ton;
uniform float doygunluk;
uniform float gorunum;
vec3 hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-6)), d / (q.x + 1e-6), q.x);
}
vec3 rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
void main() {
  vec3 h = hsv(t(vec2(0.0)));
  h.x = fract(h.x + ton / 360.0);
  h.y = clamp(h.y * doygunluk, 0.0, 1.0);
  vec3 o = gorunum < 0.5 ? rgb(h) : (gorunum < 1.5 ? vec3(h.x) : vec3(h.y));
  gl_FragColor = vec4(o, 1.0);
}`,
    parametreler: [
      { anahtar: 'ton', ad: 'Ton kaydırma (°)', min: 0, max: 360, adim: 1, varsayilan: 0, ondalik: 0 },
      { anahtar: 'doygunluk', ad: 'Doygunluk çarpanı', min: 0, max: 2, adim: 0.05, varsayilan: 1 },
      { anahtar: 'gorunum', ad: 'Görünüm', min: 0, max: 2, adim: 1, varsayilan: 0, etiketler: ['Renk', 'Ton (H)', 'Doygunluk (S)'] },
    ],
  },
  {
    id: 'morfoloji',
    baslik: 'Aşındırma ve genişletme',
    anlatim: 'Morfolojik işlemler ikili (siyah-beyaz) görüntüde şekillerle çalışır. Aşındırma bir pikseli, penceredeki tüm komşuları beyazsa beyaz bırakır; nesneler incelir, küçük lekeler kaybolur. Genişletme tek bir beyaz komşu yeterse beyaz yapar; nesneler kalınlaşır, delikler kapanır.',
    formul: 'aşındırma = min(pencere),  genişletme = max(pencere)',
    ipucu: 'Bir yazıya bak: aşındırmada harfler incelip kopar, genişletmede birbirine yapışır.',
    glsl: `uniform float islem;
uniform float boyut;
uniform float esik;
float b(vec2 o) { return gri(t(o)) > esik ? 1.0 : 0.0; }
void main() {
  float en_az = 1.0, en_cok = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      float v = b(vec2(float(i), float(j)) * boyut);
      en_az = min(en_az, v);
      en_cok = max(en_cok, v);
    }
  }
  float o = islem < 0.5 ? b(vec2(0.0)) : (islem < 1.5 ? en_az : en_cok);
  gl_FragColor = vec4(vec3(o), 1.0);
}`,
    parametreler: [
      { anahtar: 'islem', ad: 'İşlem', min: 0, max: 2, adim: 1, varsayilan: 1, etiketler: ['Yalnız eşik', 'Aşındırma', 'Genişletme'] },
      { anahtar: 'boyut', ad: 'Pencere boyutu', min: 0.3, max: 3, adim: 0.1, varsayilan: 1 },
      { anahtar: 'esik', ad: 'Eşik', min: 0, max: 1, adim: 0.01, varsayilan: 0.5 },
    ],
  },
  {
    id: 'uyarlamali',
    baslik: 'Uyarlamalı eşikleme',
    anlatim: 'Tek bir eşik, ışığı eşit olmayan sahnelerde başarısız olur: gölgede her şey siyah, ışıkta her şey beyaz kalır. Uyarlamalı eşikleme her pikseli kendi çevresinin ortalamasıyla karşılaştırır, böylece gölgeli bir sayfada da yazı okunur.',
    formul: 'çıkış = gri > ortalama(pencere) − C ise 1, değilse 0',
    ipucu: 'Sayfanın yarısına elinle gölge düşür ve iki yöntemi karşılaştır.',
    glsl: `uniform float yontem;
uniform float pencere;
uniform float sabit;
void main() {
  float m = 0.0;
  for (int i = -4; i <= 4; i++) {
    for (int j = -4; j <= 4; j++) {
      m += gri(t(vec2(float(i), float(j)) * pencere));
    }
  }
  m /= 81.0;
  float esik = yontem < 0.5 ? 0.5 : m - sabit;
  gl_FragColor = vec4(vec3(gri(t(vec2(0.0))) > esik ? 1.0 : 0.0), 1.0);
}`,
    parametreler: [
      { anahtar: 'yontem', ad: 'Yöntem', min: 0, max: 1, adim: 1, varsayilan: 1, etiketler: ['Sabit eşik (0.5)', 'Uyarlamalı'] },
      { anahtar: 'pencere', ad: 'Pencere boyutu', min: 0.5, max: 6, adim: 0.1, varsayilan: 2 },
      { anahtar: 'sabit', ad: 'Sabit (C)', min: -0.1, max: 0.2, adim: 0.005, varsayilan: 0.03 },
    ],
  },
];

const ORIJINAL = `void main() { gl_FragColor = vec4(t(vec2(0.0)), 1.0); }`;

// ---------- İlerleme (yalnız bu cihazda, localStorage) ----------

const ANAHTAR = 'visioncap.web.ilerleme.v1';
export const XP_DENEME = 5;
export const XP_DERS = 50;
export const XP_KART = 2;
export const XP_SEVIYE = 100;
const SIRALI_KILIT = true;
const BOS = { tamamlanan: [], denemeler: 0, xp: 0, gunler: [], kartlar: [], makaleler: [], sure: 0, gunlukXp: {}, akis: [], kartGun: { gun: '', sayi: 0 } };

function bugun(tarih = new Date()) {
  const a = String(tarih.getMonth() + 1).padStart(2, '0');
  const g = String(tarih.getDate()).padStart(2, '0');
  return `${tarih.getFullYear()}-${a}-${g}`;
}

function yukle() {
  try {
    const m = localStorage.getItem(ANAHTAR);
    if (m) return { ...BOS, ...JSON.parse(m) };
  } catch {}
  return { ...BOS };
}

function kaydet(i) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(i)); } catch {}
}

let ilerleme = yukle();

const seviye = (xp) => Math.floor(xp / XP_SEVIYE) + 1;

function seri(gunler) {
  const kume = new Set(gunler);
  const gun = new Date();
  if (!kume.has(bugun(gun))) gun.setDate(gun.getDate() - 1);
  let n = 0;
  while (kume.has(bugun(gun))) { n++; gun.setDate(gun.getDate() - 1); }
  return n;
}

function enUzunSeri(gunler) {
  const sayilar = [...new Set(gunler)].map((g) => Date.UTC(+g.slice(0, 4), +g.slice(5, 7) - 1, +g.slice(8, 10)) / 864e5).sort((a, b) => a - b);
  let en = 0, n = 0;
  sayilar.forEach((s, i) => { n = i > 0 && s - sayilar[i - 1] === 1 ? n + 1 : 1; en = Math.max(en, n); });
  return en;
}

function rozetler(i) {
  const s = seri(i.gunler);
  const t = i.tamamlanan.length;
  const r = (ad, ik, aciklama, deger, hedef) => ({ ad, ik, aciklama, deger: Math.min(deger, hedef), hedef, kazanildi: deger >= hedef });
  return [
    r('İlk adım', '👣', 'İlk dersi bitir', t, 1),
    r('Isınma', '🔥', '3 ders bitir', t, 3),
    r('Yarı yol', '🧭', '6 ders bitir', t, 6),
    r('Piksel ustası', '🏆', 'Tüm dersleri bitir', t, DERSLER.length),
    r('Meraklı', '📸', '25 kare işle', i.denemeler, 25),
    r('Kart avcısı', '🃏', '10 bilgi kartı topla', i.kartlar.length, 10),
    r('Kitap kurdu', '📚', '5 makale kartı oku', i.makaleler.length, 5),
    r('3 gün', '⚡', '3 günlük seri', s, 3),
    r('1 hafta', '🌟', '7 günlük seri', s, 7),
    r('1 ay', '👑', '30 günlük seri', s, 30),
  ];
}

// İlerlemeyi değiştirir; seviye atlama ve yeni rozetleri günlük akışa yazar.
function guncelle(f, olaylar = [], { sessiz = false } = {}) {
  const once = ilerleme;
  ilerleme = f({ ...ilerleme });
  const gun = bugun();
  if (!ilerleme.gunler.includes(gun)) ilerleme.gunler = [...ilerleme.gunler, gun];
  const kazanilan = ilerleme.xp - once.xp;
  if (kazanilan > 0) ilerleme.gunlukXp = { ...ilerleme.gunlukXp, [gun]: (ilerleme.gunlukXp[gun] || 0) + kazanilan };
  const yeniSeviye = seviye(ilerleme.xp) > seviye(once.xp) ? seviye(ilerleme.xp) : 0;
  const r0 = rozetler(once);
  const yeniRozetler = rozetler(ilerleme).filter((r, k) => r.kazanildi && !r0[k].kazanildi).map((r) => r.ad);
  const hepsi = [...olaylar];
  if (yeniSeviye) hepsi.push({ ik: '⭐', m: `Yeni seviye: ${yeniSeviye}` });
  yeniRozetler.forEach((ad) => hepsi.push({ ik: '🏅', m: `Rozet açıldı: ${ad}` }));
  if (hepsi.length) ilerleme.akis = [...hepsi.reverse().map((o) => ({ z: Date.now(), ...o })), ...ilerleme.akis].slice(0, 40);
  kaydet(ilerleme);
  if (!sessiz) {
    if (yeniSeviye) bildirim(`Yeni seviye: ${yeniSeviye}`);
    yeniRozetler.forEach((ad) => bildirim(`Rozet açıldı: ${ad}`));
  }
  return { yeniSeviye, yeniRozetler };
}

// ---------- Uygulama içi (iOS kabuğu) ----------

const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const eklenti = (ad) => window.Capacitor?.Plugins?.[ad];
const Bildirim = eklenti('LocalNotifications'); // eski kabukta yoksa bildirim kartı gizlenir
const Abonelik = eklenti('Abonelik'); // 1.1 kabuğu; yoksa (web, 1.0) Pro yoktur ve her şey açıktır
const HATIRLATMA = 'visioncap.hatirlatma';
if (NATIVE) document.documentElement.classList.add('native');

// ---------- VisionCap Pro (App Store aboneliği) ----------

const URUNLER = ['com.sersoz.visioncap.pro.haftalik', 'com.sersoz.visioncap.pro.aylik', 'com.sersoz.visioncap.pro.yillik'];
const PRO_ANAHTAR = 'visioncap.pro';
const UCRETSIZ_DERS = 6;
const UCRETSIZ_KART = 3; // günde
const UCRETSIZ_MAKALE = 4;
let pro = (() => { try { return !!Abonelik && localStorage.getItem(PRO_ANAHTAR) === '1'; } catch { return false; } })();
let proBilgi = null;
const proGerekli = () => !!Abonelik && !pro;

function proAyarla(d) {
  proBilgi = d || null;
  const yeni = !!d?.aktif;
  try { localStorage.setItem(PRO_ANAHTAR, yeni ? '1' : '0'); } catch {}
  if (yeni !== pro) {
    pro = yeni;
    if (!aktifDers) yonlendir();
  }
}

async function proYenile() {
  if (!Abonelik) return;
  try { proAyarla(await Abonelik.durum()); } catch {}
}

const dersKilidi = (indeks) => {
  if (SIRALI_KILIT && indeks > 0 && !ilerleme.tamamlanan.includes(DERSLER[indeks - 1].id)) return 'sira';
  if (proGerekli() && indeks >= UCRETSIZ_DERS) return 'pro';
  return '';
};
const makaleKilitli = (indeks) => proGerekli() && indeks >= UCRETSIZ_MAKALE;

// ---------- Bildirimler ----------

function bildirimAcik() {
  try { return localStorage.getItem(HATIRLATMA) === '1'; } catch { return false; }
}

// Önümüzdeki 7 gün için öğlen "günün makale kartı" bildirimleri (kimlik 101–107).
async function gunlukKartlariKur() {
  if (!Bildirim) return;
  try {
    await Bildirim.cancel({ notifications: [101, 102, 103, 104, 105, 106, 107].map((id) => ({ id })) });
    if (!bildirimAcik()) return;
    const acik = MAKALE_KARTLARI.filter((_, k) => !makaleKilitli(k));
    const okunmamis = acik.filter((m) => !ilerleme.makaleler.includes(m.id));
    const sira = [...okunmamis, ...acik.filter((m) => ilerleme.makaleler.includes(m.id))];
    const notlar = [];
    for (let k = 0; k < 7; k++) {
      const m = sira[k % sira.length];
      const at = new Date(); at.setDate(at.getDate() + k); at.setHours(12, 30, 0, 0);
      if (at <= new Date()) continue;
      notlar.push({ id: 101 + k, title: 'Günün makale kartı', body: `${m.yil} · ${m.baslik}`, extra: { kart: m.id }, schedule: { at, allowWhileIdle: true } });
    }
    if (notlar.length) await Bildirim.schedule({ notifications: notlar });
  } catch {}
}

async function bildirimDegistir() {
  const ac = !bildirimAcik();
  try {
    if (ac) {
      const izin = await Bildirim.requestPermissions();
      if (izin.display !== 'granted') return;
      await Bildirim.schedule({ notifications: [{
        id: 1, title: 'VisionCap', body: 'Serini koru: bugün bir ders ya da bir deneme yap.',
        schedule: { on: { hour: 20, minute: 0 }, allowWhileIdle: true },
      }] });
    } else {
      await Bildirim.cancel({ notifications: [{ id: 1 }] });
    }
    localStorage.setItem(HATIRLATMA, ac ? '1' : '0');
  } catch {}
  await gunlukKartlariKur();
  yonlendir();
}

async function tebrikBildirimi(baslik, govde) {
  if (!Bildirim || !bildirimAcik()) return;
  try { await Bildirim.schedule({ notifications: [{ id: 200, title: baslik, body: govde, schedule: { at: new Date(Date.now() + 1500) } }] }); } catch {}
}

Bildirim?.addListener?.('localNotificationActionPerformed', (e) => {
  const k = e?.notification?.extra?.kart;
  if (k) { location.hash = '#kartlar'; setTimeout(() => kartAc(k), 80); }
});

// ---------- Ortak arayüz parçaları ----------

const kok = document.getElementById('uygulama');
const sekmeler = document.querySelector('.sekmeler');
const kacis = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let aktifDers = null;

// Çizgi simgeler (24×24). "alev" dolgulu, diğerleri çizgi.
const SIMGE = {
  alev: '<path class="dolu" d="M12 2c.6 3.2 3.8 5 4.9 8.3A6 6 0 1 1 6.3 11c.6 1.5 1.6 2.3 2.7 2.5-.6-3.7 1-8.2 3-11.5z"/>',
  hedef: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  kart: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  yildiz: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  telefon: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2M3.5 8v8M20.5 8v8"/>',
  elmas: '<path d="M6.5 3.5h11l3.5 5.5-9 11.5L3 9z"/><path d="M3 9h18M9.5 3.5 8 9l4 11.5L16 9l-1.5-5.5"/>',
  zil: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  saat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  makale: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  kamera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  kupa: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  kilit: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ok: '<path d="M9 5l7 7-7 7"/>',
};
const ik = (ad) => `<svg class="ik" viewBox="0 0 24 24" aria-hidden="true">${SIMGE[ad]}</svg>`;

function bildirim(metin) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = metin;
  document.body.append(el);
  setTimeout(() => el.classList.add('git'), 2600);
  setTimeout(() => el.remove(), 3200);
}

// Alttan açılan kart katmanı. Arka plana ya da [data-kapat] öğesine dokununca kapanır.
function katman(icerik, { kapaninca } = {}) {
  document.querySelector('.katman')?.remove();
  const el = document.createElement('div');
  el.className = 'katman';
  el.innerHTML = `<div class="katman-kart" role="dialog" aria-modal="true">${icerik}</div>`;
  const kapat = () => { el.remove(); kapaninca?.(); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-kapat]')) kapat(); });
  document.body.append(el);
  el.querySelector('button, a')?.focus({ preventScroll: true, focusVisible: false });
  return el;
}

function sureYaz(sn) {
  const dk = Math.floor(sn / 60);
  return dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60} dk` : `${dk} dk`;
}

function zamanYaz(z) {
  const dk = Math.round((Date.now() - z) / 6e4);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 1440) return `${Math.floor(dk / 60)} sa önce`;
  return `${Math.floor(dk / 1440)} gün önce`;
}

const akisListesi = (liste) => liste.length
  ? `<ul class="akis">${liste.map((o) => `<li><i>${o.ik}</i><span>${kacis(o.m)}</span><small>${zamanYaz(o.z)}</small></li>`).join('')}</ul>`
  : '<p class="bos">Ders bitirdikçe, kart topladıkça gelişmelerin burada görünür.</p>';

const proBandi = () => proGerekli()
  ? `<a class="kart pro-bant" href="#pro"><span class="kutu-ik mor">${ik('elmas')}</span><span class="kart-ic"><em>VISIONCAP PRO</em><strong>Tüm dersler, sınırsız kart</strong><small>${DERSLER.length - UCRETSIZ_DERS} ders daha, tüm makale kartları ve yeni dersler. 3 gün ücretsiz dene.</small></span></a>`
  : '';

// ---------- Salla, öğren ----------

function kalanKart() {
  if (!proGerekli()) return Infinity;
  const k = ilerleme.kartGun;
  return Math.max(0, UCRETSIZ_KART - (k.gun === bugun() ? k.sayi : 0));
}

function kartCek() {
  if (kalanKart() <= 0) {
    katman(`<em class="etiket">SALLA, ÖĞREN</em><h2>Bugünkü kartların bitti</h2>
      <p>Ücretsiz sürümde günde ${UCRETSIZ_KART} kart çekebilirsin. Yarın yeni kartlar seni bekliyor.</p>
      <a class="dugme" href="#pro" data-kapat>Pro ile sınırsız kart</a>
      <button class="dugme ikincil" data-kapat>Kapat</button>`);
    return;
  }
  const gorulmemis = BILGI_KARTLARI.filter((k) => !ilerleme.kartlar.includes(k.id));
  const havuz = gorulmemis.length ? gorulmemis : BILGI_KARTLARI;
  const k = havuz[Math.floor(Math.random() * havuz.length)];
  const yeni = !ilerleme.kartlar.includes(k.id);
  const gun = bugun();
  guncelle((i) => ({
    ...i,
    kartGun: { gun, sayi: (i.kartGun.gun === gun ? i.kartGun.sayi : 0) + 1 },
    kartlar: yeni ? [...i.kartlar, k.id] : i.kartlar,
    xp: i.xp + (yeni ? XP_KART : 0),
  }), yeni ? [{ ik: '🃏', m: `Yeni kart: ${k.baslik}` }] : []);
  kartAc(k.id, { cekildi: true, yeni });
}

function ilgiliDers(id) {
  const k = DERSLER.findIndex((d) => d.id === id);
  if (k < 0) return '';
  const kilit = dersKilidi(k);
  return kilit === 'sira' ? '' : `<a class="ilgili" href="#${kilit === 'pro' ? 'pro' : id}" data-kapat>Bu derste dene: ${kacis(DERSLER[k].baslik)} ›</a>`;
}

function kartAc(id, { cekildi = false, yeni = false } = {}) {
  const bilgi = BILGI_KARTLARI.find((k) => k.id === id);
  const yenile = () => { if (!aktifDers) yonlendir(); };
  if (bilgi) {
    const kalan = kalanKart();
    const [renk, e] = TUR[bilgi.tur] ?? ['turuncu', '•'];
    katman(`<span class="kart-amblem ${renk}">${e}</span>
      <em class="etiket ${renk}">${kacis(bilgi.tur.toLocaleUpperCase('tr'))}${yeni ? ' · YENİ KART' : ''}</em>
      <h2>${kacis(bilgi.baslik)}</h2>
      <p>${kacis(bilgi.metin)}</p>
      ${bilgi.ders ? ilgiliDers(bilgi.ders) : ''}
      ${yeni ? `<p class="kazanc">+${XP_KART} XP</p>` : ''}
      ${cekildi && kalan !== Infinity ? `<p class="kucuk">Bugün kalan ücretsiz kart: ${kalan}</p>` : ''}
      <button class="dugme" data-is="bir-daha">Bir kart daha çek</button>
      <button class="dugme ikincil" data-kapat>Kapat</button>`, { kapaninca: yenile })
      .querySelector('[data-is="bir-daha"]').addEventListener('click', kartCek);
    return;
  }
  const indeks = MAKALE_KARTLARI.findIndex((m) => m.id === id);
  if (indeks < 0) return;
  if (makaleKilitli(indeks)) { location.hash = '#pro'; return; }
  const m = MAKALE_KARTLARI[indeks];
  const ilk = !ilerleme.makaleler.includes(m.id);
  if (ilk) guncelle((i) => ({ ...i, makaleler: [...i.makaleler, m.id], xp: i.xp + XP_KART }), [{ ik: '📄', m: `Makale okundu: ${m.yazar.split(',')[0]}, ${m.yil}` }]);
  katman(`<span class="kart-amblem mor">📄</span>
    <em class="etiket mor">MAKALE ÖZETİ · ${m.yil}</em>
    <h2 class="makale-baslik">${kacis(m.baslik)}</h2>
    <p class="yazar">${kacis(m.yazar)}</p>
    <p>${kacis(m.ozet)}</p>
    <div class="onem"><em>NEDEN ÖNEMLİ</em><p>${kacis(m.onem)}</p></div>
    ${m.ders ? ilgiliDers(m.ders) : ''}
    ${ilk ? `<p class="kazanc">+${XP_KART} XP</p>` : ''}
    <button class="dugme ikincil" data-kapat>Kapat</button>`, { kapaninca: yenile });
}

let sonSalla = 0;
function salla() {
  if (aktifDers || document.hidden || document.querySelector('.katman')) return;
  const simdi = Date.now();
  if (simdi - sonSalla < 1500) return;
  sonSalla = simdi;
  kartCek();
}
// iOS kabuğu (1.1+) sallamayı ivmeölçerden algılar ve bu olayı gönderir.
addEventListener('visioncapSalla', salla);
// Tarayıcı yedeği: izin istemeyen cihazlarda (Android) ivme ile. iOS Safari'de düğme kullanılır.
if (!NATIVE && 'DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission !== 'function') {
  addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (a && Math.hypot(a.x || 0, a.y || 0, a.z || 0) > 25) salla();
  });
}

const sallaKarti = () => {
  const kalan = kalanKart();
  const oran = (ilerleme.kartlar.length / BILGI_KARTLARI.length) * 100;
  return `<button class="kart salla" data-is="kart-cek">
    <span class="kutu-ik turuncu salla-ik">${ik('telefon')}</span>
    <span class="kart-ic">
      <em>SALLA, ÖĞREN</em>
      <strong>${NATIVE ? 'Telefonu salla ya da dokun' : 'Dokun, bir bilgi kartı çek'}</strong>
      <span class="cubuk ince"><i style="width:${oran}%"></i></span>
      <small>${ilerleme.kartlar.length}/${BILGI_KARTLARI.length} kart toplandı${kalan !== Infinity ? ` · bugün ${kalan} ücretsiz kart kaldı` : ''}</small>
    </span>
  </button>`;
};

// ---------- Ekranlar ----------

function selam() {
  const s = new Date().getHours();
  return s < 5 ? 'İyi geceler' : s < 12 ? 'Günaydın' : s < 18 ? 'İyi günler' : 'İyi akşamlar';
}

// Son 7 gün (bugün en sağda): hangi günler çalışıldı
function haftaNoktalari() {
  const kume = new Set(ilerleme.gunler);
  return [...Array(7)].map((_, k) => {
    const g = new Date(); g.setDate(g.getDate() - 6 + k);
    const ad = g.toLocaleDateString('tr', { weekday: 'short' });
    return `<span class="${kume.has(bugun(g)) ? 'dolu' : ''}${k === 6 ? ' bugun' : ''}"><i>${kume.has(bugun(g)) ? ik('alev') : ''}</i><small>${ad}</small></span>`;
  }).join('');
}

function bugunEkrani() {
  const s = seri(ilerleme.gunler);
  const bugunVar = ilerleme.gunler.includes(bugun());
  const sv = seviye(ilerleme.xp);
  const kalan = ilerleme.xp % XP_SEVIYE;
  const sirakiIndeks = DERSLER.findIndex((d) => !ilerleme.tamamlanan.includes(d.id));
  const siradaki = DERSLER[sirakiIndeks] ?? DERSLER[0];
  const gorevKilit = sirakiIndeks >= 0 && dersKilidi(sirakiIndeks) === 'pro';
  const hepsiBitti = sirakiIndeks < 0;
  const tarih = new Date().toLocaleDateString('tr', { weekday: 'long', day: 'numeric', month: 'long' });
  kok.innerHTML = `
    <header class="selam">
      <div><small>${tarih}</small><h1>${selam()}</h1></div>
      ${pro ? '<b class="pro-rozet">PRO</b>' : ''}
    </header>
    <section class="seri-kart">
      <div class="seri-ust">
        <span class="alev${s ? '' : ' sonuk'}">${ik('alev')}</span>
        <div><strong>${s}</strong><small>günlük seri</small></div>
      </div>
      <div class="hafta">${haftaNoktalari()}</div>
      <p>${bugunVar ? 'Bugünü kazandın. Yarın da gel, seri büyüsün.' : s ? 'Seriyi korumak için bugün bir ders ya da kart yeter.' : 'Bir ders ya da bir kartla serini bugün başlat.'}</p>
    </section>
    <div class="uclu">
      <a class="kart sayac" href="#dersler"><span class="mini-ik yesil">${ik('hedef')}</span><strong>${ilerleme.tamamlanan.length}/${DERSLER.length}</strong><small>Ders</small></a>
      <a class="kart sayac" href="#kartlar"><span class="mini-ik turuncu">${ik('kart')}</span><strong>${ilerleme.kartlar.length}</strong><small>Kart</small></a>
      <a class="kart sayac" href="#gelisim"><span class="mini-ik mavi">${ik('yildiz')}</span><strong>${ilerleme.xp}</strong><small>XP</small></a>
    </div>
    <a class="kart seviye-kart" href="#gelisim">
      <span class="seviye-ust"><b class="sv">${sv}</b><span><strong>Seviye ${sv}</strong><small>Sonraki seviyeye ${XP_SEVIYE - kalan} XP</small></span></span>
      <span class="cubuk"><i style="width:${(kalan / XP_SEVIYE) * 100}%"></i></span>
    </a>
    ${hepsiBitti ? `<div class="kart gorev"><span class="gorev-ust"><span class="ders-no">${ik('kupa')}</span><span><em>TEBRİKLER</em><strong>Tüm dersleri bitirdin</strong></span></span><small>Kart çekmeye ve makaleleri okumaya devam et. Yeni dersler geldiğinde burada görünecek.</small></div>` : `
    <a class="kart gorev" href="#${gorevKilit ? 'pro' : siradaki.id}">
      <span class="gorev-ust"><span class="ders-no">${sirakiIndeks + 1}</span><span><em>GÜNÜN GÖREVİ</em><strong>${kacis(siradaki.baslik)}</strong></span></span>
      <small>${gorevKilit ? 'Bu ders VisionCap Pro’da. Açmak için dokun.' : kacis(siradaki.ipucu)}</small>
      <span class="hap">${gorevKilit ? 'Pro’yu gör' : 'Derse başla'} ${ik('ok')}</span>
    </a>`}
    ${sallaKarti()}
    ${proBandi()}
    ${Bildirim ? `<button class="kart hatirlatma" data-is="bildirim" role="switch" aria-checked="${bildirimAcik()}">
      <span class="kutu-ik mavi">${ik('zil')}</span>
      <span class="kart-ic"><strong>Bildirimler</strong>
      <small>${bildirimAcik()
        ? 'Akşam 20:00 seri hatırlatması, öğlen günün makale kartı, ders tebrikleri.'
        : 'Seri hatırlatması, günün makale kartı ve ders tebrikleri için aç.'}</small></span>
      <span class="anahtar${bildirimAcik() ? ' acik' : ''}"><i></i></span>
    </button>` : ''}
    <h2>Son gelişmeler</h2>
    ${akisListesi(ilerleme.akis.slice(0, 4))}
    ${ilerleme.akis.length > 4 ? '<a class="tumu" href="#gelisim">Tüm gelişmeler ›</a>' : ''}`;
  kok.querySelector('[data-is="bildirim"]')?.addEventListener('click', bildirimDegistir);
}

function derslerEkrani() {
  const siradaki = DERSLER.findIndex((d) => !ilerleme.tamamlanan.includes(d.id));
  const adim = (d, i) => {
    const bitti = ilerleme.tamamlanan.includes(d.id);
    const kilit = dersKilidi(i);
    const simdi = i === siradaki && !kilit;
    const alt = kilit === 'sira' ? 'Önceki dersi bitirince açılır' : kilit === 'pro' ? 'VisionCap Pro ile açılır' : bitti ? 'Bitti · tekrar edebilirsin' : d.formul;
    const ic = `<i>${bitti ? '✓' : kilit ? ik('kilit') : i + 1}</i><span><strong>${kacis(d.baslik)}</strong><small>${kacis(alt)}</small></span>${simdi ? '<b class="hap">ŞİMDİ</b>' : kilit === 'pro' ? '<b class="pro-cip">PRO</b>' : ''}`;
    const sinif = `adim${bitti ? ' bitti' : ''}${simdi ? ' simdi' : ''}${kilit === 'pro' ? ' pro-kilit' : ''}`;
    if (kilit === 'sira') return `<div class="${sinif} kilitli" aria-disabled="true">${ic}</div>`;
    return `<a class="${sinif}" href="#${kilit ? 'pro' : d.id}">${ic}</a>`;
  };
  const bolum = (baslik, alt, dersler, bas) => `<h2 class="bolum">${baslik} <small>${alt}</small></h2><div class="yol">${dersler.map((d, k) => adim(d, bas + k)).join('')}</div>`;
  const oran = (ilerleme.tamamlanan.length / DERSLER.length) * 100;
  kok.innerHTML = `
    <h1>Dersler</h1>
    <div class="kart ozet-kart">
      <strong>${ilerleme.tamamlanan.length}/${DERSLER.length} ders bitti</strong>
      <span class="cubuk"><i style="width:${oran}%"></i></span>
      <small>Her ders canlı kamerayla bir yöntem öğretir. Sırayla açılır.</small>
    </div>
    ${Abonelik
      ? bolum('Temeller', 'ücretsiz', DERSLER.slice(0, UCRETSIZ_DERS), 0) + bolum('İleri teknikler', pro ? 'Pro' : 'Pro ile', DERSLER.slice(UCRETSIZ_DERS), UCRETSIZ_DERS)
      : bolum('Ders yolu', '', DERSLER, 0)}
    ${proBandi()}`;
}

const TUR = { 'Tarihçe': ['turuncu', '📜'], 'Kavram': ['mavi', '💡'], 'İpucu': ['yesil', '🎯'] };

function kartlarEkrani() {
  kok.innerHTML = `
    <h1>Kartlar</h1>
    ${sallaKarti()}
    <h2>Bilgi kartları <small>${ilerleme.kartlar.length}/${BILGI_KARTLARI.length}</small></h2>
    <div class="tur-lejant">${Object.entries(TUR).map(([ad, [renk, e]]) => `<span class="${renk}">${e} ${ad}</span>`).join('')}</div>
    <div class="kart-izgara">${[...BILGI_KARTLARI].sort((a, b) => ilerleme.kartlar.includes(b.id) - ilerleme.kartlar.includes(a.id)).map((k) => {
      const [renk, e] = TUR[k.tur] ?? ['turuncu', '•'];
      return ilerleme.kartlar.includes(k.id)
        ? `<button class="mini ${renk}" data-kart="${k.id}"><span class="mini-ust"><em>${kacis(k.tur)}</em><b>${e}</b></span><strong>${kacis(k.baslik)}</strong></button>`
        : '<div class="mini kapali" aria-label="Henüz çekilmedi"><strong>?</strong><small>Salla ve keşfet</small></div>';
    }).join('')}
    </div>
    <h2>Makale kartları <small>${ilerleme.makaleler.length}/${MAKALE_KARTLARI.length}</small></h2>
    <p class="alt-metin">Görüntü işlemenin dönüm noktası olan çalışmaların kısa özetleri.</p>
    <div class="yol makaleler">${MAKALE_KARTLARI.map((m, k) => {
      const kilit = makaleKilitli(k);
      const okundu = ilerleme.makaleler.includes(m.id);
      return `<button class="adim makale${okundu ? ' bitti' : ''}" data-kart="${m.id}">
        <i>${okundu ? '✓' : m.yil}</i>
        <span><strong>${kacis(m.baslik)}</strong><small>${kacis(m.yazar)}</small></span>
        ${kilit ? '<b class="pro-cip">PRO</b>' : ik('ok')}
      </button>`;
    }).join('')}
    </div>`;
  kok.querySelectorAll('[data-kart]').forEach((b) => b.addEventListener('click', () => kartAc(b.dataset.kart)));
}

function gelisimEkrani() {
  const gunler = [...Array(7)].map((_, k) => { const g = new Date(); g.setDate(g.getDate() - 6 + k); return g; });
  const xpler = gunler.map((g) => ilerleme.gunlukXp[bugun(g)] || 0);
  const tepe = Math.max(50, ...xpler);
  const sv = seviye(ilerleme.xp);
  const rz = rozetler(ilerleme);
  const sayac = (renk, simge, deger, ad) => `<div class="kart sayac"><span class="mini-ik ${renk}">${ik(simge)}</span><strong>${deger}</strong><small>${ad}</small></div>`;
  kok.innerHTML = `
    <h1>Gelişim</h1>
    <a class="kart seviye-kart" href="#dersler">
      <span class="seviye-ust"><b class="sv">${sv}</b><span><strong>Seviye ${sv} · ${ilerleme.xp} XP</strong><small>Sonraki seviyeye ${XP_SEVIYE - (ilerleme.xp % XP_SEVIYE)} XP</small></span></span>
      <span class="cubuk"><i style="width:${((ilerleme.xp % XP_SEVIYE) / XP_SEVIYE) * 100}%"></i></span>
    </a>
    <div class="sayaclar">
      ${sayac('turuncu', 'alev', `${seri(ilerleme.gunler)} gün`, 'Şu anki seri')}
      ${sayac('turuncu', 'kupa', `${enUzunSeri(ilerleme.gunler)} gün`, 'En uzun seri')}
      ${sayac('yesil', 'hedef', `${ilerleme.tamamlanan.length}/${DERSLER.length}`, 'Biten ders')}
      ${sayac('mavi', 'saat', sureYaz(ilerleme.sure), 'Çalışma süresi')}
      ${sayac('turuncu', 'kart', ilerleme.kartlar.length, 'Öğrenilen kart')}
      ${sayac('mor', 'makale', ilerleme.makaleler.length, 'Okunan makale')}
      ${sayac('yesil', 'kamera', ilerleme.denemeler, 'İşlenen kare')}
      ${sayac('mavi', 'yildiz', rz.filter((r) => r.kazanildi).length + '/' + rz.length, 'Rozet')}
    </div>
    <div class="kart">
      <span class="baslik-satir"><strong>Son 7 gün</strong><small>${xpler.reduce((a, b) => a + b, 0)} XP</small></span>
      <div class="grafik" role="img" aria-label="Son 7 günde kazanılan XP">${xpler.map((x, k) => `
        <div class="${k === 6 ? 'bugun' : ''}"><b>${x || ''}</b><span style="height:${Math.round((x / tepe) * 100)}%"></span><small>${gunler[k].toLocaleDateString('tr', { weekday: 'short' })}</small></div>`).join('')}
      </div>
    </div>
    <h2>Rozetler <small>${rz.filter((r) => r.kazanildi).length}/${rz.length}</small></h2>
    <div class="rozetler">${rz.map((r) => `
      <div class="rozet${r.kazanildi ? '' : ' kilitli'}">
        <span class="madalya">${r.ik}</span>
        <strong>${r.ad}</strong><small>${r.aciklama}</small>
        ${r.kazanildi ? '' : `<span class="cubuk ince"><i style="width:${(r.deger / r.hedef) * 100}%"></i></span><small class="sayi">${r.deger}/${r.hedef}</small>`}
      </div>`).join('')}
    </div>
    <h2>Günlük akış</h2>
    ${akisListesi(ilerleme.akis)}`;
}

function proEkrani() {
  if (!Abonelik) {
    kok.innerHTML = `<h1>VisionCap Pro</h1>
      <p class="alt-metin">Bu sürümde tüm dersler ve kartlar açık. Pro aboneliği iPhone uygulamasında sunulur.</p>
      <a class="dugme" href="#">Bugün’e dön</a>`;
    return;
  }
  const bitis = proBilgi?.bitis ? new Date(proBilgi.bitis).toLocaleDateString('tr', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const arti = (simge, baslik, alt) => `<li><span class="mini-ik mor">${ik(simge)}</span><span><b>${baslik}</b><small>${alt}</small></span></li>`;
  kok.innerHTML = `
    <a class="geri-ic" href="#">‹ Bugün</a>
    <section class="pro-ust">
      <span class="pro-amblem">${ik('elmas')}</span>
      <em>VISIONCAP PRO</em>
      <h1>${pro ? 'Pro aktif' : 'Görüntü işlemenin tamamı'}</h1>
      <p class="alt-metin">${pro && bitis ? `Abonelik ${proBilgi?.yenilenecek === false ? 'bitiş' : 'yenileme'} tarihi: ${bitis}` : 'Tüm dersleri aç, sınırsız kart çek, her makaleyi oku.'}</p>
    </section>
    <ul class="artilar">
      ${arti('hedef', `${DERSLER.length} dersin hepsi`, 'HSV, morfoloji, uyarlamalı eşik ve sonra gelecek yeni dersler')}
      ${arti('kart', 'Sınırsız bilgi kartı', `Ücretsizde günde ${UCRETSIZ_KART} kart`)}
      ${arti('makale', 'Tüm makale kartları', `${MAKALE_KARTLARI.length} dönüm noktası çalışmanın özeti`)}
    </ul>
    ${pro ? '' : '<div class="planlar"><p class="kucuk">Planlar yükleniyor…</p></div>'}
    <button class="dugme ikincil" data-is="geri-yukle">Satın alımları geri yükle</button>
    ${pro ? '<button class="dugme ikincil" data-is="yonet">Aboneliği yönet</button>' : ''}
    <p class="yasal">Ödeme, satın almayı onayladığında Apple Kimliği hesabından alınır. Abonelik, dönem bitmeden en az 24 saat önce iptal edilmezse aynı süre ve ücretle kendiliğinden yenilenir. Aboneliği App Store hesap ayarlarından yönetebilir ve iptal edebilirsin. Ücretsiz deneme süresinde abone olursan denemenin kalan kısmı geçersiz olur.</p>
    <p class="yasal"><a href="visioncap-gizlilik.html">Gizlilik Politikası</a> · <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Kullanım Koşulları (EULA)</a></p>`;

  kok.querySelector('[data-is="geri-yukle"]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const d = await Abonelik.geriYukle();
      proAyarla(d);
      if (!d?.aktif) bildirim('Bu Apple Kimliği’nde etkin abonelik bulunamadı.');
      else bildirim('Pro aboneliğin geri yüklendi.');
    } catch { bildirim('App Store’a ulaşılamadı. Biraz sonra tekrar dene.'); }
    e.target.disabled = false;
    if (location.hash === '#pro') proEkrani();
  });
  kok.querySelector('[data-is="yonet"]')?.addEventListener('click', () => Abonelik.aboneligiYonet().catch(() => {}));
  if (!pro) planlariYukle(kok.querySelector('.planlar'));
}

// Plan seçilir (varsayılan yıllık), alttaki düğme seçili planı satın alır.
async function planlariYukle(kutu) {
  let urunler = [];
  try { urunler = (await Abonelik.urunler({ kimlikler: URUNLER })).urunler || []; } catch {}
  if (!kutu.isConnected) return;
  if (!urunler.length) {
    kutu.innerHTML = '<p class="kucuk">Planlar şu an yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.</p><button class="dugme ikincil" data-is="tekrar">Tekrar dene</button>';
    kutu.querySelector('[data-is="tekrar"]').addEventListener('click', () => { kutu.innerHTML = '<p class="kucuk">Planlar yükleniyor…</p>'; planlariYukle(kutu); });
    return;
  }
  urunler.sort((a, b) => URUNLER.indexOf(b.kimlik) - URUNLER.indexOf(a.kimlik));
  const etiket = { hafta: 'Haftalık', ay: 'Aylık', yıl: 'Yıllık' };
  let secili = (urunler.find((u) => u.donem === 'yıl') ?? urunler[0]).kimlik;
  kutu.innerHTML = `<div class="plan-liste" role="radiogroup" aria-label="Plan">${urunler.map((u) => `
    <button class="plan" role="radio" data-urun="${kacis(u.kimlik)}">
      <span class="secim"></span>
      <span class="plan-ad"><strong>${etiket[u.donem] ?? kacis(u.ad)}</strong>${u.donem === 'yıl' ? '<em>EN AVANTAJLI</em>' : ''}
        ${u.deneme && u.denemeUygun ? `<small>${kacis(u.deneme)} ücretsiz deneme</small>` : ''}</span>
      <span class="plan-fiyat"><b>${kacis(u.fiyat)}</b><small>/ ${kacis(u.donem)}</small></span>
    </button>`).join('')}</div>
    <button class="dugme pro-dugme" data-is="satin-al"></button>
    <p class="kucuk plan-not"></p>`;
  const al = kutu.querySelector('[data-is="satin-al"]');
  const not = kutu.querySelector('.plan-not');
  const goster = () => {
    const u = urunler.find((x) => x.kimlik === secili);
    kutu.querySelectorAll('.plan').forEach((b) => { const s = b.dataset.urun === secili; b.classList.toggle('secili', s); b.setAttribute('aria-checked', s); });
    const deneme = u.deneme && u.denemeUygun;
    al.textContent = deneme ? `${u.deneme} ücretsiz başla` : 'Abone ol';
    not.textContent = deneme
      ? `Deneme bitince ${u.fiyat} / ${u.donem}. İstediğin zaman iptal edebilirsin.`
      : `${u.fiyat} / ${u.donem}. İstediğin zaman iptal edebilirsin.`;
  };
  goster();
  kutu.querySelectorAll('[data-urun]').forEach((b) => b.addEventListener('click', () => { secili = b.dataset.urun; goster(); }));
  al.addEventListener('click', async () => {
    kutu.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      const s = await Abonelik.satinAl({ kimlik: secili });
      if (s.durum === 'tamam') {
        guncelle((i) => i, [{ ik: '💎', m: 'VisionCap Pro aktif' }], { sessiz: true });
        proAyarla(s);
        katman(`<div class="konfeti" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
          <span class="pro-amblem">${ik('elmas')}</span>
          <em class="etiket">VISIONCAP PRO</em><h2>Hoş geldin!</h2>
          <p>Tüm dersler, sınırsız kart ve bütün makale kartları artık açık.</p>
          <a class="dugme" href="#dersler" data-kapat>Derslere git</a>`);
        return;
      }
      if (s.durum === 'bekliyor') bildirim('Satın alma onay bekliyor. Onaylanınca Pro kendiliğinden açılır.');
    } catch { bildirim('Satın alma tamamlanamadı. Tekrar deneyebilirsin.'); }
    kutu.querySelectorAll('button').forEach((x) => { x.disabled = false; });
  });
}

// Ders bitince açılan tebrik kartı (ve bildirimler açıksa tebrik bildirimi).
function tebrik(d, { yeniSeviye, yeniRozetler }) {
  const indeks = DERSLER.indexOf(d);
  const sonrakiIndeks = DERSLER.findIndex((x, k) => k > indeks && !ilerleme.tamamlanan.includes(x.id));
  const sonraki = DERSLER[sonrakiIndeks];
  const sonrakiKilit = sonraki ? dersKilidi(sonrakiIndeks) : '';
  const hepsiBitti = ilerleme.tamamlanan.length === DERSLER.length;
  katman(`<div class="konfeti" aria-hidden="true">${'<i></i>'.repeat(18)}</div>
    <p class="tebrik-ik" aria-hidden="true">${hepsiBitti ? '🏆' : '✓'}</p>
    <h2>Tebrikler!</h2>
    <p><b>${kacis(d.baslik)}</b> dersini bitirdin.</p>
    <p class="kazanc-hap">+${XP_DERS} XP</p>
    ${yeniSeviye ? `<p class="olay">⭐ Yeni seviye: ${yeniSeviye}</p>` : ''}
    ${yeniRozetler.map((r) => `<p class="olay">🏅 Rozet açıldı: ${kacis(r)}</p>`).join('')}
    <div class="cubuk"><i style="width:${(ilerleme.tamamlanan.length / DERSLER.length) * 100}%"></i></div>
    <p class="kucuk">${ilerleme.tamamlanan.length}/${DERSLER.length} ders tamam${hepsiBitti ? '. Hepsini bitirdin!' : ''}</p>
    ${sonraki ? `<a class="dugme" href="#${sonrakiKilit === 'pro' ? 'pro' : sonraki.id}" data-kapat>${sonrakiKilit === 'pro' ? 'Pro ile devam et' : `Sıradaki: ${kacis(sonraki.baslik)}`}</a>` : ''}
    <a class="dugme ikincil" href="#" data-kapat>Bugün’e dön</a>`, { kapaninca: () => { if (location.hash === `#${d.id}`) location.hash = ''; } });
  tebrikBildirimi('Tebrikler! 🎉', `${d.baslik} dersini bitirdin, +${XP_DERS} XP.${yeniSeviye ? ` Yeni seviye: ${yeniSeviye}.` : ''}${yeniRozetler.length ? ` Rozet: ${yeniRozetler.join(', ')}.` : ''}`);
}

// ---------- WebGL ----------

let sureSayaci, gl, video, akis, dokum, cerceve, kaynakW = 1, kaynakH = 1, dondurulmus = false, ornekKaynak = null;

function derle(tur, kod) {
  const s = gl.createShader(tur);
  gl.shaderSource(s, kod);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function program(govde) {
  const p = gl.createProgram();
  gl.attachShader(p, derle(gl.VERTEX_SHADER, `attribute vec2 a_pos;
uniform vec2 u_olcek;
varying vec2 v_uv;
void main() {
  v_uv = (a_pos * 0.5) * u_olcek + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`));
  gl.attachShader(p, derle(gl.FRAGMENT_SHADER, ORTAK + govde));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// Kamera yoksa ya da izin verilmezse kullanılan örnek sahne: renkli alanlar, yazı ve gürültü.
function ornekSahne() {
  const c = document.createElement('canvas');
  c.width = 600; c.height = 800;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 600, 800);
  g.addColorStop(0, '#1e6fd9'); g.addColorStop(0.5, '#c9a227'); g.addColorStop(1, '#e8590c');
  x.fillStyle = g; x.fillRect(0, 0, 600, 800);
  x.fillStyle = '#d62828'; x.fillRect(60, 80, 220, 240);
  x.fillStyle = '#2b9348'; x.beginPath(); x.arc(430, 230, 110, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f1efe6'; x.fillRect(80, 440, 440, 280);
  x.fillStyle = '#16181b'; x.font = 'bold 72px Inter, Arial, sans-serif';
  x.fillText('VISION', 130, 560); x.fillText('CAP 123', 130, 650);
  const v = x.getImageData(0, 0, 600, 800);
  for (let i = 0; i < 6000; i++) {
    const k = (Math.floor(Math.random() * 800) * 600 + Math.floor(Math.random() * 600)) * 4;
    const d = Math.random() * 255; v.data[k] = v.data[k + 1] = v.data[k + 2] = d;
  }
  x.putImageData(v, 0, 0);
  return c;
}

async function kameraAc(durumEl) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('yok');
  akis = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
  video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.srcObject = akis;
  await video.play();
  durumEl.textContent = '';
}

function durdur() {
  cancelAnimationFrame(cerceve);
  akis?.getTracks().forEach((t) => t.stop());
  clearInterval(sureSayaci);
  akis = null; video = null; gl = null; dondurulmus = false; aktifDers = null;
}


async function ders(d) {
  durdur();
  const indeks = DERSLER.indexOf(d);
  const kilit = dersKilidi(indeks);
  if (kilit) { location.hash = kilit === 'pro' ? '#pro' : ''; return; }
  aktifDers = d;
  const degerler = Object.fromEntries(d.parametreler.map((p) => [p.anahtar, p.varsayilan]));
  let oynandi = false;
  const bitti = () => ilerleme.tamamlanan.includes(d.id);

  kok.innerHTML = `
    <a class="geri-ic" href="#dersler">‹ Dersler</a>
    <p class="ders-ust"><span class="hap">DERS ${indeks + 1}/${DERSLER.length}</span>${bitti() ? '<span class="hap yesil">✓ Bitti</span>' : ''}</p>
    <h1>${kacis(d.baslik)}</h1>
    <p class="anlatim">${kacis(d.anlatim)}</p>
    <div class="formul"><em>FORMÜL</em>${kacis(d.formul)}</div>
    <div class="sahne"><canvas aria-label="Filtre uygulanmış görüntü"></canvas><p class="durum">Kamera açılıyor…</p></div>
    <p class="kucuk">Orijinali görmek için görüntüye basılı tut.</p>
    <button class="dugme" data-is="kare">Kare çek</button>
    <div class="ayarlar">${d.parametreler.map((p) => `
      <label class="ayar">
        <span><b>${p.ad}</b><output data-out="${p.anahtar}"></output></span>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.adim}" value="${p.varsayilan}" data-p="${p.anahtar}">
      </label>`).join('')}
    </div>
    <div class="ipucu"><em>ŞUNU DENE</em><p>${kacis(d.ipucu)}</p></div>
    <button class="dugme" data-is="bitir"></button>`;

  const tuval = kok.querySelector('canvas');
  const durumEl = kok.querySelector('.durum');
  const kareDugme = kok.querySelector('[data-is="kare"]');
  const bitirDugme = kok.querySelector('[data-is="bitir"]');

  // Çalışma süresi: ders ekranı görünürken 15 saniyede bir sayılır
  sureSayaci = setInterval(() => {
    if (!document.hidden && aktifDers === d) guncelle((i) => ({ ...i, sure: i.sure + 15 }));
  }, 15000);

  const ciktiYaz = () => d.parametreler.forEach((p) => {
    const v = degerler[p.anahtar];
    kok.querySelector(`[data-out="${p.anahtar}"]`).textContent = p.etiketler ? p.etiketler[Math.round(v)] : v.toFixed(p.ondalik ?? 2);
  });
  const bitirGuncelle = () => {
    if (bitti()) { bitirDugme.textContent = '✓ Bu dersi bitirdin'; bitirDugme.disabled = true; bitirDugme.classList.add('tamam'); return; }
    bitirDugme.disabled = !oynandi;
    bitirDugme.textContent = oynandi ? `Dersi bitir (+${XP_DERS} XP)` : 'Bitirmek için kare çek ve ayarla oyna';
  };
  ciktiYaz(); bitirGuncelle();

  kok.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
    degerler[r.dataset.p] = parseFloat(r.value);
    if (dondurulmus) { oynandi = true; bitirGuncelle(); }
    ciktiYaz();
  }));
  bitirDugme.addEventListener('click', () => {
    if (bitti()) return;
    const sonuc = guncelle((i) => ({ ...i, tamamlanan: [...i.tamamlanan, d.id], xp: i.xp + XP_DERS }),
      [{ ik: '✅', m: `Ders bitti: ${d.baslik}` }], { sessiz: true });
    bitirGuncelle();
    tebrik(d, sonuc);
  });

  gl = tuval.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) { durumEl.textContent = 'Bu tarayıcı WebGL desteklemiyor.'; return; }
  const p = program(d.glsl), orj = program(ORIJINAL);
  const tampon = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  dokum = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dokum);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  let orijinalGoster = false;
  const bas = (e) => { e.preventDefault(); orijinalGoster = true; };
  const birak = () => { orijinalGoster = false; };
  tuval.addEventListener('pointerdown', bas);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((o) => tuval.addEventListener(o, birak));

  let kaynak;
  try {
    await kameraAc(durumEl);
    kaynak = video;
  } catch {
    ornekKaynak ??= ornekSahne();
    kaynak = ornekKaynak;
    durumEl.textContent = 'Kamera açılamadı; örnek görüntüyle devam ediyorsun.';
  }
  if (aktifDers !== d || !gl) return; // beklerken ekrandan çıkıldı
  const kamerali = kaynak === video;
  kareDugme.addEventListener('click', () => {
    dondurulmus = !dondurulmus;
    if (dondurulmus) {
      guncelle((i) => ({ ...i, denemeler: i.denemeler + 1, xp: i.xp + XP_DENEME }));
      kareDugme.textContent = kamerali ? 'Canlıya dön' : 'Yeniden başla';
    } else {
      kareDugme.textContent = 'Kare çek';
    }
  });

  let yuklendi = false;
  const ciz = () => {
    if (!gl) return;
    const w = tuval.clientWidth, h = tuval.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (tuval.width !== Math.round(w * dpr)) { tuval.width = Math.round(w * dpr); tuval.height = Math.round(h * dpr); }
    kaynakW = kaynak.videoWidth || kaynak.width; kaynakH = kaynak.videoHeight || kaynak.height;
    if (kaynakW && (!dondurulmus || !yuklendi)) {
      gl.bindTexture(gl.TEXTURE_2D, dokum);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, kaynak);
      yuklendi = true;
    }
    if (yuklendi) {
      const prog = orijinalGoster ? orj : p;
      gl.viewport(0, 0, tuval.width, tuval.height);
      gl.useProgram(prog);
      const konum = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(konum);
      gl.vertexAttribPointer(konum, 2, gl.FLOAT, false, 0, 0);
      // "cover" sığdırma: görüntü tuvali doldurur, taşan kısım kırpılır
      const ta = tuval.width / tuval.height, ka = kaynakW / kaynakH;
      gl.uniform2f(gl.getUniformLocation(prog, 'u_olcek'), ta > ka ? 1 : ta / ka, ta > ka ? ka / ta : 1);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_px'), 1 / kaynakW, 1 / kaynakH);
      if (prog === p) for (const [k, v] of Object.entries(degerler)) gl.uniform1f(gl.getUniformLocation(p, k), v);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    cerceve = requestAnimationFrame(ciz);
  };
  ciz();
}

const EKRANLAR = { '': bugunEkrani, dersler: derslerEkrani, kartlar: kartlarEkrani, gelisim: gelisimEkrani, pro: proEkrani };

function yonlendir() {
  const id = location.hash.slice(1);
  const d = DERSLER.find((x) => x.id === id);
  document.querySelector('.katman')?.remove();
  if (d) {
    sekmeler.hidden = true;
    ders(d);
  } else {
    durdur();
    const ad = id in EKRANLAR ? id : '';
    sekmeler.hidden = ad === 'pro';
    sekmeler.querySelectorAll('a').forEach((a) => a.classList.toggle('secili', a.getAttribute('href') === `#${ad}`));
    EKRANLAR[ad]();
  }
  scrollTo(0, 0);
}

addEventListener('hashchange', yonlendir);
// Sekme gizlenince kamerayı kapat, derse geri gelince yeniden kur
document.addEventListener('visibilitychange', () => {
  if (document.hidden) durdur();
  else if (DERSLER.some((x) => `#${x.id}` === location.hash)) yonlendir();
});
yonlendir();
proYenile();
Abonelik?.addListener?.('degisti', proAyarla);
gunlukKartlariKur();
