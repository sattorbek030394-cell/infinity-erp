#!/usr/bin/env python3
"""Excel faylidan Infinity ERP bazasiga ko'chirish.

    python tools/excel-import/import.py "Yangi Hisobot 10.10.2026.xlsm" out/
    psql $DATABASE_URL -f out/load.sql

Natija CSV lar MIJOZ MA'LUMOTLARINI o'z ichiga oladi (pasport, PNFL, manzil).
`out/` papkasi .gitignore da — uni hech qachon GitHubga yubormang.

Har bir yozuvga mazmunidan kelib chiqib doimiy uuid beriladi, shuning uchun
skriptni qayta ishga tushirish dublikat yaratmaydi (ON CONFLICT DO NOTHING).
"""
import csv
import os
import re
import sys
import uuid
from datetime import date, datetime

import openpyxl

NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
TENANT = str(uuid.uuid5(NS, "tenant|infinity"))
BRANCH = str(uuid.uuid5(NS, "branch|infinity-1"))


def uid(*p): return str(uuid.uuid5(NS, "|".join(str(x) for x in p)))
def d(v): return v.date() if isinstance(v, datetime) else (v if isinstance(v, date) else None)
def s(v): return (str(v).strip() or None) if v is not None else None
def txt(v): return s(v) or ""


def num(v, default=0):
    return float(v) if isinstance(v, (int, float)) else default


def soum(v):          # butun so'm
    return int(round(num(v)))


def cents(v):         # USD -> sent
    return int(round(num(v) * 100))


def add_months(dt, n):
    y, m = dt.year + (dt.month - 1 + n) // 12, (dt.month - 1 + n) % 12 + 1
    leap = y % 4 == 0 and (y % 100 or y % 400 == 0)
    last = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(dt.day, last))


ID_OK = re.compile(r'^[A-Za-z0-9][A-Za-z0-9/-]{4,31}$')


