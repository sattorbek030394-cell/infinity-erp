# Excel'dan ko'chirish

`Yangi Hisobot 10.10.2026.xlsm` faylidagi ma'lumotni bazaga ko'chiradi.

```sh
python tools/excel-import/import.py "Yangi Hisobot 10.10.2026.xlsm" tools/excel-import/out
psql "$DATABASE_URL" -f tools/excel-import/out/load.sql
```

Python 3 va `openpyxl` kerak: `pip install openpyxl`.

## Nimalar ko'chadi

| Excel varag'i | Jadval |
| --- | --- |
| Kirim | `inventory` (+ `suppliers`, `exchange_rates`) |
| Chiqim | `inventory.status = sold` |
| Nasiya | `customers`, `contracts`, `installments` |
| To'lovlar | `payments` |

Kassa daftari va Investor daftari hali ko'chmaydi — ular uchun jadval yo'q.
To'lovlar `cash_entries` ga yozilmaydi, shuning uchun kassa jurnali eski
to'lovlarni ko'rsatmaydi.

## Xavfsizlik

Natija CSV larda **pasport, PNFL, tug'ilgan sana, manzil va telefon** bor.
`out/` papkasi `.gitignore` da. Uni GitHubga yubormang, pochta orqali tashimang.

## Qayta ishga tushirish

Har bir yozuvga mazmunidan kelib chiqib doimiy `uuid` beriladi va `load.sql`
`ON CONFLICT DO NOTHING` ishlatadi. Shuning uchun skriptni bir necha marta
ishga tushirsa bo'ladi — dublikat chiqmaydi. Lekin **o'zgargan yozuv
yangilanmaydi**: Excelda tuzatilgan summa bazaga o'tmaydi.

## Tekshirish

Ko'chirgandan keyin raqamlarni solishtiring. 2026-10-11 holatiga:

| | Excel | Baza |
| --- | --- | --- |
| Shartnoma | 150 | 150 |
| Qurilma | 237 | 237 |
| To'lov | 277 | 277 |
| Jami nasiya | 1 327,0 mln | 1 327,0 mln |
| Ustama | 283,2 mln | 283,2 mln |
| To'langan | 456,7 mln | 456,7 mln |
| Qoldiq | 870,3 mln | 870,3 mln |
| Kechikkan | 59,6 mln | 59,6 mln |

Mos kelmasa — oldinga yurmang.

## Ma'lum farqlar

- **Shartnoma summasi.** Excelda "Jami nasiya" boshlang'ich to'lovsiz. Dasturda
  `total` butun summa: `total = boshlang'ich + asosiy qarz + ustama`.
- **Qurilma identifikatori.** 237 tadan 54 tasi 15 xonali IMEI emas (Apple seriya
  raqami, noutbuk modeli, ikkinchi IMEI). `007_nasiya.sql` shartni yumshatadi.
- **PNFL.** 5 ta yozuvda `0` turibdi — bo'sh deb olinadi, aks holda besh xil
  mijoz bitta yozuvga qo'shilib ketardi.
