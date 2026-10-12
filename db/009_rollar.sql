-- Texnik topshiriqning 5-bo'limidagi rollar. Ilgari uchtasi bor edi
-- (admin, cashier, viewer), topshiriqda esa sakkizta: rahbar pul tushumini
-- tasdiqlaydi, omborchi pulga tegmaydi, undiruvchi faqat to'lov kiritadi,
-- hisobchi faqat ko'radi va solishtiradi.
--
-- Rolning qaysi amalga huquqi borligi kodda - `lib/domain.ts` dagi HUQUQLAR
-- jadvalida. Baza faqat rol nomini cheklaydi.
ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK(role IN (
 'admin',      -- hisoblar, rollar, konfiguratsiya; hozircha egasi ham shu
 'manager',    -- rahbar: P2P/bank tushumini tasdiqlash, qaytarish, hisobotlar
 'cashier',    -- kassir: naqd qabul va tasdiqlash, kassa, kun yopish
 'seller',     -- sotuvchi: ombor ko'rish, mijoz, sotuv va nasiya loyihasi
 'warehouse',  -- omborchi: kirim va inventarizatsiya; pulga ruxsat yo'q
 'collector',  -- undiruvchi: biriktirilgan qarzdorlar va to'lov kiritish
 'accountant', -- hisobchi: solishtirish, foyda, eksport
 'viewer',     -- faqat ko'rish
 'disabled'    -- ishdan bo'shagan xodim: hech qanday huquq yo'q
));
