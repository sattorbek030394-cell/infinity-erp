-- Kirim (ombor) kartochkasining qolgan maydonlari - TZ INV-01.
--
-- Excel'ning "Kirim" varag'ida bor, bazada yo'q edi: SIM turi, prognoz
-- sotuv narxi, qabul qiluvchi va to'lov turi.
--
-- To'lov turi hozircha faqat qayd etiladi: kassa chiqimi va yetkazib
-- beruvchi qarzi (INV-02) keyingi paketda ulanadi. Shuning uchun
-- "Naqd UZS" deb belgilangan kirim hali kassadan pul chiqarmaydi.
ALTER TABLE inventory ADD COLUMN sim_type text NOT NULL DEFAULT ''
 CHECK(length(sim_type) <= 20);
ALTER TABLE inventory ADD COLUMN expected_price bigint
 CHECK(expected_price IS NULL OR expected_price > 0);
ALTER TABLE inventory ADD COLUMN received_by text NOT NULL DEFAULT ''
 CHECK(length(received_by) <= 80);
ALTER TABLE inventory ADD COLUMN purchase_method text NOT NULL DEFAULT ''
 CHECK(purchase_method IN ('', 'cash_uzs', 'cash_usd', 'card', 'bank',
  'debt', 'investor'));
