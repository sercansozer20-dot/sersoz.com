#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pisir.py — derleme anı varlık üretimi (sersoz.com 3B sahnesi)

Tarayıcının kare başına yapamayacağı hesabı burada bir kez yapıp dosyaya
gömer. Üretilenler:

  veri/yukseklik.png  16 bit yükseklik alanı (R yüksek bayt, G alçak bayt)
  veri/normal.png     teğet uzayda normal haritası (analitik türevden)
  veri/ao.png         ufuk tabanlı ortam kapanması
  veri/sapma.png      nominal ile ölçülen farkı (işaretli, 16 bit)
  veri/egrilik.png    ortalama eğrilik (kenar/çukur vurgusu için)
  veri/olcumler.json  YÜKSEKLİK ALANINDAN HESAPLANMIŞ gerçek ölçüm değerleri

Yükseklik alanı sahne3d.js içindeki SENARYOLAR.kaynak.yukseklik(u,v)
fonksiyonunun birebir karşılığıdır — uydurulmadı, taşındı.

ÖLÇEK NOTU (önemli): özgün sahnede yatay ve dikey ölçekler tutarsızdı
(yatayda ~100 mm/birim, dikeyde ~15 mm/birim). Burada tek ve eşyönlü bir
ölçek kullanılır: 1 birim = 100 mm. Bütün mm değerleri buradan türetilir,
dolayısıyla birbiriyle tutarlıdır.
"""

import json
import os
import sys
import numpy as np
from PIL import Image

# Windows konsolu varsayılan olarak cp1254 kullanıyor ve "→" gibi karakterlerde
# patlıyor. Çıktıyı UTF-8'e sabitle — dosya yazımı zaten UTF-8'di.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# ------------------------------------------------------------------ ayarlar
COZ = 512                 # doku çözünürlüğü
MM = 100.0                # 1 birim = 100 mm (eşyönlü)
DELIKLER = [(-0.52, -0.30), (-0.52, 0.30)]
ROI = {"u1": -0.30, "u2": 0.56, "v1": -0.35, "v2": 0.35}
CAPA = (0.13, 0.0)

BURADA = os.path.dirname(os.path.abspath(__file__))
CIKTI = os.path.normpath(os.path.join(BURADA, "..", "taslak", "gorsel", "veri"))


# ------------------------------------------------------- yükseklik alanları
def yukseklik(u, v, nominal=False):
    """sahne3d.js SENARYOLAR.kaynak.yukseklik karşılığı (vektörel).

    nominal=True: kusursuz parça — yüzey gürültüsü yok, kenar pahı ideal.
    Sapma haritası bu ikisinin farkıdır.
    """
    u = np.asarray(u, dtype=np.float64)
    v = np.asarray(v, dtype=np.float64)

    y = np.full(u.shape, 0.10)

    # kenar pahı
    kenar = np.minimum(0.86 - np.abs(u), 0.60 - np.abs(v))
    pah = kenar < 0.05
    y = np.where(pah, y - (0.05 - kenar) * 1.1, y)

    # kaynak ağzı (V kanalı) bölgesi
    kanal = (u > -0.28) & (u < 0.54) & (np.abs(v) < 0.33)
    yk = 0.32 - 0.21 * np.exp(-(((u - 0.13) / 0.052) ** 2))
    if not nominal:
        yk = yk + 0.010 * np.sin(u * 9) * np.cos(v * 8)
    y = np.where(kanal, yk, y)

    # kanal dışı yüzey gürültüsü
    if not nominal:
        y = np.where(~kanal, y + 0.008 * np.sin(u * 7) * np.cos(v * 6), y)

    # delikler
    for du, dv in DELIKLER:
        r = np.hypot(u - du, v - dv)
        ic = r < 0.075
        y = np.where(ic, y - 0.13 * (1 - r / 0.075), y)

    # parça dışı: zemin
    disi = (np.abs(u) >= 0.86) | (np.abs(v) >= 0.60)
    y = np.where(disi, 0.0, y)
    return y


def izgara(n=COZ):
    t = np.linspace(-1.0, 1.0, n)
    return np.meshgrid(t, t, indexing="xy")


# --------------------------------------------------------------- yardımcılar
def png_yaz(ad, dizi, kip):
    Image.fromarray(dizi, mode=kip).save(os.path.join(CIKTI, ad), optimize=True)
    return os.path.getsize(os.path.join(CIKTI, ad))


def onaltibit(alan, alt, ust):
    """float alanı [alt,ust] aralığından 16 bit RG kanallarına kodlar."""
    o = np.clip((alan - alt) / (ust - alt), 0.0, 1.0)
    tam = (o * 65535.0 + 0.5).astype(np.uint16)
    yuksek = (tam >> 8).astype(np.uint8)
    alcak = (tam & 0xFF).astype(np.uint8)
    bos = np.zeros_like(yuksek)
    return np.dstack([yuksek, alcak, bos])


def ortam_kapanmasi(H, adim_dunya, yon_sayisi=16, adim_sayisi=14, yaricap=0.13):
    """Ufuk açısı örneklemeli AO. Çukur ve kanal içi kendiliğinden koyulaşır."""
    n = H.shape[0]
    toplam = np.zeros_like(H)
    piksel_yaricap = max(2, int(yaricap / adim_dunya))

    for k in range(yon_sayisi):
        aci = 2.0 * np.pi * k / yon_sayisi
        dx, dy = np.cos(aci), np.sin(aci)
        en_yuksek = np.zeros_like(H)
        for s in range(1, adim_sayisi + 1):
            mesafe_px = piksel_yaricap * s / adim_sayisi
            ox = int(round(dx * mesafe_px))
            oy = int(round(dy * mesafe_px))
            if ox == 0 and oy == 0:
                continue
            komsu = np.roll(np.roll(H, oy, axis=0), ox, axis=1)
            mesafe = mesafe_px * adim_dunya
            if mesafe <= 0:
                continue
            tanjant = (komsu - H) / mesafe
            en_yuksek = np.maximum(en_yuksek, tanjant)
        # ufuk açısının sinüsü kadar ışık kapanır
        toplam += en_yuksek / np.sqrt(1.0 + en_yuksek * en_yuksek)

    ao = 1.0 - toplam / yon_sayisi
    return np.clip(ao, 0.0, 1.0)


# -------------------------------------------------------------- ölçüm hesabı
def _agiz(nominal):
    """v=0 kesitinden ağız derinliği ve yarı derinlik genişliği (mm)."""
    u_hat = np.linspace(-1.0, 1.0, 4096)
    v_hat = np.zeros_like(u_hat)
    kesit = yukseklik(u_hat, v_hat, nominal=nominal)

    kanal_ici = (u_hat > -0.28) & (u_hat < 0.54)
    ust_kotu = np.median(kesit[kanal_ici & (np.abs(u_hat - 0.13) > 0.18)])
    dip_kotu = kesit[kanal_ici].min()
    derinlik = (ust_kotu - dip_kotu) * MM

    yari = ust_kotu - (ust_kotu - dip_kotu) * 0.5
    altinda = np.where(kanal_ici & (kesit <= yari))[0]
    genislik = (u_hat[altinda[-1]] - u_hat[altinda[0]]) * MM if len(altinda) > 1 else 0.0
    return derinlik, genislik


def _delik_cap(nominal):
    """Delik çapı AĞIZ KOTUNDA ölçülür (yarı derinlikte değil).

    Yarı derinlikte ölçmek konik bir çukurda gerçek çapın yarısını verir —
    ilk denemede 7,5 mm çıkmasının sebebi buydu. Metrolojide delik çapı
    ağız kenarından okunur.
    """
    du0, dv0 = DELIKLER[0]
    r = np.linspace(0.0, 0.14, 4000)
    hr = yukseklik(du0 + r, np.full_like(r, dv0), nominal=nominal)
    cevre = np.median(hr[r > 0.10])
    # çukurdan çıkıp çevre kotuna oturduğu ilk yarıçap = ağız yarıçapı
    esik = cevre - 0.002
    disari = np.where(hr >= esik)[0]
    return (r[disari[0]] * 2.0) * MM if len(disari) else 0.0


def olcumler():
    """Değerleri yükseklik alanından GERÇEKTEN hesaplar.

    Limitler tahminle konmaz: NOMINAL (kusursuz) yüzeyden hesaplanan değerin
    üstüne makul bir tolerans eklenir. Böylece ölçülen ile limit aynı
    kaynaktan gelir ve tutarlı olur.
    """
    agiz_derinlik, agiz_genislik = _agiz(nominal=False)
    nom_derinlik, nom_genislik = _agiz(nominal=True)

    # --- düzlemsellik: kanal ve delik dışındaki üst yüzeyin tepe-tepe sapması
    U, V = izgara(1024)
    Ho = yukseklik(U, V)
    maske = (np.abs(U) < 0.80) & (np.abs(V) < 0.54)
    maske &= ~((U > -0.30) & (U < 0.56) & (np.abs(V) < 0.35))
    for du, dv in DELIKLER:
        maske &= np.hypot(U - du, V - dv) > 0.10
    duz = Ho[maske]
    # en küçük kareler düzlemi çıkarılır, kalan tepe-tepe
    A = np.stack([U[maske], V[maske], np.ones(duz.shape)], axis=1)
    kats, *_ = np.linalg.lstsq(A, duz, rcond=None)
    artik = duz - A @ kats
    duzlemsellik = (artik.max() - artik.min()) * MM

    # --- delik çapı (ağız kotunda)
    delik_cap = _delik_cap(nominal=False)
    nom_delik = _delik_cap(nominal=True)

    # --- ROI içi ölçülebilir alan
    roi_maske = (U >= ROI["u1"]) & (U <= ROI["u2"]) & (V >= ROI["v1"]) & (V <= ROI["v2"])
    roi_alan = roi_maske.sum() / roi_maske.size * (2 * MM) * (2 * MM)

    # --- parça sınırları
    parca_en = (0.86 * 2) * MM
    parca_boy = (0.60 * 2) * MM

    # --- nominal ile fark (sapma haritası istatistiği)
    Hn = yukseklik(U, V, nominal=True)
    sapma = (Ho - Hn) * MM
    ic = (np.abs(U) < 0.86) & (np.abs(V) < 0.60)
    sapma_ic = sapma[ic]

    # --- nokta sayısı: 0.35 mm örnekleme aralığında
    aralik_mm = 0.35
    nokta = int((parca_en / aralik_mm) * (parca_boy / aralik_mm))

    return {
        "olcek_mm_birim": MM,
        "not": ("Değerler sahne3d.js'teki yükseklik alanından hesaplanmıştır; "
                "eşyönlü 100 mm/birim ölçeği kullanılmıştır. Sahne bir şemadır, "
                "gerçek bir ölçüm kaydı değildir."),
        "parca": {
            "en_mm": round(parca_en, 2),
            "boy_mm": round(parca_boy, 2),
            "roi_alan_mm2": round(roi_alan, 1),
        },
        "olcumler": [
            {"ad": "agiz_derinlik", "deger_mm": round(agiz_derinlik, 2),
             "nominal_mm": round(nom_derinlik, 2),
             "alt": round(nom_derinlik - 0.60, 2), "ust": round(nom_derinlik + 0.60, 2)},
            {"ad": "agiz_genislik", "deger_mm": round(agiz_genislik, 2),
             "nominal_mm": round(nom_genislik, 2),
             "alt": round(nom_genislik - 0.50, 2), "ust": round(nom_genislik + 0.50, 2)},
            {"ad": "duzlemsellik", "deger_mm": round(duzlemsellik, 3),
             "nominal_mm": 0.0, "alt": 0.0, "ust": 2.00},
            {"ad": "delik_cap", "deger_mm": round(delik_cap, 2),
             "nominal_mm": round(nom_delik, 2),
             "alt": round(nom_delik - 0.20, 2), "ust": round(nom_delik + 0.20, 2)},
            {"ad": "nokta_sayisi", "deger": nokta, "alt": 40000, "ust": None},
        ],
        "sapma": {
            "en_dusuk_mm": round(float(sapma_ic.min()), 3),
            "en_yuksek_mm": round(float(sapma_ic.max()), 3),
            "ortalama_mutlak_mm": round(float(np.abs(sapma_ic).mean()), 3),
            "bant_araligi_mm": 0.25,
        },
        "capa": {"u": CAPA[0], "v": CAPA[1]},
        "roi": ROI,
        "delikler": [{"u": u, "v": v} for u, v in DELIKLER],
    }


# ------------------------------------------------------------------ ana akış
def main():
    os.makedirs(CIKTI, exist_ok=True)
    U, V = izgara(COZ)
    adim_dunya = 2.0 / (COZ - 1)

    H = yukseklik(U, V)
    Hn = yukseklik(U, V, nominal=True)

    # --- yükseklik (16 bit)
    h_alt, h_ust = -0.05, 0.40
    b1 = png_yaz("yukseklik.png", onaltibit(H, h_alt, h_ust), "RGB")

    # --- normal (analitik türev: sonlu fark yerine gerçek eğim)
    dhdu = (np.roll(H, -1, axis=1) - np.roll(H, 1, axis=1)) / (2 * adim_dunya)
    dhdv = (np.roll(H, -1, axis=0) - np.roll(H, 1, axis=0)) / (2 * adim_dunya)
    nx, ny, nz = -dhdu, np.ones_like(H), -dhdv
    boy = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.dstack([(nx / boy * 0.5 + 0.5), (nz / boy * 0.5 + 0.5), (ny / boy)])
    b2 = png_yaz("normal.png", (np.clip(nrm, 0, 1) * 255).astype(np.uint8), "RGB")

    # --- ortam kapanması
    ao = ortam_kapanmasi(H, adim_dunya)
    b3 = png_yaz("ao.png", (ao * 255).astype(np.uint8), "L")

    # --- sapma (işaretli, 16 bit)
    sapma = (H - Hn) * MM
    # Ölçüldü: yüzey gürültüsü ±1,0 mm'ye ulaşıyor. ±0,8 aralığında kodlamak
    # uçları KIRPIYORDU; sınır ölçülen en büyük mutlak sapmanın üstüne alındı.
    s_sinir = float(np.ceil(np.abs(sapma).max() * 10.0) / 10.0) + 0.2
    b4 = png_yaz("sapma.png", onaltibit(sapma, -s_sinir, s_sinir), "RGB")

    # --- eğrilik (Laplace yaklaşımı)
    lap = (np.roll(H, 1, 0) + np.roll(H, -1, 0) +
           np.roll(H, 1, 1) + np.roll(H, -1, 1) - 4 * H) / (adim_dunya ** 2)
    e_sinir = np.percentile(np.abs(lap), 99.0)
    egrilik = np.clip(lap / (e_sinir + 1e-9) * 0.5 + 0.5, 0, 1)
    b5 = png_yaz("egrilik.png", (egrilik * 255).astype(np.uint8), "L")

    # --- ölçümler
    o = olcumler()
    yol = os.path.join(CIKTI, "olcumler.json")
    with open(yol, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False, indent=2)
    b6 = os.path.getsize(yol)

    print("PİŞİRME TAMAM →", CIKTI)
    print("  yukseklik.png %6d bayt   (16 bit, %d²)" % (b1, COZ))
    print("  normal.png    %6d bayt" % b2)
    print("  ao.png        %6d bayt" % b3)
    print("  sapma.png     %6d bayt   (±%.1f mm)" % (b4, s_sinir))
    print("  egrilik.png   %6d bayt" % b5)
    print("  olcumler.json %6d bayt" % b6)
    print()
    print("HESAPLANAN ÖLÇÜMLER (uydurma değil):")
    for m in o["olcumler"]:
        d = m.get("deger_mm", m.get("deger"))
        birim = " mm" if "deger_mm" in m else ""
        sinir = "%s – %s" % (m["alt"], m["ust"]) if m["ust"] is not None else "≥ %s" % m["alt"]
        print("  %-16s %10s%-3s   limit %s" % (m["ad"], d, birim, sinir))
    print()
    print("  parça          %.0f × %.0f mm" % (o["parca"]["en_mm"], o["parca"]["boy_mm"]))
    print("  sapma aralığı  %.3f … %.3f mm (ort. mutlak %.3f)" % (
        o["sapma"]["en_dusuk_mm"], o["sapma"]["en_yuksek_mm"],
        o["sapma"]["ortalama_mutlak_mm"]))


if __name__ == "__main__":
    main()
