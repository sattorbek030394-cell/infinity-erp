# Infinity ERP

Nasiya, ombor va moliyaviy boshqaruv. Hozirgi tizim — Excel fayl (`Yangi Hisobot 10.10.2026.xlsm`,
17 ta varaq, VBA makroslar). Shu repozitoriyada u web dasturga ko'chiriladi.

## Hozirgi holat

Ma'lumot bazasi sxemasi va Excel'dan ko'chirish skripti tayyor va sinovdan o'tgan.
Web interfeys hali yozilmagan.

| Qism | Holat |
| --- | --- |
| Postgres sxemasi (`db/migrations/0001_init.sql`) | Tayyor, Postgres 16 da sinovdan o'tgan |
| Excel → CSV ko'chirish (`db/etl/from_excel.py`) | Tayyor, 150 shartnoma va 277 to'lov yuklandi |
| Xosting va ma'lumot bazasi tanlovi | Hal qilinmagan |
| Web interfeys | Boshlanmagan |

## Ma'lumot bazasi

Postgres 15+. Supabase, Neon yoki o'z serveringizda bir xil ishlaydi.

```bash
psql $DATABASE_URL -f db/migrations/0001_init.sql
```

Excel'dan ma'lumot ko'chirish:

```bash
python db/etl/from_excel.py "Yangi Hisobot 10.10.2026.xlsm" out/
psql $DATABASE_URL -f out/load.sql
```

Skript har bir yozuvga mazmunidan kelib chiqib doimiy `uuid` beradi, shuning uchun
qayta yuklash dublikat yaratmaydi.

### Excel'dan farqlar

Ikkita narsa Excel'ga nisbatan o'zgartirildi, chunki ular hisobni aniqroq qiladi:

1. **`grafik` jadvali.** Excelda to'lov grafigi yo'q edi — kechikish `DATEDIF` bilan
   taxminiy hisoblanardi. Endi har bir shartnomaga aniq to'lov sanalari yoziladi
   (`v_qarzdorlik` ko'rinishi shundan hisoblaydi).
2. **`kurslar` jadvali.** Kurs har bir hujjatda alohida yozilardi; endi kunlik kurs
   bitta joyda turadi.

## Nimadan boshlanadi

Birinchi bosqich — nasiya va to'lovlar: shartnomalar, grafik, qarzdorlar ro'yxati,
to'lov qabul qilish. Excelda eng ko'p vaqt oladigan va eng xatoga moyil qism shu.
Kirim, ombor, kassa va investorlar keyingi bosqichlarda.
