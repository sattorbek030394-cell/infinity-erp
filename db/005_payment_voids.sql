ALTER TABLE payments ADD COLUMN voided_at timestamptz;
ALTER TABLE payments ADD COLUMN voided_by uuid REFERENCES users;
ALTER TABLE payments ADD COLUMN void_reason text;
ALTER TABLE payments ADD COLUMN void_request_key uuid UNIQUE;
ALTER TABLE payments ADD CONSTRAINT payment_void_operation FOREIGN KEY(tenant_id,branch_id,void_request_key) REFERENCES cash_operations(tenant_id,branch_id,id);
ALTER TABLE payments ADD CONSTRAINT payment_void_complete CHECK(num_nonnulls(voided_at,voided_by,void_reason,void_request_key) IN (0,4));
ALTER TABLE payments ADD CONSTRAINT payment_void_reason CHECK(void_reason IS NULL OR length(trim(void_reason)) BETWEEN 5 AND 160);
