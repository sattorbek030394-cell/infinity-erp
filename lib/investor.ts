import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { can } from "./domain";
import { QOIDALAR } from "./investor-names";
import { postInvestorCash } from "./cash";
import type { Wallet } from "./cash-domain";

/**
 * Investor kapitali va oylik taqsimot (TZ 6.10).
 *
 * Hisob dollarda, sentda. Qoidalar kelishuvda muzlatilgan:
 *
 * - Ulush KAPITAL-KUN bilan o'lchanadi: pulning qancha ekani emas, qancha
 *   va qancha vaqt ishlagani. Kirim kuni sanaladi, chiqim kuni sanalmaydi
 *   - shunda kapital-kun har doim sanalar farqiga teng chiqadi.
 * - Har oy alohida yopiladi va yopilgandan keyin MUZLATILADI. Keyin
 *   nimadir o'zgarsa, tuzatish joriy oyda alohida yozuv bilan qilinadi.
 * - Hisoblangan, olinmagan daromad kapitalga qo'shiladi va KEYINGI oydan
 *   o'zi ham kapital-kun ishlaydi; zarar ulushi kapitaldan ayriladi.
 *   Shuning uchun hisoblangan yozuvning sanasi - keyingi oyning 1-kuni.
 * - Qoida versiyalangan: 2026 mart-sentabr "kapital x oy", oktabr "oy
 *   boshidagi kapital", keyin "kunlik o'rtacha". Yopilgan oyda qaysi
 *   qoida ishlatilgani saqlanib qoladi.
 */


/** "1050.50" -> 105050 sent. */
const sent = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Summani dollarda yozing")
  .transform((v) => Math.round(Number(v) * 100));

export const investorSchema = z.object({
  branchId: z.uuid(),
  action: z.literal("investor"),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).default(""),
  note: z.string().trim().max(200).default(""),
});

export const entrySchema = z
  .object({
    branchId: z.uuid(),
    action: z.literal("entry"),
    investorId: z.uuid(),
    day: z.iso.date(),
    // Qo'lda faqat kapital harakati kiritiladi; foyda va zarar oy
    // yopilishida dastur tomonidan yoziladi.
    kind: z.enum(["capital", "return", "payout"]),
    form: z.enum(["cash", "goods"]).default("cash"),
    amount: sent,
    // Pul harakatida qaysi hamyon va - dollar bo'lmasa - qanday kurs
    // bilan. Tovarda ikkisi ham kerak emas.
    wallet: z
      .enum(["cash_usd", "cash_uzs", "card_uzs", "bank_uzs"])
      .default("cash_usd"),
    // Bo'sh qoldirilsa "yo'q" degani: dollardagi harakatda kurs kerak
    // emas, shuning uchun bo'sh matn nolga aylanib xato bermasin.
    rate: z.preprocess(
      (x) => (x === "" || x === null ? undefined : x),
      z.coerce.number().int().min(1).max(100_000_000).optional(),
    ),
    note: z.string().trim().max(200).default(""),
  })
  .refine((v) => v.form === "goods" || v.wallet === "cash_usd" || v.rate, {
    message: "So‘m yoki kartadagi harakatda kurs majburiy",
  });

export const voidSchema = z.object({
  branchId: z.uuid(),
  action: z.literal("void"),
  entryId: z.uuid(),
  reason: z.string().trim().min(5).max(160),
});

