# Haqiqiy ma'lumot bilan ishga tushirish

Bir marta qilinadigan ish: kompyuteringizda dastur ishga tushadi, Excel'dagi
150 shartnoma va 277 to'lov bazaga ko'chadi, uchta odam kira oladigan bo'ladi.

Taxminan 30–40 daqiqa, shundan ko'pi dastur o'rnatishga ketadi.

## Kerak bo'ladigan narsalar

| | Nima uchun | Qayerdan |
| --- | --- | --- |
| Node.js 22 yoki undan yangi | dastur shunda ishlaydi | nodejs.org, LTS versiya |
| PostgreSQL 17 | ma'lumot bazasi | postgresql.org/download/windows |
| Python 3 | Excel'dan ko'chirish skripti | python.org, "Add to PATH" ni belgilang |

O'rnatishda PostgreSQL `postgres` foydalanuvchisiga parol so'raydi — uni yozib
qo'ying, keyin kerak bo'ladi.

## 1. Baza yaratish

PostgreSQL bilan birga kelgan **SQL Shell (psql)** ni oching va:

```sql
CREATE DATABASE infinity;
CREATE USER erp WITH PASSWORD 'o''zingiz_tanlagan_parol';
GRANT ALL ON DATABASE infinity TO erp;
\c infinity
GRANT ALL ON SCHEMA public TO erp;
```

## 2. Dasturni yuklash va sozlash

```sh
git clone https://github.com/sattorbek030394-cell/infinity-erp
cd infinity-erp
npm ci
pip install openpyxl
```

`.env.example` nusxasini `.env.local` deb saqlang va ichini to'ldiring:

```
DATABASE_URL=postgresql://erp:o'zingiz_tanlagan_parol@localhost:5432/infinity
APP_ORIGIN=http://localhost:3000
DEMO_PASSWORD=
```

`DEMO_PASSWORD` bo'sh qolsin — sun'iy ma'lumot bilan ishlamaymiz.

## 3. Jadvallarni yaratish

```sh
npm run migrate
```

`npm run seed` ni **ishga tushirmang** — u sun'iy do'kon va qurilmalar yaratadi.

## 4. Excel'dan ko'chirish

Excel faylni loyiha papkasiga qo'ying, keyin:

```sh
python tools/excel-import/import.py "Yangi Hisobot 10.10.2026.xlsm" tools/excel-import/out
psql "postgresql://erp:parol@localhost:5432/infinity" -f tools/excel-import/out/load.sql
```

Ekranda shu chiqishi kerak:

```
exchange_rates      147
suppliers            56
inventory           237
customers           140
contracts           150
installments        751
payments            277
```

## 5. Foydalanuvchilar

`tools/excel-import/users.sql` ni oching, yuqoridagi uchta parolni
o'zgartiring (har biri kamida 12 belgi), keyin:

```sh
psql "postgresql://erp:parol@localhost:5432/infinity" -f tools/excel-import/users.sql
```

Oxirida kim qaysi filialga kirishi ko'rsatiladi. Shundan keyin fayldagi
parollarni `CHANGE_ME_12+` ga qaytarib qo'ying.

## 6. Ishga tushirish

```sh
npm run dev
```

Brauzerda `http://localhost:3000` ni oching, `sattorbek@infinity.uz` va
o'zingiz qo'ygan parol bilan kiring.

Telefondan ochish uchun kompyuteringizning lokal IP manzilini toping
(`ipconfig`) va telefonda `http://192.168.x.x:3000` ni oching. Ikkalasi bir xil
Wi-Fi da bo'lsin. Buning uchun `.env.local` da `APP_ORIGIN` ni ham o'sha
manzilga o'zgartiring, aks holda to'lov saqlanmaydi.

## 7. Raqamlarni solishtirish

Birinchi kirganda Dashboard'da shu raqamlar bo'lishi kerak:

| | Qiymat |
| --- | --- |
| Ombordagi qurilmalar | 87 |
| Nasiya qoldig'i | 870 270 796 UZS |
| Olingan nasiya to'lovlari | 1 005 715 244 UZS |
| Qarzdorlar bo'limi | 37 ta shartnoma, 59,6 mln so'm kechikkan |

