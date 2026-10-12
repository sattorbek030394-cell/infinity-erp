import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { METRICS, type Metric } from "./target-names";

export { METRICS, METRIC_NOMI, DONA, type Metric } from "./target-names";

export const targetSchema = z
  .object({
    branchId: z.uuid(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    values: z.record(
      z.enum(METRICS),
      z.coerce.number().int().min(0).max(1_000_000_000_000),
    ),
  })
  .strict();
export class TargetError extends Error {}

/** Tanlangan oyning rejasi. */
export async function readTargets(branchId: string, month: string) {
  const s = await scope(branchId);
  const rows = (
    await db.query(
      "SELECT metric,value::text FROM monthly_targets WHERE tenant_id=$1 AND branch_id=$2 AND month=$3::date",
      [s.tenant_id, s.branch_id, month + "-01"],
    )
  ).rows;
  const plan: Partial<Record<Metric, number>> = {};
  for (const r of rows) plan[r.metric as Metric] = Number(r.value);
  return plan;
}

/**
 * Oylik rejani saqlash.
 *
 * Nol qiymat "reja yo'q" degani: bunday ko'rsatkich o'chiriladi, chunki
 * plan nol bo'lsa foiz hisoblanmaydi (TZ 6.9).
 */
export async function setTargets(raw: unknown) {
  const v = targetSchema.parse(raw);
  const s = await scope(v.branchId, "target.write");
  return transaction(async (c) => {
    for (const metric of METRICS) {
      const value = v.values[metric];
      if (value === undefined) continue;
      if (value === 0)
        await c.query(
          "DELETE FROM monthly_targets WHERE tenant_id=$1 AND branch_id=$2 AND month=$3::date AND metric=$4",
          [s.tenant_id, s.branch_id, v.month + "-01", metric],
        );
      else
        await c.query(
          `INSERT INTO monthly_targets(tenant_id,branch_id,month,metric,value,updated_by)
 VALUES($1,$2,$3::date,$4,$5,$6)
 ON CONFLICT(tenant_id,branch_id,month,metric)
 DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`,
          [s.tenant_id, s.branch_id, v.month + "-01", metric, value, s.userId],
        );
    }
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'target.write',$4)",
      [s.userId, s.tenant_id, s.branch_id, s.branch_id],
    );
    return { month: v.month };
  });
}
