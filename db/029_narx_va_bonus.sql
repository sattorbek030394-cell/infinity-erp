-- Minimal sotuv narxi va sotuvchi bonusi (TZ SALE).
--
-- Ikkisi ham sozlama: raqamni kod emas, do'kon egasi belgilaydi.
-- Sukut qiymati NOL - ya'ni ikkisi ham o'chirilgan holatda keladi va
-- siz raqamni qo'yganingizda ishlay boshlaydi. Kodga o'zimdan raqam
-- yozib qo'yish to'g'ri bo'lmasdi: minimal marja ham, bonus foizi ham
-- biznes qarori.

-- Minimal marja: sotish narxi tannarxdan shu foizdan kam oshsa, sotuv
-- bloklanadi. 1500 bp = 15%. Nol - cheklov yo'q.
ALTER TABLE nasiya_settings ADD COLUMN min_margin_bp int NOT NULL DEFAULT 0
  CHECK (min_margin_bp BETWEEN 0 AND 10000);

-- Sotuvchi bonusi: sotuv marjasining shu foizi. Nol - bonus yo'q.
ALTER TABLE nasiya_settings ADD COLUMN seller_bonus_bp int NOT NULL DEFAULT 0
  CHECK (seller_bonus_bp BETWEEN 0 AND 10000);

-- Minimal marjadan past sotuv - rahbar qarori bilan va sababi yozilib.
-- Sabab yozuvda qolib ketadi, keyin "kim ruxsat berdi" degan savolga
-- javob bo'ladi.
ALTER TABLE contracts ADD COLUMN price_override_by uuid REFERENCES users;
ALTER TABLE contracts ADD COLUMN price_override_reason text
  CHECK (price_override_reason IS NULL
    OR length(btrim(price_override_reason)) BETWEEN 5 AND 160);
ALTER TABLE cash_sales ADD COLUMN price_override_by uuid REFERENCES users;
ALTER TABLE cash_sales ADD COLUMN price_override_reason text
  CHECK (price_override_reason IS NULL
    OR length(btrim(price_override_reason)) BETWEEN 5 AND 160);
