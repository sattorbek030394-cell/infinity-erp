-- PAY-06: to'lov rol bo'yicha tasdiqlanadi.
--
-- Naqdni kassir tasdiqlaydi, P2P va bank tushumini rahbar. Tasdiq
-- kutayotgan summa qarzni kamaytirmaydi va hamyon qoldig'iga kirmaydi -
-- shuning uchun qoldiq hisoblaydigan har bir so'rov `status='approved'`
-- shartini qo'shadi.
--
-- Eski va Excel'dan ko'chgan yozuvlar `approved` bo'lib qoladi: ular
-- allaqachon tekshirilgan haqiqiy tushum. Ularda tasdiq tarixi yo'q,
-- shuning uchun `decided_by` va `decided_at` NULL bo'lishi mumkin.
ALTER TABLE payments ADD COLUMN status text NOT NULL DEFAULT 'approved'
 CHECK(status IN ('pending', 'approved', 'rejected'));
ALTER TABLE payments ADD COLUMN created_by uuid REFERENCES users;
ALTER TABLE payments ADD COLUMN decided_by uuid REFERENCES users;
ALTER TABLE payments ADD COLUMN decided_at timestamptz;
ALTER TABLE payments ADD COLUMN decided_reason text;
-- Tranzaksiya dalili: P2P/bank identifikatori yoki kvitansiya raqami.
ALTER TABLE payments ADD COLUMN evidence text NOT NULL DEFAULT ''
 CHECK(length(evidence) <= 160);

-- Tasdiq kutayotgan to'lovda qaror bo'lmaydi.
ALTER TABLE payments ADD CONSTRAINT payments_pending_undecided
 CHECK(status <> 'pending' OR num_nonnulls(decided_by, decided_at, decided_reason) = 0);
-- Rad etishda sabab majburiy (PAY-06).
ALTER TABLE payments ADD CONSTRAINT payments_reject_reason
 CHECK(status <> 'rejected' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL
  AND length(btrim(decided_reason)) BETWEEN 5 AND 160));
-- Bekor qilish faqat tasdiqlangan to'lovga tegishli: kutayotgani rad etiladi.
ALTER TABLE payments ADD CONSTRAINT payments_void_only_approved
 CHECK(voided_at IS NULL OR status = 'approved');

CREATE INDEX payments_pending ON payments(tenant_id, branch_id, created_at)
 WHERE status = 'pending';
