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

### Qarzni muddatidan oldin yopish

Mijoz qarzni bir yo'la yopmoqchi bo'lsa, shartnoma sahifasida
**"Yopish hisobini olish"** ni bosing. Ekranda ko'rinadi: joriy qarz,
o'tgan to'liq oylar, saqlanadigan ustama, **avtomatik olib tashlanadigan
ustama** va yakuniy summa. Kelgusi oylarning to'lanmagan ustamasi o'zi
olib tashlanadi — alohida chegirma tasdig'i kerak emas.

Hisob **shu kun uchun** amal qiladi. Mijoz shu summani to'laydi (odatdagi
to'lov ekrani, tasdiq tartibi bilan), keyin "Yopishni yakunlash" bosiladi.
Tasdiqlanmagan tushum bilan shartnoma yopilmaydi.

Yopilganlar **"Erta yopilgan"** bo'limida: qancha ustamadan voz
kechganingiz jami bo'lib ko'rinadi. To'lovni keyin bekor qilsangiz yopish
ham teskari qiladi va qarz qaytadi.

### Ortiqcha to'lov va dollar

- Mijoz qarzdan **ortiq** bergan bo'lsa, to'lov rad etilmaydi: ortiqcha
  qism "mijoz avansi" bo'lib turadi, qarz esa manfiy ko'rsatilmaydi.
- **Naqd USD** to'lovida dollar summasi va kurs kiritiladi, so'mga
  o'tkazilgan summa darhol ekranda ko'rinadi. Kursi yo'q USD to'lov
  saqlanmaydi. Naqd USD hamyoniga dollar tushadi, so'm emas.

### To'lov eslatmasi

"Qarzdorlar" bo'limida har mijoz uchun **"Eslatma matni"** tugmasi bor:
matn tayyor bo'ladi va bir bosishda nusxalanadi — Telegram yoki SMS ga
qo'yib yuborasiz. Telefon raqami yonida, bosilsa qo'ng'iroq qiladi.

### Nasiya berish qarori

Shartnoma tuzishda dastur mijozni tekshiradi:

- **Qora ro'yxat.** Shartnoma sahifasidagi mijoz kartochkasidan mijozni
  qora ro'yxatga qo'shasiz (sabab majburiy). Unga yangi nasiya berilmaydi;
  eski shartnomalari o'z holicha qoladi.
- **Limit.** Bir mijozda ko'pi bilan **2 ta faol shartnoma** va **25 mln
  so'm jami qarz**. Oshsa, rahbar sabab yozib o'tkazadi va shartnomada kim
  ruxsat bergani qoladi. **40 mln** dan oshishga hech kim ruxsat bermaydi.
  Bu raqamlar sizning 150 shartnomangiz tahlilidan chiqdi — tafsiloti
  `docs/TZ_TAKLIFLAR.md` da. Kerak bo'lsa `nasiya_settings` jadvalidan
  o'zgartiriladi.
- Tekshiruv **PNFL bo'yicha** ishlaydi: PNFL yozilmasa mijoz yangi deb
  qabul qilinadi.

### Qurilma nazorati (iCloud / MDM)

Shartnoma sahifasida "Qurilma nazorati" bo'limi: nazoratga olindi →
bloklandi → ochildi → nazoratdan chiqarildi. Har qaror kim, qachon, nega,
qanday kechikishda va qancha qarzda qabul qilganini saqlaydi.

Qarz yopilgach nazoratni ochish majburiy: Dashboardda **"Nazorat
ochilmagan"** soni chiqadi.

⚠️ Bloklash huquqi shartnoma matnida yozilgan bo'lishi kerak. Hozirgi
shartnoma matnida bu band bormi — yurist bilan tekshiring.

### Undiruvchi qo'lidagi pul

Undiruvchi mijoz uyida naqd olsa, pul **kassirga topshirilmaguncha**
hisobga kirmaydi: Dashboardda "Undiruvchi qo'lida" summasi ko'rinadi.
Kassir tasdiqlaganda kassaga tushadi.

### Kechikish guruhlari va zaxira

"Qarzdorlar" bo'limida 1–30, 31–60, 61–90 va 91+ kunlik guruhlar hamda
**5% zaxira** ko'rsatkichi. Zaxira — portfeldan kutilayotgan qaytmaydigan
qarz; hisob yozuvi emas, ogohlantirish. Kechikish uchun **jarima yo'q**.

### Kirim (ombor)

Kirim formasida Excel'dagi barcha maydonlar bor: brend, model, xotira, SIM
turi, rang, region, holat (Yangi / B/U / Trade-in), batareyka foizi, ikkinchi
IMEI, kirim sanasi, yetkazib beruvchi, qabul qiluvchi va to'lov turi.

Tannarxni **dollarda** kiriting va kirim kursini yozing — so'mdagi qiymat
darhol ko'rinadi va ikkisi ham saqlanadi (foyda hisobi kirim kursiga
tayanadi). Faqat so'mda ishlaydigan tovar uchun "tannarx UZS" maydoni bor.

IMEI endi 15 raqam bo'lishi shart emas: Apple seriya raqami (J4RMVWVXVV)
va noutbuk modeli (15-fd0366nia) ham o'tadi.

To'lov turi hozircha faqat qayd etiladi — kassadan pul chiqishi va yetkazib
beruvchi qarzi keyingi paketda ulanadi.

Hali yo'q:

- **Aksessuar va xizmat sotuvi** (chexol, oyna, remont) — model hozircha
  faqat IMEI'li qurilmani biladi.
- **Kafil, minimal sotuv narxi va sotuvchi bonusi** — qaror kutilmoqda.
- **Kassa daftari va investorlar** Excel'dan ko'chmaydi.
- **Hisobot ekrani.** Plan–fakt va 12 oylik jadval hozircha Excelda.

Shuning uchun birinchi hafta Excel'ni yopmang: dasturda tuzgan shartnomani
Excelga ham kiriting va raqamlarni solishtirib turing.
