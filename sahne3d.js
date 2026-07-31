/* sersoz.com — Vision Detection App çalışma canlandırması
 *
 * Uygulamanın gerçek mantığını yansıtır: sol ARAÇ ZİNCİRİ sütunu, ortada
 * viewport, sağda seçili aracın ÇIKTILAR panosu (değer · limit · karar glifi ·
 * PLC işareti), altta üç durumlu karar (OK / NOK / DEĞERLENDİRİLEMEDİ).
 * Zincir sırayla koşar; her araç viewport'u kendi işlevine göre değiştirir.
 *
 * Kullanım: Sahne3D('kanvasId', { senaryo: 'kaynak', kompakt: false, metrik: {...} })
 */
(function (global) {
  'use strict';

  /* Araç zinciri adımları — her senaryoda ortak iskelet, ölçüm adımı senaryoya özel */
  function zincirKur(olcumAd, olcumGlif) {
    return [
      { glif: '⬒', ad: 'Tarama',        tur: 'tarama' },
      { glif: '▦', ad: 'Zemin Kaldır',  tur: 'zemin' },
      { glif: '⌗', ad: 'Kırpma (ROI)',  tur: 'roi' },
      { glif: '⌖', ad: 'Çapalama',      tur: 'capa' },
      { glif: olcumGlif, ad: olcumAd,   tur: 'olcum' },
      { glif: '◎', ad: 'Denetim',       tur: 'denetim' },
      { glif: '☰', ad: 'Karar',         tur: 'karar' },
      { glif: '⇥', ad: 'PLC Yaz',       tur: 'plc' }
    ];
  }

  var SENARYOLAR = {

    /* ----------------------------------------------------- KAYNAK ROBOTU */
    kaynak: {
      ad: 'Kaynak robotu',
      is: 'kaynak_govde_v4',
      zincir: zincirKur('Kaynak Ağzı', '∡'),
      ozet: '4/4 ölçüldü · 0 NOK · 0 ölçülemedi',
      karar: 'OK',
      ciktilar: [
        { ad: 'agiz_derinlik', deger: '3.18 mm', limit: '2.8 – 3.6', durum: 'ok', plc: true },
        { ad: 'agiz_genislik', deger: '6.04 mm', limit: '5.5 – 6.5', durum: 'ok', plc: true },
        { ad: 'duzlemsellik',  deger: '0.06 mm', limit: '≤ 0.15',    durum: 'ok', plc: false },
        { ad: 'delik_cap',     deger: 'Ø 8.02',  limit: '7.9 – 8.1', durum: 'ok', plc: true },
        { ad: 'nokta_sayisi',  deger: '78 880',  limit: '≥ 40 000',  durum: 'ok', plc: false }
      ],
      delikler: [{ u: -0.52, v: -0.30 }, { u: -0.52, v: 0.30 }],
      roi: { u1: -0.30, u2: 0.56, v1: -0.35, v2: 0.35 },
      capa: { u: 0.13, v: 0 },
      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.86 || Math.abs(v) >= 0.60) return 0;
        var y = 0.10;
        var kenar = Math.min(0.86 - Math.abs(u), 0.60 - Math.abs(v));
        if (kenar < 0.05) y -= (0.05 - kenar) * 1.1;
        if (u > -0.28 && u < 0.54 && Math.abs(v) < 0.33) {
          y = 0.32 - 0.21 * Math.exp(-Math.pow((u - 0.13) / 0.052, 2));
          y += 0.010 * Math.sin(u * 9) * Math.cos(v * 8);
        } else {
          y += 0.008 * Math.sin(u * 7) * Math.cos(v * 6);
        }
        for (var i = 0; i < this.delikler.length; i++) {
          var d = this.delikler[i];
          var r = Math.hypot(u - d.u, v - d.v);
          if (r < 0.075) y -= 0.13 * (1 - r / 0.075);
        }
        return y;
      },
      zeminMi: function (y) { return y < 0.16; },
      olcumCiz: function (S, aci, a) {
        var oUst = S.yansit(0.13, -0.32, 0.12, aci), oAlt = S.yansit(0.13, -0.11, 0.12, aci);
        S.ctx.strokeStyle = 'rgba(110,240,170,' + a + ')'; S.ctx.lineWidth = 1.4;
        S.ctx.beginPath(); S.ctx.moveTo(oUst.X, oUst.Y); S.ctx.lineTo(oAlt.X, oAlt.Y); S.ctx.stroke();
        S.etiket(oAlt.X + 10, (oUst.Y + oAlt.Y) / 2 + 4, 'ağız 3.18 mm', 'rgba(110,240,170,' + a + ')');
        var sol = S.yansit(-0.28, -0.32, -0.33, aci), sag = S.yansit(0.54, -0.32, -0.33, aci);
        S.olcu(sol, sag, '82.40 mm', 'rgba(255,190,140,' + a + ')', -26);
      }
    },

    /* ------------------------------------------------ PALETLEME / EKSİK */
    palet: {
      ad: 'Paletleme · eksik ürün',
      is: 'palet_3x3_kutu',
      zincir: zincirKur('Bölge Sayım', '▤'),
      ozet: '8/9 sayıldı · 1 NOK · 0 ölçülemedi',
      karar: 'NOK',
      ciktilar: [
        { ad: 'koli_adet',     deger: '8',       limit: '= 9',       durum: 'nok', plc: true },
        { ad: 'eksik_konum',   deger: 'S2 · K3', limit: '—',         durum: 'nok', plc: true },
        { ad: 'palet_yukseklik', deger: '148 mm', limit: '140 – 155', durum: 'ok', plc: true },
        { ad: 'istif_sapma',   deger: '4.2 mm',  limit: '≤ 8',       durum: 'ok', plc: false },
        { ad: 'nokta_sayisi',  deger: '86 768',  limit: '≥ 40 000',  durum: 'ok', plc: false }
      ],
      kutular: (function () {
        var l = [];
        for (var s = 0; s < 3; s++) for (var k = 0; k < 3; k++) {
          if (s === 1 && k === 2) continue;
          l.push({ u: -0.50 + k * 0.50, v: -0.38 + s * 0.38 });
        }
        return l;
      })(),
      bosluk: { u: 0.50, v: 0 },
      roi: { u1: -0.78, u2: 0.78, v1: -0.60, v2: 0.60 },
      capa: { u: -0.50, v: -0.38 },
      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.88 || Math.abs(v) >= 0.66) return 0;
        var y = 0.07;
        for (var i = 0; i < this.kutular.length; i++) {
          var b = this.kutular[i];
          if (Math.abs(u - b.u) < 0.21 && Math.abs(v - b.v) < 0.16) {
            y = 0.34;
            if (Math.abs(u - b.u) < 0.012) y -= 0.02;
            y += 0.006 * Math.sin(u * 40) * Math.cos(v * 30);
          }
        }
        return y;
      },
      zeminMi: function (y) { return y < 0.12; },
      olcumCiz: function (S, aci, a) {
        var b = this.bosluk;
        var k1 = S.yansit(b.u - 0.21, -0.09, b.v - 0.16, aci);
        var k2 = S.yansit(b.u + 0.21, -0.09, b.v - 0.16, aci);
        var k3 = S.yansit(b.u + 0.21, -0.09, b.v + 0.16, aci);
        var k4 = S.yansit(b.u - 0.21, -0.09, b.v + 0.16, aci);
        S.ctx.fillStyle = 'rgba(248,113,113,' + (0.18 * a) + ')';
        S.ctx.beginPath();
        S.ctx.moveTo(k1.X, k1.Y); S.ctx.lineTo(k2.X, k2.Y); S.ctx.lineTo(k3.X, k3.Y); S.ctx.lineTo(k4.X, k4.Y);
        S.ctx.closePath(); S.ctx.fill();
        S.ctx.strokeStyle = 'rgba(248,113,113,' + a + ')'; S.ctx.lineWidth = 1.8;
        S.ctx.setLineDash([6, 4]); S.ctx.stroke(); S.ctx.setLineDash([]);
        S.etiket((k1.X + k3.X) / 2 - 34, (k1.Y + k3.Y) / 2 - 20, 'EKSİK · S2·K3', 'rgba(248,113,113,' + a + ')');
        for (var i = 0; i < this.kutular.length; i++) {
          var c = this.kutular[i];
          var cp = S.yansit(c.u, -0.36, c.v, aci);
          S.ctx.strokeStyle = 'rgba(110,240,170,' + (0.8 * a) + ')'; S.ctx.lineWidth = 1.1;
          S.ctx.beginPath(); S.ctx.arc(cp.X, cp.Y, 7, 0, Math.PI * 2); S.ctx.stroke();
          S.ctx.font = '9px Consolas, monospace';
          S.ctx.fillStyle = 'rgba(110,240,170,' + a + ')';
          S.ctx.fillText(String(i + 1), cp.X - 2.5, cp.Y + 3);
        }
      }
    },

    /* ------------------------------------------------------- KOLİLEME */
    koli: {
      ad: 'Kolileme · adet ve oturma',
      is: 'koli_12li_dolum',
      zincir: zincirKur('Adet + Yükseklik', '▤'),
      ozet: '12/12 kontrol · 2 NOK · 0 ölçülemedi',
      karar: 'NOK',
      ciktilar: [
        { ad: 'urun_adet',     deger: '11',      limit: '= 12',      durum: 'nok', plc: true },
        { ad: 'oturma_farki',  deger: '6.4 mm',  limit: '≤ 2.0',     durum: 'nok', plc: true },
        { ad: 'kapak_yuksek',  deger: '92.1 mm', limit: '90 – 94',   durum: 'ok', plc: false },
        { ad: 'koli_konum',    deger: '1.2 mm',  limit: '≤ 3',       durum: 'ok', plc: true },
        { ad: 'nokta_sayisi',  deger: '77 112',  limit: '≥ 40 000',  durum: 'ok', plc: false }
      ],
      urunler: (function () {
        var l = [];
        for (var s = 0; s < 3; s++) for (var k = 0; k < 4; k++) {
          if (s === 2 && k === 1) continue;
          l.push({ u: -0.48 + k * 0.32, v: -0.34 + s * 0.34, alcak: (s === 0 && k === 2) });
        }
        return l;
      })(),
      roi: { u1: -0.72, u2: 0.72, v1: -0.56, v2: 0.56 },
      capa: { u: -0.48, v: -0.34 },
      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.80 || Math.abs(v) >= 0.62) return 0;
        var duvar = Math.min(0.80 - Math.abs(u), 0.62 - Math.abs(v));
        var y = duvar < 0.06 ? 0.26 : 0.08;
        for (var i = 0; i < this.urunler.length; i++) {
          var p = this.urunler[i];
          var r = Math.hypot(u - p.u, v - p.v);
          if (r < 0.13) {
            var tepe = p.alcak ? 0.24 : 0.38;
            y = Math.max(y, tepe - 0.03 + 0.03 * Math.sqrt(Math.max(0, 1 - Math.pow(r / 0.13, 2))));
          }
        }
        return y;
      },
      zeminMi: function (y) { return y < 0.12; },
      olcumCiz: function (S, aci, a) {
        for (var i = 0; i < this.urunler.length; i++) {
          var p = this.urunler[i];
          var pp = S.yansit(p.u, -(p.alcak ? 0.25 : 0.39), p.v, aci);
          var renk = p.alcak ? 'rgba(248,113,113,' + a + ')' : 'rgba(110,240,170,' + (0.8 * a) + ')';
          S.ctx.strokeStyle = renk; S.ctx.lineWidth = p.alcak ? 1.8 : 1.1;
          S.ctx.beginPath(); S.ctx.arc(pp.X, pp.Y, 9, 0, Math.PI * 2); S.ctx.stroke();
          if (p.alcak) S.etiket(pp.X + 13, pp.Y - 11, 'oturmadı −6.4', 'rgba(248,113,113,' + a + ')');
        }
        var bos = S.yansit(-0.16, -0.10, 0.34, aci);
        S.ctx.strokeStyle = 'rgba(248,113,113,' + a + ')'; S.ctx.lineWidth = 1.6;
        S.ctx.setLineDash([5, 4]);
        S.ctx.beginPath(); S.ctx.arc(bos.X, bos.Y, 13, 0, Math.PI * 2); S.ctx.stroke();
        S.ctx.setLineDash([]);
        S.etiket(bos.X + 16, bos.Y + 4, 'eksik ürün', 'rgba(248,113,113,' + a + ')');
      }
    },

    /* --------------------------------------------------- KALİTE KONTROL */
    kalite: {
      ad: 'Kalite kontrol · yüzey',
      is: 'yuzey_denetim_a3',
      zincir: zincirKur('Yüzey Sapma', '◈'),
      ozet: '3/4 ölçüldü · 2 NOK · 1 ölçülemedi',
      karar: 'NOK',
      ciktilar: [
        { ad: 'cukur_derinlik', deger: '−0.42 mm', limit: '≤ 0.15',  durum: 'nok', plc: true },
        { ad: 'cukur_alan',     deger: '38.4 mm²', limit: '≤ 10',    durum: 'nok', plc: false },
        { ad: 'duzlemsellik',   deger: '0.31 mm',  limit: '≤ 0.20',  durum: 'nok', plc: true },
        { ad: 'kenar_pah',      deger: '—',        limit: '0.4 – 0.8', durum: 'deger', plc: false },
        { ad: 'nokta_sayisi',   deger: '69 768',   limit: '≥ 40 000', durum: 'ok', plc: false }
      ],
      kusurlar: [{ u: 0.22, v: -0.14, r: 0.14, d: 0.075 }, { u: -0.34, v: 0.22, r: 0.09, d: 0.045 }],
      roi: { u1: -0.76, u2: 0.76, v1: -0.52, v2: 0.52 },
      capa: { u: -0.70, v: -0.46 },
      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.82 || Math.abs(v) >= 0.58) return 0;
        var y = 0.26;
        var kenar = Math.min(0.82 - Math.abs(u), 0.58 - Math.abs(v));
        if (kenar < 0.05) y -= (0.05 - kenar) * 1.4;
        y += 0.006 * Math.sin(u * 11) * Math.cos(v * 9);
        for (var i = 0; i < this.kusurlar.length; i++) {
          var k = this.kusurlar[i];
          var r = Math.hypot(u - k.u, v - k.v);
          if (r < k.r) y -= k.d * (1 - Math.pow(r / k.r, 2));
        }
        return y;
      },
      zeminMi: function (y) { return y < 0.14; },
      olcumCiz: function (S, aci, a) {
        for (var i = 0; i < this.kusurlar.length; i++) {
          var k = this.kusurlar[i];
          var kp = S.yansit(k.u, -(this.yukseklik(k.u, k.v) + 0.01), k.v, aci);
          var R = 24 - i * 7;
          for (var h = 3; h >= 1; h--) {
            S.ctx.fillStyle = 'rgba(248,113,113,' + (0.055 * h * a) + ')';
            S.ctx.beginPath(); S.ctx.arc(kp.X, kp.Y, R * h / 2.2, 0, Math.PI * 2); S.ctx.fill();
          }
          S.ctx.strokeStyle = 'rgba(248,113,113,' + a + ')'; S.ctx.lineWidth = 1.6;
          S.ctx.beginPath(); S.ctx.arc(kp.X, kp.Y, R / 2, 0, Math.PI * 2); S.ctx.stroke();
          S.etiket(kp.X + 20, kp.Y - 18, i === 0 ? '−0.42 mm' : '−0.24 mm', 'rgba(248,113,113,' + a + ')');
        }
      }
    }
  };

  var GLIF = { ok: '✓', nok: '✗', deger: '○', bos: '—' };
  var RENK = {
    ok: 'rgba(110,240,170,1)',
    nok: 'rgba(248,113,113,1)',
    deger: 'rgba(255,190,110,1)',
    bos: 'rgba(255,255,255,.28)'
  };

  function Sahne3D(kanvasId, secenek) {
    var c = document.getElementById(kanvasId);
    if (!c || !c.getContext) return null;

    secenek = secenek || {};
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    var kompakt = !!secenek.kompakt;
    var azalt = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* panel yerleşimi */
    var UST = kompakt ? 30 : 34;
    var SUTUN = kompakt ? 150 : 196;
    var PANO = kompakt ? 0 : 292;
    var ALT = kompakt ? 38 : 44;
    var VX = SUTUN, VY = UST;
    var VW = W - SUTUN - PANO, VH = H - UST - ALT;

    var N = kompakt ? 52 : 62;
    var TILT = -0.96, FOV = 3.5;
    var OLCEK = Math.min(VW, VH) * 0.86;
    var CX = VX + VW * 0.5, CY = VY + VH * 0.56;

    var senaryo = SENARYOLAR[secenek.senaryo] || SENARYOLAR.kaynak;
    var ADIM_SURE = 1750;
    var t0 = performance.now();
    var suruklenen = false, surukleBas = 0, aciKay = 0, sonAci = 0;
    var ince = !global.matchMedia || matchMedia('(pointer: fine)').matches;

    var m = secenek.metrik || {};
    function metrikYaz(ad, deger) {
      var el = m[ad] ? document.getElementById(m[ad]) : null;
      if (el && el.textContent !== deger) el.textContent = deger;
    }

    /* alt metrik etiketlerini senaryonun gerçek çıktı adlarıyla eşitler */
    function etiketleriEsitle() {
      if (m.etiketA) {
        var ea = document.getElementById(m.etiketA);
        if (ea) ea.textContent = senaryo.ciktilar[0].ad;
      }
      if (m.etiketB) {
        var eb = document.getElementById(m.etiketB);
        if (eb) eb.textContent = senaryo.ciktilar[1].ad;
      }
      if (m.ustBilgi) {
        var ub = document.getElementById(m.ustBilgi);
        if (ub) ub.textContent = senaryo.ad;
      }
      if (m.karar) {
        var kel = document.getElementById(m.karar);
        if (kel) kel.className = 'v ' + (senaryo.karar === 'OK' ? 'ok' : 'nok');
      }
    }

    function yansit(px, py, pz, aci) {
      var ca = Math.cos(aci), sa = Math.sin(aci);
      var xr = px * ca + pz * sa, zr = -px * sa + pz * ca;
      var cx2 = Math.cos(TILT), sx2 = Math.sin(TILT);
      var yr = py * cx2 - zr * sx2, zd = py * sx2 + zr * cx2;
      var s = FOV / (FOV + zd);
      return { X: CX + xr * s * OLCEK, Y: CY + yr * s * OLCEK, s: s, zd: zd };
    }

    function etiket(px, py, yazi, renk) {
      ctx.font = '600 11px Consolas, monospace';
      var g = ctx.measureText(yazi).width;
      ctx.fillStyle = 'rgba(8,12,17,.85)';
      ctx.fillRect(px - 5, py - 12, g + 10, 17);
      ctx.strokeStyle = renk; ctx.lineWidth = 1;
      ctx.strokeRect(px - 5, py - 12, g + 10, 17);
      ctx.fillStyle = renk;
      ctx.fillText(yazi, px, py);
    }

    function olcu(a, b, yazi, renk, kaydir) {
      var oy = kaydir || -26;
      ctx.strokeStyle = renk; ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(a.X, a.Y + oy); ctx.lineTo(b.X, b.Y + oy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(a.X, a.Y + oy - 5); ctx.lineTo(a.X, a.Y + oy + 5);
      ctx.moveTo(b.X, b.Y + oy - 5); ctx.lineTo(b.X, b.Y + oy + 5);
      ctx.stroke();
      ctx.font = '600 11px Consolas, monospace';
      etiket((a.X + b.X) / 2 - ctx.measureText(yazi).width / 2, a.Y + oy - 4, yazi, renk);
    }

    var S = { ctx: ctx, yansit: yansit, etiket: etiket, olcu: olcu };

    /* ------------------------------------------------------ panel çizimleri */
    function ustCubuk(adim, p) {
      ctx.fillStyle = '#11161d';
      ctx.fillRect(0, 0, W, UST);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(0, UST - 1, W, 1);

      ctx.font = '10.5px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.fillText('İŞ', 14, UST / 2 + 4);
      ctx.fillStyle = 'rgba(232,237,245,.92)';
      ctx.font = '600 11.5px Consolas, monospace';
      ctx.fillText(senaryo.is, 34, UST / 2 + 4);

      /* Zinciri Çalıştır düğmesi */
      var bx = kompakt ? W - 150 : W - 176, bw = kompakt ? 136 : 162;
      var koşuyor = adim < senaryo.zincir.length;
      ctx.fillStyle = koşuyor ? 'rgba(194,65,12,.9)' : 'rgba(255,255,255,.12)';
      ctx.fillRect(bx, 6, bw, UST - 12);
      ctx.fillStyle = koşuyor ? '#fff' : 'rgba(255,255,255,.6)';
      ctx.font = '600 10px Consolas, monospace';
      ctx.fillText(koşuyor ? '▶ ZİNCİR KOŞUYOR' : '✓ ZİNCİR TAMAMLANDI', bx + 12, UST / 2 + 4);

      /* mini ilerleme */
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(bx, UST - 5, bw, 2);
      ctx.fillStyle = 'rgba(255,190,140,.9)';
      ctx.fillRect(bx, UST - 5, bw * p, 2);
    }

    function aracSutunu(adim, altIlerleme) {
      ctx.fillStyle = '#0e131a';
      ctx.fillRect(0, UST, SUTUN, H - UST);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(SUTUN - 1, UST, 1, H - UST);

      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.34)';
      ctx.fillText('ARAÇ ZİNCİRİ', 12, UST + 16);

      var y0 = UST + 26;
      var kartY = kompakt ? 30 : 34;

      for (var i = 0; i < senaryo.zincir.length; i++) {
        var a = senaryo.zincir[i];
        var ky = y0 + i * kartY;
        if (ky + kartY > H - 4) break;

        var aktif = i === adim;
        var bitti = i < adim;

        if (aktif) {
          ctx.fillStyle = 'rgba(194,65,12,.16)';
          ctx.fillRect(0, ky, SUTUN, kartY - 3);
          ctx.fillStyle = '#c2410c';
          ctx.fillRect(0, ky, 2.5, kartY - 3);
        }

        /* sıra rozeti */
        ctx.fillStyle = bitti ? 'rgba(110,240,170,.18)' : aktif ? 'rgba(255,190,140,.22)' : 'rgba(255,255,255,.07)';
        ctx.fillRect(10, ky + 6, 16, 16);
        ctx.font = '9px Consolas, monospace';
        ctx.fillStyle = bitti ? 'rgba(110,240,170,.9)' : aktif ? 'rgba(255,200,150,.95)' : 'rgba(255,255,255,.35)';
        ctx.fillText(String(i + 1), 15, ky + 17);

        /* glif */
        ctx.font = '13px Consolas, monospace';
        ctx.fillStyle = aktif ? 'rgba(255,210,170,.95)' : bitti ? 'rgba(200,215,230,.7)' : 'rgba(255,255,255,.28)';
        ctx.fillText(a.glif, 32, ky + 18);

        /* ad */
        ctx.font = (aktif ? '600 ' : '') + '10.5px Consolas, monospace';
        ctx.fillStyle = aktif ? 'rgba(255,235,220,.98)' : bitti ? 'rgba(220,230,240,.72)' : 'rgba(255,255,255,.34)';
        ctx.fillText(a.ad, 50, ky + 18);

        /* durum LED'i */
        var lx = SUTUN - 16, ly = ky + 13;
        if (bitti) {
          ctx.fillStyle = 'rgba(110,240,170,.9)';
          ctx.font = '11px Consolas, monospace';
          ctx.fillText('✓', lx - 3, ly + 4);
        } else if (aktif) {
          var puls = 0.45 + Math.abs(Math.sin(performance.now() / 260)) * 0.55;
          ctx.fillStyle = 'rgba(255,180,120,' + puls + ')';
          ctx.beginPath(); ctx.arc(lx, ly, 3.6, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.font = '11px Consolas, monospace';
          ctx.fillText('—', lx - 4, ly + 4);
        }

        /* aktif adım ilerleme çizgisi */
        if (aktif) {
          ctx.fillStyle = 'rgba(255,190,140,.65)';
          ctx.fillRect(0, ky + kartY - 5, SUTUN * altIlerleme, 1.5);
        }
      }
    }

    function ciktiPanosu(adim) {
      if (kompakt) return;
      var px = W - PANO;
      ctx.fillStyle = '#0e131a';
      ctx.fillRect(px, UST, PANO, H - UST);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(px, UST, 1, H - UST);

      var aracAd = senaryo.zincir[Math.min(adim, senaryo.zincir.length - 1)].ad;
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.34)';
      ctx.fillText('ÇIKTILAR · ' + aracAd.toUpperCase(), px + 14, UST + 16);

      /* başlık satırı */
      var y = UST + 34;
      ctx.font = '8.5px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.26)';
      ctx.fillText('AD', px + 14, y);
      ctx.fillText('DEĞER', px + 128, y);
      ctx.fillText('LİMİT', px + 196, y);

      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(px + 12, y + 6, PANO - 24, 1);

      /* ölçüm adımından itibaren değerler dolar */
      var gorunur = adim < 4 ? 0 : adim === 4 ? 3 : senaryo.ciktilar.length;

      for (var i = 0; i < senaryo.ciktilar.length; i++) {
        var o = senaryo.ciktilar[i];
        var ry = y + 24 + i * 26;
        var dolu = i < gorunur;

        ctx.font = '10px Consolas, monospace';
        ctx.fillStyle = dolu ? 'rgba(220,230,240,.85)' : 'rgba(255,255,255,.26)';
        ctx.fillText(o.ad, px + 14, ry);

        ctx.fillStyle = dolu ? (o.durum === 'nok' ? RENK.nok : 'rgba(232,237,245,.95)') : 'rgba(255,255,255,.2)';
        ctx.font = '600 10px Consolas, monospace';
        ctx.fillText(dolu ? o.deger : '—', px + 128, ry);

        ctx.font = '9px Consolas, monospace';
        ctx.fillStyle = 'rgba(255,255,255,.32)';
        ctx.fillText(o.limit, px + 196, ry);

        /* karar glifi */
        var d = dolu ? o.durum : 'bos';
        ctx.font = '11px Consolas, monospace';
        ctx.fillStyle = RENK[d];
        ctx.fillText(GLIF[d], px + PANO - 26, ry);

        /* PLC işareti */
        if (o.plc) {
          ctx.font = '9px Consolas, monospace';
          ctx.fillStyle = dolu && adim >= 7 ? 'rgba(120,205,255,.95)' : 'rgba(120,205,255,.3)';
          ctx.fillText('⇥', px + PANO - 44, ry);
        }

        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.fillRect(px + 12, ry + 8, PANO - 24, 1);
      }

      /* özet */
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = adim >= 5 ? 'rgba(255,190,140,.8)' : 'rgba(255,255,255,.25)';
      ctx.fillText(adim >= 5 ? senaryo.ozet : '— koşum bekleniyor —', px + 14, H - 16);
    }

    function altCubuk(adim) {
      var by = H - ALT;
      ctx.fillStyle = '#11161d';
      ctx.fillRect(0, by, W - PANO, ALT);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(0, by, W - PANO, 1);

      /* karar rozeti */
      var kararVar = adim >= 6;
      var kr = senaryo.karar;
      var renk = kr === 'OK' ? RENK.ok : kr === 'NOK' ? RENK.nok : RENK.deger;
      var bx = SUTUN + 14, bw = 104, bh = ALT - 16;

      ctx.strokeStyle = kararVar ? renk : 'rgba(255,255,255,.16)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(bx, by + 8, bw, bh);
      if (kararVar) {
        ctx.fillStyle = kr === 'OK' ? 'rgba(110,240,170,.12)' : 'rgba(248,113,113,.12)';
        ctx.fillRect(bx, by + 8, bw, bh);
      }
      ctx.font = '600 13px Consolas, monospace';
      ctx.fillStyle = kararVar ? renk : 'rgba(255,255,255,.24)';
      ctx.fillText(kararVar ? kr : '—', bx + 12, by + 8 + bh / 2 + 5);

      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillText('KARAR', bx + bw - 44, by + 8 + bh / 2 + 4);

      /* PLC bitleri */
      if (!kompakt) {
        var px2 = bx + bw + 24;
        var bitler = [
          { ad: 'yaşam', on: true },
          { ad: 'hazır', on: adim >= 1 },
          { ad: 'OK', on: adim >= 7 && senaryo.karar === 'OK' },
          { ad: 'NOK', on: adim >= 7 && senaryo.karar === 'NOK' },
          { ad: 'sayaç', on: adim >= 7 }
        ];
        for (var i = 0; i < bitler.length; i++) {
          var b = bitler[i];
          var lx = px2 + i * 64;
          var yanik = b.on && (b.ad !== 'yaşam' || Math.sin(performance.now() / 450) > 0);
          ctx.fillStyle = yanik
            ? (b.ad === 'NOK' ? 'rgba(248,113,113,.95)' : 'rgba(110,240,170,.9)')
            : 'rgba(255,255,255,.14)';
          ctx.beginPath(); ctx.arc(lx, by + ALT / 2, 4, 0, Math.PI * 2); ctx.fill();
          ctx.font = '9px Consolas, monospace';
          ctx.fillStyle = 'rgba(255,255,255,.42)';
          ctx.fillText(b.ad, lx + 9, by + ALT / 2 + 3.5);
        }
      }
    }

    /* ------------------------------------------------------------ viewport */
    function viewport(adim, altIlerleme, t) {
      ctx.save();
      ctx.beginPath(); ctx.rect(VX, VY, VW, VH); ctx.clip();

      var zg = ctx.createLinearGradient(0, VY, 0, VY + VH);
      zg.addColorStop(0, '#0c1118'); zg.addColorStop(1, '#070a0e');
      ctx.fillStyle = zg; ctx.fillRect(VX, VY, VW, VH);

      var aci = 0.30 + Math.sin(t / 6000) * 0.15 + aciKay;

      /* ızgara — zemin kaldırılınca soluklaşır */
      ctx.strokeStyle = 'rgba(255,255,255,' + (adim >= 1 ? 0.025 : 0.05) + ')';
      ctx.lineWidth = 1;
      for (var gi = -4; gi <= 4; gi++) {
        var q = gi / 4 * 1.4;
        var a1 = yansit(q, -0.02, -1.4, aci), a2 = yansit(q, -0.02, 1.4, aci);
        ctx.beginPath(); ctx.moveTo(a1.X, a1.Y); ctx.lineTo(a2.X, a2.Y); ctx.stroke();
        var b1 = yansit(-1.4, -0.02, q, aci), b2 = yansit(1.4, -0.02, q, aci);
        ctx.beginPath(); ctx.moveTo(b1.X, b1.Y); ctx.lineTo(b2.X, b2.Y); ctx.stroke();
      }

      var roi = senaryo.roi;
      var taramaOran = adim === 0 ? altIlerleme : 1;
      var tarananU = -1 + taramaOran * 2;
      var nokta = 0;

      for (var i = 0; i < N; i++) {
        var u = (i / (N - 1) - 0.5) * 2;
        if (u > tarananU + 0.02) continue;
        for (var j = 0; j < N; j++) {
          var v = (j / (N - 1) - 0.5) * 2;
          var y = senaryo.yukseklik(u, v);
          if (y === 0) continue;

          var zemin = senaryo.zeminMi(y);
          var roiDisi = u < roi.u1 || u > roi.u2 || v < roi.v1 || v > roi.v2;

          /* adım 1: zemin kaldırıldı — adım 2: ROI dışı atıldı */
          var solukluk = 1;
          if (adim >= 1 && zemin) {
            solukluk = adim === 1 ? Math.max(0, 1 - altIlerleme * 1.4) : 0;
          }
          if (adim >= 2 && roiDisi) {
            solukluk *= adim === 2 ? Math.max(0, 1 - altIlerleme * 1.4) : 0;
          }
          if (solukluk <= 0.02) continue;

          var pr = yansit(u, -y, v, aci);
          nokta++;

          var lazerde = adim === 0 && Math.abs(u - tarananU) < 0.03;
          var yn = Math.max(0, Math.min(1, (y + 0.03) / 0.40));
          var boy = (lazerde ? 3.0 : 2.0) * pr.s;

          if (lazerde) {
            ctx.fillStyle = 'rgba(215,245,255,.96)';
          } else {
            var sis = Math.max(0.2, 0.9 - (pr.zd + 1) * 0.24) * solukluk;
            ctx.fillStyle = 'hsla(' + (214 - yn * 150) + ',88%,' + (50 + yn * 16) + '%,' + sis + ')';
          }
          ctx.fillRect(pr.X - boy / 2, pr.Y - boy / 2, boy, boy);
        }
      }
      metrikYaz('nokta', (nokta * 34).toLocaleString('tr-TR'));

      /* adım 0: lazer düzlemi */
      if (adim === 0) {
        var l1 = yansit(tarananU, -0.64, -0.72, aci), l2 = yansit(tarananU, -0.64, 0.72, aci);
        var l3 = yansit(tarananU, 0.02, 0.72, aci), l4 = yansit(tarananU, 0.02, -0.72, aci);
        var lg = ctx.createLinearGradient(l1.X, l1.Y, l3.X, l3.Y);
        lg.addColorStop(0, 'rgba(120,205,255,.04)');
        lg.addColorStop(1, 'rgba(120,205,255,.20)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(l1.X, l1.Y); ctx.lineTo(l2.X, l2.Y); ctx.lineTo(l3.X, l3.Y); ctx.lineTo(l4.X, l4.Y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(200,240,255,.9)'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(l4.X, l4.Y); ctx.lineTo(l3.X, l3.Y); ctx.stroke();
      }

      /* adım 2+: ROI kutusu */
      if (adim >= 2) {
        var a = adim === 2 ? altIlerleme : 1;
        var kose = [
          yansit(roi.u1, -0.02, roi.v1, aci), yansit(roi.u2, -0.02, roi.v1, aci),
          yansit(roi.u2, -0.02, roi.v2, aci), yansit(roi.u1, -0.02, roi.v2, aci)
        ];
        ctx.strokeStyle = 'rgba(120,205,255,' + (0.55 * a) + ')';
        ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(kose[0].X, kose[0].Y);
        for (var k2 = 1; k2 < 4; k2++) ctx.lineTo(kose[k2].X, kose[k2].Y);
        ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        if (adim === 2) etiket(kose[1].X + 6, kose[1].Y - 6, 'ROI', 'rgba(120,205,255,.9)');
      }

      /* adım 3+: çapa */
      if (adim >= 3) {
        var ca = adim === 3 ? altIlerleme : 1;
        var cp = senaryo.capa;
        var cpt = yansit(cp.u, -(senaryo.yukseklik(cp.u, cp.v) + 0.02), cp.v, aci);
        ctx.strokeStyle = 'rgba(255,190,140,' + ca + ')'; ctx.lineWidth = 1.5;
        var r2 = 13 + (1 - ca) * 22;
        ctx.beginPath(); ctx.arc(cpt.X, cpt.Y, r2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cpt.X - r2 - 6, cpt.Y); ctx.lineTo(cpt.X + r2 + 6, cpt.Y);
        ctx.moveTo(cpt.X, cpt.Y - r2 - 6); ctx.lineTo(cpt.X, cpt.Y + r2 + 6);
        ctx.stroke();
        if (adim === 3) etiket(cpt.X + r2 + 10, cpt.Y - 8, 'ÇAPA kilitlendi', 'rgba(255,190,140,.95)');
      }

      /* adım 4+: ölçüm işaretleri */
      if (adim >= 4) {
        var oa = adim === 4 ? Math.min(1, altIlerleme * 1.6) : 1;
        try { senaryo.olcumCiz(S, aci, oa); } catch (e) {}
      }

      /* adım 5: denetim — tolerans bandı taraması */
      if (adim === 5) {
        var sy = VY + VH * altIlerleme;
        var g2 = ctx.createLinearGradient(0, sy - 16, 0, sy + 16);
        g2.addColorStop(0, 'rgba(255,190,140,0)');
        g2.addColorStop(.5, 'rgba(255,190,140,.14)');
        g2.addColorStop(1, 'rgba(255,190,140,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(VX, sy - 16, VW, 32);
      }

      /* adım 6: karar bindirmesi */
      if (adim >= 6) {
        var kr2 = senaryo.karar;
        var rgb = kr2 === 'OK' ? '110,240,170' : '248,113,113';
        var yogun = adim === 6 ? (1 - altIlerleme) * 0.10 : 0.03;
        ctx.fillStyle = 'rgba(' + rgb + ',' + yogun + ')';
        ctx.fillRect(VX, VY, VW, VH);
        ctx.font = '700 22px Georgia, serif';
        ctx.fillStyle = 'rgba(' + rgb + ',.92)';
        ctx.fillText(kr2, VX + VW - 74, VY + 34);
      }

      /* adım 7: PLC aktarım oku */
      if (adim === 7) {
        var ax = VX + VW - 40, ay = VY + VH - 26;
        var kay = (altIlerleme * 40) % 40;
        ctx.strokeStyle = 'rgba(120,205,255,.8)'; ctx.lineWidth = 1.6;
        for (var q3 = 0; q3 < 3; q3++) {
          var ox = ax - 60 + kay + q3 * 14;
          ctx.beginPath();
          ctx.moveTo(ox, ay); ctx.lineTo(ox + 8, ay - 5);
          ctx.moveTo(ox, ay); ctx.lineTo(ox + 8, ay + 5);
          ctx.stroke();
        }
        etiket(VX + VW - 168, ay + 4, 'PLC ⇥ DB10', 'rgba(120,205,255,.9)');
      }

      /* viewport rozeti */
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.34)';
      ctx.fillText(senaryo.zincir[Math.min(adim, senaryo.zincir.length - 1)].ad.toUpperCase(),
                   VX + 12, VY + 16);

      if (ince && !kompakt && t < 7000) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, 0.45 - t / 15000) + ')';
        ctx.fillText('↔ sürükleyerek döndürün', VX + 12, VY + VH - 10);
      }

      ctx.restore();
    }

    /* --------------------------------------------------------------- çizim */
    function ciz(t) {
      var toplam = senaryo.zincir.length * ADIM_SURE + 2200;   /* + bitiş bekleme */
      var tt = t % toplam;
      var adim = Math.min(senaryo.zincir.length - 1, Math.floor(tt / ADIM_SURE));
      var altIlerleme = Math.min(1, (tt - adim * ADIM_SURE) / ADIM_SURE);
      var p = Math.min(1, tt / (senaryo.zincir.length * ADIM_SURE));

      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, W, H);

      viewport(adim, altIlerleme, t);
      ustCubuk(adim, p);
      aracSutunu(adim, altIlerleme);
      ciktiPanosu(adim);
      altCubuk(adim);

      metrikYaz('asama', senaryo.zincir[adim].ad);
      metrikYaz('karar', adim >= 6 ? senaryo.karar : '—');
      if (adim >= 4) {
        metrikYaz('olcu', senaryo.ciktilar[0].deger);
        metrikYaz('duzlem', senaryo.ciktilar[1].deger);
      } else {
        metrikYaz('olcu', '—'); metrikYaz('duzlem', '—');
      }
    }

    /* --------------------------------------------------------- döndürme */
    if (ince) {
      c.style.cursor = 'grab';
      c.addEventListener('pointerdown', function (e) {
        suruklenen = true; surukleBas = e.clientX; sonAci = aciKay;
        c.style.cursor = 'grabbing';
        if (c.setPointerCapture) c.setPointerCapture(e.pointerId);
      });
      c.addEventListener('pointermove', function (e) {
        if (suruklenen) aciKay = sonAci + (e.clientX - surukleBas) / 180;
      });
      var birak = function () { suruklenen = false; c.style.cursor = 'grab'; };
      c.addEventListener('pointerup', birak);
      c.addEventListener('pointercancel', birak);
      c.addEventListener('pointerleave', birak);
    }

    /* ------------------------------------------------------------- döngü */
    var rafId = null, calisiyor = false, ekranda = true, gozlemci = null;
    var tik = 0, kare = 0, sonHata = null;

    function dongu() {
      if (!calisiyor) return;
      tik++;
      if (ekranda) {
        try { ciz(performance.now() - t0); kare++; }
        catch (e) { sonHata = String((e && e.message) || e); }
      }
      rafId = requestAnimationFrame(dongu);
    }
    function baslat() { if (!calisiyor) { calisiyor = true; rafId = requestAnimationFrame(dongu); } }
    function durdur() { calisiyor = false; if (rafId) cancelAnimationFrame(rafId); }

    etiketleriEsitle();

    if (azalt) {
      ciz(5 * ADIM_SURE + 400);          /* denetim adımı — dolu bir kare */
    } else {
      ciz(0);
      baslat();
      if (global.IntersectionObserver) {
        gozlemci = new IntersectionObserver(function (g) {
          ekranda = g[g.length - 1].isIntersecting;
        }, { threshold: 0, rootMargin: '120px' });
        gozlemci.observe(c);
      }
    }

    return {
      baslat: baslat,
      durdur: durdur,
      senaryolar: Object.keys(SENARYOLAR).map(function (k) {
        return { anahtar: k, ad: SENARYOLAR[k].ad };
      }),
      senaryoDegistir: function (ad) {
        if (!SENARYOLAR[ad] || SENARYOLAR[ad] === senaryo) return senaryo.ad;
        senaryo = SENARYOLAR[ad];
        t0 = performance.now();                    /* zinciri baştan koştur */
        etiketleriEsitle();
        try { ciz(azalt ? 5 * ADIM_SURE + 400 : 0); } catch (e) {}
        return senaryo.ad;
      },
      aktifSenaryo: function () { return senaryo.ad; },
      /* belirli bir ana ait tek kare çizer (ön izleme/tanı için) */
      kareCiz: function (t) { try { ciz(t); return true; } catch (e) { sonHata = String(e); return false; } },
      adimSuresi: ADIM_SURE,
      adimSayisi: senaryo.zincir.length,
      tani: function () {
        return { tik: tik, kare: kare, ekranda: ekranda, calisiyor: calisiyor, sonHata: sonHata };
      }
    };
  }

  global.Sahne3D = Sahne3D;
})(window);
