# Infinity ERP V1

Ikki filial uchun ishlaydigan boshlang‘ich dastur: xavfsiz login, Dashboard, IMEI bo‘yicha Ombor, Nasiya va To‘lovlar. Birinchi filial — **Infinity**; ikkinchisining nomi sozlanadi. Bu versiyani avval sun’iy ma’lumotlar bilan sinang.

**Excel mosligi tasdiqlanmagan.** `Yangi Hisobot 10.10.2026.xlsm` audit uchun manba. Fayl import qilinmagan. Kassa formulalarining cheklangan sinovida sana-vaqt xatolari aniqlangan; to‘liq audit tugamagan. Dashboarddagi olingan mablag‘ Kassa yoki sof foyda emas.

## Tezkor sinov (Docker bilan)

Postgres o'rnatish shart emas. Node.js 22+ va Docker bo'lsa yetarli:

```
git clone -b nasiya-biznes <repo>
cd infinity-erp
docker compose up -d
npm ci
cp .env.example .env.local
```

`.env.local` ni oching va ikki qatorni yozing:

```
DATABASE_URL=postgres://infinity:infinity@localhost:5433/infinity
DEMO_PASSWORD=<kamida 12 belgili parol>
```

So'ngra:

```
npm run migrate
npm run seed
npm run dev
```

