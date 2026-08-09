#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kirik.py — HTML yorumlarını dışlayarak gerçek kırık bağlantı taraması.

analiz.py yorum bloklarını ayıklamıyordu ve şablon içindeki yer tutucu
bağlantıları (yazilar.html içindeki "dosya-adi.html" gibi) kırık sanıyordu.
Bu betik yalnızca CANLI işaretlemedeki bağlantılara bakar.
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
ATLA = {".git", "vendor", "arac", "__pycache__"}
BAG = re.compile(r'(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
YORUM = re.compile(r"<!--.*?-->", re.S)


def main():
    kirik = []
    yorumdaki = 0
    toplam = 0

    for dizin, alt, dosyalar in os.walk(KOK):
        alt[:] = [a for a in alt if a not in ATLA]
        for f in dosyalar:
            if not f.lower().endswith(".html"):
                continue
            tam = os.path.join(dizin, f)
            metin = io.open(tam, encoding="utf-8", errors="replace").read()
            araliklar = [(m.start(), m.end()) for m in YORUM.finditer(metin)]

            def yorumda(i):
                return any(a <= i < b for a, b in araliklar)

            for m in BAG.finditer(metin):
                ham = m.group(1).split("#")[0].split("?")[0].strip()
                if not ham:
                    continue
                if re.match(r"^(https?:|mailto:|tel:|data:|javascript:)", ham, re.I):
                    continue
                toplam += 1
                if yorumda(m.start()):
                    yorumdaki += 1
                    continue
                if ham.startswith("/"):
                    hedef = os.path.join(KOK, ham.lstrip("/"))
                else:
                    hedef = os.path.join(dizin, ham)
                hedef = os.path.normpath(hedef)
                # Dizin ise index.html'e bak — bu kural BİR KEZ uygulanır.
                # (Önceki hâlinde hem isdir hem "sonu / " dalı çalışıp
                #  index.html/index.html aranıyordu; 70 sahte kırık üretti.)
                if os.path.isdir(hedef):
                    hedef = os.path.join(hedef, "index.html")
                if not os.path.exists(hedef):
                    kirik.append((
                        "/" + os.path.relpath(tam, KOK).replace("\\", "/"),
                        ham,
                    ))

    print("incelenen ic baglanti : %d" % toplam)
    print("yorum icinde (sayilmadi): %d" % yorumdaki)
    print("GERCEK KIRIK          : %d" % len(kirik))
    for kaynak, hedef in kirik:
        print("  %-42s -> %s" % (kaynak, hedef))


if __name__ == "__main__":
    main()
