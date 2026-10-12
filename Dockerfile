# Sinov uchun: butun dastur Docker ichida ishlaydi.
# Windowsda Node o'rnatish shart emas - faqat Docker Desktop kerak.
FROM node:22-alpine

WORKDIR /app

# Avval faqat paket ro'yxati: kod o'zgarganda kutubxonalar qayta
# yuklanmasin, Docker shu qatlamni keshda saqlaydi.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Jadvallarni yaratadi, sun'iy ma'lumot qo'shadi va ishga tushadi.
# Seed ikkinchi marta o'tmaydi - bu normal, shuning uchun xatosi
# e'tiborga olinmaydi.
CMD ["sh", "-c", "npm run migrate && (npm run seed || echo 'seed o\\'tkazildi: baza bo\\'sh emas') && npx next dev -H 0.0.0.0 -p 3000"]
