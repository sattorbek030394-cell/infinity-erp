# Infinity ERP V1

Ikki filial uchun ishlaydigan boshlang‘ich dastur: xavfsiz login, Dashboard, IMEI bo‘yicha Ombor, Nasiya va To‘lovlar. Birinchi filial — **Infinity**; ikkinchisining nomi sozlanadi. Bu versiyani avval sun’iy ma’lumotlar bilan sinang.

**Excel mosligi tasdiqlanmagan.** `Yangi Hisobot 10.10.2026.xlsm` kelajakdagi audit uchun manba. Fayl import qilinmagan, formulalar tekshirilmagan, Kassa ishonchliligi tasdiqlanmagan. Dashboarddagi olingan mablag‘ Kassa yoki sof foyda emas.

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

Filialni tanlab, **Excel hisobotini yuklash** havolasini bosing. `.xlsx` faylda Ma’lumot, Ombor, Nasiya, To‘lovlar va Qarzdorlar varaqlari bor. Tanlangan filialning barcha yozuvlari olinadi; ekrandagi qidiruv, sana yoki sahifa filtrlari eksportga qo‘llanmaydi. Kassir va kuzatuvchi ham o‘zi o‘qishga ruxsatli filial hisobotini yuklay oladi.

IMEI matn, UZS summalari son sifatida saqlanadi. Sana va kechikish qoidasi faylda yoziladi. Bu qiymatlar nusxasi; formula, makros, parol yoki sessiya ma’lumotlari yo‘q. Barcha varaqlar bazaning bir xil holatidan olinadi. Yuklangan faylni faqat vakolatli odamga bering; dastur uni GitHubga yoki boshqa servisga yubormaydi.

Har bir Ombor/Nasiya/To‘lovlar ro‘yxati 10 000 yozuvgacha. Limitdan oshganda eksport to‘liq rad qilinadi, yozuvlar kesilmaydi. Katta hajmli eksport va Excel/Kassa mosligi auditi hali mavjud emas.

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

V1: login parolini tiklash, MFA, qaytarish/bekor qilish, filial transferi, kechikish taqsimoti va to‘liq Kassa yo‘q. Nasiya jadvali bazada mavjud; to‘lovlarni aniq oylarga ajratish hali yo‘q. Production operatsion audit va Excel parity auditi bajarilmagan.

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
