-- PAY-07/08/09: shartnomani to'liq yopish va muddatidan oldin yopishda
-- kelgusi oylar ustamasini avtomatik olib tashlash.
--
-- Yopish hisobi (quote) shu biznes kuni uchun amal qiladi: keyingi kunga
-- o'tilsa yoki boshqa to'lov tasdiqlansa qayta hisoblanadi.
--
-- `markup_cancelled` - bekor qilingan kelgusi ustama. Bu real pul tushumi
-- emas, kassaga kirim yaratmaydi: u faqat qolgan ustamani va daromad
-- hisobini tuzatadi. Shuning uchun shartnoma qoldig'i hisoblanganda
-- tasdiqlangan to'lovlar bilan birga shu summa ham ayriladi.
CREATE TABLE contract_closures (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 contract_id uuid NOT NULL,
 -- quoted: hisoblangan, to'lov/tasdiq kutilmoqda
 -- completed: yakunlangan, shartnoma yopilgan
 -- cancelled: operator bekor qildi yoki qayta hisoblandi
 -- reversed: yopilgandan keyin to'lov qaytarildi, yopish teskari qilindi
 status text NOT NULL CHECK(status IN ('quoted','completed','cancelled','reversed')),
 -- early: muddatidan oldin, scheduled: jadval bo'yicha (PAY-09)
 kind text NOT NULL CHECK(kind IN ('early','scheduled')),
 quote_date date NOT NULL,
 periods_elapsed int NOT NULL CHECK(periods_elapsed >= 0),
 debt_before bigint NOT NULL CHECK(debt_before > 0),
 markup_kept bigint NOT NULL CHECK(markup_kept >= 0),
 markup_cancelled bigint NOT NULL CHECK(markup_cancelled >= 0),
 close_amount bigint NOT NULL CHECK(close_amount >= 0),
 created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid REFERENCES users,
 decided_at timestamptz,
 note text NOT NULL DEFAULT '' CHECK(length(note) <= 160),
 CHECK(debt_before = markup_cancelled + close_amount),
 CHECK(status = 'quoted' OR num_nonnulls(decided_by, decided_at) = 2),
 FOREIGN KEY(tenant_id,branch_id,contract_id) REFERENCES contracts(tenant_id,branch_id,id),
 UNIQUE(tenant_id,branch_id,id)
);
-- Bir shartnomada bir vaqtda bitta faol hisob va bitta yakunlangan yopish.
CREATE UNIQUE INDEX contract_closures_active
 ON contract_closures(contract_id) WHERE status = 'quoted';
CREATE UNIQUE INDEX contract_closures_done
 ON contract_closures(contract_id) WHERE status = 'completed';
CREATE INDEX contract_closures_report
 ON contract_closures(tenant_id, branch_id, status, decided_at);
