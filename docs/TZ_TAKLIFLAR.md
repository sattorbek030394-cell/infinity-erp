# Texnik topshiriqqa takliflar (v1.1 ga)

Hujjat: `INFINITY ERP — batafsil texnik topshiriq`, v1.1, 11.10.2026.
Ko'rib chiqildi: 11.10.2026, mavjud kod bilan solishtirilgan.

## 1. Topshiriqda to'g‘ri qo'yilgan joylar

Hisoblash misollari **ichidan izchil** — tekshirdim: 11.1-bo'limdagi shartnoma
(1000 USD, kurs 12 000, boshlang'ich 3,6 mln, 6 oy, 5%) va AT-28 dagi erta
yopish raqamlari bir-biriga aniq mos keladi (D = 8,4 mln; M = 2,52 mln;
2 oydan keyin B = 7,28 mln; I_paid = I_accrued = 840 000; C = 1,68 mln;
S = 5,6 mln). Shuning uchun bu misollarni dasturchi test sifatida ishlatsa
bo'ladi.

Eng muhim uchta qoida ham to'g'ri qo'yilgan: qarz faqat nolda yopiladi
(100 000 so'mlik chegara olib tashlangan), tasdiqlangan moliyaviy hujjat
o'chirilmaydi, va huquq serverda tekshiriladi.

## 2. Mavjud kod bilan ziddiyatlar

| Topshiriq | Kodda nima bo'lgan | Holat |
|---|---|---|
| 4.3 / AT-07: yaxlitlash tafovuti **oxirgi** to'lovga tushadi (100 so'm 3 oyga 33+33+34) | Tafovut **birinchi** oylarga tushardi (34+33+33) | **Tuzatildi** |
| 5-bo'lim: 8 rol | 3 rol bor edi (admin, kassir, ko'ruvchi) | **Tuzatildi** (009 migratsiya + huquq jadvali) |
| PAY-04 / AT-11: qarzdan ortiq to'lov qabul qilinadi, ortig'i avans bo'ladi | Hozir ortiqcha to'lov butunlay rad etiladi | Ochiq — PAY moduli bilan |
| 4.4 / PAY-02 / AT-10: USD to'lov + to'lov kursi | To'lov faqat UZS; USD qismi yo'q | Ochiq — PAY moduli bilan |
| 10.1: **varaqlarni tanlab** import | Import skripti hamma varaqni birdan oladi (CLI) | Ochiq — WP-4 |
| 4.2: muddat 1–12 oy | Bazada 1–36 oy, filial sozlamasida {3,6,8,10,12} | Bir joyga keltirish kerak |

## 3. Qo'shish kerak — biznes uchun muhim

Topshiriq hisob-kitobni juda yaxshi yozgan, lekin **nasiya biznesining
asosiy xavfi — qaytmaydigan qarz — hujjatda deyarli yo'q.** Quyidagilar
muhimlik tartibida.

### 3.1. Nasiya berish qarori (yangi modul: SALE-04 / CRM-04)

Hozir topshiriqda "mijoz tanlanadi → hisoblanadi → tasdiqlanadi". Kim
nasiya **berish** qarorini qabul qiladi degan savol yo'q. Kerak:

- **Qora ro'yxat:** ilgari qarzini qaytarmagan yoki telefoni qaytarib
  olingan mijoz. PNFL bo'yicha tekshirish majburiy, natija shartnomada
  saqlanadi.
- **Mijoz limiti:** bir mijozda bir vaqtda nechta faol shartnoma va
  jami qancha qarz bo'lishi mumkin.
- **Kafil (zaminchi):** topshiriqda umuman yo'q. Amalda ko'p do'kon kafil
  oladi — kafilning F.I.Sh., pasporti, telefoni va imzosi shartnoma
  qo'shimchasi bo'ladi. Model darajasida `contract_guarantors` kerak.
- **Qaror huquqi:** yangi mijozga yoki limitdan oshsa rahbar tasdig'i.

### 3.2. Qurilma nazorati — iCloud/MDM (yangi modul: DEV)

Topshiriqda iCloud "ixtiyoriy operatsion rekvizit". Amalda bu **undirishning
asosiy vositasi.** Kerak:

- Qurilmaning nazorat holati: iCloud/MDM o'rnatilgan / yo'q / olib
  tashlangan; kim o'rnatdi, qachon.
- **Bloklash hujjati:** sabab (necha kun kechikish), kim qaror qildi, qachon
  bloklandi, qachon ochildi. Bloklash — qaror, tugma emas.
- Shartnoma yopilganda **nazoratni ochish majburiyati**: yopilgan, lekin
  ochilmagan qurilmalar ro'yxati.