export const closeSchema = z.object({
  branchId: z.uuid(),
  action: z.literal("close"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  rule: z.enum(QOIDALAR).default("daily"),
  // Investorlarga tegishli natija: sof foydaning 80% i. Zarar bo'lsa
  // oldiga minus qo'yiladi.
  profit: z
    .string()
    .regex(/^-?\d{1,9}(\.\d{1,2})?$/, "Natijani dollarda yozing")
    .transform((v) => Math.round(Number(v) * 100)),
  rate: z.coerce.number().int().min(1).max(100_000_000),
});

/** Oyning oxirgi kuni, YYYY-MM-DD. */
export function oyOxiri(oy: string) {
  const [y, m] = oy.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** Keyingi oyning birinchi kuni - hisoblangan yozuv shu kundan ishlaydi. */
export function keyingiOy(oy: string) {
  const [y, m] = oy.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * Summani kapital-kun ulushiga qarab bo'lish.
 *
 * Butun sentda bo'linadi va yig'indisi aynan `jami` ga teng chiqadi:
 * yaxlitlashdan qolgan sentlar eng katta kasr qismiga ega ulushlarga
 * birma-bir qo'shiladi. Zararda ham xuddi shunday ishlaydi.
 */
export function taqsimla(
  jami: number,
  kunlar: { investorId: string; kunlar: number }[],
) {
  const butunKunlar = kunlar.reduce((a, b) => a + b.kunlar, 0);
  if (butunKunlar <= 0) throw new Error("Bu oyda ishlagan kapital yo‘q");
  const rows = kunlar.map((k) => {
    const aniq = (jami * k.kunlar) / butunKunlar;
    const butun = Math.trunc(aniq);
    return { ...k, cents: butun, kasr: Math.abs(aniq - butun) };
  });
  let qoldiq = jami - rows.reduce((a, b) => a + b.cents, 0);
  const qadam = qoldiq >= 0 ? 1 : -1;
  for (const r of [...rows].sort((a, b) => b.kasr - a.kasr)) {
    if (qoldiq === 0) break;
    r.cents += qadam;
    qoldiq -= qadam;
  }
  return rows.map(({ investorId, kunlar, cents }) => ({
    investorId,
    kunlar,
    cents,
  }));
}

type Q = { query: (sql: string, args?: unknown[]) => Promise<any> };

/**
 * Oynadagi kapital-kunlar.
 *
 * Har yozuv o'z sanasidan oyna oxirigacha sanaladi, shuning uchun
 * yig'indi kunlik qoldiqlarning yig'indisiga teng. Oynadan oldin kirgan
 * pul butun oyna bo'yicha ishlaydi.
 */
async function kapitalKunlar(c: Q, s: any, dan: string, gacha: string) {
  return (
    await c.query(
      `SELECT e.investor_id,
 COALESCE(sum(e.cents * (($4::date - GREATEST(e.day,$3::date)) + 1)),0)::bigint kunlar
 FROM investor_entries e
 WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.voided_at IS NULL AND e.day<=$4::date
 GROUP BY 1`,
      [s.tenant_id, s.branch_id, dan, gacha],
    )
  ).rows as { investor_id: string; kunlar: string }[];
}

export async function writeInvestor(raw: unknown) {
  const base = z.object({ branchId: z.uuid(), action: z.string() }).parse(raw);
  const s = await scope(base.branchId, "investor.write");
  if (base.action === "investor") {
    const v = investorSchema.parse(raw);
    const id = randomUUID();
    await db.query(
      `INSERT INTO investors(id,tenant_id,branch_id,name,phone,note,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, s.tenant_id, s.branch_id, v.name, v.phone, v.note, s.userId],
    );
    return { id };
  }
  if (base.action === "entry") {
    const v = entrySchema.parse(raw);
    const id = randomUUID();
    // Qaytarim va daromad olish kapitaldan ayriladi, shuning uchun
    // manfiy. Qoldiqdan ortiq chiqarib bo'lmaydi.
    const ishora = v.kind === "capital" ? 1 : -1;
    await transaction(async (c) => {
      const investor = await c.query(
        "SELECT closed_at FROM investors WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE",
        [v.investorId, s.tenant_id, s.branch_id],
      );
      if (!investor.rowCount) throw new Error("Investor topilmadi");
      if (investor.rows[0].closed_at && ishora > 0)
        throw new Error("Chiqib ketgan investorga kirim yozilmaydi");
      if (ishora < 0) {
        const qoldiq = Number(
          (
            await c.query(
              `SELECT COALESCE(sum(cents),0)::bigint q FROM investor_entries
 WHERE investor_id=$1 AND voided_at IS NULL`,
              [v.investorId],
            )
          ).rows[0].q,
        );
        if (v.amount > qoldiq)
          throw new Error("Kapital qoldig‘idan ortiq chiqarib bo‘lmaydi");
      }
      await c.query(
        `INSERT INTO investor_entries(id,tenant_id,branch_id,investor_id,day,kind,form,cents,note,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          s.tenant_id,
          s.branch_id,
          v.investorId,
          v.day,
          v.kind,
          v.form,
          ishora * v.amount,
          v.note,
          s.userId,
        ],
      );
      // Pul harakati bo'lsa kassaga ham tushadi: bitta yozuv, ikki
      // joyda ko'rinadi. Tovar kassaga tegmaydi.
      if (v.form === "cash")
        await postInvestorCash(
          c,
          s,
          id,
          v.day,
          ishora *
            (v.wallet === "cash_usd"
              ? v.amount
              : Math.round((v.amount * v.rate!) / 100)),
          v.wallet as Wallet,
        );
    });
    return { id };
  }
  if (base.action === "void") {
    const v = voidSchema.parse(raw);
    // Kassaga tushgan pul va hisoblangan yozuv bekor qilinmaydi: ikkisi
    // ham boshqa joyda hisobga olingan. Tuzatish teskari yozuv bilan
    // qilinadi - yopilgan oy qoidasi bilan bir xil.
    const r = await db.query(
      `UPDATE investor_entries SET voided_at=now(),voided_by=$4,void_reason=$5
 WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND voided_at IS NULL
 AND form<>'accrual'
 AND NOT EXISTS(SELECT 1 FROM cash_entries k WHERE k.investor_entry_id=$1)`,
      [v.entryId, s.tenant_id, s.branch_id, s.userId, v.reason],
    );
    if (!r.rowCount)
      throw new Error(
        "Bekor qilinmaydi: yozuv topilmadi, hisoblangan yoki kassaga tushgan. Teskari yozuv kiriting",
      );
    return { id: v.entryId };
  }
  if (base.action === "close") {
    const v = closeSchema.parse(raw);
    const dan = v.month + "-01",
      gacha = oyOxiri(v.month);
    const bugun = (
      await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d")
    ).rows[0].d as string;
    if (gacha > bugun) throw new Error("Oy tugamagan - yopib bo‘lmaydi");
    await transaction(async (c) => {
      // Qoidaga qarab oyna: kunlik o'rtachada butun oy, oy boshidagi
      // kapitalda esa faqat 1-kun.
      const oynaGacha = v.rule === "open_capital" ? dan : gacha;
      const kunlar = (await kapitalKunlar(c, s, dan, oynaGacha))
        .map((r) => ({ investorId: r.investor_id, kunlar: Number(r.kunlar) }))
        .filter((r) => r.kunlar > 0);
      const ulush = taqsimla(v.profit, kunlar);
      await c.query(
        `INSERT INTO investor_months(tenant_id,branch_id,month,rule,profit_cents,rate,closed_by)
 VALUES($1,$2,$3::date,$4,$5,$6,$7)`,
        [
          s.tenant_id,
          s.branch_id,
          dan,
          v.rule,
          v.profit,
          v.rate,
          s.userId,
        ],
      );
      for (const u of ulush) {
        await c.query(
          `INSERT INTO investor_shares(tenant_id,branch_id,month,investor_id,capital_days,cents)
 VALUES($1,$2,$3::date,$4,$5,$6)`,
          [s.tenant_id, s.branch_id, dan, u.investorId, u.kunlar, u.cents],
        );
        if (u.cents === 0) continue;
        // Reinvestitsiya: ulush kapitalga qo'shiladi va KEYINGI oydan
        // ishlay boshlaydi, shuning uchun sana - keyingi oyning 1-kuni.
        await c.query(
          `INSERT INTO investor_entries(id,tenant_id,branch_id,investor_id,day,kind,form,cents,note,month,created_by)
 VALUES($1,$2,$3,$4,$5::date,$6,'accrual',$7,$8,$9::date,$10)`,
          [
            randomUUID(),
            s.tenant_id,
            s.branch_id,
            u.investorId,
            keyingiOy(v.month),
            u.cents > 0 ? "profit" : "loss",
            u.cents,
            v.month + " natijasi",
            dan,
            s.userId,
          ],
        );
      }
    });
    return { month: dan };
  }
  throw new Error("Noto‘g‘ri amal");
}

export async function readInvestors(branchId: string, oyRaw?: string) {
  const s = await scope(branchId);
  if (!can(s.role, "investor.read")) throw new Error("Ruxsat yo‘q");
  const args = [s.tenant_id, s.branch_id];
  const bugun = (
    await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d")
  ).rows[0].d as string;
  const oy = /^\d{4}-(0[1-9]|1[0-2])$/.test(oyRaw ?? "")
    ? oyRaw!
    : bugun.slice(0, 7);
  const investorlar = (
    await db.query(
      `SELECT i.id,i.name,i.phone,i.closed_at,
 COALESCE((SELECT sum(e.cents) FROM investor_entries e
   WHERE e.investor_id=i.id AND e.voided_at IS NULL AND e.day<=$3::date),0)::bigint kapital,
 COALESCE((SELECT sum(e.cents) FROM investor_entries e
   WHERE e.investor_id=i.id AND e.voided_at IS NULL AND e.kind='capital'),0)::bigint kiritgan,
 COALESCE((SELECT sum(-e.cents) FROM investor_entries e
   WHERE e.investor_id=i.id AND e.voided_at IS NULL AND e.kind IN ('return','payout')),0)::bigint olgan,
 COALESCE((SELECT sum(e.cents) FROM investor_entries e
   WHERE e.investor_id=i.id AND e.voided_at IS NULL AND e.form='accrual'),0)::bigint natija
 FROM investors i WHERE i.tenant_id=$1 AND i.branch_id=$2
 ORDER BY i.closed_at NULLS FIRST, i.name`,
      [...args, bugun],
    )
  ).rows;
  // Joriy oyning kapital-kunlari: taqsimot qanday chiqishini oldindan
  // ko'rsatish uchun.
  const kunlar = await kapitalKunlar(db, s, oy + "-01", bugun);
  const oylar = (
    await db.query(
      `SELECT to_char(m.month,'YYYY-MM') oy,m.rule,m.profit_cents,m.rate,m.closed_at
 FROM investor_months m WHERE m.tenant_id=$1 AND m.branch_id=$2
 ORDER BY m.month DESC LIMIT 24`,
      args,
    )
  ).rows;
  const ulushlar = (
    await db.query(
      `SELECT s2.investor_id,s2.capital_days,s2.cents,i.name
 FROM investor_shares s2 JOIN investors i ON i.id=s2.investor_id
 WHERE s2.tenant_id=$1 AND s2.branch_id=$2 AND s2.month=$3::date
 ORDER BY s2.cents DESC`,
      [...args, oy + "-01"],
    )
  ).rows;
  const daftar = (
    await db.query(
      `SELECT e.id,e.day::text,e.kind,e.form,e.cents,e.note,e.voided_at,i.name
 FROM investor_entries e JOIN investors i ON i.id=e.investor_id
 WHERE e.tenant_id=$1 AND e.branch_id=$2
 ORDER BY e.day DESC,e.created_at DESC LIMIT 200`,
      args,
    )
  ).rows;
  const jamiKun = kunlar.reduce((a, b) => a + Number(b.kunlar), 0);
  return {
    oy,
    bugun,
    role: s.role,
    canWrite: can(s.role, "investor.write"),
    investorlar: investorlar.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      phone: r.phone as string,
      yopilgan: !!r.closed_at,
      kapital: Number(r.kapital),
      kiritgan: Number(r.kiritgan),
      olgan: Number(r.olgan),
      natija: Number(r.natija),
      kunlar: Number(
        kunlar.find((k) => k.investor_id === r.id)?.kunlar ?? 0,
      ),
    })),
    jamiKun,
    oylar: oylar.map((r) => ({
      oy: r.oy as string,
      rule: r.rule as string,
      profit: Number(r.profit_cents),
      rate: Number(r.rate),
    })),
    ulushlar: ulushlar.map((r) => ({
      name: r.name as string,
      kunlar: Number(r.capital_days),
      cents: Number(r.cents),
    })),
    daftar: daftar.map((r) => ({
      id: r.id as string,
      day: r.day as string,
      kind: r.kind as string,
      form: r.form as string,
      cents: Number(r.cents),
      note: r.note as string,
      bekor: !!r.voided_at,
      name: r.name as string,
    })),
  };
}

/**
 * Kirim formasidagi tanlov uchun qisqa ro'yxat - faqat ismlar.
 *
 * Summalarni qaytarmaydi, shuning uchun omborchi ham investor tovarini
 * yozib qo'ya oladi: kimning tovari ekanini bilish uchun kapital
 * raqamlarini ko'rish shart emas.
 */
export async function investorRoyxati(branchId: string) {
  const s = await scope(branchId);
  return (
    await db.query(
      `SELECT id,name FROM investors
 WHERE tenant_id=$1 AND branch_id=$2 AND closed_at IS NULL ORDER BY name`,
      [s.tenant_id, s.branch_id],
    )
  ).rows as { id: string; name: string }[];
}
