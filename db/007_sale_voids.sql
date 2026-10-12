ALTER TABLE cash_sales ADD COLUMN voided_at timestamptz;
ALTER TABLE cash_sales ADD COLUMN voided_by uuid REFERENCES users;
ALTER TABLE cash_sales ADD COLUMN void_reason text;
ALTER TABLE cash_sales ADD COLUMN void_request_key uuid UNIQUE;
ALTER TABLE cash_sales ADD CONSTRAINT sale_void_operation FOREIGN KEY(tenant_id,branch_id,void_request_key) REFERENCES cash_operations(tenant_id,branch_id,id);
ALTER TABLE cash_sales ADD CONSTRAINT sale_void_complete CHECK(num_nonnulls(voided_at,voided_by,void_reason,void_request_key) IN (0,4));
ALTER TABLE cash_sales ADD CONSTRAINT sale_void_reason CHECK(void_reason IS NULL OR length(trim(void_reason)) BETWEEN 5 AND 160);
ALTER TABLE cash_sales DROP CONSTRAINT cash_sales_inventory_id_key;
CREATE UNIQUE INDEX cash_sales_active_inventory ON cash_sales(inventory_id) WHERE voided_at IS NULL;
