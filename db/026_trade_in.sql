-- Trade-in: mijozning eski telefoni boshlang'ich to'lovning bir qismi
-- (TZ INV-01, taklif 3.10).
--
-- Avval boshlang'ich to'lov faqat pul edi. Mijoz eski telefon bersa,
-- sotuvchi uni naqd deb yozishga majbur bo'lardi - kassada kelmagan pul
-- ko'rinib qolardi va kun yopilishida farq chiqardi.
--
-- Endi eski telefon avval Kirimga "Trade-in" turi bilan olinadi (kassadan
-- pul chiqmaydi, yetkazib beruvchi qarzi ham tug'ilmaydi: u boshlang'ich
-- to'lovning chegirmasi bilan "to'langan"), so'ngra shartnomaga
-- bog'lanadi. Kassaga esa faqat pul qismi tushadi:
--
--   kassaga = boshlang'ich to'lov − trade-in qurilmaning tannarxi
--
-- Qurilma omborda tannarxi bilan turadi va keyin sotilganda marja
-- o'sha baholashdan hisoblanadi. Alohida "baholash summasi" ustuni
-- qo'yilmadi: bitta raqam - tannarx - ikki joyda bir xil bo'lsin.
ALTER TABLE contracts ADD COLUMN trade_in_id uuid UNIQUE;
ALTER TABLE contracts ADD CONSTRAINT contracts_trade_in_scope
  FOREIGN KEY (tenant_id, branch_id, trade_in_id)
  REFERENCES inventory (tenant_id, branch_id, id);
-- Sotilayotgan qurilmaning o'zi trade-in bo'lib qolmasin.
ALTER TABLE contracts ADD CONSTRAINT contracts_trade_in_other
  CHECK (trade_in_id IS NULL OR trade_in_id <> inventory_id);
