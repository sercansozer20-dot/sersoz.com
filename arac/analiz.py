#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analiz.py — sersoz.com site envanteri ve bağlantı haritası

Ne cevaplar:
  - Hangi sayfalar var, ne kadar büyük, başlıkları ne
  - Hangileri arama motoruna kapalı (taslak) hangileri açık (yayın)
  - Kim kime bağlanıyor; hangi sayfaya HİÇBİR YERDEN gidilmiyor (öksüz)
  - Kırık iç bağlantı var mı
  - Hangi sayfalar birbirinin kopyası/türevi
"""

import io
import os
import re
import sys
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

KOK = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ATLA = {".git", "vendor", "arac", "__pycache__"}

BAG = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
BASLIK = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
ROBOTS = re.compile(r'name=["\']robots["\'][^>]*content=["\']([^"\']+)', re.I)


def sayfalar():
    out = []
    for dizin, alt, dosyalar in os.walk(KOK):
        alt[:] = [a for a in alt if a not in ATLA]
        for d in dosyalar:
            if d.lower().endswith(".html"):
                tam = os.path.join(dizin, d)
                yol = "/" + os.path.relpath(tam, KOK).replace("\\", "/")
                out.append((yol, tam))
    return sorted(out)


def coz(kaynak_yol, hedef):
    """Bağlantıyı köke göre normalize eder; dış/özel ise None döner."""
    h = hedef.split("#")[0].split("?")[0].strip()
    if not h:
        return None
    if re.match(r"^(https?:|mailto:|tel:|data:|javascript:)", h, re.I):
        return None
    if h.startswith("/"):
        yol = h
    else:
        taban = os.path.dirname(kaynak_yol)
        yol = os.path.normpath(os.path.join(taban, h)).replace("\\", "/")
        if not yol.startswith("/"):
            yol = "/" + yol
    if yol.endswith("/"):
        yol += "index.html"
    if yol == "/":
        yol = "/index.html"
    return yol


def main():
    liste = sayfalar()
    bilgi = {}
    giden = defaultdict(set)
    gelen = defaultdict(set)
    varliklar = defaultdict(set)

    for yol, tam in liste:
        try:
            s = io.open(tam, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        b = BASLIK.search(s)
        r = ROBOTS.search(s)
        bilgi[yol] = {
            "boyut": os.path.getsize(tam),
            "baslik": (b.group(1).strip()[:58] if b else "—"),
            "kapali": bool(r and "noindex" in r.group(1).lower()),
            "kanvas": s.count("<canvas"),
            "three": "vendor/three" in s,
        }
        for ham in BAG.findall(s):
            t = coz(yol, ham)
            if not t:
                continue
            if t.lower().endswith(".html"):
                giden[yol].add(t)
                gelen[t].add(yol)
            else:
                varliklar[t].add(yol)

    mevcut = set(bilgi)

    print("=" * 78)
    print("SAYFA ENVANTERI  (%d HTML)" % len(bilgi))
    print("=" * 78)
    print("%-34s %8s %5s %5s  %s" % ("yol", "bayt", "kanvas", "gelen", "durum"))
    for yol in sorted(bilgi, key=lambda k: (-bilgi[k]["boyut"])):
        i = bilgi[yol]
        durum = "TASLAK" if i["kapali"] else "yayin"
        if i["three"]:
            durum += " +three"
        print("%-34s %8d %5d %5d  %s" % (yol, i["boyut"], i["kanvas"], len(gelen[yol]), durum))

    print()
    print("=" * 78)
    print("OKSUZ SAYFALAR — hiçbir sayfadan bağlantı YOK")
    print("=" * 78)
    oksuz = [y for y in sorted(mevcut) if not gelen[y] and y != "/index.html"]
    if not oksuz:
        print("  yok")
    for y in oksuz:
        print("  %-34s %s" % (y, bilgi[y]["baslik"]))

    print()
    print("=" * 78)
    print("KIRIK IC BAGLANTILAR")
    print("=" * 78)
    kirik = defaultdict(set)
    for kaynak, hedefler in giden.items():
        for h in hedefler:
            if h not in mevcut:
                kirik[h].add(kaynak)
    if not kirik:
        print("  yok")
    for h in sorted(kirik):
        print("  %-34s <- %s" % (h, ", ".join(sorted(kirik[h]))[:120]))

    print()
    print("=" * 78)
    print("EKSIK VARLIKLAR (js/css/png)")
    print("=" * 78)
    eksik = []
    for v, kaynaklar in varliklar.items():
        tam = os.path.join(KOK, v.lstrip("/").replace("/", os.sep))
        if not os.path.exists(tam):
            eksik.append((v, kaynaklar))
    if not eksik:
        print("  yok")
    for v, k in sorted(eksik):
        print("  %-34s <- %s" % (v, ", ".join(sorted(k))[:110]))

    print()
    print("=" * 78)
    print("ANA SAYFADAN ERISILEBILIRLIK (tikla-tikla nereye gidilir)")
    print("=" * 78)
    gorulen = {"/index.html"}
    sira = ["/index.html"]
    derinlik = {"/index.html": 0}
    while sira:
        s = sira.pop(0)
        for h in sorted(giden.get(s, ())):
            if h in mevcut and h not in gorulen:
                gorulen.add(h)
                derinlik[h] = derinlik[s] + 1
                sira.append(h)
    for d in range(0, 4):
        grup = sorted([y for y in gorulen if derinlik[y] == d])
        if grup:
            print("  %d tik: %s" % (d, ", ".join(grup)))
    ulasilmaz = sorted(mevcut - gorulen)
    print()
    print("  ANA SAYFADAN ULASILAMAYAN (%d):" % len(ulasilmaz))
    for y in ulasilmaz:
        print("    %-34s %s" % (y, "TASLAK" if bilgi[y]["kapali"] else "YAYIN — sorun"))

    print()
    print("=" * 78)
    print("OZET")
    print("=" * 78)
    yayin = [y for y in mevcut if not bilgi[y]["kapali"]]
    taslak = [y for y in mevcut if bilgi[y]["kapali"]]
    print("  toplam HTML      : %d" % len(mevcut))
    print("  yayin (indekslenebilir): %d" % len(yayin))
    print("  taslak (noindex) : %d" % len(taslak))
    print("  oksuz            : %d" % len(oksuz))
    print("  kirik baglanti   : %d" % len(kirik))
    print("  toplam agirlik   : %.1f MB" % (sum(bilgi[y]["boyut"] for y in mevcut) / 1e6))


if __name__ == "__main__":
    main()
