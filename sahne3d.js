/* sersoz.com — 3D tarama sahnesi
 *
 * Lazer profil taraması → nokta bulutu → ölçüm → robot kılavuzlama döngüsünü
 * canlandıran bağımsız kanvas sahnesi. Harici kütüphane kullanmaz.
 *
 * Kullanım:  Sahne3D('kanvasId', { kompakt: false, metrik: {...} })
 */
(function (global) {
  'use strict';

  function Sahne3D(kanvasId, secenek) {
    var c = document.getElementById(kanvasId);
    if (!c || !c.getContext) return null;

    secenek = secenek || {};
    var x = c.getContext('2d');
    var W = c.width, H = c.height;
    var kompakt = !!secenek.kompakt;
    var azalt = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* --------------------------------------------------------- geometri */
    var N = kompakt ? 54 : 68;
    var TILT = -0.96;
    var FOV = 3.5;
    var OLCEK = Math.min(W, H) * (kompakt ? 0.66 : 0.60);
    var CX = W * 0.47, CY = H * (kompakt ? 0.58 : 0.60);

    var DELIKLER = [{ u: -0.52, v: -0.30 }, { u: -0.52, v: 0.30 }];

    /* parçanın yükseklik haritası (0 = zemin, + = yukarı) */
    function yukseklik(u, v) {
      var plakaIcinde = Math.abs(u) < 0.86 && Math.abs(v) < 0.60;
      if (!plakaIcinde) return 0;

      var y = 0.10;                                        /* taban plaka */

      /* kenar pahı */
      var kenar = Math.min(0.86 - Math.abs(u), 0.60 - Math.abs(v));
      if (kenar < 0.05) y -= (0.05 - kenar) * 1.1;

      /* yükselti bloğu */
      var blokIcinde = u > -0.28 && u < 0.54 && Math.abs(v) < 0.33;
      if (blokIcinde) {
        y = 0.32;
        /* V kaynak ağzı */
        var oluk = Math.exp(-Math.pow((u - 0.13) / 0.052, 2));
        y -= 0.21 * oluk;
        /* blok üstü hafif doku */
        y += 0.010 * Math.sin(u * 9.0) * Math.cos(v * 8.0);
      } else {
        y += 0.008 * Math.sin(u * 7.0) * Math.cos(v * 6.0);
      }

      /* delikler */
      for (var i = 0; i < DELIKLER.length; i++) {
        var d = DELIKLER[i];
        var r = Math.sqrt((u - d.u) * (u - d.u) + (v - d.v) * (v - d.v));
        if (r < 0.075) y -= 0.13 * (1 - r / 0.075);
      }
      return y;
    }

    function yansit(px, py, pz, aci) {
      var ca = Math.cos(aci), sa = Math.sin(aci);
      var xr = px * ca + pz * sa;
      var zr = -px * sa + pz * ca;
      var cx2 = Math.cos(TILT), sx2 = Math.sin(TILT);
      var yr = py * cx2 - zr * sx2;
      var zd = py * sx2 + zr * cx2;
      var s = FOV / (FOV + zd);
      return { X: CX + xr * s * OLCEK, Y: CY + yr * s * OLCEK, s: s, zd: zd };
    }

    /* ------------------------------------------------------- durum */
    var HEDEFLER = [-0.16, 0.03, 0.22, 0.41];      /* kaynak noktaları (u) */
    var DONGU = kompakt ? 15000 : 16000;
    var t0 = performance.now();

    var suruklenen = false, surukleBaslangic = 0, aciKaydirma = 0, sonAci = 0;
    var inceMisPointer = !global.matchMedia || matchMedia('(pointer: fine)').matches;

    var m = secenek.metrik || {};
    function metrikYaz(ad, deger) {
      var el = m[ad] ? document.getElementById(m[ad]) : null;
      if (el && el.textContent !== deger) el.textContent = deger;
    }

    /* ------------------------------------------------------- yardımcı çizim */
    function etiketKutusu(px, py, yazi, renk, zeminAlfa) {
      x.font = '600 12px Consolas, monospace';
      var g = x.measureText(yazi).width;
      x.fillStyle = 'rgba(8,12,17,' + (zeminAlfa == null ? 0.82 : zeminAlfa) + ')';
      x.fillRect(px - 6, py - 13, g + 12, 19);
      x.strokeStyle = renk;
      x.lineWidth = 1;
      x.strokeRect(px - 6, py - 13, g + 12, 19);
      x.fillStyle = renk;
      x.fillText(yazi, px, py + 1);
      return g + 12;
    }

    function olcuCizgisi(a, b, yazi, renk, kaydir) {
      var ox = 0, oy = kaydir || -30;
      x.strokeStyle = renk;
      x.lineWidth = 1.2;
      x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(a.X + ox, a.Y + oy); x.lineTo(b.X + ox, b.Y + oy); x.stroke();
      x.setLineDash([]);
      /* uç çentikleri */
      x.beginPath();
      x.moveTo(a.X + ox, a.Y + oy - 6); x.lineTo(a.X + ox, a.Y + oy + 6);
      x.moveTo(b.X + ox, b.Y + oy - 6); x.lineTo(b.X + ox, b.Y + oy + 6);
      x.stroke();
      /* bağlantı çizgileri */
      x.globalAlpha = 0.5;
      x.beginPath();
      x.moveTo(a.X, a.Y); x.lineTo(a.X + ox, a.Y + oy + 6);
      x.moveTo(b.X, b.Y); x.lineTo(b.X + ox, b.Y + oy + 6);
      x.stroke();
      x.globalAlpha = 1;
      etiketKutusu((a.X + b.X) / 2 + ox - x.measureText(yazi).width / 2, a.Y + oy - 4, yazi, renk);
    }

    function renkSkalasi() {
      if (kompakt) return;
      var sx = W - 34, sy = 56, sh = 118, sw = 9;
      for (var i = 0; i < sh; i++) {
        var oran = 1 - i / sh;
        x.fillStyle = 'hsl(' + (214 - oran * 150) + ',88%,' + (50 + oran * 16) + '%)';
        x.fillRect(sx, sy + i, sw, 1);
      }
      x.strokeStyle = 'rgba(255,255,255,.25)';
      x.lineWidth = 1;
      x.strokeRect(sx - .5, sy - .5, sw + 1, sh + 1);
      x.font = '9px Consolas, monospace';
      x.fillStyle = 'rgba(255,255,255,.55)';
      x.fillText('24 mm', sx - 40, sy + 6);
      x.fillText('12', sx - 16, sy + sh / 2 + 3);
      x.fillText('0', sx - 12, sy + sh + 3);
      x.save();
      x.translate(sx + 30, sy + sh / 2);
      x.rotate(Math.PI / 2);
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.fillText('YÜKSEKLİK', -30, 0);
      x.restore();
    }

    function zamanCizgisi(p) {
      var y = H - 26, sol = 18, sag = W - (kompakt ? 18 : 60);
      var gen = sag - sol;
      x.fillStyle = 'rgba(255,255,255,.10)';
      x.fillRect(sol, y, gen, 3);
      x.fillStyle = 'rgba(194,65,12,.9)';
      x.fillRect(sol, y, gen * p, 3);

      var fazlar = [{ p: 0, ad: 'TARAMA' }, { p: 0.42, ad: 'ÖLÇÜM' }, { p: 0.62, ad: 'ROBOT' }];
      x.font = '9px Consolas, monospace';
      for (var i = 0; i < fazlar.length; i++) {
        var fx = sol + gen * fazlar[i].p;
        var aktif = p >= fazlar[i].p && (i === fazlar.length - 1 || p < fazlar[i + 1].p);
        x.fillStyle = aktif ? 'rgba(255,190,140,.95)' : 'rgba(255,255,255,.32)';
        x.fillRect(fx, y - 3, 1.5, 9);
        x.fillText(fazlar[i].ad, fx + 5, y - 7);
      }
    }

    /* ------------------------------------------------------------- çizim */
    function ciz(t) {
      var p = (t % DONGU) / DONGU;
      var aci = 0.30 + Math.sin(t / 6000) * 0.17 + aciKaydirma;

      var tarama = Math.min(1, p / 0.42);
      var olcumFaz = p > 0.42 ? Math.min(1, (p - 0.42) / 0.10) : 0;
      var robotFaz = p > 0.62 ? Math.min(1, (p - 0.62) / 0.12) : 0;

      /* zemin */
      var zg = x.createLinearGradient(0, 0, 0, H);
      zg.addColorStop(0, '#0c1118');
      zg.addColorStop(1, '#070a0e');
      x.fillStyle = zg;
      x.fillRect(0, 0, W, H);

      /* perspektif ızgara */
      x.strokeStyle = 'rgba(255,255,255,.05)';
      x.lineWidth = 1;
      for (var gi = -5; gi <= 5; gi++) {
        var q = gi / 5 * 1.5;
        var a1 = yansit(q, -0.02, -1.5, aci), a2 = yansit(q, -0.02, 1.5, aci);
        x.beginPath(); x.moveTo(a1.X, a1.Y); x.lineTo(a2.X, a2.Y); x.stroke();
        var b1 = yansit(-1.5, -0.02, q, aci), b2 = yansit(1.5, -0.02, q, aci);
        x.beginPath(); x.moveTo(b1.X, b1.Y); x.lineTo(b2.X, b2.Y); x.stroke();
      }

      /* nokta bulutu */
      var tarananU = -1 + tarama * 2;
      var nokta = 0;

      for (var i = 0; i < N; i++) {
        var u = (i / (N - 1) - 0.5) * 2;
        if (u > tarananU + 0.02) continue;
        for (var j = 0; j < N; j++) {
          var v = (j / (N - 1) - 0.5) * 2;
          var y = yukseklik(u, v);
          if (y === 0) continue;

          var pr = yansit(u, -y, v, aci);
          nokta++;

          var lazerde = Math.abs(u - tarananU) < 0.03;
          var yn = Math.max(0, Math.min(1, (y + 0.03) / 0.36));
          var boy = (lazerde ? 3.1 : 2.1) * pr.s;

          if (lazerde) {
            x.fillStyle = 'rgba(215,245,255,.96)';
          } else {
            var sis = Math.max(0.22, 0.92 - (pr.zd + 1) * 0.24);   /* derinlik sisi */
            x.fillStyle = 'hsla(' + (214 - yn * 150) + ',88%,' + (50 + yn * 16) + '%,' + sis + ')';
          }
          x.fillRect(pr.X - boy / 2, pr.Y - boy / 2, boy, boy);
        }
      }

      metrikYaz('nokta', (nokta * 34).toLocaleString('tr-TR'));

      /* lazer düzlemi */
      if (tarama < 1) {
        metrikYaz('asama', 'TARAMA');
        var l1 = yansit(tarananU, -0.62, -0.72, aci);
        var l2 = yansit(tarananU, -0.62, 0.72, aci);
        var l3 = yansit(tarananU, 0.02, 0.72, aci);
        var l4 = yansit(tarananU, 0.02, -0.72, aci);
        var lg = x.createLinearGradient(l1.X, l1.Y, l3.X, l3.Y);
        lg.addColorStop(0, 'rgba(120,205,255,.04)');
        lg.addColorStop(1, 'rgba(120,205,255,.22)');
        x.fillStyle = lg;
        x.beginPath();
        x.moveTo(l1.X, l1.Y); x.lineTo(l2.X, l2.Y); x.lineTo(l3.X, l3.Y); x.lineTo(l4.X, l4.Y);
        x.closePath(); x.fill();

        x.strokeStyle = 'rgba(200,240,255,.9)';
        x.lineWidth = 1.8;
        x.beginPath(); x.moveTo(l4.X, l4.Y); x.lineTo(l3.X, l3.Y); x.stroke();

        /* sensör göstergesi */
        var sens = yansit(tarananU, -0.72, 0, aci);
        x.fillStyle = 'rgba(255,255,255,.30)';
        x.fillRect(sens.X - 16, sens.Y - 9, 32, 12);
        x.fillStyle = 'rgba(120,205,255,.9)';
        x.fillRect(sens.X - 3, sens.Y + 3, 6, 3);

        /* tarama ilerleme */
        if (!kompakt) {
          x.font = '10px Consolas, monospace';
          x.fillStyle = 'rgba(200,240,255,.75)';
          x.fillText('TARAMA  %' + Math.round(tarama * 100), 18, 30);
        }
      }

      /* ölçüm aşaması */
      if (olcumFaz > 0) {
        metrikYaz('asama', robotFaz > 0 ? 'ROBOT KILAVUZLAMA' : 'ÖLÇÜM');
        x.globalAlpha = olcumFaz;

        var sol = yansit(-0.28, -0.32, -0.33, aci);
        var sag = yansit(0.54, -0.32, -0.33, aci);
        olcuCizgisi(sol, sag, '82.40 mm', 'rgba(255,190,140,.95)', -34);

        /* oluk derinliği */
        var oUst = yansit(0.13, -0.32, 0.12, aci);
        var oAlt = yansit(0.13, -0.11, 0.12, aci);
        x.strokeStyle = 'rgba(110,240,170,.95)';
        x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(oUst.X, oUst.Y); x.lineTo(oAlt.X, oAlt.Y); x.stroke();
        etiketKutusu(oAlt.X + 12, (oUst.Y + oAlt.Y) / 2 + 4, 'dikiş 3.18 mm', 'rgba(110,240,170,.95)');

        /* delik ölçüsü */
        var dp = yansit(DELIKLER[0].u, -(yukseklik(DELIKLER[0].u, DELIKLER[0].v) + 0.02), DELIKLER[0].v, aci);
        x.strokeStyle = 'rgba(255,190,140,.9)';
        x.beginPath(); x.arc(dp.X, dp.Y, 11, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.moveTo(dp.X + 8, dp.Y - 8); x.lineTo(dp.X + 28, dp.Y - 26); x.stroke();
        etiketKutusu(dp.X + 30, dp.Y - 24, 'Ø 8.02 mm', 'rgba(255,190,140,.95)');

        x.globalAlpha = 1;
        metrikYaz('olcu', '3.18 mm');
        metrikYaz('duzlem', '0.06 mm');
        metrikYaz('karar', 'OK');
      } else {
        metrikYaz('olcu', '— mm');
        metrikYaz('duzlem', '— mm');
        metrikYaz('karar', '—');
      }

      /* robot aşaması */
      if (robotFaz > 0) {
        var gorunen = Math.min(HEDEFLER.length, Math.floor(robotFaz * HEDEFLER.length * 1.6) + 1);

        /* hedefler arası yol */
        if (gorunen > 1) {
          x.strokeStyle = 'rgba(194,65,12,.35)';
          x.lineWidth = 1.2;
          x.setLineDash([3, 4]);
          x.beginPath();
          for (var q2 = 0; q2 < gorunen; q2++) {
            var hp0 = yansit(HEDEFLER[q2], -(yukseklik(HEDEFLER[q2], 0) + 0.015), 0, aci);
            if (q2 === 0) x.moveTo(hp0.X, hp0.Y); else x.lineTo(hp0.X, hp0.Y);
          }
          x.stroke();
          x.setLineDash([]);
        }

        for (var k = 0; k < gorunen; k++) {
          var hp = yansit(HEDEFLER[k], -(yukseklik(HEDEFLER[k], 0) + 0.015), 0, aci);
          var nabiz = 1 + Math.sin(t / 240 + k * 1.2) * 0.16;
          x.strokeStyle = 'rgba(255,120,60,.95)';
          x.lineWidth = 1.7;
          x.beginPath(); x.arc(hp.X, hp.Y, 8 * nabiz, 0, Math.PI * 2); x.stroke();
          x.beginPath();
          x.moveTo(hp.X - 13, hp.Y); x.lineTo(hp.X - 4, hp.Y);
          x.moveTo(hp.X + 4, hp.Y); x.lineTo(hp.X + 13, hp.Y);
          x.moveTo(hp.X, hp.Y - 13); x.lineTo(hp.X, hp.Y - 4);
          x.moveTo(hp.X, hp.Y + 4); x.lineTo(hp.X, hp.Y + 13);
          x.stroke();
          if (!kompakt) {
            x.font = '10px Consolas, monospace';
            x.fillStyle = 'rgba(255,170,120,.9)';
            x.fillText('P' + (k + 1), hp.X + 15, hp.Y - 9);
          }
        }

        /* robot kolu */
        var idx = Math.min(HEDEFLER.length - 1, Math.floor(robotFaz * 4.2));
        var hd = yansit(HEDEFLER[idx], -(yukseklik(HEDEFLER[idx], 0) + 0.03), 0, aci);
        var taban = { X: W - (kompakt ? 62 : 96), Y: 58 };
        var orta = { X: (taban.X + hd.X) / 2 + 46, Y: (taban.Y + hd.Y) / 2 - 52 };

        x.lineCap = 'round';
        x.strokeStyle = 'rgba(255,255,255,.16)';
        x.lineWidth = 11;
        x.beginPath(); x.moveTo(taban.X, taban.Y); x.lineTo(orta.X, orta.Y); x.lineTo(hd.X, hd.Y - 14); x.stroke();
        x.strokeStyle = 'rgba(225,235,245,.55)';
        x.lineWidth = 5;
        x.beginPath(); x.moveTo(taban.X, taban.Y); x.lineTo(orta.X, orta.Y); x.stroke();
        x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(orta.X, orta.Y); x.lineTo(hd.X, hd.Y - 14); x.stroke();

        /* eklemler */
        x.fillStyle = 'rgba(255,255,255,.55)';
        x.beginPath(); x.arc(taban.X, taban.Y, 8, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.arc(orta.X, orta.Y, 5.5, 0, Math.PI * 2); x.fill();

        /* torç ucu */
        x.strokeStyle = 'rgba(255,150,80,.95)';
        x.lineWidth = 2;
        x.beginPath(); x.moveTo(hd.X, hd.Y - 14); x.lineTo(hd.X, hd.Y - 4); x.stroke();
        var kivilcim = 0.4 + Math.abs(Math.sin(t / 90)) * 0.6;
        x.fillStyle = 'rgba(255,190,110,' + kivilcim + ')';
        x.beginPath(); x.arc(hd.X, hd.Y - 2, 3.4, 0, Math.PI * 2); x.fill();

        if (!kompakt) {
          x.font = '10px Consolas, monospace';
          x.fillStyle = 'rgba(255,255,255,.45)';
          x.fillText('ROBOT', taban.X - 17, taban.Y - 15);
        }
      }

      renkSkalasi();
      zamanCizgisi(p);

      /* telemetri */
      if (!kompakt) {
        x.font = '10.5px Consolas, monospace';
        x.fillStyle = 'rgba(255,255,255,.38)';
        x.fillText('profil 1280 px   z-çöz. 0.012 mm   ' + Math.round(28 + Math.sin(t / 800) * 3) + ' fps', 18, H - 40);
      }

      /* sürükleme ipucu */
      if (inceMisPointer && !kompakt && t < 6000) {
        x.font = '10px Consolas, monospace';
        x.fillStyle = 'rgba(255,255,255,' + Math.max(0, 0.5 - t / 12000) + ')';
        x.fillText('↔ sürükleyerek döndürün', 18, 48);
      }
    }

    /* ------------------------------------------------- etkileşim: döndürme */
    if (inceMisPointer) {
      c.style.cursor = 'grab';
      c.addEventListener('pointerdown', function (e) {
        suruklenen = true;
        surukleBaslangic = e.clientX;
        sonAci = aciKaydirma;
        c.style.cursor = 'grabbing';
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
      });
      c.addEventListener('pointermove', function (e) {
        if (!suruklenen) return;
        aciKaydirma = sonAci + (e.clientX - surukleBaslangic) / 180;
      });
      var birak = function () { suruklenen = false; c.style.cursor = 'grab'; };
      c.addEventListener('pointerup', birak);
      c.addEventListener('pointercancel', birak);
      c.addEventListener('pointerleave', birak);
    }

    /* --------------------------------------------------------- döngü */
    var rafId = null, calisiyor = false, ekranda = true, gozlemci = null;
    var tik = 0, kare = 0, sonHata = null;

    function dongu() {
      if (!calisiyor) return;
      tik++;
      if (ekranda) {
        try { ciz(performance.now() - t0); kare++; }
        catch (e) { sonHata = String(e && e.message || e); }
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
        }, { threshold: 0 });
        gozlemci.observe(c);
      }
    }

    return {
      baslat: baslat,
      durdur: durdur,
      tani: function () {
        return { tik: tik, kare: kare, ekranda: ekranda, calisiyor: calisiyor, sonHata: sonHata };
      }
    };
  }

  global.Sahne3D = Sahne3D;
})(window);
