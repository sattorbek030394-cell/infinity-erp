-- Qurilma nazorati: iCloud/MDM holati va bloklash hujjati (taklif 3.2).
--
-- Amalda nasiyani undirishning asosiy vositasi shu. Ilgari iCloud faqat
-- mijoz kartochkasidagi matn edi - kim, qachon, nega bloklagani hech
-- qayerda qolmasdi. Endi har qaror hujjat bo'lib yoziladi.
--
-- MUHIM: bloklash huquqi shartnoma matnida yozilgan bo'lishi kerak.
-- Buni yurist tekshirishi lozim; dastur faqat qarorni qayd etadi.
ALTER TABLE contracts ADD COLUMN control_state text NOT NULL DEFAULT 'none'
 CHECK(control_state IN ('none', 'installed', 'blocked', 'released'));

CREATE TABLE device_controls (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 contract_id uuid NOT NULL,
 -- install: iCloud/MDM o'rnatildi, block: kechikish uchun bloklandi,
 -- unblock: ochildi, release: shartnoma yopilgach nazoratdan chiqarildi
 action text NOT NULL CHECK(action IN ('install', 'block', 'unblock', 'release')),
 reason text NOT NULL DEFAULT '' CHECK(length(reason) <= 160),
 -- Qaror paytidagi kechikish kuni va qarz - keyin tekshirish uchun
 days_late int,
 debt bigint,
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,branch_id,contract_id) REFERENCES contracts(tenant_id,branch_id,id),
 -- Bloklashda sabab majburiy.
 CHECK(action <> 'block' OR length(btrim(reason)) BETWEEN 5 AND 160)
);
CREATE INDEX device_controls_contract
 ON device_controls(tenant_id, branch_id, contract_id, created_at);
