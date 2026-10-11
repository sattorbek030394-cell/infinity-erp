#!/usr/bin/env python3
"""Excel faylidan Infinity ERP bazasiga ko'chirish — varaq tanlab.

    python tools/excel-import/import.py "Yangi Hisobot.xlsm" --list
    python tools/excel-import/import.py "Yangi Hisobot.xlsm" out --sheets Kirim,Nasiya,To'lovlar
    psql $DATABASE_URL -f out/load.sql

Hech bir varaq avtomatik tanlanmaydi (TZ 10.1): `--sheets` ko'rsatilmasa
skript varaqlar ro'yxatini chiqarib to'xtaydi. Tanlanmagan varaqdan yozuv
yaratilmaydi.

Bog'liq ma'lumot bazada allaqachon bo'lsa, tegishli varaqni yana tanlash
shart emas: `load.sql` bog'lanishi topilmagan qatorlarni o'tkazib yuboradi
va sonini aytadi ("Shartnoma topilmadi" o'rniga jim import qilmaydi).

Natija CSV lar MIJOZ MA'LUMOTLARINI o'z ichiga oladi (pasport, PNFL, manzil).
`out/` papkasi .gitignore da — uni hech qachon GitHubga yubormang.

Har bir yozuvga mazmunidan kelib chiqib doimiy uuid beriladi, shuning uchun
skriptni qayta ishga tushirish dublikat yaratmaydi (ON CONFLICT DO NOTHING).
"""
import argparse
import csv
import hashlib
import os
import re
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

# Varaq -> (vazifasi, import qilinadimi, bog'liq varaqlar)
SHEETS = {
    "Kirim": ("Qurilmalar, tannarx, yetkazib beruvchilar va kurs", True, []),
    "Chiqim": ("Sotuv sanasi va kursi (qurilma holatini belgilaydi)", True, ["Kirim"]),
    "Nasiya": ("Shartnomalar, mijozlar va to'lov jadvali", True, ["Kirim"]),
    "To'lovlar": ("Mijozlarning nasiya to'lovlari", True, ["Nasiya"]),
    "Kassa": ("Hamyonlarning boshlang'ich qoldig'i va hisob sanasi", True, []),
    "Kassa daftari": ("Pul harakatlari: xarajat va boshqa kirimlar", True, ["Kassa"]),
    "Shartnoma (yangi)": ("Shartnoma shabloni — ma'lumot emas", False, []),
    "Yangi nasiya": ("Kiritish formasi — ma'lumot emas", False, []),
    "Anketa arxivi": ("Shartnoma nusxalari (hali ko'chirilmaydi)", False, []),
    "Ombor": ("Hisoblangan ko'rinish — Kirim va Chiqimdan chiqadi", False, []),
    "Qarzdorlar": ("Hisoblangan ko'rinish — Nasiya va To'lovlardan chiqadi", False, []),
    "Hisobot": ("Hisoblangan ko'rinish", False, []),
    "Baza": ("Ichki hisob qatlami", False, []),
    "Yetkazib beruvchilar": ("Hisoblangan ko'rinish — Kirimdan chiqadi", False, []),
    "Investorlar": ("Investor moduli dasturda hali yo'q", False, []),
    "Investor daftari": ("Investor moduli dasturda hali yo'q", False, []),
    "Investor foyda": ("Investor moduli dasturda hali yo'q", False, []),
}
WALLETS = {
    "Naqd UZS": "cash_uzs",
    "Naqd USD": "cash_usd",
    "Karta (P2P)": "card_uzs",
    "Karta": "card_uzs",
    "Hisob raqam": "bank_uzs",
}


