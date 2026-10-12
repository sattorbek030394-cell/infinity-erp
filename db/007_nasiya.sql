-- Nasiya biznes qatlami: valyuta kursi, ustama, haqiqiy mijoz kartochkasi,
-- qurilma tavsifi va yetkazib beruvchilar. Manba: "Yangi Hisobot 10.10.2026.xlsm".
-- Pul butun son: UZS so'mda, USD sentda. Kurs — 1 USD uchun butun so'm.

CREATE TABLE exchange_rates (
 tenant_id uuid NOT NULL, day date NOT NULL,
 rate bigint NOT NULL CHECK(rate BETWEEN 1 AND 100000000),
 PRIMARY KEY(tenant_id,day), FOREIGN KEY(tenant_id) REFERENCES tenants
);

CREATE TABLE suppliers (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 phone text NOT NULL DEFAULT '',
 UNIQUE(tenant_id,name), UNIQUE(tenant_id,id)
);

CREATE TABLE customers (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants,
 full_name text NOT NULL CHECK(length(btrim(full_name)) BETWEEN 1 AND 160),
 passport text NOT NULL DEFAULT '',
 -- PNFL odatda 14 raqam, lekin eski yozuvlarda to'liq bo'lmasligi mumkin:
 -- qattiq shart qo'ysak, mavjud 5 ta shartnoma ko'chmay qoladi.
 pnfl text CHECK(pnfl IS NULL OR length(btrim(pnfl)) BETWEEN 5 AND 20),
 birth_date date,
 phone1 text NOT NULL DEFAULT '', phone2 text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '',
 icloud_account text NOT NULL DEFAULT '', icloud_phone text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,pnfl), UNIQUE(tenant_id,id)
);
CREATE INDEX customers_name ON customers(tenant_id,full_name);
CREATE INDEX customers_phone ON customers(tenant_id,phone1);

-- Qurilmaning identifikatori har doim 15 xonali IMEI emas: 237 ta yozuvdan 54 tasi
-- Apple seriya raqami (J4RMVWVXVV), noutbuk modeli (15-fd0366nia) yoki ikki SIMli
-- telefonning ikkinchi IMEI si (353840106026083/1). Eski shart ularni rad etardi.
ALTER TABLE inventory DROP CONSTRAINT inventory_imei_check;
ALTER TABLE inventory ADD CONSTRAINT inventory_imei_check
 CHECK(imei ~ '^[A-Za-z0-9][A-Za-z0-9/-]{4,31}$');

-- Qurilma tavsifi. Excelda Kirim varag'ining ustunlari.
ALTER TABLE inventory ADD COLUMN brand text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN memory text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN color text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN region text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN condition text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN battery text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN imei2 text NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN purchase_date date;
ALTER TABLE inventory ADD COLUMN cost_usd_cents bigint CHECK(cost_usd_cents IS NULL OR cost_usd_cents >= 0);
ALTER TABLE inventory ADD COLUMN cost_rate bigint CHECK(cost_rate IS NULL OR cost_rate > 0);
ALTER TABLE inventory ADD COLUMN supplier_id uuid;
ALTER TABLE inventory ADD CONSTRAINT inventory_supplier_scope
 FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id);

-- Nasiya shartnomasi: ustama va valyuta.
-- total = boshlang'ich to'lov + principal + markup (dastur modeli: total butun shartnoma summasi).
-- principal = narx(so'm) - boshlang'ich to'lov. Excelda "Jami nasiya" = principal + markup.
-- markup = principal * monthly_rate_bp/10000 * months (oddiy foiz, har oy asosiy summadan).
ALTER TABLE contracts ADD COLUMN number int;
ALTER TABLE contracts ADD COLUMN customer_id uuid;
ALTER TABLE contracts ADD COLUMN price_usd_cents bigint CHECK(price_usd_cents IS NULL OR price_usd_cents > 0);
ALTER TABLE contracts ADD COLUMN rate bigint CHECK(rate IS NULL OR rate > 0);
ALTER TABLE contracts ADD COLUMN monthly_rate_bp int NOT NULL DEFAULT 0
 CHECK(monthly_rate_bp BETWEEN 0 AND 10000);
ALTER TABLE contracts ADD COLUMN principal bigint CHECK(principal IS NULL OR principal > 0);
ALTER TABLE contracts ADD COLUMN markup bigint CHECK(markup IS NULL OR markup >= 0);
ALTER TABLE contracts ADD CONSTRAINT contracts_total_parts
 CHECK(principal IS NULL OR markup IS NULL OR total = down_payment + principal + markup);
ALTER TABLE contracts ADD CONSTRAINT contracts_number_unique UNIQUE(tenant_id,number);
ALTER TABLE contracts ADD CONSTRAINT contracts_customer_scope
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id);
CREATE INDEX contracts_customer ON contracts(tenant_id,customer_id);

-- Har bir filial o'z ustama foizi va muddat variantlari bilan ishlaydi.
CREATE TABLE nasiya_settings (
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 default_rate_bp int NOT NULL DEFAULT 500 CHECK(default_rate_bp BETWEEN 0 AND 10000),
 terms int[] NOT NULL DEFAULT '{3,6,8,10,12}',
 min_down_bp int NOT NULL DEFAULT 0 CHECK(min_down_bp BETWEEN 0 AND 10000),
 PRIMARY KEY(tenant_id,branch_id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CHECK(array_length(terms,1) BETWEEN 1 AND 24)
);
