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
  // Zaxira foizi: kutilayotgan qaytmaydigan qarz (taklif 3.3).
  const reserveBp = Number(
    (
      await db.query(
        "SELECT reserve_bp FROM nasiya_settings WHERE tenant_id=$1 AND branch_id=$2",
        [s.tenant_id, s.branch_id],
      )
    ).rows[0]?.reserve_bp ?? 500,
  );
  return { today, rows: result.rows, reserveBp };
}
