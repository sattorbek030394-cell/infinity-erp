-- Mijoz avansini boshqa shartnomaga yo'naltirish (PAY-04 davomi).
--
-- Mijoz qarzdan ortiq to'lasa, ortig'i avans bo'lib turadi. Lekin u
-- bitta shartnomaga bog'langan: mijozning birinchi shartnomasi yopilib,
-- ikkinchisida qarzi qolsa, avansni ishlatib bo'lmasdi. Kassaga qaytarib
-- yana kiritish ham yo'l emas - kassada bo'lmagan pul harakati paydo
-- bo'ladi.
--
-- Yechim: ko'chirish - maqsad shartnomasiga to'lov yozish, lekin puli
-- kassadan emas, avansdan. Shuning uchun kassaga yozuv tushmaydi: o'sha
-- pul avans paydo bo'lgan kuni allaqachon kassaga kirgan.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'cash_usd', 'card', 'transfer', 'advance'));

ALTER TABLE payments ADD COLUMN from_advance_id uuid
  REFERENCES customer_advances (id);
ALTER TABLE payments ADD CONSTRAINT payments_advance CHECK (
  (method = 'advance') = (from_advance_id IS NOT NULL)
);

-- Avansdan to'langan tushumda dollar yozuvi bo'lmaydi.
ALTER TABLE payments DROP CONSTRAINT payments_usd_complete;
ALTER TABLE payments ADD CONSTRAINT payments_usd_complete CHECK (
  CASE
    WHEN method = 'cash_usd' THEN num_nonnulls(usd_cents, rate) = 2
    ELSE usd_cents IS NULL
  END
);
