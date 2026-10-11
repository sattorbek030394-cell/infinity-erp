-- Shartnomada pasportni kim va qachon bergani yoziladi ("Чилонзор ИИБ,
-- 12.03.2021"). Ilgari bu ikki qiymat faqat qog'ozda qolardi, shuning uchun
-- dastur chop etgan shartnomada bo'sh joy chiqib ketardi.
ALTER TABLE customers ADD COLUMN passport_issuer text NOT NULL DEFAULT ''
 CHECK(length(passport_issuer) <= 120);
ALTER TABLE customers ADD COLUMN passport_date date;