def ro_yxat(wb):
    """TZ 10.1: fayl tanlangach varaqlar, vazifasi va yaroqliligi ko'rinadi."""
    print("%-22s %-8s %-10s %s" % ("Varaq", "Qator", "Import", "Vazifasi"))
    for name in wb.sheetnames:
        vazifa, mumkin, dep = SHEETS.get(name, ("Noma'lum varaq", False, []))
        ws = wb[name]
        qator = max(0, ws.max_row - 1)
        belgi = "ha" if mumkin else "yo'q"
        if dep:
            vazifa += " (bog'liq: %s)" % ", ".join(dep)
        print("%-22s %-8d %-10s %s" % (name[:22], qator, belgi, vazifa))
    print("\nTanlash: --sheets \"Kirim,Nasiya,To'lovlar\"")


def main(src, outdir, tanlangan):
    os.makedirs(outdir, exist_ok=True)
    wb = openpyxl.load_workbook(src, data_only=True)
    # Faylning hash'i: qaysi fayldan ko'chirilgani yozuvda qolsin.
    with open(src, "rb") as f:
        fayl_hash = hashlib.sha256(f.read()).hexdigest()[:16]
    tanlangan = set(tanlangan)
    for name in tanlangan:
        if name not in wb.sheetnames:
            raise SystemExit("Bu faylda '%s' varag'i yo'q" % name)
        if not SHEETS.get(name, ("", False, []))[1]:
            raise SystemExit(
                "'%s' varag'i import qilinmaydi: %s"
                % (name, SHEETS.get(name, ("noma'lum",))[0]))
    bos = lambda name: wb[name] if name in tanlangan else None
    K, C, N, T = (bos("Kirim"), bos("Chiqim"), bos("Nasiya"), bos("To'lovlar"))
    KS, KD = bos("Kassa"), bos("Kassa daftari")

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
    for r in range(2, (K.max_row + 1) if K else 2):
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
    sold, sale_date, sotuvchi, kanal = set(), {}, {}, {}
    for r in range(2, (C.max_row + 1) if C else 2):
        imei, dt = s(C.cell(r, 3).value), d(C.cell(r, 2).value)
        if not imei or not dt or imei not in dev:
            continue
        sold.add(imei); sale_date[imei] = dt
        # Sotuvchi va kanal shartnomaga yoziladi (TZ SALE-01).
        sotuvchi[imei] = txt(C.cell(r, 19).value)[:80]
        kanal[imei] = txt(C.cell(r, 20).value)[:40]
        rate(dt, C.cell(r, 18).value)

    # ---------- Nasiya -> customers + contracts + installments
    sh = {}
    for r in range(2, (N.max_row + 1) if N else 2):
        imei, raqam, dt = s(N.cell(r, 3).value), N.cell(r, 2).value, d(N.cell(r, 4).value)
        if not imei or raqam in (None, "") or not dt:
            continue
        if imei not in dev:
            # Kirim tanlanmagan bo'lsa qurilma bazada bo'lishi mumkin:
            # bog'lanishni load.sql tekshiradi va topilmasa o'tkazadi.
            if K is not None:
                skipped.append(("Nasiya", r, "qurilma Kirimda yo'q: %s" % imei)); continue
            dev[imei] = uid("inv", imei)
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
                          int(round(num(N.cell(r, 22).value, 0.05) * 10000)), principal, markup,
                          sotuvchi.get(imei, ""), kanal.get(imei, "")])
        monthly = soum(N.cell(r, 25).value)
        left = total - down        # grafik faqat qolgan summaga tuziladi
        for i in range(1, months + 1):
            amt = min(monthly, left) if i < months else left
            if amt <= 0:
                break
            installments.append([kid, i, add_months(dt, i), amt])
            left -= amt

    # ---------- To'lovlar
    for r in range(2, (T.max_row + 1) if T else 2):
        raqam, dt, amt = T.cell(r, 3).value, d(T.cell(r, 2).value), soum(T.cell(r, 10).value)
        key = s(raqam)
        if not key or not dt or amt <= 0:
            continue
        if key not in sh:
            if N is not None:
                skipped.append(("To'lovlar", r, "shartnoma topilmadi: %s" % key)); continue
            sh[key] = uid("contract", int(float(key)) if str(key).replace(".", "").isdigit() else key)
        karta = soum(T.cell(r, 8).value)
        payments.append([uid("pay", key, r), TENANT, BRANCH, sh[key], amt,
                         "card" if karta >= amt and karta > 0 else "cash", uid("payreq", key, r), dt])
        rate(dt, T.cell(r, 9).value)

    # ---------- Kassa -> hamyonlarning boshlang'ich qoldig'i
    wallets_rows = []
    if KS is not None:
        bosh_sana = d(KS.cell(3, 4).value)
        for r in range(4, 8):
            nom = txt(KS.cell(r, 6).value)
            w = WALLETS.get(nom)
            if not w or not bosh_sana:
                continue
            miqdor = KS.cell(r, 4).value
            wallets_rows.append([TENANT, BRANCH, w, bosh_sana,
                                 cents(miqdor) if w == "cash_usd" else soum(miqdor)])

    # ---------- Kassa daftari -> pul harakatlari
    cash_ops, cash_rows = [], []
    if KD is not None:
        for r in range(2, KD.max_row + 1):
            dt, tur = d(KD.cell(r, 2).value), txt(KD.cell(r, 3).value)
            w = WALLETS.get(txt(KD.cell(r, 5).value))
            if not dt or not w or tur not in ("Kirim", "Chiqim"):
                continue
            xom = KD.cell(r, 6).value
            miqdor = cents(xom) if w == "cash_usd" else soum(xom)
            if miqdor <= 0:
                skipped.append(("Kassa daftari", r, "summa nol yoki manfiy")); continue
            op = uid("cashop", fayl_hash, r)
            cash_ops.append([op, TENANT, BRANCH, "excel|%s|%d" % (fayl_hash, r)])
            izoh = " ".join(x for x in [txt(KD.cell(r, 9).value),
                                        txt(KD.cell(r, 8).value),
                                        txt(KD.cell(r, 10).value)] if x)[:160]
            cash_rows.append([uid("cash", fayl_hash, r), TENANT, BRANCH, w, dt,
                              miqdor if tur == "Kirim" else -miqdor,
                              txt(KD.cell(r, 4).value) or "Boshqa xarajat",
                              izoh, op])
            rate(dt, KD.cell(r, 7).value)

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
                       "price_usd_cents", "rate", "monthly_rate_bp", "principal", "markup",
                       "seller", "channel"],
         contracts, "(id)"),
        ("installments", ["contract_id", "sequence", "due_date", "amount"],
         installments, "(contract_id,sequence)"),
        ("payments", ["id", "tenant_id", "branch_id", "contract_id", "amount", "method",
                      "request_key", "created_at"], payments, "(id)"),
        ("cash_wallets", ["tenant_id", "branch_id", "wallet", "opening_date", "opening_minor"],
         wallets_rows, "(tenant_id,branch_id,wallet)"),
        ("cash_operations", ["id", "tenant_id", "branch_id", "input_hash"],
         cash_ops, "(id)"),
        ("cash_entries", ["id", "tenant_id", "branch_id", "wallet", "entry_date",
                          "amount_minor", "category", "note", "operation_id"],
         cash_rows, "(id)"),
    ]

    # Bog'liqlik tekshiruvi: bog'lanishi topilmagan qator import qilinmaydi
    # va soni aytiladi (TZ 10.1 - jim import qilinmaydi).
    DEPS = {
        "contracts": [
            ("exists(select 1 from inventory i where i.id=t.inventory_id)",
             "qurilma bazada topilmadi"),
            ("exists(select 1 from customers m where m.id=t.customer_id)",
             "mijoz bazada topilmadi"),
        ],
        "installments": [
            ("exists(select 1 from contracts c where c.id=t.contract_id)",
             "shartnoma bazada topilmadi"),
        ],
        "payments": [
            ("exists(select 1 from contracts c where c.id=t.contract_id)",
             "shartnoma bazada topilmadi"),
        ],
    }
    # cash_entries ga muallif kerak: bazadagi administrator yoziladi.
    MUALLIF = ("(select u.id from users u join memberships m on m.user_id=u.id "
               "where m.tenant_id='%s' and m.role='admin' order by u.email limit 1)" % TENANT)
    EXTRA = {"cash_entries": [("user_id", MUALLIF)]}

    load = ["\\set ON_ERROR_STOP on", "begin;",
            "insert into tenants values('%s','Infinity') on conflict do nothing;" % TENANT,
            "insert into branches values('%s','%s','Infinity') on conflict do nothing;" % (BRANCH, TENANT)]
    if cash_rows:
        load += [
            "do $$ begin if not exists(select 1 from users u join memberships m on"
            " m.user_id=u.id where m.tenant_id='%s' and m.role='admin') then"
            " raise exception 'Avval users.sql ni ishga tushiring: kassa yozuviga muallif kerak';"
            " end if; end $$;" % TENANT,
            "insert into cash_wallets(tenant_id,branch_id,wallet) select '%s','%s',w"
            " from unnest(array['cash_uzs','cash_usd','card_uzs','bank_uzs']) w"
            " on conflict do nothing;" % (TENANT, BRANCH),
        ]
    for name, cols, rows, key in tables:
        if not rows:
            continue
        seen, uniq = set(), []
        for row in rows:
            k = tuple(row[:2]) if name in ("exchange_rates", "installments") else \
                tuple(row[:3]) if name == "cash_wallets" else row[0]
            if k in seen:
                continue
            seen.add(k); uniq.append(row)
        # Bo'sh matn va NULL ni ajratish uchun NULL o'rniga \N yoziladi
        with open(os.path.join(outdir, name + ".csv"), "w", newline="", encoding="utf8") as f:
            w = csv.writer(f); w.writerow(cols)
            w.writerows([["\\N" if v is None else v for v in row] for row in uniq])
        deps = DEPS.get(name, [])
        extra = EXTRA.get(name, [])
        allcols = cols + [c for c, _ in extra]
        allvals = ["t." + c for c in cols] + [e for _, e in extra]
        where = (" where " + " and ".join(c for c, _ in deps)) if deps else ""
        load += ["create temp table t_%s (like %s including defaults) on commit drop;" % (name, name),
                 "\\copy t_%s (%s) from '%s.csv' with (format csv, header true, null '\\N')"
                 % (name, ", ".join(cols), name),
                 "insert into %s (%s) select %s from t_%s t%s on conflict %s do nothing;"
                 % (name, ", ".join(allcols), ", ".join(allvals), name, where, key)]
        for cond, label in deps:
            load.append("select count(*) as \"%s: %s\" from t_%s t where not %s;"
                        % (name, label, name, cond))
        print("%-16s %6d" % (name, len(uniq)))
    if sold or contracts:
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
    ap = argparse.ArgumentParser(description="Excel -> Infinity ERP (varaq tanlab)")
    ap.add_argument("fayl")
    ap.add_argument("outdir", nargs="?", default="out")
    ap.add_argument("--list", action="store_true", help="varaqlar ro'yxatini ko'rsatish")
    ap.add_argument("--sheets", default="", help="vergul bilan: Kirim,Nasiya,To'lovlar")
    a = ap.parse_args()
    kitob = openpyxl.load_workbook(a.fayl, data_only=True, read_only=True)
    if a.list or not a.sheets.strip():
        ro_yxat(kitob)
        if not a.list:
            raise SystemExit("\nVaraq tanlanmadi: --sheets bilan tanlang.")
        raise SystemExit(0)
    main(a.fayl, a.outdir, [x.strip() for x in a.sheets.split(",") if x.strip()])
