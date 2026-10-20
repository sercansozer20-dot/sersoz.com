// VisionCap web sürümü: dersler (GLSL), ilerleme, pano ve ders ekranı. iOS uygulamasındaki
// app/src/dersler/dersler.ts ile aynı dersler; shader'lar SkSL'den WebGL'e çevrildi.

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
];

const ORIJINAL = `void main() { gl_FragColor = vec4(t(vec2(0.0)), 1.0); }`;

// ---------- İlerleme (uygulamadaki ilerleme.ts ile aynı kurallar; yalnız bu tarayıcıda) ----------

const ANAHTAR = 'visioncap.web.ilerleme.v1';
export const XP_DENEME = 5;
export const XP_DERS = 50;
export const XP_SEVIYE = 100;
const SIRALI_KILIT = true;

function bugun(tarih = new Date()) {
  const a = String(tarih.getMonth() + 1).padStart(2, '0');
  const g = String(tarih.getDate()).padStart(2, '0');
  return `${tarih.getFullYear()}-${a}-${g}`;
}

function yukle() {
  try {
    const m = localStorage.getItem(ANAHTAR);
    if (m) return { tamamlanan: [], denemeler: 0, xp: 0, gunler: [], ...JSON.parse(m) };
  } catch {}
  return { tamamlanan: [], denemeler: 0, xp: 0, gunler: [] };
}

function kaydet(i) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(i)); } catch {}
}

let ilerleme = yukle();

function guncelle(f) {
  ilerleme = f({ ...ilerleme });
  const gun = bugun();
  if (!ilerleme.gunler.includes(gun)) ilerleme.gunler = [...ilerleme.gunler, gun];
  kaydet(ilerleme);
}

function seri(gunler) {
  const kume = new Set(gunler);
  const gun = new Date();
  if (!kume.has(bugun(gun))) gun.setDate(gun.getDate() - 1);
  let n = 0;
  while (kume.has(bugun(gun))) { n++; gun.setDate(gun.getDate() - 1); }
  return n;
}

function rozetler(i) {
  const s = seri(i.gunler);
  const t = i.tamamlanan.length;
  return [
    { ad: 'İlk adım', aciklama: 'İlk dersi bitir', kazanildi: t >= 1 },
    { ad: 'Isınma', aciklama: '3 ders bitir', kazanildi: t >= 3 },
    { ad: 'Piksel ustası', aciklama: 'Tüm dersleri bitir', kazanildi: t >= DERSLER.length },
    { ad: 'Meraklı', aciklama: '25 kare işle', kazanildi: i.denemeler >= 25 },
    { ad: '3 gün', aciklama: '3 günlük seri', kazanildi: s >= 3 },
    { ad: '1 hafta', aciklama: '7 günlük seri', kazanildi: s >= 7 },
    { ad: '1 ay', aciklama: '30 günlük seri', kazanildi: s >= 30 },
  ];
}

// ---------- Uygulama içi (iOS kabuğu) ----------

const NATIVE = !!window.Capacitor?.isNativePlatform?.();
const Bildirim = window.Capacitor?.Plugins?.LocalNotifications; // eski kabukta yoksa hatırlatma kartı gizlenir
const HATIRLATMA = 'visioncap.hatirlatma';
if (NATIVE) document.documentElement.classList.add('native');

function hatirlatmaAcik() {
  try { return localStorage.getItem(HATIRLATMA) === '1'; } catch { return false; }
}

async function hatirlatmaDegistir() {
  const ac = !hatirlatmaAcik();
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
  pano();
}

// ---------- Ekranlar ----------

