import { scope } from "./auth";
import { db } from "./db";
import type { HistoryFilters } from "./filters";
export async function readContract(branchId: string, contractId: string) {
  const s = await scope(branchId);
  const result = await db.query(
    `SELECT c.*,i.model,i.imei,b.name branch_name,
 c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.contract_id=c.id AND p.voided_at IS NULL),0) balance
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 JOIN branches b ON b.id=c.branch_id AND b.tenant_id=c.tenant_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.id=$3`,
    [s.tenant_id, s.branch_id, contractId],
  );
  if (!result.rowCount) return null;
  const installments = await db.query(
    "SELECT * FROM installments WHERE contract_id=$1 ORDER BY sequence",
    [contractId],
  );
  return {
    contract: result.rows[0],
    installments: installments.rows,
    role: s.role,
  };
}
export async function readPaymentHistory(
  branchId: string,
  filters: HistoryFilters,
  contractId?: string,
) {
  const s = await scope(branchId);
  const args = [
    s.tenant_id,
    s.branch_id,
    contractId ?? null,
    filters.q,
    filters.method || null,
    filters.from || null,
    filters.to || null,
  ];
  const from = `FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE p.tenant_id=$1 AND p.branch_id=$2
 AND ($3::uuid IS NULL OR c.id=$3)
 AND strpos(lower(concat_ws(' ',c.customer_label,c.id::text,i.model,i.imei,p.id::text)),lower($4::text))>0
 AND ($5::text IS NULL OR p.method=$5)
 AND ($6::date IS NULL OR p.created_at>=($6::date::timestamp AT TIME ZONE 'Asia/Tashkent'))
 AND ($7::date IS NULL OR p.created_at<(($7::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent'))`;
  const total = Number(
    (await db.query("SELECT count(*) total " + from, args)).rows[0].total,
  );
  const pages = Math.max(1, Math.ceil(total / 20)),
    page = Math.min(filters.page, pages);
  const payments = await db.query(
    "SELECT p.*,c.customer_label,i.model,i.imei,EXISTS(SELECT 1 FROM cash_entries e WHERE e.payment_id=p.id) cash_linked " +
      from +
      " ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET $8",
    [...args, (page - 1) * 20],
  );
  return { payments: payments.rows, total, page, pages, role: s.role };
}
