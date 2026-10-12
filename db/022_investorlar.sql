-- Investor kapitali (TZ 6.10).
--
-- Hisob DOLLARDA yuritiladi: telefon dollarga olinadi, investor kapitali
-- ham dollarda kirgan. Hamma summa sentda.
--
-- Kapital hisobvarag'i modeli:
--   kapital = kirim + hisoblangan foyda − hisoblangan zarar − qaytarilgan
-- Hisoblangan, lekin olinmagan daromad kapitalga qo'shiladi va keyingi
-- oydan o'zi ham kapital-kun ishlaydi; zarar ulushi esa kapitaldan
-- ayriladi. Foyda va zarar bir xil yo'l bilan yuradi, istisno yo'q.
--
-- Hamma harakat bitta daftarda turadi, shuning uchun istalgan kundagi
-- kapital qoldig'i shu kungacha bo'lgan yozuvlar yig'indisidan chiqadi -
-- alohida "qoldiq" ustuni yo'q, demak u eskirib qolishi ham mumkin emas.
CREATE TABLE investors (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  phone text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Chiqib ketgan investor: yozuvlari qoladi, yangi kirim yozilmaydi.
  closed_at timestamptz,
  UNIQUE (tenant_id, branch_id, name),
  UNIQUE (tenant_id, branch_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);

-- Kapital daftari. `cents` ishorasi harakatning yo'nalishini bildiradi:
-- musbat kapitalni oshiradi, manfiy kamaytiradi.
--
--   capital  + pul yoki tovar kiritildi
--   return   − kapital qaytarildi
--   profit   + oylik foyda ulushi kapitalga qo'shildi (reinvestitsiya)
--   loss     − oylik zarar ulushi kapitaldan ayrildi
--   payout   − hisoblangan daromad pul qilib olindi
CREATE TABLE investor_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  investor_id uuid NOT NULL,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('capital', 'return', 'profit', 'loss', 'payout')),
  -- Tovar ko'rinishidagi kapital tannarx bo'yicha, omborga kirgan kun
  -- bilan yoziladi; `accrual` - oy yopilishida hisoblangan yozuv.
  form text NOT NULL CHECK (form IN ('cash', 'goods', 'accrual')),
  cents bigint NOT NULL CHECK (cents <> 0 AND abs(cents) <= 100000000000),
  note text NOT NULL DEFAULT '',
  -- Oylik taqsimotdan chiqqan yozuv qaysi oyga tegishli.
  month date,
  created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES users,
  void_reason text,
  FOREIGN KEY (tenant_id, branch_id, investor_id)
    REFERENCES investors (tenant_id, branch_id, id),
  -- Kirim musbat, qaytarim va zarar manfiy: ishora turga mos kelsin.
  CONSTRAINT investor_entry_sign CHECK (
    CASE kind
      WHEN 'capital' THEN cents > 0
      WHEN 'profit' THEN cents > 0
      ELSE cents < 0
    END
  ),
  -- Hisoblangan yozuv oyga bog'langan, qo'lda kiritilgani esa emas.
  CONSTRAINT investor_entry_month CHECK (
    (form = 'accrual') = (month IS NOT NULL)
    AND (month IS NULL OR date_trunc('month', month)::date = month)
  ),
  CONSTRAINT investor_entry_void CHECK (
    (voided_at IS NULL) = (voided_by IS NULL)
    AND (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) BETWEEN 5 AND 160)
  )
);
CREATE INDEX investor_entries_scope
  ON investor_entries (tenant_id, branch_id, investor_id, day);

-- Oylik taqsimot: qaysi oy qanday qoida bilan hisoblangani va yopilgani.
-- Yopilgan oy muzlatiladi - keyingi oylar uni qayta hisoblamaydi.
CREATE TABLE investor_months (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  month date NOT NULL CHECK (date_trunc('month', month)::date = month),
  -- 'capital_month' - 2026 mart-sentabr: butun davr "kapital x oy"
  -- 'open_capital'  - oy boshidagi kapital
  -- 'daily'         - oy ichida kunlik o'rtacha kapital (asosiy qoida)
  rule text NOT NULL CHECK (rule IN ('capital_month', 'open_capital', 'daily')),
  -- Investorlarga tegishli natija (sof foydaning 80% i), sentda.
  -- Manfiy bo'lishi mumkin: zarar ham shu yo'l bilan taqsimlanadi.
  profit_cents bigint NOT NULL,
  rate bigint NOT NULL CHECK (rate > 0),
  closed_by uuid REFERENCES users,
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, month),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)
);

-- Oy yopilgandagi muzlatilgan natija: kimga qancha va qanday kapital-kun
-- bilan. Summalar `investor_entries` ga ham yoziladi; bu jadval esa
-- hisoblashning o'zini saqlaydi, keyin "qanday chiqdi" degan savolga
-- javob berish uchun.
CREATE TABLE investor_shares (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  month date NOT NULL,
  investor_id uuid NOT NULL,
  capital_days bigint NOT NULL CHECK (capital_days >= 0),
  cents bigint NOT NULL,
  PRIMARY KEY (tenant_id, branch_id, month, investor_id),
  FOREIGN KEY (tenant_id, branch_id, month)
    REFERENCES investor_months (tenant_id, branch_id, month) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id, investor_id)
    REFERENCES investors (tenant_id, branch_id, id)
);
