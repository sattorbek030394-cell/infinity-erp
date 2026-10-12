-- Excel ko'chirilgandan keyin kiradigan odamlarni yaratadi.
-- Email kichik harflarda bo'lishi shart - login shunday qidiradi.
-- Parollar kamida 12 belgi. Bu faylni parol yozilgan holda GitHubga YUBORMANG;
-- ishlatib bo'lgach parollarni CHANGE_ME ga qaytaring.
--
--     psql "$DATABASE_URL" -f tools/excel-import/users.sql
--
-- Keyin har bir odam birinchi kirishida parolini o'zgartirsin. Parolni
-- almashtirish ekrani hali yo'q, shuning uchun hozircha shu faylni qayta
-- ishga tushirish orqali o'zgartiriladi.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

\set ikkinchi_filial 'Ikkinchi do''kon'
\set admin_email   'sattorbek@infinity.uz'
\set admin_parol   'CHANGE_ME_12+'
\set sotuvchi1_email 'jamoliddin@infinity.uz'
\set sotuvchi1_parol 'CHANGE_ME_12+'
\set sotuvchi2_email 'jahongir@infinity.uz'
\set sotuvchi2_parol 'CHANGE_ME_12+'

BEGIN;

-- Ikkinchi do'kon. Excel'dan ko'chgan ma'lumot birinchi filialga tushadi,
-- ikkinchisi bo'sh boshlanadi.
INSERT INTO branches(id, tenant_id, name)
SELECT gen_random_uuid(), id, :'ikkinchi_filial' FROM tenants WHERE name = 'Infinity'
  AND NOT EXISTS (SELECT 1 FROM branches WHERE name = :'ikkinchi_filial');

WITH t AS (SELECT id FROM tenants WHERE name = 'Infinity'),
     b AS (SELECT id, tenant_id FROM branches WHERE tenant_id = (SELECT id FROM t)),
     yangi(email, parol, rol) AS (
       VALUES (lower(:'admin_email'),     :'admin_parol',     'admin'),
              (lower(:'sotuvchi1_email'), :'sotuvchi1_parol', 'cashier'),
              (lower(:'sotuvchi2_email'), :'sotuvchi2_parol', 'cashier')
     ),
     qo_shildi AS (
       INSERT INTO users(id, email, password_hash)
       SELECT gen_random_uuid(), email, crypt(parol, gen_salt('bf', 12)) FROM yangi
       ON CONFLICT (email) DO UPDATE SET password_hash = excluded.password_hash
       RETURNING id, email
     )
INSERT INTO memberships(user_id, tenant_id, branch_id, role)
SELECT q.id, b.tenant_id, b.id, y.rol
FROM qo_shildi q JOIN yangi y ON y.email = q.email CROSS JOIN b
ON CONFLICT (user_id, branch_id) DO UPDATE SET role = excluded.role;

COMMIT;

-- Tekshirish: kim qaysi filialga qanday huquq bilan kira oladi
SELECT u.email, b.name AS filial, m.role
FROM users u
JOIN memberships m ON m.user_id = u.id
JOIN branches b ON b.id = m.branch_id
ORDER BY u.email, b.name;
