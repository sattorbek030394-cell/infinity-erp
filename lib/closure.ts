import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, AccessDeniedError } from "./auth";
import { db, transaction } from "./db";
import { can, yopishHisobi, otganDavrlar, oyQoshish } from "./domain";
import { qarzSql } from "./qarz-sql";
import type { PoolClient } from "pg";

export const closureSchema = z
  .object({
    branchId: z.uuid(),
    contractId: z.uuid(),
    action: z.enum(["quote", "complete", "cancel"]),
    note: z.string().trim().max(160).default(""),
  })
  .strict();
export class ClosureError extends Error {}

type Hisob = {
  contractId: string;
  kind: "early" | "scheduled";
  quoteDate: string;
  periods: number;
  months: number;
  debt: number;
  markup: number;
  markupKept: number;
  markupCancelled: number;
  closeAmount: number;
  endDate: string;
  pending: number;
};

/**
 * Yopish hisobini shartnomaning hozirgi holatidan hisoblaydi.
 *
 * Hisob sanasi - Asia/Tashkent bo'yicha bugungi kun. Tasdiq kutayotgan
 * tushum bo'lsa soni qaytariladi: yopishni yakunlash uchun avval ular
 * hal qilinishi kerak (PAY-07).
 */
async function hisobla(
  c: Pick<PoolClient, "query">,
  tenant: string,
  branch: string,
  contractId: string,
): Promise<Hisob> {
  const row = (
    await c.query(
      `SELECT c.id,c.months,c.principal,c.markup,c.monthly_rate_bp,c.start_date::text start_date,
 ${qarzSql()} debt,
 (now() AT TIME ZONE 'Asia/Tashkent')::date::text today,
 (SELECT count(*) FROM payments p WHERE p.contract_id=c.id AND p.status='pending') pending
 FROM contracts c WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.id=$3`,
      [tenant, branch, contractId],
    )
  ).rows[0];
  if (!row) throw new ClosureError("Shartnoma topilmadi");
  const debt = Number(row.debt);
  if (debt <= 0) throw new ClosureError("Bu shartnomada qarz qolmagan");
  // Tarixiy yozuvda asosiy qarz va ustama ajratilmagan bo'lsa avtomatik
  // yopish bloklanadi (TZ PAY-08).
  if (row.principal === null || row.markup === null)
    throw new ClosureError(
      "Bu shartnomada asosiy qarz va ustama ajratilmagan: avtomatik yopish mumkin emas",
    );
  const months = Number(row.months),
    today = row.today as string,
    endDate = oyQoshish(row.start_date, months);
  const periods = otganDavrlar(row.start_date, today, months);
  const hisob = yopishHisobi({
    principal: Number(row.principal),
    markup: Number(row.markup),
    rateBp: Number(row.monthly_rate_bp),
    periods,
    debt,
  });
  return {
    contractId,
    // Jadval oxiriga yetgan yoki o'tgan yopishda kelgusi ustama chegirmasi
    // bo'lmaydi (AT-37).
    kind: today < endDate ? "early" : "scheduled",
    quoteDate: today,
    periods,
    months,
    debt,
    markup: Number(row.markup),
    markupKept: hisob.markupKept,
    markupCancelled: hisob.markupCancelled,
    closeAmount: hisob.closeAmount,
    endDate,
    pending: Number(row.pending),
  };
}

/** Shartnoma sahifasi uchun: faol hisob va yakunlangan yopish. */
export async function readClosure(branchId: string, contractId: string) {
  const s = await scope(branchId);
  const rows = (
    await db.query(
      `SELECT * FROM contract_closures WHERE tenant_id=$1 AND branch_id=$2 AND contract_id=$3
 AND status IN ('quoted','completed') ORDER BY created_at DESC`,
      [s.tenant_id, s.branch_id, contractId],
    )
  ).rows;
  return {
    quote: rows.find((r) => r.status === "quoted") ?? null,
    done: rows.find((r) => r.status === "completed") ?? null,
    canClose: can(s.role, "payment.create"),
  };
}

/** PAY-09: muddatidan oldin yopilgan shartnomalar hisoboti. */
export async function readClosures(branchId: string) {
  const s = await scope(branchId);
  const rows = (
    await db.query(
      `SELECT x.*,c.number,c.customer_label,c.months,c.start_date::text start_date,
 i.model,i.imei,u.email decided_email,
 ${tolangan}
 FROM contract_closures x
 JOIN contracts c ON c.id=x.contract_id AND c.tenant_id=x.tenant_id AND c.branch_id=x.branch_id
 JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 LEFT JOIN users u ON u.id=x.decided_by
 WHERE x.tenant_id=$1 AND x.branch_id=$2 AND x.status='completed' AND x.kind='early'
 ORDER BY x.decided_at DESC LIMIT 500`,
      [s.tenant_id, s.branch_id],
    )
  ).rows;
  return {
    rows,
    jami: {
      soni: rows.length,
      yopish: rows.reduce((n, r) => n + Number(r.close_amount), 0),
      bekor: rows.reduce((n, r) => n + Number(r.markup_cancelled), 0),
      tolangan: rows.reduce((n, r) => n + Number(r.tolangan), 0),
    },
  };
}

const tolangan = `COALESCE((SELECT sum(p.amount+p.advance_amount) FROM payments p
 WHERE p.contract_id=c.id AND p.status='approved' AND p.voided_at IS NULL),0) tolangan`;

