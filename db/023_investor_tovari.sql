-- Kirimdagi "investor tovari" qaysi investorga tegishli (TZ 6.10).
--
-- Avval bu tur faqat "pul chiqmadi, qarz ham tug'ilmadi" degan belgi
-- edi. Endi tovar kimning kapitali ekani ham yoziladi va kirim o'zi
-- investor daftariga kapital yozuvini yaratadi - tannarx bo'yicha,
-- omborga kirgan kun bilan. Shu bilan 51 305 USD kapitalning qanday
-- kirgani qo'lda emas, bir marta kirim yozilganda hisobga tushadi.
ALTER TABLE inventory ADD COLUMN investor_id uuid;
ALTER TABLE inventory ADD CONSTRAINT inventory_investor_scope
  FOREIGN KEY (tenant_id, branch_id, investor_id)
  REFERENCES investors (tenant_id, branch_id, id);

-- Investor tovarida investor ham, dollardagi tannarx ham majburiy:
-- kapital dollarda yuritiladi, so'mdagi summadan kurs orqali chiqarsak
-- yaxlitlash kapitalni asta-sekin surib yuborardi.
ALTER TABLE inventory ADD CONSTRAINT inventory_investor CHECK (
  ((purchase_method = 'investor') = (investor_id IS NOT NULL))
  AND (purchase_method <> 'investor' OR cost_usd_cents IS NOT NULL)
);

-- Bir kirim ko'pi bilan bitta kapital yozuvi yaratadi.
ALTER TABLE investor_entries ADD COLUMN inventory_id uuid UNIQUE;
ALTER TABLE investor_entries ADD CONSTRAINT investor_entry_inventory
  FOREIGN KEY (tenant_id, branch_id, inventory_id)
  REFERENCES inventory (tenant_id, branch_id, id);
ALTER TABLE investor_entries ADD CONSTRAINT investor_entry_goods CHECK (
  inventory_id IS NULL OR (kind = 'capital' AND form = 'goods')
);
