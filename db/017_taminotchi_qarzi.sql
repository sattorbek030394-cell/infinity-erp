-- Kirimning pul tomoni va yetkazib beruvchi qarzi: TZ INV-02 va SUP.
--
-- Kirim tasdiqlanganda to'lov turiga qarab:
--   naqd/karta/bank  -> kassadan chiqim (xarid to'lovi)
--   qarzga           -> yetkazib beruvchi majburiyati, kassada harakat yo'q
--   investor tovari  -> na chiqim, na qarz (kapital moduli keyin)
--
-- Har kirim uchun ko'pi bilan bitta pul yozuvi va bitta majburiyat
-- bo'lishi bazada kafolatlanadi (UNIQUE inventory_id).
ALTER TABLE cash_entries ADD COLUMN inventory_id uuid UNIQUE;
ALTER TABLE cash_entries ADD COLUMN settlement_id uuid UNIQUE;
ALTER TABLE cash_entries ADD CONSTRAINT cash_inventory_scope
 FOREIGN KEY(tenant_id,branch_id,inventory_id) REFERENCES inventory(tenant_id,branch_id,id);
ALTER TABLE cash_entries DROP CONSTRAINT cash_entry_source;
ALTER TABLE cash_entries ADD CONSTRAINT cash_entry_source
 CHECK(num_nonnulls(operation_id,payment_id,contract_id,sale_id,inventory_id,settlement_id)=1);

-- Qarzga olingan tovar uchun majburiyat.
CREATE TABLE supplier_obligations (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 inventory_id uuid NOT NULL UNIQUE,
 amount bigint NOT NULL CHECK(amount > 0),
 usd_cents bigint CHECK(usd_cents IS NULL OR usd_cents > 0),
 rate bigint CHECK(rate IS NULL OR rate > 0),
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id,inventory_id) REFERENCES inventory(tenant_id,branch_id,id),
 UNIQUE(tenant_id,branch_id,id)
);
CREATE INDEX supplier_obligations_supplier
 ON supplier_obligations(tenant_id,supplier_id);

-- Yetkazib beruvchiga qarz to'lovi. Xarid xarajatini qayta yaratmaydi:
-- faqat majburiyatni kamaytiradi va kassadan pul chiqaradi (TZ SUP).
--
-- Hozircha to'lov ta'minotchining umumiy qarziga tushadi, alohida
-- majburiyatga biriktirilmaydi; hisobotda eski majburiyatdan boshlab
-- qoplangan deb ko'rsatiladi.
CREATE TABLE supplier_settlements (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 -- Majburiyatdan ayiriladigan summa, so'mda.
 amount bigint NOT NULL CHECK(amount > 0),
 -- Haqiqatda chiqqan pul: USD hamyonidan to'lanса sentda.
 wallet text NOT NULL,
 wallet_minor bigint NOT NULL CHECK(wallet_minor > 0),
 rate bigint CHECK(rate IS NULL OR rate > 0),
 note text NOT NULL DEFAULT '' CHECK(length(note) <= 160),
 request_key uuid NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id,wallet) REFERENCES cash_wallets(tenant_id,branch_id,wallet),
 UNIQUE(tenant_id,branch_id,id)
);
ALTER TABLE cash_entries ADD CONSTRAINT cash_settlement_scope
 FOREIGN KEY(tenant_id,branch_id,settlement_id) REFERENCES supplier_settlements(tenant_id,branch_id,id);
CREATE INDEX supplier_settlements_supplier
 ON supplier_settlements(tenant_id,supplier_id,created_at);
