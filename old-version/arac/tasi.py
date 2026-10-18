#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tasi.py — /yeni ağacını köke taşır, eskiyi arşive alır, eski adresleri yönlendirir.

Neden: kullanıcı "her şeyi baştan yapalım" dedi ve asıl şikâyeti dağınıklıktı.
Yeni ağacı /yeni/ altında bırakmak, şikâyet edilen "yanına bir taslak daha"
durumunu tekrar üretirdi.

Yapılanlar
  1. Değiştirilen eski sayfalar arsiv/ altına taşınır (SİLİNMEZ).
  2. yeni/*.html ve yeni/sistem.css köke taşınır.
  3. Eski adresler için yönlendirme kabukları yazılır (SEO + eski bağlantılar).
  4. robots.txt ve sitemap.xml yeni sayfa listesine göre yenilenir.

Kökte KALANLAR (yeni sette karşılığı yok, işlevsel):
  yonetim.html · siparis-sonuc.html · hizmetler.html (zaten yönlendirme)
  onay.js · hesap.js · iz.js · sahne3d.js · og.png · CNAME · firestore.rules
  vendor/ · arac/ · yazilar/ · taslak/
"""

import io
import os
import shutil
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

KOK = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
YENI = os.path.join(KOK, "yeni")
ARSIV = os.path.join(KOK, "arsiv")

# Yeni sette karşılığı olan, arşive inecek eski sayfalar
ARSIVLIK = [
    "index.html", "cozumler.html", "vision-detection.html", "kazanc.html",
    "magaza.html", "portfolyo.html", "yazilar.html", "forum.html",
    "gizlilik.html", "hesabim.html", "onceki-anasayfa.html",
    "varyant-1.html", "varyant-2.html", "varyant-2a.html",
    "varyant-2b.html", "varyant-2c.html", "varyant-3.html",
]

# eski adres -> yeni adres
YONLENDIRME = {
    "cozumler.html": "/uygulamalar.html",
    "vision-detection.html": "/yazilim.html",
    "magaza.html": "/fiyat.html",
    "kazanc.html": "/fiyat.html",
    "yazilar.html": "/hakkinda.html",
    "portfolyo.html": "/hakkinda.html",
}

YAYIN = [
    ("/", "1.0", "weekly"),
    ("/uygulamalar.html", "0.9", "monthly"),
    ("/yazilim.html", "0.9", "monthly"),
    ("/fiyat.html", "0.8", "weekly"),
    ("/surec.html", "0.8", "monthly"),
    ("/forum.html", "0.7", "daily"),
    ("/hakkinda.html", "0.6", "monthly"),
    ("/yazilar/el-goz-kalibrasyonu-tsai-lenz.html", "0.6", "yearly"),
    ("/gizlilik.html", "0.3", "yearly"),
]


def yonlendirme_kabugu(hedef, baslik):
    return """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=%s">
<link rel="canonical" href="https://sersoz.com%s">
<meta name="robots" content="noindex, follow">
<title>%s — sersoz.com</title>
<style>
  body { background:#faf8f4; color:#1a1815; font-family:'Segoe UI',system-ui,sans-serif;
         display:flex; align-items:center; justify-content:center; min-height:100vh;
         margin:0; padding:24px; text-align:center; }
  a { color:#c2410c; }
</style>
</head>
<body>
<p>Bu sayfa taşındı — <a href="%s">devam etmek için tıklayın</a></p>
<script>location.replace(%s);</script>
</body>
</html>
""" % (hedef, hedef, baslik, hedef, repr(hedef).replace("'", '"'))


def main():
    if not os.path.isdir(YENI):
        print("HATA: yeni/ yok"); return 1

    os.makedirs(ARSIV, exist_ok=True)

    # 1) eskileri arşive
    tasinan = []
    for f in ARSIVLIK:
        kaynak = os.path.join(KOK, f)
        if os.path.exists(kaynak):
            shutil.move(kaynak, os.path.join(ARSIV, f))
            tasinan.append(f)
    print("ARSIVE ALINDI (%d): %s" % (len(tasinan), ", ".join(tasinan)))

    # 2) yeni ağacı köke
    yeniler = []
    for f in sorted(os.listdir(YENI)):
        kaynak = os.path.join(YENI, f)
        if os.path.isfile(kaynak):
            shutil.move(kaynak, os.path.join(KOK, f))
            yeniler.append(f)
    # yeni/veri gibi boş kalan alt dizinleri temizle
    for d, alt, dosyalar in os.walk(YENI, topdown=False):
        if not os.listdir(d):
            os.rmdir(d)
    print("KOKE TASINDI (%d): %s" % (len(yeniler), ", ".join(yeniler)))

    # 3) yönlendirmeler
    for eski, yeni in YONLENDIRME.items():
        io.open(os.path.join(KOK, eski), "w", encoding="utf-8", newline="\n").write(
            yonlendirme_kabugu(yeni, eski.replace(".html", "").capitalize()))
    print("YONLENDIRME YAZILDI (%d): %s" % (
        len(YONLENDIRME), ", ".join("%s -> %s" % (a, b) for a, b in YONLENDIRME.items())))

    # 4) robots + sitemap
    rb = ["# sersoz.com", "User-agent: *", "Allow: /", "",
          "# Tasarim denemeleri ve arsiv", "Disallow: /taslak/", "Disallow: /arsiv/",
          "Disallow: /yonetim.html", "Disallow: /hesabim.html",
          "Disallow: /siparis-sonuc.html", "",
          "Sitemap: https://sersoz.com/sitemap.xml", ""]
    io.open(os.path.join(KOK, "robots.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(rb))

    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for yol, onc, sik in YAYIN:
        sm += ["  <url>", "    <loc>https://sersoz.com%s</loc>" % yol,
               "    <changefreq>%s</changefreq>" % sik,
               "    <priority>%s</priority>" % onc, "  </url>"]
    sm += ["</urlset>", ""]
    io.open(os.path.join(KOK, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
    print("robots.txt + sitemap.xml yenilendi (%d sayfa)" % len(YAYIN))
    return 0


if __name__ == "__main__":
    sys.exit(main())
