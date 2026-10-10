#!/usr/bin/env python3
"""Excel faylidan ma'lumot bazasiga ko'chirish.

Ishlatish:
    python db/etl/from_excel.py "Yangi Hisobot 10.10.2026.xlsm" out/

Natija: out/ papkasida har bir jadval uchun CSV va load.sql.
CSV larni psql \\copy bilan yuklaysiz:
    psql $DATABASE_URL -f out/load.sql
"""
import csv
import os
import sys
import uuid
from datetime import date, datetime

import openpyxl

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def uid(*parts) -> str:
    """Bir xil kirish ma'lumotidan har doim bir xil id — qayta yuklasa dublikat bo'lmaydi."""
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def d(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def num(v, default=0):
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    return default


def s(v):
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def add_months(dt: date, n: int) -> date:
    y, m = dt.year + (dt.month - 1 + n) // 12, (dt.month - 1 + n) % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(dt.day, last))


def main(src: str, outdir: str) -> None:
    os.makedirs(outdir, exist_ok=True)
    wb = openpyxl.load_workbook(src, data_only=True)
    K, C, N, T = wb["Kirim"], wb["Chiqim"], wb["Nasiya"], wb["To'lovlar"]
    KD, ID_ = wb["Kassa daftari"], wb["Investor daftari"]

    xodimlar, yetk, investorlar = {}, {}, {}
    qurilmalar, kirimlar, sotuvlar = [], [], []
    mijozlar, shartnomalar, grafik, tolovlar = [], [], [], []
    kassa, inv_har, kurslar = [], [], {}

    def xodim(nom):
        nom = s(nom)
        if not nom:
            return None
        if nom not in xodimlar:
            xodimlar[nom] = uid("xodim", nom)
        return xodimlar[nom]

    def supplier(nom):
        nom = s(nom)
        if not nom:
            return None
        if nom not in yetk:
            yetk[nom] = uid("yetk", nom)
        return yetk[nom]

    def kurs(dt, v):
        v = num(v)
        if dt and v > 0:
            kurslar.setdefault(dt, v)
        return v

    # ---------- Kirim -> qurilmalar + kirimlar
    dev_by_imei = {}
    for r in range(2, K.max_row + 1):
        imei = s(K.cell(r, 3).value)
        dt = d(K.cell(r, 2).value)
        if not imei or not dt:
            continue
        dev = uid("dev", imei)
        dev_by_imei[imei] = dev
        qurilmalar.append([dev, imei, s(K.cell(r, 4).value), s(K.cell(r, 5).value) or "?",
                           s(K.cell(r, 6).value) or "?", s(K.cell(r, 7).value),
                           s(K.cell(r, 8).value), s(K.cell(r, 9).value), s(K.cell(r, 10).value),
                           s(K.cell(r, 11).value), s(K.cell(r, 12).value)])
        kirimlar.append([uid("kirim", imei), dev, dt, num(K.cell(r, 13).value),
                         num(K.cell(r, 14).value) or None, kurs(dt, K.cell(r, 15).value),
                         supplier(K.cell(r, 16).value), xodim(K.cell(r, 17).value),
                         s(K.cell(r, 18).value)])

    # ---------- Chiqim -> sotuvlar
    sale_by_imei = {}
    for r in range(2, C.max_row + 1):
        imei = s(C.cell(r, 3).value)
        dt = d(C.cell(r, 2).value)
        if not imei or not dt or imei not in dev_by_imei:
            continue
        sid = uid("sotuv", imei)
        sale_by_imei[imei] = sid
        turi = "nasiya" if (s(C.cell(r, 13).value) or "").lower().startswith("nasiya") else "naqd"
        sotuvlar.append([sid, dev_by_imei[imei], dt, turi, num(C.cell(r, 17).value),
                         kurs(dt, C.cell(r, 18).value), num(C.cell(r, 14).value),
                         num(C.cell(r, 15).value), num(C.cell(r, 16).value),
                         xodim(C.cell(r, 19).value), s(C.cell(r, 20).value)])

    # ---------- Nasiya -> mijozlar + shartnomalar + grafik
    sh_by_raqam = {}
    for r in range(2, N.max_row + 1):
        imei = s(N.cell(r, 3).value)
        raqam = s(N.cell(r, 2).value)
        dt = d(N.cell(r, 4).value)
        if not imei or not raqam or imei not in sale_by_imei:
            continue
        pnfl = s(N.cell(r, 7).value)
        mid = uid("mijoz", pnfl or raqam)
        mijozlar.append([mid, s(N.cell(r, 5).value) or "?", s(N.cell(r, 6).value), pnfl,
                         d(N.cell(r, 8).value), s(N.cell(r, 9).value), s(N.cell(r, 10).value),
                         s(N.cell(r, 11).value), s(N.cell(r, 13).value), s(N.cell(r, 14).value)])
        shid = uid("shartnoma", raqam)
        sh_by_raqam[raqam] = shid
        muddat = int(num(N.cell(r, 21).value, 1)) or 1
        jami = num(N.cell(r, 24).value)
        oylik = num(N.cell(r, 25).value)
        shartnomalar.append([shid, raqam, sale_by_imei[imei], mid, dt,
                             kurs(dt, N.cell(r, 17).value), num(N.cell(r, 18).value),
                             num(N.cell(r, 19).value), muddat, num(N.cell(r, 22).value, 0.05),
                             num(N.cell(r, 20).value), num(N.cell(r, 23).value), jami, oylik])
        if dt and jami > 0 and oylik > 0:
            qolgan = jami
            for i in range(1, muddat + 1):
                summa = round(min(oylik, qolgan), 2) if i < muddat else round(qolgan, 2)
                if summa <= 0:
                    break
                grafik.append([uid("grafik", raqam, i), shid, i, add_months(dt, i), summa])
                qolgan = round(qolgan - summa, 2)

    # ---------- To'lovlar
    for r in range(2, T.max_row + 1):
        raqam = s(T.cell(r, 3).value)
        dt = d(T.cell(r, 2).value)
        jami = num(T.cell(r, 10).value)
        if not raqam or not dt or jami <= 0 or raqam not in sh_by_raqam:
            continue
        tolovlar.append([uid("tolov", raqam, r), sh_by_raqam[raqam], dt,
                         kurs(dt, T.cell(r, 9).value), num(T.cell(r, 6).value),
                         num(T.cell(r, 7).value), num(T.cell(r, 8).value), jami,
                         s(T.cell(r, 12).value), xodim(T.cell(r, 13).value),
                         s(T.cell(r, 18).value)])

    # ---------- Kassa daftari
    HAMYON = {"naqd uzs": "naqd_uzs", "naqd usd": "naqd_usd",
              "karta (p2p)": "karta", "karta": "karta", "hisob raqam": "hisob_raqam"}
    for r in range(2, KD.max_row + 1):
        dt = d(KD.cell(r, 2).value)
        summa = num(KD.cell(r, 6).value)
        if not dt or summa <= 0:
            continue
        kassa.append([uid("kassa", r), dt,
                      "chiqim" if (s(KD.cell(r, 3).value) or "").lower() == "chiqim" else "kirim",
                      s(KD.cell(r, 4).value) or "Boshqa",
                      HAMYON.get((s(KD.cell(r, 5).value) or "").lower(), "naqd_uzs"),
                      summa, num(KD.cell(r, 7).value) or None,
                      supplier(KD.cell(r, 8).value), s(KD.cell(r, 9).value),
                      xodim(KD.cell(r, 10).value)])

    # ---------- Investor daftari
    for r in range(2, ID_.max_row + 1):
        dt = d(ID_.cell(r, 2).value)
        nom = s(ID_.cell(r, 3).value)
        if not dt or not nom:
            continue
        if nom not in investorlar:
            investorlar[nom] = uid("investor", nom)
        inv_har.append([uid("invhar", r), investorlar[nom], dt, s(ID_.cell(r, 4).value) or "?",
                        s(ID_.cell(r, 5).value) or "?", num(ID_.cell(r, 6).value),
                        num(ID_.cell(r, 7).value) or None, num(ID_.cell(r, 8).value),
                        s(ID_.cell(r, 9).value)])

    tables = [
        ("xodimlar", ["id", "fish"], [[v, k] for k, v in xodimlar.items()]),
        ("yetkazib_beruvchilar", ["id", "nomi"], [[v, k] for k, v in yetk.items()]),
        ("investorlar", ["id", "fish"], [[v, k] for k, v in investorlar.items()]),
        ("kurslar", ["sana", "usd_uzs"], sorted([k, v] for k, v in kurslar.items())),
        ("qurilmalar", ["id", "imei", "imei2", "brend", "model", "xotira", "sim_turi",
                        "rang", "region", "holati", "batareyka"], qurilmalar),
        ("kirimlar", ["id", "qurilma_id", "sana", "tannarx_usd", "prognoz_narx_usd", "kurs",
                      "yetkazib_id", "qabul_qiluvchi_id", "tolov_turi"], kirimlar),
        ("mijozlar", ["id", "fish", "pasport", "pnfl", "tugilgan_sana", "telefon1", "telefon2",
                      "manzil", "icloud_akkaunt", "icloud_raqam"], mijozlar),
        ("sotuvlar", ["id", "qurilma_id", "sana", "turi", "narx_usd", "kurs", "naqd_usd",
                      "naqd_uzs", "karta_uzs", "sotuvchi_id", "kanal"], sotuvlar),
        ("shartnomalar", ["id", "raqam", "sotuv_id", "mijoz_id", "sana", "kurs", "narx_uzs",
                          "boshlangich_uzs", "muddat_oy", "oylik_ustama", "qolgan_uzs",
                          "ustama_uzs", "jami_uzs", "oylik_tolov_uzs"], shartnomalar),
        ("grafik", ["id", "shartnoma_id", "nomer", "muddat_sana", "summa_uzs"], grafik),
        ("tolovlar", ["id", "shartnoma_id", "sana", "kurs", "naqd_usd", "naqd_uzs",
                      "karta_uzs", "jami_uzs", "karta_turi", "undiruvchi_id", "izoh"], tolovlar),
        ("kassa", ["id", "sana", "yonalish", "kategoriya", "hamyon_turi", "summa", "kurs",
                   "yetkazib_id", "izoh", "kiritgan_id"], kassa),
        ("investor_harakatlari", ["id", "investor_id", "sana", "operatsiya", "shakl", "summa",
                                  "kurs", "summa_usd", "izoh"], inv_har),
    ]

    # mijozlar/qurilmalar ro'yxatida takror bo'lishi mumkin — oxirgisini qoldiramiz
    load = ["\\set ON_ERROR_STOP on", "begin;"]
    for name, cols, rows in tables:
        seen, uniq = set(), []
        for row in rows:
            if row[0] in seen:
                continue
            seen.add(row[0])
            uniq.append(row)
        path = os.path.join(outdir, f"{name}.csv")
        with open(path, "w", newline="", encoding="utf8") as f:
            w = csv.writer(f)
            w.writerow(cols)
            w.writerows(uniq)
        load.append(f"\\copy {name} ({', '.join(cols)}) from '{name}.csv' with (format csv, header true)")
        print(f"{name:24} {len(uniq):6d}")
    load.append("commit;")
    with open(os.path.join(outdir, "load.sql"), "w", encoding="utf8") as f:
        f.write("\n".join(load) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "out")