- Huquqiy jihat: bloklash shartnomada ko'rsatilgan bo'lishi kerak, aks holda
  mijoz bilan muammo chiqadi. Shartnoma matniga band qo'shilishini
  yuristdan so'rash.

### 3.3. Qaytmaydigan qarz va zarar (yangi bo'lim: 4.5)

Topshiriqda 91+ kun guruhi bor, lekin keyin nima bo'lishi yozilmagan:

- Kechikish guruhi bo'yicha **zaxira foizi** (masalan 91+ kun uchun N%) —
  foydani haqiqatga yaqin ko'rsatish uchun.
- **Hisobdan chiqarish hujjati:** kim, qachon, qancha, sababi; foydaga
  ta'siri ko'rinadi.
- **Telefonni qaytarib olish:** qurilma qaytdi → tekshiruv → qayta sotuv.
  Hisob-kitob: qolgan qarz − qayta sotuvdan tushgan pul = qoldiq zarar
  (yoki mijozga qaytariladigan summa). Hozir bu zanjir hech qayerda yo'q.
- Shartnoma bekor qilinganda qurilma qaytmasa — nima bo'ladi.

### 3.4. Kechikish uchun jarima (penya)

Topshiriqda penya haqida bir og'iz ham yo'q. Ikkitasidan bittasi yozilishi
kerak: "penya yo'q" (shunda hisobot ham shunday) yoki penya bor — qanday
hisoblanadi, kim bekor qiladi, daromadga qanday kiradi.

### 3.5. Minimal sotuv narxi va chegirma huquqi

Naqd sotuvda marja juda yupqa (hisobimizda ~3,6%, bir donada ~28 USD).
Shunday marjada sotuvchining o'zi chegirma berishi zarar keltiradi.
Kerak: qurilmaning minimal sotuv narxi, undan past narxga **rahbar
tasdig'i**, va chegirmalar hisoboti (kim, qancha, qaysi qurilmaga).

### 3.6. Sotuvchi bonusi

Topshiriqda "sotuvchi natijalari" hisoboti bor, lekin bonus qoidasi yo'q.
Nasiyada bonusni **sotuv paytida** to'lash xavfli: sotuvchi qarz
qaytarilishiga qiziqmaydi. Taklif: naqd sotuvdan bonus darhol, nasiyadan —
to'lov tushganda yoki shartnoma yopilganda. Qoida konfiguratsiyada,
hisoblash va to'lash alohida hujjat.

### 3.7. Telegram eslatmalari — WP-6 dan WP-3/4 ga ko'chirish

Topshiriqda xabarnoma "WP-6 dan keyin". Lekin to'lov sanasidan 3 kun oldin
eslatma kechikishni kamaytiradigan eng arzon vosita, va Excelda allaqachon
"Telegram uchun tayyor matn" bor. Minimal variant: ro'yxat + "matnni
nusxalash" tugmasi (bot kerak emas). Shuningdek rahbarga kunlik xulosa.

### 3.8. Inkassatsiya — PAY-06 dagi teshik

PAY-06 da naqd pulni kassir tasdiqlaydi. Lekin undiruvchi mijozning uyida
naqd olsa, kassir u yerda yo'q. Hozirgi matnda bu holat yopilmagan. Kerak:
undiruvchi "qabul qildim" deb kiritadi → pul kassaga topshirilganda kassir
tasdiqlaydi; shu orada summa "undiruvchi qo'lida" degan alohida holatda
turadi va kassa qoldig'iga kirmaydi.

### 3.9. Aksessuar va xizmat sotuvi

