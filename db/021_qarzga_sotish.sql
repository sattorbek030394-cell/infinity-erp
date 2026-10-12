-- Qarzga sotish: ustamasiz, grafiksiz, qarzi DOLLARDA yuritiladigan sotuv.
--
-- Nasiyadan farqi: ustama yo'q, bitta muddat bor, va qarzning haqiqiy
-- o'lchovi dollar. So'mdagi `total`/`down_payment` sotuv kunidagi kurs
-- bilan yoziladi - ular marja, kassa va limit uchun kerak, lekin qarz
-- qoldig'i `total_cents - down_cents - sum(applied_cents)` dan chiqadi.
--
-- Alohida jadval ochilmadi: to'lovlar, tasdiqlar, Qarzdorlar ro'yxati,
-- kechikish guruhlari va mijoz limiti shartnomalar ustida ishlaydi. Ikki
-- turni CHECK ajratib turadi, shuning uchun chalkashish ehtimoli yo'q.
ALTER TABLE contracts
  ADD COLUMN kind text NOT NULL DEFAULT 'nasiya'
    CHECK (kind IN ('nasiya', 'qarz')),
  ADD COLUMN total_cents bigint CHECK (total_cents > 0),
  ADD COLUMN down_cents bigint CHECK (down_cents >= 0),
  ADD COLUMN sale_rate bigint CHECK (sale_rate > 0),
  ADD COLUMN due_date date;

ALTER TABLE contracts ADD CONSTRAINT contracts_qarz CHECK (
  CASE kind
    WHEN 'nasiya' THEN num_nonnulls(total_cents, down_cents, sale_rate, due_date) = 0
    ELSE num_nonnulls(total_cents, down_cents, sale_rate, due_date) = 4
         AND COALESCE(markup, 0) = 0
         AND months = 1
         AND total_cents > down_cents
  END
);

-- Shu to'lov dollardagi qarzdan qancha yopgani. Faqat qarz turidagi
-- shartnomada to'ladi; nasiyada so'm summasining o'zi yetarli.
ALTER TABLE payments ADD COLUMN applied_cents bigint CHECK (applied_cents > 0);

-- Qarz dollarda yuritilgani uchun so'mdagi to'lovga ham kurs kerak:
-- tushgan so'm shu kurs bilan dollarga o'tkaziladi. Avvalgi shart kursni
-- faqat naqd USD to'lovda ruxsat etardi; endi kurs har qanday usulda
-- bo'lishi mumkin, `usd_cents` esa hamon faqat naqd USD da.
ALTER TABLE payments DROP CONSTRAINT payments_usd_complete;
ALTER TABLE payments ADD CONSTRAINT payments_usd_complete CHECK (
  CASE
    WHEN method = 'cash_usd' THEN num_nonnulls(usd_cents, rate) = 2
    ELSE usd_cents IS NULL
  END
);

-- Sotuv paytida mijoz bir necha hamyonga bo'lib to'lashi mumkin (naqd
-- dollar + naqd so'm + karta). Avval bir shartnomaga bitta kassa yozuvi
-- ruxsat etilardi; endi har hamyonga bittadan.
ALTER TABLE cash_entries DROP CONSTRAINT cash_entries_contract_id_key;
ALTER TABLE cash_entries
  ADD CONSTRAINT cash_entries_contract_wallet UNIQUE (contract_id, wallet);

CREATE INDEX contracts_qarz_muddat ON contracts (tenant_id, branch_id, due_date)
  WHERE kind = 'qarz';
