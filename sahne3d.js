/* sersoz.com — 3D tarama sahnesi (çok senaryolu)
 *
 * Lazer profil taraması → nokta bulutu → ölçüm → robot/karar döngüsünü
 * dört ayrı endüstriyel senaryo için canlandırır. Harici kütüphane yok.
 *
 * Kullanım:
 *   var s = Sahne3D('kanvasId', { senaryo: 'kaynak', kompakt: false, metrik: {...} });
 *   s.senaryoDegistir('palet');
 */
(function (global) {
  'use strict';

  /* =======================================================  SENARYOLAR  */
  var SENARYOLAR = {

    /* -------------------------------------------------- 1) KAYNAK ROBOTU */
    kaynak: {
      ad: 'Kaynak robotu',
      ustBilgi: '3D profil sensörü · kaynak hücresi',
      etiketler: { a: 'Dikiş derinliği', b: 'Düzlemsellik' },
      degerler: { a: '3.18 mm', b: '0.06 mm' },
      karar: { yazi: 'OK', iyi: true },
      robotUcu: 'torc',
      hedefler: [{ u: -0.16, v: 0 }, { u: 0.03, v: 0 }, { u: 0.22, v: 0 }, { u: 0.41, v: 0 }],
      delikler: [{ u: -0.52, v: -0.30 }, { u: -0.52, v: 0.30 }],

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

      olcum: function (S, aci, alfa) {
        var sol = S.yansit(-0.28, -0.32, -0.33, aci);
        var sag = S.yansit(0.54, -0.32, -0.33, aci);
        S.olcuCizgisi(sol, sag, '82.40 mm', 'rgba(255,190,140,.95)', -34);

        var oUst = S.yansit(0.13, -0.32, 0.12, aci);
        var oAlt = S.yansit(0.13, -0.11, 0.12, aci);
        S.x.strokeStyle = 'rgba(110,240,170,.95)';
        S.x.lineWidth = 1.4;
        S.x.beginPath(); S.x.moveTo(oUst.X, oUst.Y); S.x.lineTo(oAlt.X, oAlt.Y); S.x.stroke();
        S.etiket(oAlt.X + 12, (oUst.Y + oAlt.Y) / 2 + 4, 'dikiş 3.18 mm', 'rgba(110,240,170,.95)');

        var d0 = this.delikler[0];
        var dp = S.yansit(d0.u, -(this.yukseklik(d0.u, d0.v) + 0.02), d0.v, aci);
        S.x.strokeStyle = 'rgba(255,190,140,.9)';
        S.x.beginPath(); S.x.arc(dp.X, dp.Y, 11, 0, Math.PI * 2); S.x.stroke();
        S.x.beginPath(); S.x.moveTo(dp.X + 8, dp.Y - 8); S.x.lineTo(dp.X + 28, dp.Y - 26); S.x.stroke();
        S.etiket(dp.X + 30, dp.Y - 24, 'Ø 8.02 mm', 'rgba(255,190,140,.95)');
      }
    },

    /* ---------------------------------------------- 2) PALETLEME / EKSİK */
    palet: {
      ad: 'Paletleme · eksik ürün',
      ustBilgi: '3D profil sensörü · palet istasyonu',
      etiketler: { a: 'Koli sayısı', b: 'Palet yüksekliği' },
      degerler: { a: '8 / 9', b: '148 mm' },
      karar: { yazi: 'EKSİK', iyi: false },
      robotUcu: 'vantuz',
      /* 3×3 koli ızgarası; [1][2] konumu boş */
      kutular: (function () {
        var liste = [];
        for (var s = 0; s < 3; s++) {
          for (var k = 0; k < 3; k++) {
            if (s === 1 && k === 2) continue;               /* eksik koli */
            liste.push({ u: -0.50 + k * 0.50, v: -0.38 + s * 0.38 });
          }
        }
        return liste;
      })(),
      bosluk: { u: 0.50, v: 0 },
      hedefler: [{ u: 0.50, v: 0 }],

      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.88 || Math.abs(v) >= 0.66) return 0;
        var y = 0.07;                                        /* palet tablası */
        for (var i = 0; i < this.kutular.length; i++) {
          var b = this.kutular[i];
          if (Math.abs(u - b.u) < 0.21 && Math.abs(v - b.v) < 0.16) {
            y = 0.34;
            /* koli kapak çizgisi */
            if (Math.abs(u - b.u) < 0.012) y -= 0.02;
            y += 0.006 * Math.sin(u * 40) * Math.cos(v * 30);
          }
        }
        return y;
      },

      olcum: function (S, aci, alfa) {
        /* eksik koli yuvası vurgusu */
        var b = this.bosluk;
        var k1 = S.yansit(b.u - 0.21, -0.09, b.v - 0.16, aci);
        var k2 = S.yansit(b.u + 0.21, -0.09, b.v - 0.16, aci);
        var k3 = S.yansit(b.u + 0.21, -0.09, b.v + 0.16, aci);
        var k4 = S.yansit(b.u - 0.21, -0.09, b.v + 0.16, aci);

        S.x.fillStyle = 'rgba(248,113,113,' + (0.16 * alfa) + ')';
        S.x.beginPath();
        S.x.moveTo(k1.X, k1.Y); S.x.lineTo(k2.X, k2.Y); S.x.lineTo(k3.X, k3.Y); S.x.lineTo(k4.X, k4.Y);
        S.x.closePath(); S.x.fill();

        S.x.strokeStyle = 'rgba(248,113,113,.95)';
        S.x.lineWidth = 1.8;
        S.x.setLineDash([6, 4]);
        S.x.stroke();
        S.x.setLineDash([]);

        var orta = { X: (k1.X + k3.X) / 2, Y: (k1.Y + k3.Y) / 2 };
        S.etiket(orta.X - 40, orta.Y - 24, 'EKSİK · sıra 2 · sütun 3', 'rgba(248,113,113,.95)');

        /* palet yüksekliği ölçüsü */
        var yUst = S.yansit(-0.88, -0.34, 0.66, aci);
        var yAlt = S.yansit(-0.88, -0.02, 0.66, aci);
        S.x.strokeStyle = 'rgba(255,190,140,.9)';
        S.x.lineWidth = 1.3;
        S.x.beginPath(); S.x.moveTo(yUst.X - 14, yUst.Y); S.x.lineTo(yAlt.X - 14, yAlt.Y); S.x.stroke();
        S.x.beginPath();
        S.x.moveTo(yUst.X - 20, yUst.Y); S.x.lineTo(yUst.X - 8, yUst.Y);
        S.x.moveTo(yAlt.X - 20, yAlt.Y); S.x.lineTo(yAlt.X - 8, yAlt.Y);
        S.x.stroke();
        S.etiket(yUst.X - 96, (yUst.Y + yAlt.Y) / 2, '148 mm', 'rgba(255,190,140,.95)');

        /* sayılan koliler */
        for (var i = 0; i < this.kutular.length; i++) {
          var c = this.kutular[i];
          var cp = S.yansit(c.u, -0.36, c.v, aci);
          S.x.strokeStyle = 'rgba(110,240,170,.75)';
          S.x.lineWidth = 1.2;
          S.x.beginPath(); S.x.arc(cp.X, cp.Y, 7, 0, Math.PI * 2); S.x.stroke();
          S.x.font = '9px Consolas, monospace';
          S.x.fillStyle = 'rgba(110,240,170,.9)';
          S.x.fillText(String(i + 1), cp.X - 2.5, cp.Y + 3);
        }
      }
    },

    /* ------------------------------------------------------- 3) KOLİLEME */
    koli: {
      ad: 'Kolileme · adet ve oturma',
      ustBilgi: '3D profil sensörü · kolileme hattı',
      etiketler: { a: 'Adet', b: 'Oturma farkı' },
      degerler: { a: '11 / 12', b: '6.4 mm' },
      karar: { yazi: 'NOK', iyi: false },
      robotUcu: 'tutucu',
      /* 4×3 kavanoz; biri eksik, biri alçak oturmuş */
      urunler: (function () {
        var liste = [];
        for (var s = 0; s < 3; s++) {
          for (var k = 0; k < 4; k++) {
            if (s === 2 && k === 1) continue;                 /* eksik */
            liste.push({
              u: -0.48 + k * 0.32, v: -0.34 + s * 0.34,
              alcak: (s === 0 && k === 2)                      /* tam oturmamış */
            });
          }
        }
        return liste;
      })(),
      hedefler: [{ u: -0.16, v: 0.34 }],

      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.80 || Math.abs(v) >= 0.62) return 0;
        /* koli tabanı + duvarlar */
        var duvar = Math.min(0.80 - Math.abs(u), 0.62 - Math.abs(v));
        var y = duvar < 0.06 ? 0.26 : 0.08;

        for (var i = 0; i < this.urunler.length; i++) {
          var p = this.urunler[i];
          var r = Math.hypot(u - p.u, v - p.v);
          if (r < 0.13) {
            var tepe = p.alcak ? 0.24 : 0.38;
            var kubbe = Math.sqrt(Math.max(0, 1 - Math.pow(r / 0.13, 2)));
            y = Math.max(y, tepe - 0.03 + 0.03 * kubbe);
          }
        }
        return y;
      },

      olcum: function (S, aci, alfa) {
        for (var i = 0; i < this.urunler.length; i++) {
          var p = this.urunler[i];
          var pp = S.yansit(p.u, -(p.alcak ? 0.25 : 0.39), p.v, aci);
          var renk = p.alcak ? 'rgba(248,113,113,.95)' : 'rgba(110,240,170,.8)';
          S.x.strokeStyle = renk;
          S.x.lineWidth = p.alcak ? 1.8 : 1.1;
          S.x.beginPath(); S.x.arc(pp.X, pp.Y, 9, 0, Math.PI * 2); S.x.stroke();
          if (p.alcak) {
            S.etiket(pp.X + 14, pp.Y - 12, 'oturmadı −6.4 mm', 'rgba(248,113,113,.95)');
          }
        }
        /* eksik yuva */
        var bos = S.yansit(-0.16, -0.10, 0.34, aci);
        S.x.strokeStyle = 'rgba(248,113,113,.9)';
        S.x.lineWidth = 1.6;
        S.x.setLineDash([5, 4]);
        S.x.beginPath(); S.x.arc(bos.X, bos.Y, 13, 0, Math.PI * 2); S.x.stroke();
        S.x.setLineDash([]);
        S.etiket(bos.X + 18, bos.Y + 4, 'eksik ürün', 'rgba(248,113,113,.95)');

        S.etiket(20, 34, '11 / 12 adet · 1 eksik · 1 oturmadı', 'rgba(255,190,140,.95)');
      }
    },

    /* --------------------------------------------------- 4) KALİTE KONTROL */
    kalite: {
      ad: 'Kalite kontrol · yüzey',
      ustBilgi: '3D profil sensörü · denetim istasyonu',
      etiketler: { a: 'Çukur derinliği', b: 'Düzlemsellik' },
      degerler: { a: '−0.42 mm', b: '0.31 mm' },
      karar: { yazi: 'NOK', iyi: false },
      robotUcu: 'yok',
      kusurlar: [{ u: 0.22, v: -0.14, r: 0.14, d: 0.075 }, { u: -0.34, v: 0.22, r: 0.09, d: 0.045 }],
      hedefler: [],

      yukseklik: function (u, v) {
        if (Math.abs(u) >= 0.82 || Math.abs(v) >= 0.58) return 0;
        var y = 0.26;
        var kenar = Math.min(0.82 - Math.abs(u), 0.58 - Math.abs(v));
        if (kenar < 0.05) y -= (0.05 - kenar) * 1.4;
        y += 0.006 * Math.sin(u * 11) * Math.cos(v * 9);       /* hafif doku */

        for (var i = 0; i < this.kusurlar.length; i++) {
          var k = this.kusurlar[i];
          var r = Math.hypot(u - k.u, v - k.v);
          if (r < k.r) y -= k.d * (1 - Math.pow(r / k.r, 2));  /* çukur */
        }
        return y;
      },

      olcum: function (S, aci, alfa) {
        for (var i = 0; i < this.kusurlar.length; i++) {
          var k = this.kusurlar[i];
          var kp = S.yansit(k.u, -(this.yukseklik(k.u, k.v) + 0.01), k.v, aci);
          var yarcap = 26 - i * 8;

          /* ısı halkaları */
          for (var h = 3; h >= 1; h--) {
            S.x.fillStyle = 'rgba(248,113,113,' + (0.06 * h * alfa) + ')';
            S.x.beginPath(); S.x.arc(kp.X, kp.Y, yarcap * h / 2.2, 0, Math.PI * 2); S.x.fill();
          }
          S.x.strokeStyle = 'rgba(248,113,113,.95)';
          S.x.lineWidth = 1.6;
          S.x.beginPath(); S.x.arc(kp.X, kp.Y, yarcap / 2, 0, Math.PI * 2); S.x.stroke();

          var yazi = i === 0 ? 'çukur −0.42 mm' : 'çukur −0.24 mm';
          S.x.beginPath();
          S.x.moveTo(kp.X + yarcap / 2 * 0.7, kp.Y - yarcap / 2 * 0.7);
          S.x.lineTo(kp.X + 26, kp.Y - 26);
          S.x.stroke();
          S.etiket(kp.X + 28, kp.Y - 24, yazi, 'rgba(248,113,113,.95)');
        }

        var sol = S.yansit(-0.82, -0.28, -0.58, aci);
        var sag = S.yansit(0.82, -0.28, -0.58, aci);
        S.olcuCizgisi(sol, sag, 'tolerans ±0.15 mm aşıldı', 'rgba(255,190,140,.95)', -32);
      }
    }
  };

  /* ==========================================================  SAHNE  */
  function Sahne3D(kanvasId, secenek) {
    var c = document.getElementById(kanvasId);
    if (!c || !c.getContext) return null;

    secenek = secenek || {};
    var x = c.getContext('2d');
    var W = c.width, H = c.height;
    var kompakt = !!secenek.kompakt;
    var azalt = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var N = kompakt ? 56 : 68;
    var TILT = -0.96, FOV = 3.5;
    var OLCEK = Math.min(W, H) * (kompakt ? 0.66 : 0.60);
    var CX = W * 0.47, CY = H * (kompakt ? 0.58 : 0.60);
    var DONGU = kompakt ? 15000 : 16000;

    var senaryo = SENARYOLAR[secenek.senaryo] || SENARYOLAR.kaynak;
    var t0 = performance.now();
    var gecis = 1;                                    /* senaryo geçiş solması */

    var suruklenen = false, surukleBas = 0, aciKaydirma = 0, sonAci = 0;
    var inceIsaretci = !global.matchMedia || matchMedia('(pointer: fine)').matches;

    var m = secenek.metrik || {};
    function metrikYaz(ad, deger) {
      var el = m[ad] ? document.getElementById(m[ad]) : null;
      if (el && el.textContent !== deger) el.textContent = deger;
    }

    function yansit(px, py, pz, aci) {
      var ca = Math.cos(aci), sa = Math.sin(aci);
      var xr = px * ca + pz * sa, zr = -px * sa + pz * ca;
      var cx2 = Math.cos(TILT), sx2 = Math.sin(TILT);
      var yr = py * cx2 - zr * sx2, zd = py * sx2 + zr * cx2;
      var s = FOV / (FOV + zd);
      return { X: CX + xr * s * OLCEK, Y: CY + yr * s * OLCEK, s: s, zd: zd };
    }

    function etiket(px, py, yazi, renk, zeminAlfa) {
      x.font = '600 12px Consolas, monospace';
      var g = x.measureText(yazi).width;
      x.fillStyle = 'rgba(8,12,17,' + (zeminAlfa == null ? 0.84 : zeminAlfa) + ')';
      x.fillRect(px - 6, py - 13, g + 12, 19);
      x.strokeStyle = renk; x.lineWidth = 1;
      x.strokeRect(px - 6, py - 13, g + 12, 19);
      x.fillStyle = renk;
      x.fillText(yazi, px, py + 1);
      return g + 12;
    }

    function olcuCizgisi(a, b, yazi, renk, kaydir) {
      var oy = kaydir || -30;
      x.strokeStyle = renk; x.lineWidth = 1.2;
      x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(a.X, a.Y + oy); x.lineTo(b.X, b.Y + oy); x.stroke();
      x.setLineDash([]);
      x.beginPath();
      x.moveTo(a.X, a.Y + oy - 6); x.lineTo(a.X, a.Y + oy + 6);
      x.moveTo(b.X, b.Y + oy - 6); x.lineTo(b.X, b.Y + oy + 6);
      x.stroke();
      x.globalAlpha *= 0.5;
      x.beginPath();
      x.moveTo(a.X, a.Y); x.lineTo(a.X, a.Y + oy + 6);
      x.moveTo(b.X, b.Y); x.lineTo(b.X, b.Y + oy + 6);
      x.stroke();
      x.globalAlpha *= 2;
      x.font = '600 12px Consolas, monospace';
      etiket((a.X + b.X) / 2 - x.measureText(yazi).width / 2, a.Y + oy - 4, yazi, renk);
    }

    var S = { x: x, yansit: yansit, etiket: etiket, olcuCizgisi: olcuCizgisi };

    function renkSkalasi() {
      if (kompakt) return;
      var sx = W - 34, sy = 56, sh = 118, sw = 9;
      for (var i = 0; i < sh; i++) {
        var oran = 1 - i / sh;
        x.fillStyle = 'hsl(' + (214 - oran * 150) + ',88%,' + (50 + oran * 16) + '%)';
        x.fillRect(sx, sy + i, sw, 1);
      }
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1;
      x.strokeRect(sx - .5, sy - .5, sw + 1, sh + 1);
      x.font = '9px Consolas, monospace';
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.fillText('24 mm', sx - 40, sy + 6);
      x.fillText('0', sx - 12, sy + sh + 3);
    }

    function zamanCizgisi(p) {
      var y = H - 26, sol = 18, sag = W - (kompakt ? 18 : 60), gen = sag - sol;
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.fillRect(sol, y, gen, 3);
      x.fillStyle = 'rgba(194,65,12,.9)';
      x.fillRect(sol, y, gen * p, 3);

      var fazlar = [{ p: 0, ad: 'TARAMA' }, { p: 0.42, ad: 'ÖLÇÜM' },
                    { p: 0.62, ad: senaryo.robotUcu === 'yok' ? 'KARAR' : 'ROBOT' }];
      x.font = '9px Consolas, monospace';
      for (var i = 0; i < fazlar.length; i++) {
        var fx = sol + gen * fazlar[i].p;
        var aktif = p >= fazlar[i].p && (i === fazlar.length - 1 || p < fazlar[i + 1].p);
        x.fillStyle = aktif ? 'rgba(255,190,140,.95)' : 'rgba(255,255,255,.32)';
        x.fillRect(fx, y - 3, 1.5, 9);
        x.fillText(fazlar[i].ad, fx + 5, y - 7);
      }
    }

    function robotCiz(t, robotFaz, aci) {
      if (senaryo.robotUcu === 'yok' || !senaryo.hedefler.length) return;

      var gorunen = Math.min(senaryo.hedefler.length,
                             Math.floor(robotFaz * senaryo.hedefler.length * 1.6) + 1);

      if (gorunen > 1) {
        x.strokeStyle = 'rgba(194,65,12,.35)'; x.lineWidth = 1.2;
        x.setLineDash([3, 4]); x.beginPath();
        for (var q = 0; q < gorunen; q++) {
          var h0 = senaryo.hedefler[q];
          var p0 = yansit(h0.u, -(senaryo.yukseklik(h0.u, h0.v) + 0.015), h0.v, aci);
          if (q === 0) x.moveTo(p0.X, p0.Y); else x.lineTo(p0.X, p0.Y);
        }
        x.stroke(); x.setLineDash([]);
      }

      for (var k = 0; k < gorunen; k++) {
        var h = senaryo.hedefler[k];
        var hp = yansit(h.u, -(senaryo.yukseklik(h.u, h.v) + 0.015), h.v, aci);
        var nabiz = 1 + Math.sin(t / 240 + k * 1.2) * 0.16;
        x.strokeStyle = 'rgba(255,120,60,.95)'; x.lineWidth = 1.7;
        x.beginPath(); x.arc(hp.X, hp.Y, 8 * nabiz, 0, Math.PI * 2); x.stroke();
        x.beginPath();
        x.moveTo(hp.X - 13, hp.Y); x.lineTo(hp.X - 4, hp.Y);
        x.moveTo(hp.X + 4, hp.Y); x.lineTo(hp.X + 13, hp.Y);
        x.moveTo(hp.X, hp.Y - 13); x.lineTo(hp.X, hp.Y - 4);
        x.moveTo(hp.X, hp.Y + 4); x.lineTo(hp.X, hp.Y + 13);
        x.stroke();
        if (!kompakt && senaryo.hedefler.length > 1) {
          x.font = '10px Consolas, monospace';
          x.fillStyle = 'rgba(255,170,120,.9)';
          x.fillText('P' + (k + 1), hp.X + 15, hp.Y - 9);
        }
      }

      var idx = Math.min(senaryo.hedefler.length - 1, Math.floor(robotFaz * 4.2));
      var hh = senaryo.hedefler[idx];
      var hd = yansit(hh.u, -(senaryo.yukseklik(hh.u, hh.v) + 0.03), hh.v, aci);
      var taban = { X: W - (kompakt ? 62 : 96), Y: 58 };
      var orta = { X: (taban.X + hd.X) / 2 + 46, Y: (taban.Y + hd.Y) / 2 - 52 };

      x.lineCap = 'round';
      x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 11;
      x.beginPath(); x.moveTo(taban.X, taban.Y); x.lineTo(orta.X, orta.Y); x.lineTo(hd.X, hd.Y - 14); x.stroke();
      x.strokeStyle = 'rgba(225,235,245,.55)'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(taban.X, taban.Y); x.lineTo(orta.X, orta.Y); x.stroke();
      x.lineWidth = 3.5;
      x.beginPath(); x.moveTo(orta.X, orta.Y); x.lineTo(hd.X, hd.Y - 14); x.stroke();

      x.fillStyle = 'rgba(255,255,255,.55)';
      x.beginPath(); x.arc(taban.X, taban.Y, 8, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(orta.X, orta.Y, 5.5, 0, Math.PI * 2); x.fill();

      /* uç eleman */
      if (senaryo.robotUcu === 'torc') {
        x.strokeStyle = 'rgba(255,150,80,.95)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(hd.X, hd.Y - 14); x.lineTo(hd.X, hd.Y - 4); x.stroke();
        x.fillStyle = 'rgba(255,190,110,' + (0.4 + Math.abs(Math.sin(t / 90)) * 0.6) + ')';
        x.beginPath(); x.arc(hd.X, hd.Y - 2, 3.4, 0, Math.PI * 2); x.fill();
      } else if (senaryo.robotUcu === 'vantuz') {
        x.strokeStyle = 'rgba(225,235,245,.7)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(hd.X - 12, hd.Y - 12); x.lineTo(hd.X + 12, hd.Y - 12); x.stroke();
        for (var vi = -1; vi <= 1; vi += 2) {
          x.beginPath(); x.moveTo(hd.X + vi * 8, hd.Y - 12); x.lineTo(hd.X + vi * 8, hd.Y - 5); x.stroke();
          x.fillStyle = 'rgba(180,210,235,.75)';
          x.beginPath(); x.ellipse(hd.X + vi * 8, hd.Y - 4, 4.5, 2.4, 0, 0, Math.PI * 2); x.fill();
        }
      } else if (senaryo.robotUcu === 'tutucu') {
        x.strokeStyle = 'rgba(225,235,245,.75)'; x.lineWidth = 2.4;
        var acilma = 7 + Math.sin(t / 400) * 3;
        x.beginPath();
        x.moveTo(hd.X - acilma, hd.Y - 14); x.lineTo(hd.X - acilma, hd.Y - 2);
        x.moveTo(hd.X + acilma, hd.Y - 14); x.lineTo(hd.X + acilma, hd.Y - 2);
        x.stroke();
      }

      if (!kompakt) {
        x.font = '10px Consolas, monospace';
        x.fillStyle = 'rgba(255,255,255,.45)';
        x.fillText('ROBOT', taban.X - 17, taban.Y - 15);
      }
    }

    /* ------------------------------------------------------------- çizim */
    function ciz(t) {
      var p = (t % DONGU) / DONGU;
      var aci = 0.30 + Math.sin(t / 6000) * 0.17 + aciKaydirma;

      var tarama = Math.min(1, p / 0.42);
      var olcumFaz = p > 0.42 ? Math.min(1, (p - 0.42) / 0.10) : 0;
      var robotFaz = p > 0.62 ? Math.min(1, (p - 0.62) / 0.12) : 0;

      var zg = x.createLinearGradient(0, 0, 0, H);
      zg.addColorStop(0, '#0c1118'); zg.addColorStop(1, '#070a0e');
      x.fillStyle = zg; x.fillRect(0, 0, W, H);

      x.globalAlpha = gecis;

      /* ızgara */
      x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1;
      for (var gi = -5; gi <= 5; gi++) {
        var q = gi / 5 * 1.5;
        var a1 = yansit(q, -0.02, -1.5, aci), a2 = yansit(q, -0.02, 1.5, aci);
        x.beginPath(); x.moveTo(a1.X, a1.Y); x.lineTo(a2.X, a2.Y); x.stroke();
        var b1 = yansit(-1.5, -0.02, q, aci), b2 = yansit(1.5, -0.02, q, aci);
        x.beginPath(); x.moveTo(b1.X, b1.Y); x.lineTo(b2.X, b2.Y); x.stroke();
      }

      /* nokta bulutu */
      var tarananU = -1 + tarama * 2, nokta = 0;
      for (var i = 0; i < N; i++) {
        var u = (i / (N - 1) - 0.5) * 2;
        if (u > tarananU + 0.02) continue;
        for (var j = 0; j < N; j++) {
          var v = (j / (N - 1) - 0.5) * 2;
          var y = senaryo.yukseklik(u, v);
          if (y === 0) continue;
          var pr = yansit(u, -y, v, aci);
          nokta++;
          var lazerde = Math.abs(u - tarananU) < 0.03;
          var yn = Math.max(0, Math.min(1, (y + 0.03) / 0.40));
          var boy = (lazerde ? 3.1 : 2.1) * pr.s;
          if (lazerde) {
            x.fillStyle = 'rgba(215,245,255,.96)';
          } else {
            var sis = Math.max(0.22, 0.92 - (pr.zd + 1) * 0.24);
            x.fillStyle = 'hsla(' + (214 - yn * 150) + ',88%,' + (50 + yn * 16) + '%,' + sis + ')';
          }
          x.fillRect(pr.X - boy / 2, pr.Y - boy / 2, boy, boy);
        }
      }
      metrikYaz('nokta', (nokta * 34).toLocaleString('tr-TR'));

      /* lazer düzlemi */
      if (tarama < 1) {
        metrikYaz('asama', 'TARAMA');
        var l1 = yansit(tarananU, -0.66, -0.75, aci), l2 = yansit(tarananU, -0.66, 0.75, aci);
        var l3 = yansit(tarananU, 0.02, 0.75, aci), l4 = yansit(tarananU, 0.02, -0.75, aci);
        var lg = x.createLinearGradient(l1.X, l1.Y, l3.X, l3.Y);
        lg.addColorStop(0, 'rgba(120,205,255,.04)');
        lg.addColorStop(1, 'rgba(120,205,255,.22)');
        x.fillStyle = lg;
        x.beginPath();
        x.moveTo(l1.X, l1.Y); x.lineTo(l2.X, l2.Y); x.lineTo(l3.X, l3.Y); x.lineTo(l4.X, l4.Y);
        x.closePath(); x.fill();
        x.strokeStyle = 'rgba(200,240,255,.9)'; x.lineWidth = 1.8;
        x.beginPath(); x.moveTo(l4.X, l4.Y); x.lineTo(l3.X, l3.Y); x.stroke();

        var sens = yansit(tarananU, -0.76, 0, aci);
        x.fillStyle = 'rgba(255,255,255,.30)';
        x.fillRect(sens.X - 16, sens.Y - 9, 32, 12);
        x.fillStyle = 'rgba(120,205,255,.9)';
        x.fillRect(sens.X - 3, sens.Y + 3, 6, 3);

        if (!kompakt) {
          x.font = '10px Consolas, monospace';
          x.fillStyle = 'rgba(200,240,255,.75)';
          x.fillText('TARAMA  %' + Math.round(tarama * 100), 18, 30);
        }
        metrikYaz('olcu', '— '); metrikYaz('duzlem', '— '); metrikYaz('karar', '—');
      }

      /* ölçüm + karar */
      if (olcumFaz > 0) {
        metrikYaz('asama', robotFaz > 0
          ? (senaryo.robotUcu === 'yok' ? 'KARAR' : 'ROBOT KILAVUZLAMA')
          : 'ÖLÇÜM');
        x.globalAlpha = gecis * olcumFaz;
        try { senaryo.olcum(S, aci, olcumFaz); } catch (e) {}
        x.globalAlpha = gecis;

        metrikYaz('olcu', senaryo.degerler.a);
        metrikYaz('duzlem', senaryo.degerler.b);
        metrikYaz('karar', senaryo.karar.yazi);
      }

      robotCiz(t, robotFaz, aci);

      renkSkalasi();
      zamanCizgisi(p);

      if (!kompakt) {
        x.font = '10.5px Consolas, monospace';
        x.fillStyle = 'rgba(255,255,255,.38)';
        x.fillText('profil 1280 px   z-çöz. 0.012 mm   ' +
                   Math.round(28 + Math.sin(t / 800) * 3) + ' fps', 18, H - 40);
      }

      if (inceIsaretci && !kompakt && t < 6000) {
        x.font = '10px Consolas, monospace';
        x.fillStyle = 'rgba(255,255,255,' + Math.max(0, 0.5 - t / 12000) + ')';
        x.fillText('↔ sürükleyerek döndürün', 18, 48);
      }

      x.globalAlpha = 1;
      if (gecis < 1) gecis = Math.min(1, gecis + 0.05);
    }

    /* --------------------------------------------------- döndürme */
    if (inceIsaretci) {
      c.style.cursor = 'grab';
      c.addEventListener('pointerdown', function (e) {
        suruklenen = true; surukleBas = e.clientX; sonAci = aciKaydirma;
        c.style.cursor = 'grabbing';
        if (c.setPointerCapture) c.setPointerCapture(e.pointerId);
      });
      c.addEventListener('pointermove', function (e) {
        if (suruklenen) aciKaydirma = sonAci + (e.clientX - surukleBas) / 180;
      });
      var birak = function () { suruklenen = false; c.style.cursor = 'grab'; };
      c.addEventListener('pointerup', birak);
      c.addEventListener('pointercancel', birak);
      c.addEventListener('pointerleave', birak);
    }

    /* ------------------------------------------------------- döngü */
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
    function baslat() {
      if (calisiyor) return;
      calisiyor = true;
      rafId = requestAnimationFrame(dongu);
    }
    function durdur() {
      calisiyor = false;
      if (rafId) cancelAnimationFrame(rafId);
    }

    if (azalt) {
      ciz(DONGU * 0.70);
    } else {
      ciz(DONGU * 0.5);
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
        gecis = 0;                          /* yumuşak geçiş; döngü aşaması korunur */
        if (m.ustBilgi) {
          var ub = document.getElementById(m.ustBilgi);
          if (ub) ub.textContent = senaryo.ustBilgi;
        }
        if (m.etiketA) {
          var ea = document.getElementById(m.etiketA);
          if (ea) ea.textContent = senaryo.etiketler.a;
        }
        if (m.etiketB) {
          var eb = document.getElementById(m.etiketB);
          if (eb) eb.textContent = senaryo.etiketler.b;
        }
        if (m.karar) {
          var kel = document.getElementById(m.karar);
          if (kel) kel.className = 'v ' + (senaryo.karar.iyi ? 'ok' : 'nok');
        }
        /* değişim anında görünsün — bir sonraki kareyi bekleme */
        try { ciz(azalt ? DONGU * 0.70 : performance.now() - t0); } catch (e) {}
        return senaryo.ad;
      },
      aktifSenaryo: function () { return senaryo.ad; },
      tani: function () {
        return { tik: tik, kare: kare, ekranda: ekranda, calisiyor: calisiyor, sonHata: sonHata };
      }
    };
  }

  global.Sahne3D = Sahne3D;
})(window);
