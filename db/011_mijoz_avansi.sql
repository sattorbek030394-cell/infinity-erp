-- PAY-04 / AT-11: qarzdan ortiq tushum rad etilmaydi, ortiqcha qism mijoz
-- avansi bo'ladi. Qarz hech qachon manfiy ko'rsatilmaydi.
--
-- `payments.amount` - qarzga yo'naltirilgan UZS (qoldiq hisobi shundan),
-- `payments.advance_amount` - shu to'lovdan ortib qolgan qism. Haqiqatda
-- olingan pul - ikkisining yig'indisi; kassa kirimi ham shu summa bo'ladi.
--
-- Tasdiq kutayotgan to'lovda taqsimot tasdiq paytida qayta hisoblanadi:
-- kutish davomida boshqa to'lov tasdiqlangan bo'lsa qarz kamayadi va
-- ortiqcha qism o'sadi. Shuning uchun `amount` nol bo'lishi mumkin -
-- hamma pul avansga tushsa.
ALTER TABLE payments ADD COLUMN advance_amount bigint NOT NULL DEFAULT 0
 CHECK(advance_amount >= 0);
ALTER TABLE payments DROP CONSTRAINT payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK(amount >= 0);
ALTER TABLE payments ADD CONSTRAINT payments_received_positive
 CHECK(amount + advance_amount > 0);

CREATE TABLE customer_advances (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 contract_id uuid NOT NULL,
 -- Har to'lovdan ko'pi bilan bitta avans yozuvi chiqadi.
 payment_id uuid NOT NULL UNIQUE,
 amount bigint NOT NULL CHECK(amount > 0),
 -- Avansni boshqa shartnomaga yo'naltirish alohida hujjat bilan bo'ladi
 -- (PAY-04). Hozircha ishlatilgan summa har doim nol.
 used_amount bigint NOT NULL DEFAULT 0 CHECK(used_amount >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 -- To'lov bekor qilinsa avans ham amaldan chiqadi, lekin yozuv o'chmaydi.
 voided_at timestamptz,
 CHECK(used_amount <= amount),
 FOREIGN KEY(tenant_id,branch_id,contract_id) REFERENCES contracts(tenant_id,branch_id,id),
 FOREIGN KEY(tenant_id,branch_id,payment_id) REFERENCES payments(tenant_id,branch_id,id),
 UNIQUE(tenant_id,branch_id,id)
);
CREATE INDEX customer_advances_contract
 ON customer_advances(tenant_id, branch_id, contract_id);
