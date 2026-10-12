import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, AccessDeniedError } from "./auth";
import { db, transaction } from "./db";
import { can } from "./domain";
import { minorUnits, walletNames, type Wallet } from "./cash-domain";
import { bugun, wallets } from "./cash";

const WALLETS = Object.keys(walletNames) as Wallet[];
const sanalgan = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

export const closingSchema = z
  .object({
    branchId: z.uuid(),
    day: z.iso.date(),
    // Har hamyonda sanalgan summa: USD uchun "1234.50", so'm uchun butun.
    counted: z.object({
      cash_uzs: sanalgan,
      cash_usd: sanalgan,
      card_uzs: sanalgan,
      bank_uzs: sanalgan,
    }),
    note: z.string().trim().max(160).default(""),
  })
  .strict();
export const reopenSchema = z
  .object({
    branchId: z.uuid(),
    day: z.iso.date(),
    reason: z.string().trim().min(5).max(160),
  })
  .strict();
export class ClosingError extends Error {}

/** Kun oxirida har hamyonning hisoblangan qoldig'i. */
async function hisoblangan(
  c: { query: (q: string, p?: unknown[]) => Promise<{ rows: any[] }> },
  tenant: string,
  branch: string,
  day: string,
) {
  return (
    await c.query(
      `SELECT w.wallet,w.opening_minor,
 COALESCE(sum(e.amount_minor),0) movement
 FROM cash_wallets w
 LEFT JOIN cash_entries e ON e.tenant_id=w.tenant_id AND e.branch_id=w.branch_id
  AND e.wallet=w.wallet AND e.entry_date<=$3::date
  AND (w.opening_date IS NULL OR e.entry_date>=w.opening_date)
 WHERE w.tenant_id=$1 AND w.branch_id=$2
 GROUP BY w.wallet,w.opening_minor`,
      [tenant, branch, day],
    )
  ).rows;
}

/** Kassa tarixidagi yopishlar (CASH-04). */
export async function readClosings(branchId: string) {
  const s = await scope(branchId);
  const rows = (
    await db.query(
      `SELECT x.id,x.day::text,x.note,x.closed_at,x.reopened_at,x.reopen_reason,
 u.email closed_email,r.email reopened_email,
 (SELECT json_agg(json_build_object('wallet',l.wallet,'computed',l.computed_minor::text,
   'counted',l.counted_minor::text) ORDER BY l.wallet)
  FROM cash_closing_lines l WHERE l.closing_id=x.id) lines
 FROM cash_closings x
 LEFT JOIN users u ON u.id=x.closed_by LEFT JOIN users r ON r.id=x.reopened_by
 WHERE x.tenant_id=$1 AND x.branch_id=$2 ORDER BY x.day DESC,x.closed_at DESC LIMIT 60`,
      [s.tenant_id, s.branch_id],
    )
  ).rows;
  return {
    rows,
    canClose: can(s.role, "cash.entry"),
    canReopen: can(s.role, "cash.reverse"),
  };
}

/**
 * Kunni yopish: hisoblangan va sanalgan qoldiq yoziladi, farq ko'rinadi.
 *
 * Boshlang'ich qoldiq belgilanmagan hamyon bilan kun yopilmaydi - aks
 * holda "farq" ma'nosiz chiqadi.
 */
export async function closeDay(raw: unknown) {
  const v = closingSchema.parse(raw);
  const s = await scope(v.branchId, "cash.entry");
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [s.tenant_id, s.branch_id],
    );
    if (v.day > (await bugun(c)))
      throw new ClosingError("Kelajak kunini yopib bo‘lmaydi");
    const ochiq = (
      await c.query(
        "SELECT day::text FROM cash_closings WHERE tenant_id=$1 AND branch_id=$2 AND day>=$3::date AND reopened_at IS NULL LIMIT 1",
        [s.tenant_id, s.branch_id, v.day],
      )
    ).rows[0];
    if (ochiq)
      throw new ClosingError(`${ochiq.day} kuni allaqachon yopilgan`);
    await wallets(c, s);
    const hisob = await hisoblangan(c, s.tenant_id, s.branch_id, v.day);
    const bosh = hisob.filter((r) => r.opening_minor === null);
    if (bosh.length)
      throw new ClosingError(
        "Avval boshlang‘ich qoldiqni belgilang: " +
          bosh.map((r) => walletNames[r.wallet as Wallet]).join(", "),
      );
    const id = randomUUID();
    await c.query(
      "INSERT INTO cash_closings(id,tenant_id,branch_id,day,note,closed_by) VALUES($1,$2,$3,$4,$5,$6)",
      [id, s.tenant_id, s.branch_id, v.day, v.note, s.userId],
    );
    const natija: Record<string, { computed: number; counted: number }> = {};
    for (const row of hisob) {
      const wallet = row.wallet as Wallet;
      const computed = Number(row.opening_minor) + Number(row.movement);
      let counted: number;
      try {
        counted = minorUnits(v.counted[wallet], wallet, true);
      } catch (e) {
        throw new ClosingError(
          walletNames[wallet] + ": " + (e as Error).message,
        );
      }
      await c.query(
        "INSERT INTO cash_closing_lines VALUES($1,$2,$3,$4)",
        [id, wallet, computed, counted],
      );
      natija[wallet] = { computed, counted };
    }
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'cash.close',$4)",
      [s.userId, s.tenant_id, s.branch_id, id],
    );
    return { id, day: v.day, lines: natija };
  });
}

/** Kunni qayta ochish: rahbar huquqi, sabab majburiy, auditda qoladi. */
export async function reopenDay(raw: unknown) {
  const v = reopenSchema.parse(raw);
  const s = await scope(v.branchId, "cash.reverse");
  return transaction(async (c) => {
    const yopish = (
      await c.query(
        "SELECT id FROM cash_closings WHERE tenant_id=$1 AND branch_id=$2 AND day=$3::date AND reopened_at IS NULL FOR UPDATE",
        [s.tenant_id, s.branch_id, v.day],
      )
    ).rows[0];
    if (!yopish) throw new ClosingError("Bu kun yopilmagan");
    await c.query(
      "UPDATE cash_closings SET reopened_by=$2,reopened_at=now(),reopen_reason=$3 WHERE id=$1",
      [yopish.id, s.userId, v.reason],
    );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'cash.reopen',$4)",
      [s.userId, s.tenant_id, s.branch_id, yopish.id],
    );
    return { id: yopish.id as string, day: v.day };
  });
}

export { AccessDeniedError };
