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

`SECOND_BRANCH_NAME` seed paytida ikkinchi filial nomini belgilaydi. Keyingi nom o‘zgarishi administrator tomonidan bazada bajariladi. Foydalanuvchi va ruxsatlarni boshqarish ekrani V1 ga kirmagan.

## Qidiruv va shartnoma tafsilotlari

- Omborda model yoki IMEI orqali qidiring; holatni Omborda/Sotilgan bo‘yicha tanlang.
- Nasiyada mijoz belgisi, IMEI, model yoki shartnoma ID orqali qidiring. Qarzi bor yoki to‘liq to‘langan shartnomalarni ajrating.
- Mijoz belgisini bosib, qurilma, jami summa, boshlang‘ich to‘lov, qoldiq, oylik jadval va shu shartnomaning to‘lov tarixini oching. Yozish ruxsati bor xodim shu yerda to‘lov kirita oladi.
- To‘lovlar tarixida mijoz/IMEI/shartnoma yoki to‘lov ID, usul va sana orqali qidiring. Barcha tarix 20 tadan sahifalanadi; oxirgi 100 ta bilan cheklanmaydi. Sana chegaralari Toshkent vaqtida, ikkala kun ham kiradi.
- Qidiruv Dashboard summalarini o‘zgartirmaydi. Har bir ekran tanlangan filial va serverdagi ruxsatlar bilan cheklanadi. Viewer shartnoma tafsilotlarini o‘qiydi, to‘lov kirita olmaydi.

## Hisoblash qoidalari

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

V1: login parolini tiklash, MFA, foydalanuvchilarni boshqarish UI, qaytarish/bekor qilish, filial transferi, hisobot eksporti, kechikish taqsimoti va to‘liq Kassa yo‘q. Nasiya jadvali bazada mavjud; to‘lovlarni aniq oylarga ajratish hali yo‘q. Production operatsion audit va Excel parity auditi bajarilmagan.

Haqiqiy mijoz, passport, PNFL, haqiqiy to‘lov yoki maxfiy kalitlarni repositoryga kiritmang. Sun’iy seeddagi IMEI ham haqiqiy qurilma emas. Excel/CSV va env fayllari ignore qilingan; ignore qoidasi ma’lumot xavfsizligi tekshiruvi o‘rnini bosmaydi. Real ma’lumot importi V1 da mavjud emas.

## API

- POST /api/login — form email/password; muvaffaqiyat: 303, xato: 400/401.
- POST /api/logout — sessiyani bekor qiladi; 303 yoki 403.
- POST /api/records — JSON: branchId, kind (inventory/contracts/payments), data. Barcha yozuvlar sessiya va Origin talab qiladi. 200 {id} yoki 400 {error}. Maydonlar lib/domain.ts da.
- GET /erp?branch=<uuid>&tab=dashboard|inventory|contracts|payments — serverda tekshiriladigan ekranlar.
- GET /erp/contracts/<uuid>?branch=<uuid> — qurilma, shartnoma jadvali va to‘lov tarixi; shu filial uchun server ruxsati talab qilinadi.

O‘zgarishlar uchun branch va PR yarating; test, typecheck, build o‘tishini tekshiring. Xavfsizlik yoki moliyaviy qoida o‘zgarsa integration testni kengaytiring.
