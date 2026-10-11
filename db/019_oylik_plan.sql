-- Oylik reja (TZ 6.9): ko'rsatkich, plan, fakt, foiz, qolgan va kunlik norma.
--
-- Excel'ning "Hisobot" varag'idagi plan-fakt shu yerga ko'chadi. Naqd va
-- nasiya alohida: egasi aynan shunday so'ragan edi.
CREATE TABLE monthly_targets (
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 month date NOT NULL,
 metric text NOT NULL CHECK(metric IN (
  'sotuv_dona_naqd', 'sotuv_dona_nasiya',
  'sotuv_summa_naqd', 'sotuv_summa_nasiya',
  'undirish', 'sof_foyda')),
 value bigint NOT NULL CHECK(value >= 0),
 updated_by uuid NOT NULL REFERENCES users,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id, branch_id, month, metric),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 -- Oyning 1-sanasi saqlanadi, aks holda bir oyga ikki qator chiqadi.
 CHECK(date_trunc('month', month)::date = month)
);
