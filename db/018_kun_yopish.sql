-- CASH-04: kun yopish.
--
-- Kun oxirida kassir har hamyonni sanaydi: dastur hisoblagan qoldiq va
-- haqiqatda sanalgan summa yoziladi, farq ko'rinadi. Yopilgan kunga
-- (va undan oldingi kunlarga) yangi yozuv kirmaydi - nasiya to'lovi,
-- xarid yoki qarz to'lovi ham chetlab o'tolmaydi.
--
-- Qayta ochish rahbar huquqi: sabab majburiy va yozuv tarixda qoladi.
CREATE TABLE cash_closings (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 day date NOT NULL,
 note text NOT NULL DEFAULT '' CHECK(length(note) <= 160),
 closed_by uuid NOT NULL REFERENCES users,
 closed_at timestamptz NOT NULL DEFAULT now(),
 reopened_by uuid REFERENCES users,
 reopened_at timestamptz,
 reopen_reason text,
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CHECK(num_nonnulls(reopened_by, reopened_at, reopen_reason) IN (0, 3)),
 CHECK(reopen_reason IS NULL
  OR length(btrim(reopen_reason)) BETWEEN 5 AND 160)
);
-- Bir kunga bir vaqtda bitta amaldagi yopish; qayta ochilgani tarixda qoladi.
CREATE UNIQUE INDEX cash_closings_active
 ON cash_closings(tenant_id, branch_id, day) WHERE reopened_at IS NULL;

CREATE TABLE cash_closing_lines (
 closing_id uuid NOT NULL REFERENCES cash_closings,
 wallet text NOT NULL,
 -- Dastur hisoblagan va kassir sanagan qoldiq, hamyon birligida.
 computed_minor bigint NOT NULL,
 counted_minor bigint NOT NULL,
 PRIMARY KEY(closing_id, wallet)
);
