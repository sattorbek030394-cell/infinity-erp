-- Kirim kartochkasi: prognoz narx dollarda va aralash to'lov (TZ INV-01/02).
--
-- 1) Prognoz sotuv narxi endi dollarda kiritiladi, chunki telefon
--    dollarga olinadi va dollarda narxlanadi. So'mdagi `expected_price`
--    saqlanib qoladi (hisobotlar shunga tayanadi): uni dastur kirim
--    kursi bilan o'zi hisoblaydi.
ALTER TABLE inventory ADD COLUMN expected_price_usd_cents bigint
  CHECK (expected_price_usd_cents IS NULL OR expected_price_usd_cents > 0);

-- 2) "Aralash" to'lov turi: bitta kirim uchun bir nechta hamyondan pul
--    chiqadi (masalan 500$ naqd + 2 mln so'm naqd + 4 mln so'm karta).
ALTER TABLE inventory DROP CONSTRAINT inventory_purchase_method_check;
ALTER TABLE inventory ADD CONSTRAINT inventory_purchase_method_check
  CHECK (purchase_method IN ('', 'cash_uzs', 'cash_usd', 'card', 'bank',
    'debt', 'investor', 'mixed'));

-- Avval har kirimga bitta kassa yozuvi edi (UNIQUE inventory_id).
-- Aralash to'lovda bitta kirim har hamyondan bittadan yozuv beradi,
-- shuning uchun kafolat "bir kirim - bir hamyon - bitta yozuv" bo'ladi.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute a
      ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'cash_entries'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND a.attname = 'inventory_id'
  LOOP
    EXECUTE format('ALTER TABLE cash_entries DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
-- Faqat xarid yozuvlarida inventory_id bor (bekor qilish yozuvlarida yo'q).
CREATE UNIQUE INDEX cash_entries_inventory_wallet
  ON cash_entries (inventory_id, wallet) WHERE inventory_id IS NOT NULL;
