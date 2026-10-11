-- Nasiya berish qarori: qora ro'yxat va mijoz limiti (taklif 3.1).
--
-- Limit raqamlari 150 ta haqiqiy shartnoma tahlilidan olingan:
--   * 139 mijozdan 129 tasida bitta shartnoma, 9 tasida ikkita, 1 tasida uchta;
--     uchta shartnomali mijozda kechikish 25% (bittasida 6.5%, ikkitasida 7.6%).
--     Shuning uchun avtomatik chegara - 2 ta faol shartnoma.
--   * Bir mijozdagi qoldiq: o'rtacha 6.8 mln, median 6.2 mln, 90-protsentil
--     13.7 mln, eng kattasi 20.7 mln. Eng katta bitta shartnoma 21.7 mln
--     (Iphone 17 Pro Max). 25 mln chegara hozirgi birorta mijozni to'xtatmaydi,
--     lekin bir mijozning ta'sirini portfelning ~3% bilan cheklaydi.
--   * Qattiq chegara 40 mln: undan oshishga rahbar ham ruxsat bermaydi.
--   * Zaxira 5% - egasi belgilagan nevozvrat chegarasi. Hozirgi portfelda
--     870 mln dan 43.5 mln.
ALTER TABLE customers ADD COLUMN blocked_at timestamptz;
ALTER TABLE customers ADD COLUMN blocked_by uuid REFERENCES users;
ALTER TABLE customers ADD COLUMN blocked_reason text;
ALTER TABLE customers ADD CONSTRAINT customers_block_complete
 CHECK(blocked_at IS NULL OR (blocked_by IS NOT NULL
  AND length(btrim(blocked_reason)) BETWEEN 5 AND 160));

ALTER TABLE nasiya_settings ADD COLUMN max_active_contracts int NOT NULL DEFAULT 2
 CHECK(max_active_contracts BETWEEN 1 AND 20);
ALTER TABLE nasiya_settings ADD COLUMN max_exposure bigint NOT NULL DEFAULT 25000000
 CHECK(max_exposure > 0);
ALTER TABLE nasiya_settings ADD COLUMN hard_exposure bigint NOT NULL DEFAULT 40000000
 CHECK(hard_exposure > 0);
ALTER TABLE nasiya_settings ADD COLUMN reserve_bp int NOT NULL DEFAULT 500
 CHECK(reserve_bp BETWEEN 0 AND 10000);
ALTER TABLE nasiya_settings ADD CONSTRAINT nasiya_settings_exposure_order
 CHECK(hard_exposure >= max_exposure);

-- Har filialda sozlama qatori bo'lsin; yangi filialga kod sukut qiymatlarni
-- beradi.
INSERT INTO nasiya_settings(tenant_id, branch_id)
SELECT tenant_id, id FROM branches ON CONFLICT DO NOTHING;

-- Limitdan oshirib tuzilgan shartnomada kim ruxsat berganini saqlaymiz.
ALTER TABLE contracts ADD COLUMN limit_override_by uuid REFERENCES users;
ALTER TABLE contracts ADD COLUMN limit_override_reason text;
ALTER TABLE contracts ADD CONSTRAINT contracts_override_complete
 CHECK(limit_override_by IS NULL OR
  length(btrim(limit_override_reason)) BETWEEN 5 AND 160);