Mos kelmasa — to'xtang va sababini toping.

## Nimaga ishonish mumkin, nimaga hali yo'q

Ma'lumot qatlami haqiqiy Postgres'da to'liq tekshirilgan: yettita migratsiya
ketma-ket o'tadi, 150 shartnoma to'liq ko'chadi, dasturning o'z so'rovlari
to'g'ri raqam qaytaradi, `users.sql` ni ikki marta ishga tushirsa dublikat
chiqmaydi.

**Ekranlar hali haqiqiy ma'lumot bilan ochib ko'rilmagan** — ishlab chiqish
muhitida `npm` paketlari yuklanmadi. Birinchi ochganingizda bir-ikki joyda
xato chiqishi mumkin; skrinshot yuboring, tuzataman.

Shartnoma tuzish ekrani to'liq ishlaydi:

- **Ustama o'zi hisoblanadi.** Narx, boshlang'ich, muddat va oylik foizni
  kiritganda asosiy qarz, ustama, jami va oylik to'lov darhol ekranda
  ko'rinadi — mijozga aytiladigan summa shu. Bazaga ham shu yoziladi.
- **Mijoz kartochkasi.** F.I.Sh., PNFL, pasport (kim va qachon bergani),
  tug'ilgan sana, ikki telefon, manzil va iCloud maydonlari bor. PNFL bir xil
  bo'lsa, mijoz ikkinchi marta telefon olganda yangi kartochka ochilmaydi.
- **Shartnomani chop etish.** Shartnoma sahifasida "N - sonli shartnomani
  chop etish" havolasi bor: brauzerda ochiladi, Ctrl+P bilan chop etiladi
  yoki PDF qilib saqlanadi. Matn Excel'dagi "Shartnoma (yangi)" varag'idan
  so'zma-so'z olingan.

### To'lovni tasdiqlash — kundalik ishda eng muhim o'zgarish

Endi to'lov darhol hisobga kirmaydi:

- **Naqd pulni kassir** o'zi tasdiqlaydi — u pulni sanab oldi, javobgarligi
  auditda qoladi. Shuning uchun kassir kiritgan naqd to'lov darhol qarzni
  kamaytiradi.
- **P2P karta va bank tushumini faqat rahbar** tasdiqlaydi. Kassir kiritadi,
  "Tasdiq kutayotgan" ekranida turadi: **qarzni kamaytirmaydi va kassa
  qoldig'iga kirmaydi.** Siz pulning haqiqatan kelganini tekshirib
  "Tasdiqlash" bosganda hisobga kiradi.
- Rad etishda sabab majburiy. Rad etilgan tushum hisobda yo'q, lekin tarixda
  qoladi.
- Tasdiq kutayotgan tushumni bekor qilib bo'lmaydi — u rad etiladi.

Shu sababli har kuni **"Tasdiq kutayotgan"** bo'limini ko'rib chiqing: u
yerda turgan pul hali hisobda yo'q.

Rollar: Administrator, Rahbar, Kassir, Sotuvchi, Omborchi, Undiruvchi,
Hisobchi, Faqat ko'rish. Sozlamalar ekranida xodimga rol beriladi. Hozir
administrator rahbar huquqini ham oladi (do'kon egasi ikkala vazifani
bajaradi) — alohida rahbar kerak bo'lsa aytasiz, bir qatorda ajratiladi.

Hali yo'q:

- **Kirim (ombor) maydonlari formada.** Brend, xotira, rang, holat, batareya,
  yetkazib beruvchi — bazada bor, ekranda hali yo'q.
- **Kassa daftari va investorlar** Excel'dan ko'chmaydi.
- **Hisobot ekrani.** Plan–fakt va 12 oylik jadval hozircha Excelda.

Shuning uchun birinchi hafta Excel'ni yopmang: dasturda tuzgan shartnomani
Excelga ham kiriting va raqamlarni solishtirib turing.
