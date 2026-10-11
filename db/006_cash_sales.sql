CREATE TABLE cash_sales (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 inventory_id uuid NOT NULL UNIQUE,amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),
 method text NOT NULL CHECK(method IN ('cash','card','transfer')),
 customer_label text NOT NULL DEFAULT '',user_id uuid NOT NULL REFERENCES users,
 request_key uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,branch_id,id),
 FOREIGN KEY(tenant_id,branch_id,inventory_id) REFERENCES inventory(tenant_id,branch_id,id),
 FOREIGN KEY(tenant_id,branch_id,request_key) REFERENCES cash_operations(tenant_id,branch_id,id)
);
ALTER TABLE cash_entries ADD COLUMN sale_id uuid UNIQUE;
ALTER TABLE cash_entries ADD CONSTRAINT cash_sale_scope FOREIGN KEY(tenant_id,branch_id,sale_id) REFERENCES cash_sales(tenant_id,branch_id,id);
ALTER TABLE cash_entries DROP CONSTRAINT cash_entries_check;
ALTER TABLE cash_entries ADD CONSTRAINT cash_entry_source CHECK(num_nonnulls(operation_id,payment_id,contract_id,sale_id)=1);
CREATE INDEX cash_sales_scope_time ON cash_sales(tenant_id,branch_id,created_at,id);
