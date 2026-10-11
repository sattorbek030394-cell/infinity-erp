ALTER TABLE payments ADD CONSTRAINT payments_cash_scope UNIQUE(tenant_id,branch_id,id);
CREATE TABLE cash_wallets (
 tenant_id uuid NOT NULL, branch_id uuid NOT NULL,
 wallet text NOT NULL CHECK(wallet IN ('cash_uzs','cash_usd','card_uzs','bank_uzs')),
 opening_date date, opening_minor bigint CHECK(opening_minor BETWEEN 0 AND 1000000000000),
 PRIMARY KEY(tenant_id,branch_id,wallet),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CHECK((opening_date IS NULL)=(opening_minor IS NULL))
);
CREATE TABLE cash_operations (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,branch_id uuid NOT NULL,input_hash text NOT NULL,
 UNIQUE(tenant_id,branch_id,id), FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TABLE cash_entries (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,branch_id uuid NOT NULL,wallet text NOT NULL,
 entry_date date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor<>0 AND amount_minor BETWEEN -1000000000000 AND 1000000000000),
 category text NOT NULL,note text NOT NULL DEFAULT '',user_id uuid NOT NULL REFERENCES users,
 operation_id uuid,payment_id uuid UNIQUE,contract_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,branch_id,wallet) REFERENCES cash_wallets(tenant_id,branch_id,wallet),
 FOREIGN KEY(tenant_id,branch_id,operation_id) REFERENCES cash_operations(tenant_id,branch_id,id),
 FOREIGN KEY(tenant_id,branch_id,payment_id) REFERENCES payments(tenant_id,branch_id,id),
 FOREIGN KEY(tenant_id,branch_id,contract_id) REFERENCES contracts(tenant_id,branch_id,id),
 UNIQUE(operation_id,wallet),CHECK(num_nonnulls(operation_id,payment_id,contract_id)=1)
);
CREATE INDEX cash_entries_scope_date ON cash_entries(tenant_id,branch_id,entry_date,id);
