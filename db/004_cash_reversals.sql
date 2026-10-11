ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_scope UNIQUE(tenant_id,branch_id,id);
ALTER TABLE cash_entries ADD COLUMN reversal_of uuid UNIQUE;
ALTER TABLE cash_entries ADD CONSTRAINT cash_reversal_scope FOREIGN KEY(tenant_id,branch_id,reversal_of) REFERENCES cash_entries(tenant_id,branch_id,id);
