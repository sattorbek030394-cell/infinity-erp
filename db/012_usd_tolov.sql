-- PAY-02 / AT-10: dollarda olingan to'lov.
--
-- Shartnoma qarzi UZSda yuritiladi (TZ 4.4). Dollarda olingan to'lov
-- to'lov sanasidagi kurs bilan UZSga aylantiriladi va qarzga shu summa
-- yo'naltiriladi; shartnoma kursi o'zgarmaydi. Kurs majburiy - kursi
-- yo'q USD to'lovni saqlash bloklanadi.
--
-- `usd_cents` - haqiqatda olingan dollar (sentda), `rate` - 1 USD uchun
-- butun so'm, `amount` - qarzga yo'naltirilgan UZS. Naqd USD hamyoniga
-- esa dollar tushadi, so'm emas.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
 CHECK(method IN ('cash', 'cash_usd', 'card', 'transfer'));
ALTER TABLE payments ADD COLUMN usd_cents bigint
 CHECK(usd_cents IS NULL OR (usd_cents > 0 AND usd_cents <= 1000000000000));
ALTER TABLE payments ADD COLUMN rate bigint
 CHECK(rate IS NULL OR (rate > 0 AND rate <= 100000000));
ALTER TABLE payments ADD CONSTRAINT payments_usd_complete
 CHECK((method = 'cash_usd') = (num_nonnulls(usd_cents, rate) = 2));