Model har bir tovarni IMEI bilan alohida karta deb oladi. Chexol, oyna,
quloqchin va remont xizmati bunga sig'maydi (miqdorli tovar). Yoki
`product_type` (IMEI'li qurilma / miqdorli tovar) qo'shiladi, yoki
"aksessuar ERPda yuritilmaydi" deb aniq yoziladi. Hozir — oraliq holat.

### 3.10. Trade-in

INV-01 da "Trade-in" holati bor, lekin jarayoni yo'q: mijozning eski
telefonini qabul qilish, narxlash (kim, qanday), uni boshlang'ich to'lov
sifatida hisoblash va omborga kirim qilish. Boshlang'ich to'lov tarkibiga
"tovar" qismi qo'shilishi kerak.

### 3.11. Imzolangan shartnoma skani

INS-03 PDF yaratadi, lekin imzolangan nusxa qayerda? Taklif: imzolangan
shartnoma (va kafil hujjati) skani/surati biriktirilmaguncha qurilma
topshirilgan deb belgilanmaydi — SALE-02 dagi "topshirish bloklanadi"
qoidasining tabiiy davomi.

### 3.12. Kurs siyosati

`exchange_rates` bor, lekin boshqaruvi yo'q: kunlik kursni kim qo'yadi,
qachon, bir kunda ikki marta o'zgarsa nima bo'ladi, shartnoma kursi kunlik
kursdan avtomatik olinadimi yoki qo'lda kiritiladimi, kim o'zgartira oladi
va o'zgarish auditga tushadimi.

### 3.13. Ko'p do'kon (SaaS) talablari — strategik

Sizning maqsadingiz: keyinchalik boshqa do'konlarga sotish. Topshiriqda
`organizations` bor, lekin quyidagilar yo'q:

- Har tashkilotning o'z rekvizitlari, shartnoma shabloni, ustama foizi,
  muddat variantlari va hamyonlari.
- **Izolyatsiya kafolati** va uning sinovi: bir do'kon boshqasining
  ma'lumotini hech qanday yo'l bilan ko'rmasligi (API, eksport, qidiruv).
- Yangi do'konni ulash tartibi: boshlang'ich qoldiq, foydalanuvchilar,
  o'z Excelidan import.
- Abonent to'lovi, muddati tugaganda nima bo'ladi (ma'lumot o'chmaydi,
  faqat yozish to'xtaydi).
- **Ma'lumot egaligi:** do'kon o'z ma'lumotini istalgan vaqtda to'liq
  eksport qila olishi. Bu sotuvda asosiy savol bo'ladi.

### 3.14. Fayl saqlash

PAY-06 "tranzaksiya dalili" talab qiladi, INS-03 PDF saqlaydi, 3.11 skan
qo'shadi. Lekin fayllar qayerda saqlanadi, hajmi, saqlash muddati va kim
ko'rishi yozilmagan. PNFL/pasport surati maxfiy ma'lumot — rol bo'yicha
cheklov kerak.

## 4. Qabul sinovlariga qo'shish

| ID | Ssenariy | Kutiladigan natija |
|---|---|---|
| AT-38 | Qora ro'yxatdagi mijozga nasiya | Bloklanadi; rahbar tasdig'i bilan izoh yoziladi |
| AT-39 | Mijoz limitidan oshgan ikkinchi shartnoma | Ogohlantirish va tasdiq talab qiladi |
| AT-40 | Minimal narxdan past sotuv | Sotuvchida bloklanadi, rahbarda izoh bilan o'tadi |
| AT-41 | Undiruvchi naqd oldi, kassirga topshirmadi | Kassa qoldig'iga kirmaydi; "yo'lda" holatida ko'rinadi |
| AT-42 | Qarz hisobdan chiqarildi | Foyda kamayadi; qarz tarixda qoladi, yashirilmaydi |
| AT-43 | Qaytarib olingan telefon qayta sotildi | Qarz, qayta sotuv va qoldiq zarar bog'langan ko'rinadi |
| AT-44 | Boshqa tashkilot ma'lumotiga so'rov | Rad etiladi; eksport va qidiruvda ham ko'rinmaydi |
| AT-45 | Shartnoma yopildi, iCloud ochilmadi | "Ochilmagan qurilmalar" ro'yxatida turadi |

## 5. Ketma-ketlikka taklif

Topshiriqdagi tartib to'g'ri. Ikki o'zgarish taklif qilaman:

1. **Telegram eslatmasi va nasiya berish qarori (qora ro'yxat + limit)**
   WP-3/WP-4 ga ko'chirilsin. Ikkisi ham kechikishni kamaytiradi, ya'ni
   darhol pul olib keladi, va ikkisi ham arzon.
2. **Investor moduli (WP-6)** oxirida qolsin. Oyiga bir marta
   hisoblanadigan ish; Excelda ishlab turibdi va shoshilinch emas.

Qolgan hamma narsa — avval hisob, keyin ekran, keyin hisobot — o'z
tartibida.

## 6. Ochiq qarorlar ro'yxatiga qo'shish

| Qaror | Nega kerak |
|---|---|
| Administrator va rahbar bir odammi? | Hozir kodda `admin` tasdiqlash huquqini ham oldi. Xodim ko'paysa ajratiladi |
| Penya bor/yo'q | Hisobot va shartnoma matniga ta'sir qiladi |
| Kafil majburiymi yoki summadan oshganda | Shartnoma shabloni o'zgaradi |
| iCloud bloklash shartnomada yozilganmi | Yuridik xavf |
| Aksessuar ERPda yuritiladimi | Ma'lumotlar modeliga ta'sir qiladi |
| Qaytmaydigan qarz zaxirasi foizi | Foyda hisobotining haqiqiyligi |
| Muddat chegarasi: 12 yoki 36 oy | Topshiriqning o'zida ikki xil |