[localhost:3000](http://localhost:3000) ni ochib `demo@example.invalid` va
o'sha parol bilan kiring. Seed ikkita filial va sun'iy qurilmalar
yaratadi — haqiqiy ma'lumot tegmaydi.

Sinab ko'rish ketma-ketligi: Omborga qurilma qo'shing → Nasiya
shartnomasi tuzing → To'lov kiritib ko'ring → Erta yopish hisobini
chiqaring → Foyda bo'limida raqamlarning ustiga bosib tafsilotini
ko'ring → Investorlar bo'limida kapital kiritib oyni yopib ko'ring.

To'xtatish: `docker compose down`. Bazani ham o'chirish:
`docker compose down -v`.

## Ishga tushirish

Texnik yordamchi uchun: Node.js 22+, PostgreSQL 17 va bo‘sh ma’lumotlar bazasi kerak.

1. Repositoryni yuklang, `npm ci` bajaring.
2. `.env.example` nusxasini `.env.local` deb saqlang. `DATABASE_URL` ga lokal baza ulanishini, `DEMO_PASSWORD` ga yangi, kamida 12 belgili parol yozing. Parolni GitHubga yubormang.
3. `npm run migrate`, keyin `npm run seed` bajaring. Seed faqat bo‘sh bazada ishlaydi, ikkita filial va sun’iy qurilmalar yaratadi.
4. `npm run dev` bajaring va [localhost:3000](http://localhost:3000) ni oching.
5. `demo@example.invalid` va o‘zingiz belgilagan parol bilan kiring. Filialni tanlang. Omborga qurilma qo‘shing → Nasiya shartnomasini yarating → To‘lov kiriting.

`SECOND_BRANCH_NAME` seed paytida ikkinchi filial nomini belgilaydi. Keyingi nom o‘zgarishi administratorning **Sozlamalar** ekranida bajariladi. Mavjud dasturni yangilaganda `npm run migrate` bajaring; seedni qayta ishlatmang.

## Filial va xodimlar

- Administrator filialni tanlab, **Sozlamalar** orqali nomini o‘zgartiradi va xodim qo‘shadi. Yangi xodim uchun kamida 12 belgili dastlabki parol belgilanadi.
- Administrator boshqaradi; kassir ombor, shartnoma va to‘lov kiritadi; kuzatuvchi faqat ko‘radi. Ruxsat har bir filial uchun alohida.
- Mavjud xodimni qo‘shish faqat shu tashkilotda, administrator boshqaradigan filiallardagi xodimlar uchun mavjud. Mavjud akkaunt paroli o‘zgartirilmaydi.
- Xodim kirishini o‘chirish va qayta yoqish mumkin. Keyingi so‘rovlar yangi ruxsatni tekshiradi; boshqa filialdagi ruxsati saqlanadi. Administrator o‘z huquqini olib tashlay olmaydi va filial administratorsiz qolmaydi.
- Parolni tiklash yoki almashtirish ekrani hali mavjud emas. Dastlab sun’iy xodimlar bilan sinang.

## Excel hisobotini yuklash

Eksportda Kassa qoldiqlari va Kassa daftari ham bor. Hamyonlar alohida ko‘rsatiladi, noma’lum qoldiq nolga aylantirilmaydi. Kassa summalari aniq qiymatni saqlash uchun valyutasi bilan matn shaklida yoziladi; ular Excelda avtomatik yig‘iladigan son emas. Asl harakat, bekor qilish yozuvi, sabab, manba ID, muallif va yozilgan vaqt saqlanadi. Barcha varaqlar bir xil baza holatidan olinadi.

Filialni tanlab, **Excel hisobotini yuklash** havolasini bosing. `.xlsx` faylda Ma’lumot, Ombor, Nasiya, To‘lovlar, Qarzdorlar, Kassa qoldiqlari, Kassa daftari va Naqd savdo varaqlari bor. Tanlangan filialning barcha yozuvlari olinadi; ekrandagi qidiruv, sana yoki sahifa filtrlari eksportga qo‘llanmaydi. Kassir va kuzatuvchi ham o‘zi o‘qishga ruxsatli filial hisobotini yuklay oladi.

IMEI matn, UZS summalari son sifatida saqlanadi. Sana va kechikish qoidasi faylda yoziladi. Bu qiymatlar nusxasi; formula, makros, parol yoki sessiya ma’lumotlari yo‘q. Barcha varaqlar bazaning bir xil holatidan olinadi. Yuklangan faylni faqat vakolatli odamga bering; dastur uni GitHubga yoki boshqa servisga yubormaydi.

Har bir Ombor/Nasiya/To‘lovlar/Kassa daftari/Naqd savdo ro‘yxati 10 000 yozuvgacha. Limitdan oshganda eksport to‘liq rad qilinadi, yozuvlar kesilmaydi. Katta hajmli eksport va to‘liq Excel/Kassa mosligi auditi hali mavjud emas.

## Qidiruv va shartnoma tafsilotlari

- Omborda model yoki IMEI orqali qidiring; holatni Omborda/Sotilgan bo‘yicha tanlang.
- Nasiyada mijoz belgisi, IMEI, model yoki shartnoma ID orqali qidiring. Qarzi bor yoki to‘liq to‘langan shartnomalarni ajrating.
- Mijoz belgisini bosib, qurilma, jami summa, boshlang‘ich to‘lov, qoldiq, oylik jadval va shu shartnomaning to‘lov tarixini oching. Yozish ruxsati bor xodim shu yerda to‘lov kirita oladi.
- To‘lovlar tarixida mijoz/IMEI/shartnoma yoki to‘lov ID, usul va sana orqali qidiring. Barcha tarix 20 tadan sahifalanadi; oxirgi 100 ta bilan cheklanmaydi. Sana chegaralari Toshkent vaqtida, ikkala kun ham kiradi.
- Qidiruv Dashboard summalarini o‘zgartirmaydi. Har bir ekran tanlangan filial va serverdagi ruxsatlar bilan cheklanadi. Viewer shartnoma tafsilotlarini o‘qiydi, to‘lov kirita olmaydi.

## Hisoblash qoidalari

### Qarzdorlar va kechikkan to‘lovlar

**Qarzdorlar** bo‘limida muddati o‘tgan shartnomalar yoki barcha qoldig‘i bor shartnomalar ko‘rsatiladi. Mijoz belgisi, model, IMEI yoki shartnoma ID orqali qidirish mumkin; ro‘yxat 20 tadan sahifalanadi va shartnoma tafsilotlariga olib boradi.

Hisob kuni serverda Toshkent vaqti bilan olinadi. Faqat hisob kunidan oldingi jadval muddatlari kechikkan hisoblanadi. Keyingi to‘lovlar eng eski oylikdan boshlab qoplanadi deb hisoblanadi: kechikkan summa = max(0, avvalgi muddatlarning jami − keyingi to‘lovlar). Boshlang‘ich to‘lov jadvalga kirmaydi. Kechikish kunlari eng eski hali to‘liq qoplanmagan muddatdan sanaladi. Oldindan to‘lash hisobga olinadi; to‘liq yopilgan shartnomalar chiqarilmaydi.

Bu joriy holat hisoboti; tarixiy sana bo‘yicha hisobot yoki to‘lovlarni oylarga bazada biriktirish mavjud emas. Jarima hisoblanmaydi va yozuvlar o‘zgarmaydi. Excel/Kassa mosligi tasdiqlanmagan.

- Valyuta: butun UZS. Kasr, valyuta kursi, avtomatik foiz, jarima va soliq hisoblanmaydi.
- Kelishilgan jami summa va boshlang‘ich to‘lov qo‘lda kiritiladi. Qolgan summa oylar bo‘yicha butun UZS ga bo‘linadi; yaxlitlash qoldig‘i dastlabki oylarga tarqatiladi.
- Oylik sanalar boshlanish kuniga mos; qisqa oyda oxirgi kun olinadi. Shartnoma yaratishda jadval bazaga yoziladi.
- Boshlang‘ich to‘lov shartnomada alohida saqlanadi; keyingi to‘lovlar o‘zgarmas yozuvlar. Qoldiq = jami − boshlang‘ich − keyingi to‘lovlar.
- Bitta qurilma faqat bitta shartnomaga sotiladi. Manfiy yoki qoldiqdan katta to‘lov bloklanadi.
- Har bir filialning ombori, shartnomalari va mablag‘i mustaqil. Filiallararo transfer, konsolidatsiya va to‘liq buxgalteriya jurnali hali yo‘q.

## Arxitektura va xavfsizlik

Next.js App Router + TypeScript, PostgreSQL, parametrli SQL, Zod validatsiya. Sxema: tenants → branches → memberships; inventory, contracts va payments tenant/branch bilan bog‘langan. Kompozit foreign key boshqa filial qurilmasi yoki shartnomasini bog‘lashni bloklaydi. IMEI tenant doirasida yagona.

Server sessiyadan foydalanuvchini aniqlaydi va har bir o‘qish/yozishda memberships ni tekshiradi; tenant ID mijozdan olinmaydi. admin/cashier yozishi mumkin, viewer faqat o‘qiydi. Dastur darajasidagi ajratish mavjud; PostgreSQL RLS V1 da yo‘q. Baza akkaunti faqat ilova serverida ishlatilishi kerak.

Parollar bcrypt (12 rounds). Tasodifiy 256-bit sessiya tokenining faqat SHA-256 xeshi bazada saqlanadi. HttpOnly, SameSite=Lax, productionda Secure cookie; 8 soatlik sessiya va chiqishda bekor qilish. Yozuvchi so‘rovlar aniq APP_ORIGIN bilan tekshiriladi. Login 5 muvaffaqiyatsiz urinishdan keyin email bo‘yicha 15 daqiqaga bloklanadi. Internet uchun qo‘shimcha gateway/IP rate limiting tavsiya qilinadi.

Nasiya/to‘lov amallari transaction va row lock bilan bajariladi. To‘lov requestKey orqali takrorlanishdan himoyalanadi; qayta yuborishda bir xil kalit va qiymatlar kerak. Audit jurnalida muallif, filial, amal va yozuv ID saqlanadi; maxfiy payload yozilmaydi.

## Tekshiruvlar

```sh
npm test
npm run typecheck
npm run build
```

`npm test`: jadval/yaxlitlash, validatsiya, rollar va haqiqiy PostgreSQL dvigateliga asoslangan PGlite sxema testi. HTTP integration testi oddiy testda alohida baza berilmaganda skip qilinadi.

To‘liq HTTP testi uchun migratsiya qilingan **lokal test bazasi** bilan `INTEGRATION_DATABASE_URL` ni muhitga yozing, builddan keyin `npm run test:integration` bajaring. Test 3100 portda production server ochadi; sun’iy foydalanuvchilarni yaratib, login/logout, CSRF, viewer, boshqa tenant/filial, rollback, takroriy va parallel ortiqcha to‘lov, barcha modullarni tekshiradi. Test oxirida o‘z yozuvlarini o‘chiradi. Testni production bazasiga yo‘naltirmang.

## Joylashtirish va cheklovlar

Production: HTTPS, production DATABASE_URL, APP_ORIGIN ning aniq HTTPS manzili, migratsiyalar, alohida cheklangan DB foydalanuvchisi, backup/restore sinovi kerak. `npm run build` → `npm start`. Demo seedni real bazada ishlatmang.

V1: login parolini tiklash, MFA, qaytarish/bekor qilish, filial transferi, kechikish taqsimoti va to‘liq buxgalteriya yo‘q. Nasiya jadvali bazada mavjud; to‘lovlarni aniq oylarga ajratish hali yo‘q. Production operatsion audit va Excel parity auditi bajarilmagan.

Haqiqiy mijoz, passport, PNFL, haqiqiy to‘lov yoki maxfiy kalitlarni repositoryga kiritmang. Sun’iy seeddagi IMEI ham haqiqiy qurilma emas. Excel/CSV va env fayllari ignore qilingan; ignore qoidasi ma’lumot xavfsizligi tekshiruvi o‘rnini bosmaydi. Real ma’lumot importi V1 da mavjud emas.

## API

- GET /api/export?branch=<uuid> — ruxsatli filial uchun barcha yozuvlar `.xlsx` nusxasi; 400 noto‘g‘ri filial, 403 ruxsat yo‘q, 422 hajm limiti. Javob private/no-store.

- POST /api/login — form email/password; muvaffaqiyat: 303, xato: 400/401.
- POST /api/logout — sessiyani bekor qiladi; 303 yoki 403.
- POST /api/records — JSON: branchId, kind (inventory/contracts/payments), data. Barcha yozuvlar sessiya va Origin talab qiladi. 200 {id} yoki 400 {error}. Maydonlar lib/domain.ts da.
- GET /erp?branch=<uuid>&tab=dashboard|inventory|contracts|payments|arrears — serverda tekshiriladigan ekranlar. Qarzdorlar uchun status=all barcha qoldiqlarni, standart holat faqat muddati o‘tganlarni ko‘rsatadi.
- GET /erp/contracts/<uuid>?branch=<uuid> — qurilma, shartnoma jadvali va to‘lov tarixi; shu filial uchun server ruxsati talab qilinadi.
- GET /erp/settings?branch=<uuid> — faqat filial administratori uchun sozlamalar.
- POST /api/settings — JSON: branchId, action (rename/create/grant/role) va tegishli maydonlar. Sessiya, Origin va filial administratorining ruxsati talab qilinadi. Ruxsatlar o‘zgarishi auditga yoziladi; parollar yozilmaydi.

O‘zgarishlar uchun branch va PR yarating; test, typecheck, build o‘tishini tekshiring. Xavfsizlik yoki moliyaviy qoida o‘zgarsa integration testni kengaytiring.

## Kassa

Yangilaganda `npm run migrate` bajaring: `003_cash.sql` kassa jadvallarini yaratadi. Kassa bo‘limida har bir filial uchun Naqd UZS, Naqd USD, Karta (P2P) va Hisob raqam alohida yuritiladi.

- Administrator tekshirilgan sana boshidagi qoldiqni bir marta belgilaydi. Noma’lum qoldiqni nol deb kiritmang; belgilanmaguncha balans “noma’lum”. V1 da boshlang‘ich qoldiqni tahrirlash mavjud emas.
- Qoldiq = boshlang‘ich qoldiq + o‘sha kundan bugungacha kirim − chiqim. Sana serverda Toshkent vaqti bilan olinadi; bugungi kun to‘liq kiradi. Boshlang‘ich sanadan oldingi harakatlar daftarda saqlanadi, balansga kirmaydi.
- Administrator va kassir kirim/chiqimni sabab va izoh bilan yozadi. Kuzatuvchi faqat ko‘radi. Turli UZS hamyonlari orasidagi o‘tkazma ikkita teng, qarama-qarshi yozuv bilan bitta tranzaksiyada bajariladi.
- Yangi nasiya boshlang‘ich va keyingi to‘lovlari tanlangan usul bo‘yicha avtomatik yoziladi. Moliyaviy yozuv va kassa yozuvi bir tranzaksiyada saqlanadi. Bir xil kalitli takroriy so‘rov pulni ikki marta yozmaydi.
- Avvalgi shartnoma/to‘lovlar ko‘chirilmagan. Yangi tushumning sanasi shartnoma jadvali boshlanish sanasi emas, pul kiritilgan kun. Avtomatik tushumni qo‘lda yana yozmang.
- Omborga qurilma kiritish pul sarflanganini anglatmaydi; haqiqiy xaridga alohida chiqim yozing. USD sentlarda, UZS butun sonlarda saqlanadi. Valyuta kursi va USD o‘tkazmasi mavjud emas.
- Manfiy balans ogohlantirish bilan ko‘rsatiladi. Filiallararo o‘tkazma va investor qarzi/foydasi mavjud emas. “Investor kapitali” sababi investorning alohida hisobini yaratmaydi.

### Xato harakatni bekor qilish

`004_cash_reversals.sql` migratsiyasini qo‘llang. Administrator Kassa daftarida qo‘lda yozilgan asl harakatni ochib, **Bekor qilish** orqali kamida 5 belgili sabab yozadi. Asl yozuv o‘chmaydi; asl sanaga qarama-qarshi summa yoziladi, muallif va bajarilgan vaqt saqlanadi. Bu yangi pul harakati emas, tarixiy xatoni tuzatishdir. Hamyonlar orasidagi o‘tkazmaning ikkala tomoni birga bekor qilinadi. Bekor qilingan yozuv belgilanadi; uni yoki bekor qilish yozuvini yana bekor qilish bloklanadi.

Kassir va kuzatuvchi bekor qila olmaydi. Boshlang‘ich qoldiq va avtomatik nasiya tushumi Kassa daftaridan alohida bekor qilinmaydi. Keyingi nasiya to‘lovi quyidagi bog‘langan tuzatish jarayoni orqali bekor qilinadi.

POST /api/cash/reverse — branchId, entryId, requestKey, reason. Sessiya, Origin va shu filial administratorining ruxsati talab qilinadi. Bir xil kalitli takroriy so‘rov bir marta bajariladi; boshqa kalit bilan ikkinchi bekor qilish rad etiladi. 200 {id}, 400 validatsiya yoki 403 ruxsat xatosi.

## Xato nasiya to‘lovini tuzatish

Yangilaganda `npm run migrate` bajaring (`005_payment_voids.sql`). Administrator **To‘lovlar** ekranida yoki shartnomaning **To‘lov tarixi**da xato to‘lov yonidagi **To‘lovni bekor qilish**ni ochadi, kamida 5 belgili sabab yozadi va tekshirganini belgilaydi. So‘ng to‘g‘ri summa/usulni yangi to‘lov sifatida kiriting. Eski yozuv tahrirlanmaydi yoki o‘chirilmaydi.

Bekor qilish bir tranzaksiyada bajariladi: to‘lov bekor qilingan deb belgilanadi, mijozning qarzi shu summaga oshadi va bog‘langan Kassa tushumiga asl sanada qarama-qarshi yozuv qo‘shiladi. Dashboard, shartnoma qoldig‘i, qarzdorlar, keyingi to‘lov limiti va Excel hisoblari faqat faol to‘lovlarni hisoblaydi. Tarix va eksportda asl to‘lov, sabab, bekor qilish vaqti va muallifi saqlanadi. Parallel qayta yuborish yoki bir vaqtning o‘zida yangi to‘lov kiritish shartnoma blokirovkasi bilan tartiblanadi; ikki marta bekor qilish rad etiladi.

Bu tarixiy xato yozuvni tuzatish, haqiqiy pulni mijozga qaytarish emas. Kassir va kuzatuvchi bekor qila olmaydi. Boshlang‘ich to‘lovni/shartnomani bekor qilish, bekor qilishni qayta tiklash va Kassa yozuvi bo‘lmagan eski to‘lovlarni tuzatish mavjud emas. Eski yozuvda Kassa bog‘lanishi yo‘qligi ko‘rsatiladi va API tuzatishni rad qiladi; tasdiqlanmagan pul harakati yaratilmaydi.

POST /api/payments/void — JSON branchId, paymentId, requestKey, reason. Sessiya, Origin va filial administratori talab qilinadi; tenant serverdan olinadi. 200 {id}, 400 validatsiya/bog‘lanish/takroriy tuzatish xatosi, 403 ruxsat xatosi. Bir xil kalit va bir xil qiymatli qayta yuborish bir marta bajariladi.

## Naqd savdo

Yangilaganda `npm run migrate` bajaring (`006_cash_sales.sql`). **Naqd savdo** bo‘limida administrator yoki kassir ombordagi qurilmani tanlaydi, butun UZS dagi to‘liq sotuv summasini, tushum hamyonini va ixtiyoriy mijoz belgisini kiritadi. Maxfiy hujjat ma’lumotlarini yozmang. Naqd UZS, Karta (P2P) yoki Hisob raqam qo‘llanadi; USD savdo va bo‘lib to‘lash bu bo‘limga kirmaydi.

Savdo, qurilmaning “Sotilgan” holati va Kassa tushumi bitta tranzaksiyada saqlanadi. Tushumni yana qo‘lda yozmang. Qurilma blokirovkasi bir vaqtda ikki marta yoki ham naqd, ham nasiyaga sotilishini bloklaydi. Bir xil so‘rov kalitli qayta yuborish bir savdo va bir Kassa yozuvini yaratadi. Filial/tenant serverdan tekshiriladi; boshqa filial qurilmasini sotib bo‘lmaydi. Kuzatuvchi faqat tarixni ko‘radi.

Tarix IMEI/model/mijoz belgisi/savdo ID, usul va Toshkent sanalari bo‘yicha qidiriladi, 20 tadan sahifalanadi. Ekrandagi tushum faqat filtrga mos savdolar jami; Dashboarddagi Naqd savdo tushumi barcha filial savdolari jami. Tushum Kassa qoldig‘i yoki sof foyda emas. Excelda alohida Naqd savdo varag‘i va Kassa daftarida savdo ID bor. Eksportdagi Naqd savdo ro‘yxati ham 10 000 yozuv bilan cheklangan; limitdan oshganda butun hisobot rad qilinadi.

V1 da naqd savdoni bekor qilish, qurilmani qaytarish, chegirma/soliq modeli va savdo chekini chop etish yo‘q. Avtomatik savdo tushumini Kassa daftaridan alohida bekor qilish bloklangan; bu ombor va tushumni bir-biridan uzmaslik uchun. Dastlab sun’iy ma’lumotlarda sinang.

POST /api/sales — branchId, inventoryId, requestKey, amount (butun UZS), method (cash/card/transfer), customerLabel (ixtiyoriy). Sessiya, Origin va admin/cashier ruxsati talab qilinadi. 200 {id}, 400 validatsiya/sotilgan qurilma/takroriy kalit xatosi, 403 ruxsat xatosi. GET /erp?branch=<uuid>&tab=sales — savdo va tarix ekrani.

POST /api/cash — branchId, requestKey, action (opening/entry/transfer), wallet, date, amount (matn), actionga tegishli direction/category/note yoki destination. Tenant serverdan olinadi; Origin va filial ruxsati tekshiriladi. Opening faqat administrator uchun. 200 {id}, 400 validatsiya yoki 403 ruxsat xatosi.
