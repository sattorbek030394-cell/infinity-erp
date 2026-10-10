-- Infinity ERP — boshlang'ich sxema
-- Manba: "Yangi Hisobot 10.10.2026.xlsm" (Kirim, Chiqim, Nasiya, To'lovlar, Kassa daftari, Investor daftari)
-- Postgres 15+. Supabase, Neon yoki o'z serveringizda bir xil ishlaydi.

create extension if not exists "pgcrypto";

-- ============================================================ ma'lumotnomalar

create type sotuv_turi   as enum ('naqd', 'nasiya');
create type hamyon       as enum ('naqd_uzs', 'naqd_usd', 'karta', 'hisob_raqam');
create type shartnoma_holati as enum ('faol', 'kechikkan', 'yopilgan', 'bekor');
create type pul_yonalishi as enum ('kirim', 'chiqim');

create table xodimlar (
  id          uuid primary key default gen_random_uuid(),
  fish        text not null,
  telefon     text,
  rol         text not null default 'sotuvchi',   -- sotuvchi | admin | buxgalter
  faol        boolean not null default true,
  created_at  timestamptz not null default now()
);

create table yetkazib_beruvchilar (
  id          uuid primary key default gen_random_uuid(),
  nomi        text not null unique,
  telefon     text,
  izoh        text,
  created_at  timestamptz not null default now()
);

-- Kunlik USD kursi. Hamma hisob-kitob shu jadvalga tayanadi.
create table kurslar (
  sana        date primary key,
  usd_uzs     numeric(12,2) not null check (usd_uzs > 0)
);

-- ============================================================ tovar

create table qurilmalar (
  id            uuid primary key default gen_random_uuid(),
  imei          text not null unique,
  imei2         text,
  brend         text not null,
  model         text not null,
  xotira        text,
  sim_turi      text,
  rang          text,
  region        text,
  holati        text,          -- yangi / ishlatilgan ...
  batareyka     text,
  created_at    timestamptz not null default now()
);

create table kirimlar (
  id              uuid primary key default gen_random_uuid(),
  qurilma_id      uuid not null references qurilmalar(id) on delete restrict,
  sana            date not null,
  tannarx_usd     numeric(12,2) not null check (tannarx_usd >= 0),
  prognoz_narx_usd numeric(12,2),
  kurs            numeric(12,2) not null,
  yetkazib_id     uuid references yetkazib_beruvchilar(id),
  qabul_qiluvchi_id uuid references xodimlar(id),
  tolov_turi      text,        -- naqd / qarzga / investor tovari / trade-in
  izoh            text,
  created_at      timestamptz not null default now(),
  unique (qurilma_id)          -- bitta qurilma bir marta kirim bo'ladi
);

create index on kirimlar (sana);
create index on kirimlar (yetkazib_id);

-- ============================================================ mijoz va sotuv

create table mijozlar (
  id              uuid primary key default gen_random_uuid(),
  fish            text not null,
  pasport         text,
  pnfl            text unique,
  tugilgan_sana   date,
  telefon1        text,
  telefon2        text,
  manzil          text,
  icloud_akkaunt  text,
  icloud_raqam    text,
  izoh            text,
  created_at      timestamptz not null default now()
);

create index on mijozlar (fish);
create index on mijozlar (telefon1);

create table sotuvlar (
  id              uuid primary key default gen_random_uuid(),
  qurilma_id      uuid not null references qurilmalar(id) on delete restrict,
  sana            date not null,
  turi            sotuv_turi not null,
  narx_usd        numeric(12,2) not null check (narx_usd >= 0),
  kurs            numeric(12,2) not null,
  -- naqd sotuvda to'lov qanday tushgani; nasiyada boshlang'ich to'lov
  naqd_usd        numeric(12,2) not null default 0,
  naqd_uzs        numeric(14,2) not null default 0,
  karta_uzs       numeric(14,2) not null default 0,
  sotuvchi_id     uuid references xodimlar(id),
  kanal           text,        -- Instagram | Telegram | Eski mijoz | Tavsiya | Bozor | OLX
  izoh            text,
  created_at      timestamptz not null default now(),
  unique (qurilma_id)          -- bitta qurilma bir marta sotiladi
);

create index on sotuvlar (sana);
create index on sotuvlar (turi);
create index on sotuvlar (sotuvchi_id);

-- ============================================================ nasiya

create table shartnomalar (
  id                uuid primary key default gen_random_uuid(),
  raqam             text not null unique,            -- NS-000001
  sotuv_id          uuid not null references sotuvlar(id) on delete restrict unique,
  mijoz_id          uuid not null references mijozlar(id) on delete restrict,
  sana              date not null,
  kurs              numeric(12,2) not null,
  narx_uzs          numeric(14,2) not null check (narx_uzs > 0),
  boshlangich_uzs   numeric(14,2) not null default 0 check (boshlangich_uzs >= 0),
  muddat_oy         int not null check (muddat_oy between 1 and 36),
  oylik_ustama      numeric(5,4) not null default 0.05,   -- 0.05 = oyiga 5%
  -- hisoblanadigan maydonlar: yozilganda bir marta qotiriladi, chunki
  -- shartnoma imzolangandan keyin ular o'zgarmasligi kerak
  qolgan_uzs        numeric(14,2) not null,
  ustama_uzs        numeric(14,2) not null,
  jami_uzs          numeric(14,2) not null,
  oylik_tolov_uzs   numeric(14,2) not null,
  holat             shartnoma_holati not null default 'faol',
  bekor_sana        date,
  bekor_sababi      text,
  shartnoma_pdf     text,                             -- storage yo'li
  created_at        timestamptz not null default now(),
  created_by        uuid references xodimlar(id)
);

create index on shartnomalar (mijoz_id);
create index on shartnomalar (sana);
create index on shartnomalar (holat);

-- To'lov grafigi. Excelda yo'q edi — kechikishni aniq hisoblash uchun kerak.
create table grafik (
  id            uuid primary key default gen_random_uuid(),
  shartnoma_id  uuid not null references shartnomalar(id) on delete cascade,
  nomer         int not null check (nomer >= 1),
  muddat_sana   date not null,
  summa_uzs     numeric(14,2) not null check (summa_uzs > 0),
  unique (shartnoma_id, nomer)
);

create index on grafik (muddat_sana);

create table tolovlar (
  id            uuid primary key default gen_random_uuid(),
  shartnoma_id  uuid not null references shartnomalar(id) on delete restrict,
  sana          date not null,
  kurs          numeric(12,2) not null,
  naqd_usd      numeric(12,2) not null default 0,
  naqd_uzs      numeric(14,2) not null default 0,
  karta_uzs     numeric(14,2) not null default 0,
  jami_uzs      numeric(14,2) not null check (jami_uzs > 0),
  karta_turi    text,
  undiruvchi_id uuid references xodimlar(id),
  izoh          text,
  created_at    timestamptz not null default now()
);

create index on tolovlar (shartnoma_id);
create index on tolovlar (sana);

-- ============================================================ pul harakati

create table kassa (
  id            uuid primary key default gen_random_uuid(),
  sana          date not null,
  yonalish      pul_yonalishi not null,
  kategoriya    text not null,     -- Ijara | Oylik maosh | Reklama | Transport | ...
  hamyon_turi   hamyon not null,
  summa         numeric(14,2) not null check (summa > 0),
  kurs          numeric(12,2),
  yetkazib_id   uuid references yetkazib_beruvchilar(id),
  izoh          text,
  kiritgan_id   uuid references xodimlar(id),
  created_at    timestamptz not null default now()
);

create index on kassa (sana);
create index on kassa (kategoriya);

create table investorlar (
  id            uuid primary key default gen_random_uuid(),
  fish          text not null unique,
  telefon       text,
  created_at    timestamptz not null default now()
);

create table investor_harakatlari (
  id            uuid primary key default gen_random_uuid(),
  investor_id   uuid not null references investorlar(id) on delete restrict,
  sana          date not null,
  operatsiya    text not null,     -- Kapital kiritish | Kapital qaytarish | Daromad to'lovi
  shakl         text not null,     -- Naqd UZS | Naqd USD | Karta (P2P) | Hisob raqam | Tovar
  summa         numeric(14,2) not null,
  kurs          numeric(12,2),
  summa_usd     numeric(14,2) not null,
  izoh          text,
  created_at    timestamptz not null default now()
);

create index on investor_harakatlari (investor_id, sana);

-- ============================================================ hisoblanadigan ko'rinishlar

-- Shartnoma bo'yicha to'langan va qoldiq
create view v_shartnoma_holati as
select
  s.id,
  s.raqam,
  s.mijoz_id,
  s.sana,
  s.jami_uzs,
  coalesce(sum(t.jami_uzs), 0)                      as tolangan_uzs,
  s.jami_uzs - coalesce(sum(t.jami_uzs), 0)         as qoldiq_uzs
from shartnomalar s
left join tolovlar t on t.shartnoma_id = s.id
group by s.id;

-- Bugungacha to'lanishi kerak bo'lgan summa va kechikkan qarz.
-- Excelda bu DATEDIF bilan taxminiy hisoblanardi; bu yerda haqiqiy grafikdan olinadi.
create view v_qarzdorlik as
select
  s.id                                   as shartnoma_id,
  s.raqam,
  s.mijoz_id,
  h.tolangan_uzs,
  h.qoldiq_uzs,
  coalesce(g.kerak_uzs, 0)               as bugungacha_kerak_uzs,
  greatest(0, coalesce(g.kerak_uzs, 0) - h.tolangan_uzs) as kechikkan_uzs,
  g.eng_eski_muddat,
  case
    when h.qoldiq_uzs <= 100000 then 'yopilgan'
    when coalesce(g.kerak_uzs, 0) - h.tolangan_uzs > 0 then 'kechikkan'
    else 'faol'
  end::shartnoma_holati                  as hisoblangan_holat,
  case
    when coalesce(g.kerak_uzs, 0) - h.tolangan_uzs > 0
    then current_date - g.eng_eski_muddat
    else 0
  end                                    as kechikish_kun
from shartnomalar s
join v_shartnoma_holati h on h.id = s.id
left join lateral (
  select sum(summa_uzs) as kerak_uzs, min(muddat_sana) as eng_eski_muddat
  from grafik
  where shartnoma_id = s.id and muddat_sana <= current_date
) g on true
where s.holat <> 'bekor';

-- Oyma-oy undirish plani: grafik bo'yicha tushishi kerak bo'lgan pul
create view v_undirish_plani as
select date_trunc('month', muddat_sana)::date as oy,
       sum(summa_uzs) as plan_uzs
from grafik g
join shartnomalar s on s.id = g.shartnoma_id and s.holat <> 'bekor'
group by 1;
