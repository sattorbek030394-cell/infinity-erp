import { z } from "zod";
import { scope, AccessDeniedError } from "../../../lib/auth";
import { rollarAmal } from "../../../lib/domain";
import { transaction } from "../../../lib/db";
import { arrearsQuery } from "../../../lib/arrears-query";
import { exportWorkbook } from "../../../lib/export-workbook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
class ExportLimitError extends Error {}
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const branch = new URL(request.url).searchParams.get("branch");
  if (!z.uuid().safeParse(branch).success)
    return Response.json(
      { error: "Filial noto‘g‘ri" },
      { status: 400, headers },
    );
  try {
    const s = await scope(branch!, "export");
    const data = await transaction(async (c) => {
      await c.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const permission = await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3 AND role=ANY($4)",
        [s.userId, s.tenant_id, s.branch_id, rollarAmal("export")],
      );
      if (!permission.rowCount) throw new AccessDeniedError();
      const args = [s.tenant_id, s.branch_id];
      const branchInfo = (
        await c.query(
          "SELECT name,(now() AT TIME ZONE 'Asia/Tashkent')::date::text today,now() created_at FROM branches WHERE tenant_id=$1 AND id=$2",
          args,
        )
      ).rows[0];
      const inventory = (
        await c.query(
          "SELECT id,model,imei,cost,status FROM inventory WHERE tenant_id=$1 AND branch_id=$2 ORDER BY model,id LIMIT 10001",
          args,
        )
      ).rows;
      const contracts = (
        await c.query(
          `SELECT c.id,c.customer_label,i.model,i.imei,c.total,c.down_payment,c.months,c.start_date::text,
 COALESCE(p.paid,0) paid,c.total-c.down_payment-COALESCE(p.paid,0) balance
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 LEFT JOIN (SELECT contract_id,sum(amount) paid FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND status='approved' AND voided_at IS NULL GROUP BY contract_id) p ON p.contract_id=c.id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 ORDER BY c.start_date,c.id LIMIT 10001`,
          args,
        )
      ).rows;
      const payments = (
        await c.query(
          `SELECT p.id,p.contract_id,c.customer_label,i.imei,p.amount,p.method,p.status,p.void_reason,to_char(p.voided_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') voided_at,u.email voided_by,to_char(p.created_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') payment_time
 FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 LEFT JOIN users u ON u.id=p.voided_by
 WHERE p.tenant_id=$1 AND p.branch_id=$2 ORDER BY p.created_at,p.id LIMIT 10001`,
          args,
        )
      ).rows;
      const cashEntries = (
        await c.query(
          `SELECT e.id,e.wallet,e.entry_date::text,e.amount_minor::text,e.category,e.note,e.payment_id,e.contract_id,e.sale_id,e.operation_id,e.reversal_of,
 EXISTS(SELECT 1 FROM cash_entries r WHERE r.reversal_of=e.id) reversed,
 to_char(e.created_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') recorded_at,u.email author
 FROM cash_entries e JOIN users u ON u.id=e.user_id WHERE e.tenant_id=$1 AND e.branch_id=$2 ORDER BY e.entry_date,e.created_at,e.id LIMIT 10001`,
          args,
        )
      ).rows;
      const cashBalances = (
        await c.query(
          `SELECT names.wallet,w.opening_date::text,w.opening_minor,
 COALESCE(sum(e.amount_minor),0)::text movement,
 CASE WHEN w.opening_minor IS NULL THEN NULL ELSE (w.opening_minor+COALESCE(sum(e.amount_minor),0))::text END balance
 FROM unnest(ARRAY['cash_uzs','cash_usd','card_uzs','bank_uzs']) names(wallet)
 LEFT JOIN cash_wallets w ON w.wallet=names.wallet AND w.tenant_id=$1 AND w.branch_id=$2
 LEFT JOIN cash_entries e ON e.wallet=names.wallet AND e.tenant_id=$1 AND e.branch_id=$2 AND e.entry_date<=$3::date AND (w.opening_date IS NULL OR e.entry_date>=w.opening_date)
 GROUP BY names.wallet,w.opening_date,w.opening_minor ORDER BY names.wallet`,
          [...args, branchInfo.today],
        )
      ).rows;
      const sales = (
        await c.query(
          `SELECT sale.id,sale.customer_label,sale.amount,sale.method,i.model,i.imei,u.email author,to_char(sale.created_at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD HH24:MI:SS') sale_time FROM cash_sales sale JOIN inventory i ON i.id=sale.inventory_id AND i.tenant_id=sale.tenant_id AND i.branch_id=sale.branch_id JOIN users u ON u.id=sale.user_id WHERE sale.tenant_id=$1 AND sale.branch_id=$2 ORDER BY sale.created_at,sale.id LIMIT 10001`,
          args,
        )
      ).rows;
      if (
        [inventory, contracts, payments, cashEntries, sales].some(
          (r) => r.length > 10000,
        )
      )
        throw new ExportLimitError();
      const arrears = (await c.query(arrearsQuery, [...args, branchInfo.today]))
        .rows;
      return {
        branch: branchInfo.name,
        today: branchInfo.today,
        createdAt: new Date(branchInfo.created_at).toISOString(),
        inventory,
        contracts,
        payments,
        arrears,
        cashBalances,
        cashEntries,
        sales,
      };
    });
    const bytes = await exportWorkbook(data);
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="infinity-${s.branch_id}-${data.today}.xlsx"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError)
      return Response.json(
        { error: "Filialga ruxsat yo‘q" },
        { status: 403, headers },
      );
    if (error instanceof ExportLimitError)
      return Response.json(
        {
          error:
            "Bitta ro‘yxatda 10 000 dan ortiq yozuv bor. Katta eksport V1 da mavjud emas.",
        },
        { status: 422, headers },
      );
    return Response.json(
      { error: "Hisobotni yuklab bo‘lmadi. Qayta urinib ko‘ring." },
      { status: 500, headers },
    );
  }
}
