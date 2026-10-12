-- Investor kapitalining pul tomoni kassaga bog'lanadi.
--
-- Avval investor daftari kassadan ajralgan edi: investor naqd kiritsa
-- yoki daromadini olsa, o'sha pulni kassaga qo'lda ikkinchi marta
-- yozish kerak edi. Ikki marta yozilgan narsa ertami-kechmi bir-biriga
-- to'g'ri kelmay qoladi, shuning uchun endi bitta yozuv ikki joyda
-- ko'rinadi.
--
-- Tovar ko'rinishidagi kapital kassaga tegmaydi - pul harakati yo'q.
ALTER TABLE cash_entries ADD COLUMN investor_entry_id uuid UNIQUE;
ALTER TABLE cash_entries ADD CONSTRAINT cash_investor_scope
  FOREIGN KEY (investor_entry_id) REFERENCES investor_entries (id);
ALTER TABLE cash_entries DROP CONSTRAINT cash_entry_source;
ALTER TABLE cash_entries ADD CONSTRAINT cash_entry_source CHECK (
  num_nonnulls(
    operation_id, payment_id, contract_id, sale_id,
    inventory_id, settlement_id, investor_entry_id
  ) = 1
);
