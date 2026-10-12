-- Yopilgan oyning foyda hisobotini muzlatish (TZ 6.9 + 6.10).
--
-- Investor ulushi oy yopilganda muzlatilardi, lekin o'sha ulush
-- hisoblangan FOYDA raqami muzlatilmagan edi. Natijada keyin eski
-- to'lov bekor qilinsa yoki shartnoma erta yopilsa, o'tgan oyning
-- hisoboti o'zgarib ketardi - investorga bir marta bir xil, keyin
-- boshqa raqam ko'rsatilardi.
--
-- Endi oy yopilganda o'sha oyning butun hisobot qatori saqlanadi va
-- hisobot shundan o'qiladi. Keyingi tuzatishlar joriy oyda ko'rinadi,
-- o'tgan oyni qayta yozmaydi.
--
-- Saqlash shakli jsonb: snapshot faqat ko'rsatish uchun o'qiladi,
-- ustunlari esa hisobot qatori bilan birga o'sib boradi. Har yangi
-- ko'rsatkich uchun migratsiya yozib o'tirmaslik kerak.
CREATE TABLE profit_snapshots (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  month date NOT NULL CHECK (date_trunc('month', month)::date = month),
  data jsonb NOT NULL,
  kurs bigint NOT NULL CHECK (kurs >= 0),
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, month),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);
