import { scope } from "./auth";
import { db } from "./db";
import { can } from "./domain";
import { qarzSql, qarzCentsSql, tolanganSql } from "./qarz-sql";
import { readTargets, METRICS, type Metric } from "./targets";

/**
 * Oylik foyda hisoboti (TZ 6.9).
 *
 * Boshqaruv hisobi, rasmiy buxgalteriya foydasi emas. Uch qismdan iborat:
 *
 *   sotuv marjasi   = sotilgan qurilma narxi − tannarxi
 *   nasiya daromadi = tasdiqlangan to'lovdagi ustama ulushi
 *   xarajat         = kassadan chiqqan operatsion pul
 *
 *   sof foyda = sotuv marjasi + nasiya daromadi − xarajat
 *
 * Qoidalar:
 * - Nasiya daromadi to'lov tushganda tan olinadi, shartnoma tuzilganda
 *   emas: ustama ulushi = ustama / (asosiy qarz + ustama).
 * - Boshlang'ich to'lov va mijoz avansi nasiya daromadiga kirmaydi:
 *   boshlang'ich qurilma narxining bir qismi, avans esa hali qarz emas.
 * - Muddatidan oldin yopishda bekor qilingan ustama daromaddan ayriladi,
 *   lekin to'liq emas: to'lov ustamani proporsional tan olgani uchun
 *   yopish to'lovi bilan ortiqcha tan olingan qism faqat bekor qilingan
 *   summaning asosiy qarzga to'g'ri keladigan ulushi. Shuning uchun
 *   tuzatish = bekor * asosiy / (asosiy + ustama). To'liq summani ayirish
 *   allaqachon tan olingan daromadni ham o'chirib yuborardi.
 * - Bekor qilingan to'lov sanalmaydi.
 * - Telefon xaridi va ta'minotchiga qarz to'lovi xarajat emas: ular
 *   tovarga ketgan pul va tannarx orqali marjada hisobga olingan.
 * - Egasi va investor olgan pul xarajat emas, foyda taqsimoti - alohida
 *   ko'rsatiladi.
 * - Dollardagi xarajat oy oxiridagi ma'lum kurs bilan so'mga o'tkaziladi;
 *   kurs hisobotda ko'rinadi (TZ 4.4: valyutalar jim qo'shilmaydi).
 */
export type OylikFoyda = {
  oy: string;
  nasiyaSoni: number;
  nasiyaNarx: number;
  nasiyaTannarx: number;
  naqdSoni: number;
  naqdNarx: number;
  naqdTannarx: number;
  qarzSoni: number;
  qarzNarx: number;
  qarzTannarx: number;
  marja: number;
  ustama: number;
  bekorUstama: number;
  kursFarqi: number;
  xarajatUzs: number;
  xarajatUsd: number;
  taqsimotUzs: number;
  taqsimotUsd: number;
  sofFoyda: number;
  /** Oy yopilgan - raqamlar o'sha paytda muzlatilgan. */
  muzlatilgan?: boolean;
};

export const CHIQIM_EMAS = [
  "Hamyonlar orasida o‘tkazma",
  "Telefon xaridi",
  "Yetkazib beruvchiga qarz to‘lovi",
  "Nasiya to‘lovini bekor qilish",
];
export const TAQSIMOT = ["Egasi oldi", "Investorga to‘lov"];

/** Oyning birinchi kuni, YYYY-MM-01. */
const boshi = (oy: string) => oy + "-01";