/**
 * Yopish hisobini yaratish, yakunlash yoki bekor qilish (PAY-07).
 *
 * `quote` - hisobni qayta hisoblab saqlaydi va raqamlarni qaytaradi.
 * `complete` - barcha tasdiqlar bajarilgan va qarz aynan bekor qilinadigan
 * ustamaga teng bo'lsa shartnomani yopadi; aks holda farqni ko'rsatib
 * to'xtaydi. Bitta tranzaksiyada tekshiriladi.
 */
export async function closeContract(raw: unknown) {
  const v = closureSchema.parse(raw);
  const s = await scope(v.branchId, "payment.create");
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM contracts WHERE tenant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
      [s.tenant_id, s.branch_id, v.contractId],
    );
    const faol = (
      await c.query(
        "SELECT *,quote_date::text qd FROM contract_closures WHERE contract_id=$1 AND status='quoted' FOR UPDATE",
        [v.contractId],
      )
    ).rows[0];
    const yopilgan = (
      await c.query(
        "SELECT id FROM contract_closures WHERE contract_id=$1 AND status='completed'",
        [v.contractId],
      )
    ).rows[0];
    if (yopilgan) throw new ClosureError("Bu shartnoma allaqachon yopilgan");

    if (v.action === "cancel") {
      if (!faol) throw new ClosureError("Faol yopish hisobi yo‘q");
      await c.query(
        "UPDATE contract_closures SET status='cancelled',decided_by=$2,decided_at=now(),note=$3 WHERE id=$1",
        [faol.id, s.userId, v.note],
      );
      await audit(c, s, "closure.cancel", faol.id);
      return { status: "cancelled" };
    }

    if (v.action === "quote") {
      const h = await hisobla(c, s.tenant_id, s.branch_id, v.contractId);
      // Eski hisob yangisi bilan almashtiriladi: hisob faqat shu kun va shu
      // holat uchun amal qiladi.
      if (faol)
        await c.query(
          "UPDATE contract_closures SET status='cancelled',decided_by=$2,decided_at=now(),note='Qayta hisoblandi' WHERE id=$1",
          [faol.id, s.userId],
        );
      const id = randomUUID();
      await c.query(
        `INSERT INTO contract_closures(id,tenant_id,branch_id,contract_id,status,kind,quote_date,
 periods_elapsed,debt_before,markup_kept,markup_cancelled,close_amount,created_by,note)
 VALUES($1,$2,$3,$4,'quoted',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          s.tenant_id,
          s.branch_id,
          v.contractId,
          h.kind,
          h.quoteDate,
          h.periods,
          h.debt,
          h.markupKept,
          h.markupCancelled,
          h.closeAmount,
          s.userId,
          v.note,
        ],
      );
      await audit(c, s, "closure.quote", id);
      return { status: "quoted", ...h };
    }

    // complete — hisob muzlatilgan: yakuniy tekshiruvda iqtisodiy qism
    // qayta hisoblanmaydi, faqat "kerakli summa tushdimi" deb qaraladi.
    // Qayta hisoblasak to'langan ustama ulushi o'sib, bekor qilinadigan
    // ustama kichrayib ketardi - ya'ni mijozdan ikki marta olingan bo'lardi.
    if (!faol) throw new ClosureError("Avval yopish hisobini oling");
    const holat = (
      await c.query(
        `SELECT ${qarzSql()} debt,
 (now() AT TIME ZONE 'Asia/Tashkent')::date::text today,
 (SELECT count(*) FROM payments p WHERE p.contract_id=c.id AND p.status='pending') pending
 FROM contracts c WHERE c.id=$1`,
        [v.contractId],
      )
    ).rows[0];
    if (Number(holat.pending) > 0)
      throw new ClosureError(
        "Tasdiq kutayotgan tushum bor: yopish yakunlanmaydi. Avval uni tasdiqlang yoki rad eting.",
      );
    // Hisob shu biznes kuni oxirigacha amal qiladi (PAY-07).
    if (faol.qd !== holat.today)
      throw new ClosureError("Hisob kuni o‘tgan: yopish hisobini qaytadan oling");
    const kerak = Number(holat.debt) - Number(faol.markup_cancelled);
    if (kerak > 0)
      throw new ClosureError(
        `Yopish uchun yana ${kerak.toLocaleString("uz-UZ")} so‘m tasdiqlangan to‘lov kerak`,
      );
    if (kerak < 0)
      throw new ClosureError(
        "Qarz hisobdagidan kam: yopish hisobini qaytadan oling",
      );
    await c.query(
      "UPDATE contract_closures SET status='completed',decided_by=$2,decided_at=now(),note=$3 WHERE id=$1",
      [faol.id, s.userId, v.note],
    );
    const qoldiq = Number(
      (
        await c.query(
          `SELECT ${qarzSql()} balance FROM contracts c WHERE c.id=$1`,
          [v.contractId],
        )
      ).rows[0].balance,
    );
    // Yakunda qarz aynan nol bo'lishi shart (TZ PAY-07, 5-qadam).
    if (qoldiq !== 0)
      throw new ClosureError("Yakuniy qarz nolga teng bo‘lmadi: yopilmadi");
    await audit(c, s, "closure.complete", faol.id);
    return { status: "completed", closureId: faol.id as string };
  });
}

async function audit(
  c: Pick<PoolClient, "query">,
  s: { userId: string; tenant_id: string; branch_id: string },
  action: string,
  recordId: string,
) {
  await c.query(
    "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [s.userId, s.tenant_id, s.branch_id, action, recordId],
  );
}

export { AccessDeniedError };
