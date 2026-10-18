#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kapat.py — yayın/taslak sınırını netleştirir.

Sorun (analiz.py ile ölçüldü): 36 HTML'in 11'i arama motoruna AÇIK ama
hiçbir sayfadan bağlantı almıyor. Altısı (varyant-*) ana sayfayla neredeyse
aynı başlığı taşıyor — aramada gerçek ana sayfayla yarışıyorlar.

Yaptığı:
  1. /taslak/** ve /varyant-*.html dosyalarına noindex,nofollow ekler
     (zaten varsa dokunmaz)
  2. robots.txt yazar
  3. sitemap.xml yazar — YALNIZCA gerçekten yayında olan sayfalar

Hiçbir dosya SİLİNMEZ.
"""

import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

KOK = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ROBOTS = re.compile(r'<meta\s+name=["\']robots["\']', re.I)
KAFA = re.compile(r"(<head[^>]*>)", re.I)

ETIKET = ('<meta name="robots" content="noindex, nofollow">\n'
          '<!-- Taslak/arsiv: arama motoruna kapali. arac/kapat.py tarafindan eklendi. -->')

# Gerçekten yayında olması gereken sayfalar (ana sayfadan ulaşılabilenler)
YAYIN = [
    ("/", "1.0", "weekly"),
    ("/cozumler.html", "0.9", "monthly"),
    ("/vision-detection.html", "0.9", "monthly"),
    ("/kazanc.html", "0.8", "monthly"),
    ("/magaza.html", "0.8", "weekly"),
    ("/portfolyo.html", "0.7", "monthly"),
    ("/yazilar.html", "0.7", "weekly"),
    ("/yazilar/el-goz-kalibrasyonu-tsai-lenz.html", "0.6", "yearly"),
    ("/forum.html", "0.5", "weekly"),
    ("/gizlilik.html", "0.3", "yearly"),
]


def kapatilacaklar():
    hedefler = []
    taslak = os.path.join(KOK, "taslak")
    for dizin, alt, dosyalar in os.walk(taslak):
        for f in dosyalar:
            if f.lower().endswith(".html"):
                hedefler.append(os.path.join(dizin, f))
    for f in os.listdir(KOK):
        if re.match(r"^varyant-.*\.html$", f, re.I):
            hedefler.append(os.path.join(KOK, f))
    return sorted(hedefler)


def main():
    eklendi, zaten = [], []
    for tam in kapatilacaklar():
        s = io.open(tam, encoding="utf-8", newline="").read()
        yol = "/" + os.path.relpath(tam, KOK).replace("\\", "/")
        if ROBOTS.search(s):
            zaten.append(yol)
            continue
        m = KAFA.search(s)
        if not m:
            print("  ATLANDI (head yok):", yol)
            continue
        s = s[:m.end()] + "\n" + ETIKET + s[m.end():]
        io.open(tam, "w", encoding="utf-8", newline="").write(s)
        eklendi.append(yol)

    print("NOINDEX EKLENDI (%d):" % len(eklendi))
    for y in eklendi:
        print("   ", y)
    print("ZATEN KAPALIYDI (%d)" % len(zaten))

    # robots.txt
    rb = [
        "# sersoz.com",
        "User-agent: *",
        "Allow: /",
        "",
        "# Tasarim denemeleri ve arsiv — indekslenmemeli",
        "Disallow: /taslak/",
        "Disallow: /varyant-",
        "Disallow: /onceki-anasayfa.html",
        "Disallow: /yonetim.html",
        "Disallow: /hesabim.html",
        "Disallow: /siparis-sonuc.html",
        "",
        "Sitemap: https://sersoz.com/sitemap.xml",
        "",
    ]
    io.open(os.path.join(KOK, "robots.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(rb))
    print("\nrobots.txt yazildi")

    # sitemap.xml
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for yol, oncelik, sik in YAYIN:
        sm += ["  <url>",
               "    <loc>https://sersoz.com%s</loc>" % yol,
               "    <changefreq>%s</changefreq>" % sik,
               "    <priority>%s</priority>" % oncelik,
               "  </url>"]
    sm += ["</urlset>", ""]
    io.open(os.path.join(KOK, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
    print("sitemap.xml yazildi — %d sayfa (yalniz gercekten yayinda olanlar)" % len(YAYIN))


if __name__ == "__main__":
    main()