export async function readProfit(branchId: string, oyRaw: string, oylar = 6) {
  const s = await scope(branchId);
  // Oy YYYY-MM shaklida bo'lsin: to'g'ridan-to'g'ri sanaga aylantiriladi.
  const oy = /^\d{4}-(0[1-9]|1[0-2])$/.test(oyRaw)
    ? oyRaw
    : (
        await db.query(
          "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
        )
      ).rows[0].oy;
  const args = [s.tenant_id, s.branch_id];
  const bugun = (
    await db.query(
      "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d",
    )
  ).rows[0].d as string;
  // Oyna: tanlangan oy va undan oldingi oylar.
  const [yil, oyRaqam] = oy.split("-").map(Number);
  const oyna = Array.from({ length: oylar }, (_, i) =>
    new Date(Date.UTC(yil, oyRaqam - 1 - (oylar - 1 - i), 1))
      .toISOString()
      .slice(0, 7),
  );
  const dan = boshi(oyna[0]);

  const q = async (sql: string) =>
    (await db.query(sql, [...args, dan, boshi(oy)])).rows;

  // Shartnomali sotuv: shartnoma sanasi bo'yicha, narx = asosiy qarz +
  // boshlang'ich. Nasiya va qarzga sotish alohida sanaladi - ikkisining
  // tabiati boshqa, bitta "nasiya" raqamiga qo'shib yuborish hisobotni
  // yanglishtiradi.
  const shartnomaSotuv = (tur: "nasiya" | "qarz") =>
    q(
      `SELECT to_char(c.start_date,'YYYY-MM') oy, count(*) n,
 COALESCE(sum(COALESCE(c.principal,c.total-c.down_payment)+c.down_payment),0) narx,
 COALESCE(sum(i.cost),0) tannarx
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.kind='${tur}'
 AND c.start_date>=$3::date AND c.start_date<$4::date+interval '1 month'
 GROUP BY 1`,
    );
  const nasiya = await shartnomaSotuv("nasiya");
  const qarz = await shartnomaSotuv("qarz");
  // Naqd sotuv.
  const naqd = await q(
    `SELECT to_char((sale.created_at AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy,
 count(*) n, COALESCE(sum(sale.amount),0) narx, COALESCE(sum(i.cost),0) tannarx
 FROM cash_sales sale JOIN inventory i ON i.id=sale.inventory_id AND i.tenant_id=sale.tenant_id AND i.branch_id=sale.branch_id
 WHERE sale.tenant_id=$1 AND sale.branch_id=$2
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date<$4::date+interval '1 month'
 GROUP BY 1`,
  );
  // Nasiya daromadi: to'lovdagi ustama ulushi.
  const ustama = await q(
    `SELECT to_char((p.created_at AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy,
 COALESCE(sum(round(p.amount::numeric * COALESCE(c.markup,0)
   / NULLIF(COALESCE(c.principal,c.total-c.down_payment)+COALESCE(c.markup,0),0))),0) daromad
 FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date<$4::date+interval '1 month'
 GROUP BY 1`,
  );
  // Erta yopishda bekor qilingan ustama - olinmagan daromad. "tuzatish" -
  // daromaddan ayriladigan qism, "summa" - mijoz to'lamagan jami ustama
  // (hisobotda ma'lumot uchun ko'rsatiladi).
  const bekor = await q(
    `SELECT to_char((x.decided_at AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy,
 COALESCE(sum(round(x.markup_cancelled::numeric
   * COALESCE(c.principal,c.total-c.down_payment)
   / NULLIF(COALESCE(c.principal,c.total-c.down_payment)+COALESCE(c.markup,0),0))),0) tuzatish,
 COALESCE(sum(x.markup_cancelled),0) summa
 FROM contract_closures x
 JOIN contracts c ON c.id=x.contract_id AND c.tenant_id=x.tenant_id AND c.branch_id=x.branch_id
 WHERE x.tenant_id=$1 AND x.branch_id=$2 AND x.status='completed'
 AND (x.decided_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (x.decided_at AT TIME ZONE 'Asia/Tashkent')::date<$4::date+interval '1 month'
 GROUP BY 1`,
  );
  // Kurs farqi: DOLLARDAGI qarz so'mda to'langanda paydo bo'ladi.
  // Qarzga sotishda qoldiq dollarda, so'mdagi kitob qiymati esa sotuv
  // kursida qotgan - to'lov boshqa kursda tushsa farq qoladi va u
  // haqiqiy daromad yoki zarar. Nasiya shartnomasi so'mda yuritilgani
  // uchun unda kurs farqi tug'ilmaydi: so'mdagi qarz so'mda qoladi.
  const kursFarqi = await q(
    `SELECT to_char((p.created_at AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy,
 COALESCE(sum(p.amount - round(p.applied_cents::numeric*c.sale_rate/100)),0)::bigint summa
 FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND c.kind='qarz' AND p.applied_cents IS NOT NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date<$4::date+interval '1 month'
 GROUP BY 1`,
  );
  // Xarajat va taqsimot: hamyon valyutasi bo'yicha alohida.
  const pul = (
    await db.query(
      `SELECT to_char(entry_date,'YYYY-MM') oy,
 CASE WHEN category=ANY($5) THEN 'taqsimot' ELSE 'xarajat' END turi,
 COALESCE(sum(CASE WHEN wallet<>'cash_usd' THEN -amount_minor END),0) uzs,
 COALESCE(sum(CASE WHEN wallet='cash_usd' THEN -amount_minor END),0) usd
 FROM cash_entries
 WHERE tenant_id=$1 AND branch_id=$2 AND amount_minor<0 AND NOT category=ANY($6)
 AND entry_date>=$3::date AND entry_date<$4::date+interval '1 month'
 GROUP BY 1,2`,
      [...args, dan, boshi(oy), TAQSIMOT, CHIQIM_EMAS],
    )
  ).rows;
  // USD xarajatni so'mga o'tkazish uchun kurs.
  const kurs = Number(
    (
      await db.query(
        `SELECT rate FROM exchange_rates WHERE tenant_id=$1 AND day<=$2::date
 ORDER BY day DESC LIMIT 1`,
        [s.tenant_id, bugun],
      )
    ).rows[0]?.rate ?? 0,
  );

  // Muzlatilgan oylar: yopilganda saqlangan hisobot qatori. Bor bo'lsa
  // hisoblangan qator emas, o'sha o'qiladi.
  const snapshots = (
    await db.query(
      `SELECT to_char(month,'YYYY-MM') oy, data FROM profit_snapshots
 WHERE tenant_id=$1 AND branch_id=$2 AND month>=$3::date AND month<=$4::date`,
      [...args, dan, boshi(oy)],
    )
  ).rows as { oy: string; data: OylikFoyda }[];

  const topil = (rows: any[], o: string) => rows.find((r) => r.oy === o);
  const jadval: OylikFoyda[] = oyna.map((o): OylikFoyda => {
    const muzlatilgan = snapshots.find((x) => x.oy === o);
    if (muzlatilgan) return { ...muzlatilgan.data, oy: o, muzlatilgan: true };
    const n = topil(nasiya, o),
      q2 = topil(naqd, o),
      z = topil(qarz, o),
      u = topil(ustama, o),
      b = topil(bekor, o),
      kf = topil(kursFarqi, o),
      x = pul.find((r) => r.oy === o && r.turi === "xarajat"),
      t = pul.find((r) => r.oy === o && r.turi === "taqsimot");
    const nasiyaNarx = Number(n?.narx ?? 0),
      nasiyaTannarx = Number(n?.tannarx ?? 0),
      naqdNarx = Number(q2?.narx ?? 0),
      naqdTannarx = Number(q2?.tannarx ?? 0),
      qarzNarx = Number(z?.narx ?? 0),
      qarzTannarx = Number(z?.tannarx ?? 0),
      marja =
        nasiyaNarx -
        nasiyaTannarx +
        naqdNarx -
        naqdTannarx +
        qarzNarx -
        qarzTannarx,
      ustamaDaromad = Number(u?.daromad ?? 0) - Number(b?.tuzatish ?? 0),
      kurs_farqi = Number(kf?.summa ?? 0),
      xarajatUzs = Number(x?.uzs ?? 0),
      xarajatUsd = Number(x?.usd ?? 0);
    // Dollardagi xarajat: sent -> dollar -> so'm.
    const xarajatJami = xarajatUzs + Math.round((xarajatUsd * kurs) / 100);
    return {
      oy: o,
      nasiyaSoni: Number(n?.n ?? 0),
      nasiyaNarx,
      nasiyaTannarx,
      naqdSoni: Number(q2?.n ?? 0),
      naqdNarx,
      naqdTannarx,
      qarzSoni: Number(z?.n ?? 0),
      qarzNarx,
      qarzTannarx,
      marja,
      ustama: ustamaDaromad,
      bekorUstama: Number(b?.summa ?? 0),
      kursFarqi: kurs_farqi,
      xarajatUzs,
      xarajatUsd,
      taqsimotUzs: Number(t?.uzs ?? 0),
      taqsimotUsd: Number(t?.usd ?? 0),
      sofFoyda: marja + ustamaDaromad + kurs_farqi - xarajatJami,
    };
  });

  // Undirish fakti: shu oyda tushgan tasdiqlangan nasiya to'lovlari.
  const undirish = Number(
    (
      await db.query(
        `SELECT COALESCE(sum(p.amount),0) summa FROM payments p
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date<$3::date+interval '1 month'`,
        [...args, boshi(oy)],
      )
    ).rows[0].summa,
  );

  // Oylik reja: plan, fakt, foiz, qolgan va kunlik kerakli natija.
  const plan = await readTargets(branchId, oy);
  const fakt: Record<Metric, number> = {
    sotuv_dona_naqd: jadval[jadval.length - 1].naqdSoni,
    sotuv_dona_nasiya: jadval[jadval.length - 1].nasiyaSoni,
    sotuv_summa_naqd: jadval[jadval.length - 1].naqdNarx,
    sotuv_summa_nasiya: jadval[jadval.length - 1].nasiyaNarx,
    undirish,
    sof_foyda: jadval[jadval.length - 1].sofFoyda,
  };
  // Kunlik norma faqat davom etayotgan oy uchun: yopilgan oyda qolgan kun yo'q.
  const joriyOy = bugun.slice(0, 7) === oy;
  const oyKunlari = new Date(Date.UTC(yil, oyRaqam, 0)).getUTCDate();
  const qolganKun = joriyOy
    ? Math.max(1, oyKunlari - Number(bugun.slice(8, 10)) + 1)
    : 0;
  const reja = METRICS.map((m) => {
    const p = plan[m] ?? 0,
      f = fakt[m];
    const qolgan = Math.max(0, p - f);
    return {
      metric: m,
      plan: p,
      fakt: f,
      // Plan nol bo'lsa foiz hisoblanmaydi (TZ 6.9).
      foiz: p > 0 ? Math.round((f / p) * 100) : null,
      qolgan: p > 0 ? qolgan : null,
      kunlik: p > 0 && qolganKun ? Math.ceil(qolgan / qolganKun) : null,
    };
  });

  // Telegram xulosasi uchun bugungi tushum va kechikkan qarz.
  // Qoplangan summa qarzdorlar ekranidagi bilan bir xil hisoblanadi:
  // tasdiqlangan to'lovlar va erta yopishda bekor qilingan ustama.
  const qoplangan =
    tolanganSql() +
    "+COALESCE((SELECT sum(x.markup_cancelled) FROM contract_closures x" +
    " WHERE x.contract_id=c.id AND x.status='completed'),0)";
  const bugungi = (
    await db.query(
      `SELECT COALESCE(sum(p.amount),0) summa,count(*) soni FROM payments p
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date=$3::date`,
      [...args, bugun],
    )
  ).rows[0];
  const kechikkan = (
    await db.query(
      `WITH j AS (
 SELECT s.contract_id,sum(s.amount) jami FROM installments s
 JOIN contracts c ON c.id=s.contract_id AND c.tenant_id=$1 AND c.branch_id=$2
 WHERE s.due_date<$3::date GROUP BY 1)
 SELECT COALESCE(sum(GREATEST(j.jami-${qoplangan},0)),0) summa,
 count(*) FILTER (WHERE j.jami>${qoplangan}) soni
 FROM contracts c JOIN j ON j.contract_id=c.id
 WHERE c.tenant_id=$1 AND c.branch_id=$2`,
      [...args, bugun],
    )
  ).rows[0];

  // Sotuvchi va kanal natijalari (TZ REP). Nasiya va naqd alohida
  // hisoblanadi, keyin bitta qatorga birlashtiriladi.
  const kesim = async (ustun: "seller" | "channel") => {
    const nas = await q(
      `SELECT COALESCE(NULLIF(c.${ustun},''),'(ko''rsatilmagan)') nom, count(*) dona,
 COALESCE(sum(COALESCE(c.principal,c.total-c.down_payment)+c.down_payment),0) narx,
 COALESCE(sum(i.cost),0) tannarx, COALESCE(sum(COALESCE(c.markup,0)),0) ustama
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.kind='nasiya'
 AND c.start_date>=$4::date AND c.start_date<$4::date+interval '1 month'
 GROUP BY 1`,
    );
    const qrz = await q(
      `SELECT COALESCE(NULLIF(c.${ustun},''),'(ko''rsatilmagan)') nom, count(*) dona,
 COALESCE(sum(COALESCE(c.principal,c.total-c.down_payment)+c.down_payment),0) narx,
 COALESCE(sum(i.cost),0) tannarx
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.kind='qarz'
 AND c.start_date>=$4::date AND c.start_date<$4::date+interval '1 month'
 GROUP BY 1`,
    );
    const naq = await q(
      `SELECT COALESCE(NULLIF(sale.${ustun},''),'(ko''rsatilmagan)') nom, count(*) dona,
 COALESCE(sum(sale.amount),0) narx, COALESCE(sum(i.cost),0) tannarx
 FROM cash_sales sale JOIN inventory i ON i.id=sale.inventory_id AND i.tenant_id=sale.tenant_id AND i.branch_id=sale.branch_id
 WHERE sale.tenant_id=$1 AND sale.branch_id=$2
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$4::date
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date<$4::date+interval '1 month'
 GROUP BY 1`,
    );
    const nomlar = [
      ...new Set([...nas, ...naq, ...qrz].map((r) => r.nom as string)),
    ];
    return nomlar
      .map((nom) => {
        const n = nas.find((r) => r.nom === nom),
          k = naq.find((r) => r.nom === nom),
          z = qrz.find((r) => r.nom === nom);
        const nasiyaMarja = Number(n?.narx ?? 0) - Number(n?.tannarx ?? 0),
          naqdMarja = Number(k?.narx ?? 0) - Number(k?.tannarx ?? 0),
          qarzMarja = Number(z?.narx ?? 0) - Number(z?.tannarx ?? 0);
        return {
          nom,
          nasiyaDona: Number(n?.dona ?? 0),
          nasiyaNarx: Number(n?.narx ?? 0),
          nasiyaMarja,
          // Shartnomada kelishilgan jami ustama: to'lovlar bilan birga
          // daromadga aylanadi.
          ustama: Number(n?.ustama ?? 0),
          naqdDona: Number(k?.dona ?? 0),
          naqdNarx: Number(k?.narx ?? 0),
          naqdMarja,
          qarzDona: Number(z?.dona ?? 0),
          qarzNarx: Number(z?.narx ?? 0),
          qarzMarja,
          marja: nasiyaMarja + naqdMarja + qarzMarja,
        };
      })
      .sort((a, b) => b.marja + b.ustama - (a.marja + a.ustama));
  };
  const sotuvchilar = await kesim("seller");
  const kanallar = await kesim("channel");

  // Ombor va nasiya portfeli - oyga bog'liq emas, hozirgi holat.
  const ombor = (
    await db.query(
      `SELECT count(*) n, COALESCE(sum(cost),0) tannarx,
 COALESCE(sum(CASE WHEN expected_price IS NOT NULL THEN expected_price-cost END),0) kutilgan,
 count(expected_price) narxlangan
 FROM inventory WHERE tenant_id=$1 AND branch_id=$2 AND status='available'`,
      args,
    )
  ).rows[0];
  const portfel = (
    await db.query(
      `SELECT COALESCE(sum(CASE WHEN c.kind='nasiya' THEN COALESCE(c.principal,c.total-c.down_payment) END),0) asosiy,
 COALESCE(sum(COALESCE(c.markup,0)),0) ustama,
 COALESCE(sum(CASE WHEN c.kind='nasiya' THEN GREATEST(${qarzSql()},0) END),0) qoldiq,
 COALESCE(sum(CASE WHEN c.kind='qarz' THEN GREATEST(${qarzSql()},0) END),0) qarzQoldiq,
 COALESCE(sum(CASE WHEN c.kind='qarz' THEN GREATEST(${qarzCentsSql()},0) END),0) qarzSent
 FROM contracts c WHERE c.tenant_id=$1 AND c.branch_id=$2`,
      args,
    )
  ).rows[0];

  // Tanlangan oyning xarajatlari kategoriya bo'yicha.
  const kategoriyalar = (
    await db.query(
      `SELECT category,
 COALESCE(sum(CASE WHEN wallet<>'cash_usd' THEN -amount_minor END),0)::text uzs,
 COALESCE(sum(CASE WHEN wallet='cash_usd' THEN -amount_minor END),0)::text usd
 FROM cash_entries
 WHERE tenant_id=$1 AND branch_id=$2 AND amount_minor<0 AND NOT category=ANY($4)
 AND entry_date>=$3::date AND entry_date<$3::date+interval '1 month'
 GROUP BY 1 ORDER BY 2 DESC,1`,
      [...args, boshi(oy), CHIQIM_EMAS],
    )
  ).rows;

  return {
    oy,
    oylar: jadval,
    joriy: jadval[jadval.length - 1],
    kategoriyalar,
    kurs,
    bugun,
    reja,
    qolganKun,
    sotuvchilar,
    kanallar,
    bugungi: {
      summa: Number(bugungi.summa),
      soni: Number(bugungi.soni),
    },
    kechikkan: {
      summa: Number(kechikkan.summa),
      soni: Number(kechikkan.soni),
    },
    ombor,
    portfel,
    canEdit: can(s.role, "target.write"),
  };
}