def main(src, outdir):
    os.makedirs(outdir, exist_ok=True)
    wb = openpyxl.load_workbook(src, data_only=True)
    K, C, N, T = wb["Kirim"], wb["Chiqim"], wb["Nasiya"], wb["To'lovlar"]

    skipped = []
    rates, suppliers = {}, {}
    inventory, customers, contracts, installments, payments = [], [], [], [], []

    def rate(dt, v):
        r = soum(v)
        if dt and r > 0:
            rates.setdefault(dt, r)
        return r

    def supplier(nom):
        nom = s(nom)
        if not nom:
            return None
        suppliers.setdefault(nom, uid("supplier", nom))
        return suppliers[nom]

    # ---------- Kirim -> inventory
    dev = {}
    for r in range(2, K.max_row + 1):
        imei, dt = s(K.cell(r, 3).value), d(K.cell(r, 2).value)
        if not imei or not dt:
            continue
        if not ID_OK.match(imei):
            skipped.append(("Kirim", r, "identifikator shakli yaroqsiz: %r" % imei)); continue
        if imei in dev:
            skipped.append(("Kirim", r, "IMEI takrorlangan: %s" % imei)); continue
        dev[imei] = uid("inv", imei)
        inventory.append([dev[imei], TENANT, BRANCH, imei, txt(K.cell(r, 6).value) or "?",
                          soum(num(K.cell(r, 13).value) * num(K.cell(r, 15).value)), "available",
                          txt(K.cell(r, 5).value), txt(K.cell(r, 7).value), txt(K.cell(r, 9).value),
                          txt(K.cell(r, 10).value), txt(K.cell(r, 11).value), txt(K.cell(r, 12).value),
                          txt(K.cell(r, 4).value), dt, cents(K.cell(r, 13).value),
                          rate(dt, K.cell(r, 15).value) or None, supplier(K.cell(r, 16).value)])

    # ---------- Chiqim -> sotilgan belgisi
    sold, sale_date = set(), {}
    for r in range(2, C.max_row + 1):
        imei, dt = s(C.cell(r, 3).value), d(C.cell(r, 2).value)
        if not imei or not dt or imei not in dev:
            continue
        sold.add(imei); sale_date[imei] = dt
        rate(dt, C.cell(r, 18).value)

    # ---------- Nasiya -> customers + contracts + installments
    sh = {}
    for r in range(2, N.max_row + 1):
        imei, raqam, dt = s(N.cell(r, 3).value), N.cell(r, 2).value, d(N.cell(r, 4).value)
        if not imei or raqam in (None, "") or not dt:
            continue
        if imei not in dev:
            skipped.append(("Nasiya", r, "qurilma Kirimda yo'q: %s" % imei)); continue
        price = soum(N.cell(r, 18).value)
        down = soum(N.cell(r, 19).value)
        principal = soum(N.cell(r, 20).value)
        markup = soum(N.cell(r, 23).value)
        # Excel "Jami nasiya" (X) = principal + markup, boshlang'ich to'lovsiz.
        # Dasturda total - butun shartnoma summasi, boshlang'ich to'lov ham ichida.
        total = down + principal + markup
        months = int(num(N.cell(r, 21).value, 0))
        if total <= 0 or months < 1 or months > 36 or not (0 <= down < price):
            skipped.append(("Nasiya", r, "shartnoma raqamlari yaroqsiz")); continue
        # "0" kabi to'ldiruvchi qiymatlar PNFL emas - ularni bo'sh deb olamiz,
        # aks holda ikki boshqa mijoz bitta yozuvga qo'shilib ketadi
        pnfl = s(N.cell(r, 7).value)
        if pnfl and (len(pnfl) < 5 or len(pnfl) > 20 or set(pnfl) <= {"0"}):
            skipped.append(("Nasiya", r, "PNFL yaroqsiz, bo'sh qoldirildi: %r" % pnfl))
            pnfl = None
        cid = uid("cust", pnfl or ("sh" + str(raqam)))
        customers.append([cid, TENANT, txt(N.cell(r, 5).value) or "?", txt(N.cell(r, 6).value), pnfl,
                          d(N.cell(r, 8).value), txt(N.cell(r, 9).value), txt(N.cell(r, 10).value),
                          txt(N.cell(r, 11).value), txt(N.cell(r, 13).value), txt(N.cell(r, 14).value)])
        kid = uid("contract", raqam)
        sh[str(raqam).strip()] = kid
        contracts.append([kid, TENANT, BRANCH, dev[imei], txt(N.cell(r, 5).value) or "?", total, down,
                          months, dt, int(raqam), cid, cents(N.cell(r, 16).value),
                          rate(dt, N.cell(r, 17).value) or None,
                          int(round(num(N.cell(r, 22).value, 0.05) * 10000)), principal, markup])
        monthly = soum(N.cell(r, 25).value)
        left = total - down        # grafik faqat qolgan summaga tuziladi
        for i in range(1, months + 1):
            amt = min(monthly, left) if i < months else left
            if amt <= 0:
                break
            installments.append([kid, i, add_months(dt, i), amt])
            left -= amt

    # ---------- To'lovlar
    for r in range(2, T.max_row + 1):
        raqam, dt, amt = T.cell(r, 3).value, d(T.cell(r, 2).value), soum(T.cell(r, 10).value)
        key = s(raqam)
        if not key or not dt or amt <= 0:
            continue
        if key not in sh:
            skipped.append(("To'lovlar", r, "shartnoma topilmadi: %s" % key)); continue
        karta = soum(T.cell(r, 8).value)
        payments.append([uid("pay", key, r), TENANT, BRANCH, sh[key], amt,
                         "card" if karta >= amt and karta > 0 else "cash", uid("payreq", key, r), dt])
        rate(dt, T.cell(r, 9).value)

    tables = [
        ("exchange_rates", ["tenant_id", "day", "rate"],
         [[TENANT, k, v] for k, v in sorted(rates.items())], "(tenant_id,day)"),
        ("suppliers", ["id", "tenant_id", "name"],
         [[v, TENANT, k] for k, v in suppliers.items()], "(id)"),
        ("inventory", ["id", "tenant_id", "branch_id", "imei", "model", "cost", "status", "brand",
                       "memory", "color", "region", "condition", "battery", "imei2",
                       "purchase_date", "cost_usd_cents", "cost_rate", "supplier_id"],
         inventory, "(id)"),
        ("customers", ["id", "tenant_id", "full_name", "passport", "pnfl", "birth_date",
                       "phone1", "phone2", "address", "icloud_account", "icloud_phone"],
         customers, "(id)"),
        ("contracts", ["id", "tenant_id", "branch_id", "inventory_id", "customer_label", "total",
                       "down_payment", "months", "start_date", "number", "customer_id",
                       "price_usd_cents", "rate", "monthly_rate_bp", "principal", "markup"],
         contracts, "(id)"),
        ("installments", ["contract_id", "sequence", "due_date", "amount"],
         installments, "(contract_id,sequence)"),
        ("payments", ["id", "tenant_id", "branch_id", "contract_id", "amount", "method",
                      "request_key", "created_at"], payments, "(id)"),
    ]

    load = ["\\set ON_ERROR_STOP on", "begin;",
            "insert into tenants values('%s','Infinity') on conflict do nothing;" % TENANT,
            "insert into branches values('%s','%s','Infinity') on conflict do nothing;" % (BRANCH, TENANT)]
    for name, cols, rows, key in tables:
        seen, uniq = set(), []
        for row in rows:
            k = tuple(row[:2]) if name == "exchange_rates" else (row[0], row[1]) if name == "installments" else row[0]
            if k in seen:
                continue
            seen.add(k); uniq.append(row)
        # Bo'sh matn va NULL ni ajratish uchun NULL o'rniga \\N yoziladi
        with open(os.path.join(outdir, name + ".csv"), "w", newline="", encoding="utf8") as f:
            w = csv.writer(f); w.writerow(cols)
            w.writerows([["\\N" if v is None else v for v in row] for row in uniq])
        load += ["create temp table t_%s (like %s including defaults) on commit drop;" % (name, name),
                 "\\copy t_%s (%s) from '%s.csv' with (format csv, header true, null '\\N')"
                 % (name, ", ".join(cols), name),
                 "insert into %s (%s) select %s from t_%s on conflict %s do nothing;"
                 % (name, ", ".join(cols), ", ".join(cols), name, key)]
        print("%-16s %6d" % (name, len(uniq)))
    load.append("update inventory set status='sold' where id in (select inventory_id from contracts);")
    load.append("commit;")
    with open(os.path.join(outdir, "load.sql"), "w", encoding="utf8") as f:
        f.write("\n".join(load) + "\n")

    if skipped:
        print("\nO'tkazib yuborilgan %d qator:" % len(skipped))
        for sheet, r, why in skipped[:20]:
            print("   %-10s %-5d %s" % (sheet, r, why))
        with open(os.path.join(outdir, "otkazilgan.csv"), "w", newline="", encoding="utf8") as f:
            w = csv.writer(f); w.writerow(["varaq", "qator", "sabab"]); w.writerows(skipped)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "out")
