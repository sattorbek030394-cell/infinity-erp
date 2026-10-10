import { scope } from "./auth";
import { db } from "./db";
import { arrearsQuery } from "./arrears-query";
export async function readArrears(branchId: string) {
  const s = await scope(branchId);
  const today = (
    await db.query(
      "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text today",
    )
  ).rows[0].today;
  const result = await db.query(arrearsQuery, [
    s.tenant_id,
    s.branch_id,
    today,
  ]);
  return { today, rows: result.rows };
}