const kok = document.getElementById('uygulama');
const kacis = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function pano() {
  durdur();
  const s = seri(ilerleme.gunler);
  const sv = Math.floor(ilerleme.xp / XP_SEVIYE) + 1;
  const kalan = ilerleme.xp % XP_SEVIYE;
  const siradaki = DERSLER.find((d) => !ilerleme.tamamlanan.includes(d.id)) ?? DERSLER[0];
  kok.innerHTML = `
    <section class="seri-kart"><span>${s}</span><small>günlük seri</small></section>
    <div class="uclu">
      <div class="kart"><strong>${ilerleme.tamamlanan.length}/${DERSLER.length}</strong><small>Ders</small></div>
      <div class="kart"><strong>${ilerleme.denemeler}</strong><small>Deneme</small></div>
      <div class="kart"><strong>${sv}</strong><small>Seviye</small></div>
    </div>
    <div class="kart">
      <strong>Seviye ${sv} · ${ilerleme.xp} XP</strong>
      <div class="cubuk"><i style="width:${(kalan / XP_SEVIYE) * 100}%"></i></div>
      <small>Sonraki seviyeye ${XP_SEVIYE - kalan} XP</small>
    </div>
    <a class="kart gorev" href="#${siradaki.id}">
      <em>GÜNÜN GÖREVİ</em><strong>${kacis(siradaki.baslik)}</strong><small>${kacis(siradaki.ipucu)}</small>
    </a>
    ${Bildirim ? `<button class="kart hatirlatma" data-is="hatirlatma">
      <strong>Günlük hatırlatma ${hatirlatmaAcik() ? 'açık' : 'kapalı'}</strong>
      <small>${hatirlatmaAcik() ? 'Her akşam 20:00’de serini hatırlatırım. Kapatmak için dokun.' : 'Her akşam 20:00’de serini hatırlatmamı istersen dokun.'}</small>
    </button>` : ''}
    <h2>Rozetler</h2>
    <div class="rozetler">${rozetler(ilerleme).map((r) => `
      <div class="rozet${r.kazanildi ? '' : ' kilitli'}"><strong>${r.ad}</strong><small>${r.aciklama}</small></div>`).join('')}
    </div>
    <h2>Ders yolu</h2>
    <div class="yol">${DERSLER.map((d, i) => {
      const bitti = ilerleme.tamamlanan.includes(d.id);
      const acik = !SIRALI_KILIT || i === 0 || ilerleme.tamamlanan.includes(DERSLER[i - 1].id);
      const ic = `<i>${bitti ? '✓' : i + 1}</i><span><strong>${kacis(d.baslik)}</strong><small>${acik ? kacis(d.formul) : 'Önceki dersi bitirince açılır'}</small></span>`;
      return acik
        ? `<a class="adim${bitti ? ' bitti' : ''}" href="#${d.id}">${ic}</a>`
        : `<div class="adim kilitli" aria-disabled="true">${ic}</div>`;
    }).join('')}
    </div>`;
  kok.querySelector('[data-is="hatirlatma"]')?.addEventListener('click', hatirlatmaDegistir);
}

// ---------- WebGL ----------

let gl, video, akis, dokum, cerceve, kaynakW = 1, kaynakH = 1, dondurulmus = false, ornekKaynak = null;

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
  akis = null; video = null; gl = null; dondurulmus = false;
}

async function ders(d) {
  durdur();
  const indeks = DERSLER.indexOf(d);
  const acik = !SIRALI_KILIT || indeks === 0 || ilerleme.tamamlanan.includes(DERSLER[indeks - 1].id);
  if (!acik) { location.hash = ''; return; }
  const degerler = Object.fromEntries(d.parametreler.map((p) => [p.anahtar, p.varsayilan]));
  let oynandi = false;
  const bitti = () => ilerleme.tamamlanan.includes(d.id);

  kok.innerHTML = `
    <a class="geri-ic" href="#">‹ Pano</a>
    <h1>${kacis(d.baslik)}</h1>
    <p class="anlatim">${kacis(d.anlatim)}</p>
    <div class="formul">${kacis(d.formul)}</div>
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

  const ciktiYaz = () => d.parametreler.forEach((p) => {
    const v = degerler[p.anahtar];
    kok.querySelector(`[data-out="${p.anahtar}"]`).textContent = p.etiketler ? p.etiketler[Math.round(v)] : v.toFixed(2);
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
    guncelle((i) => i.tamamlanan.includes(d.id) ? i : { ...i, tamamlanan: [...i.tamamlanan, d.id], xp: i.xp + XP_DERS });
    location.hash = '';
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

function yonlendir() {
  const id = location.hash.slice(1);
  const d = DERSLER.find((x) => x.id === id);
  if (d) ders(d); else pano();
  scrollTo(0, 0);
}

addEventListener('hashchange', yonlendir);
// Sekme gizlenince kamerayı kapat, geri gelince dersi yeniden kur
document.addEventListener('visibilitychange', () => { if (document.hidden) durdur(); else yonlendir(); });
yonlendir();
