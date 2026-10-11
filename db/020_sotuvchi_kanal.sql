-- Sotuvchi va sotuv kanali (TZ SALE-01, REP: sotuvchi/kanal natijalari).
--
-- Excel'da bu ma'lumot bor va boy: sotuvchilar Jamoliddin (206) va
-- Jahongir (15); kanallar Bozor (77), Instagram (68), Eski mijoz (44),
-- Tavsiya (31), Telegram (1). Dasturda esa sotuvni kim qilgani faqat
-- audit yozuvida qolardi, kanal esa hech qayerda.
--
-- Nomi matn sifatida saqlanadi: sotuvchi dasturda hisob ochmagan bo'lishi
-- mumkin (bitta umumiy hisobdan ishlashadi).
ALTER TABLE contracts ADD COLUMN seller text NOT NULL DEFAULT ''
 CHECK(length(seller) <= 80);
ALTER TABLE contracts ADD COLUMN channel text NOT NULL DEFAULT ''
 CHECK(length(channel) <= 40);
ALTER TABLE cash_sales ADD COLUMN seller text NOT NULL DEFAULT ''
 CHECK(length(seller) <= 80);
ALTER TABLE cash_sales ADD COLUMN channel text NOT NULL DEFAULT ''
 CHECK(length(channel) <= 40);
CREATE INDEX contracts_seller ON contracts(tenant_id, branch_id, seller);
CREATE INDEX cash_sales_seller ON cash_sales(tenant_id, branch_id, seller);
