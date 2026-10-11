import { createHash, randomUUID } from "node:crypto";
import { scope, AccessDeniedError } from "./auth";
import { db, transaction } from "./db";
import { saleSchema } from "./sales-schema";
import { rollarAmal } from "./domain";
import { paymentWallet } from "./cash-domain";
import type { HistoryFilters } from "./filters";
export class SaleError extends Error {}
export async function createSale(raw: unknown) {
  const v = saleSchema.parse(raw),
    s = await scope(v.branchId, "sale.create");
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [s.tenant_id, s.branch_id],
    );
    const role = (
      await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3 AND role=ANY($4)",
        [s.userId, s.tenant_id, s.branch_id, rollarAmal("sale.create")],
      )
    ).rows[0]?.role;
    if (!role) throw new AccessDeniedError();
    const hash = createHash("sha256")
      .update(JSON.stringify({ action: "sale.create", ...v }))
      .digest("hex");
    const prior = (
      await c.query(
        "SELECT tenant_id,branch_id,input_hash FROM cash_operations WHERE id=$1",
        [v.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.tenant_id !== s.tenant_id ||
        prior.branch_id !== s.branch_id ||
        prior.input_hash !== hash
      )
        throw new SaleError("Takroriy so‘rov mos emas");
      const sale = (
        await c.query(
          "SELECT id FROM cash_sales WHERE tenant_id=$1 AND branch_id=$2 AND request_key=$3",
          [s.tenant_id, s.branch_id, v.requestKey],
        )
      ).rows[0];
      if (!sale) throw new SaleError("Savdo topilmadi");
      return sale.id;
    }
    const item = (
      await c.query(
        "SELECT id FROM inventory WHERE tenant_id=$1 AND branch_id=$2 AND id=$3 AND status='available' FOR UPDATE",
        [s.tenant_id, s.branch_id, v.inventoryId],
      )
    ).rows[0];
    if (!item)
      throw new SaleError(
        "Qurilma bu filial omborida mavjud emas yoki sotilgan",
      );
    const id = randomUUID();
    await c.query("INSERT INTO cash_operations VALUES($1,$2,$3,$4)", [
      v.requestKey,
      s.tenant_id,
      s.branch_id,
      hash,
    ]);
    await c.query(
      "INSERT INTO cash_sales(id,tenant_id,branch_id,inventory_id,amount,method,customer_label,user_id,request_key,seller,channel) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.inventoryId,
        v.amount,
        v.method,
        v.customerLabel,
        s.userId,
        v.requestKey,
        v.seller,
        v.channel,
      ],
    );
    const wallet = paymentWallet(v.method);
    await c.query(
      "INSERT INTO cash_wallets(tenant_id,branch_id,wallet) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [s.tenant_id, s.branch_id, wallet],
    );
    await c.query(
      "INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,user_id,sale_id) VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'Asia/Tashkent')::date,$5,'Naqd savdo tushumi',$6,$7)",
      [randomUUID(), s.tenant_id, s.branch_id, wallet, v.amount, s.userId, id],
    );
    await c.query(
      "UPDATE inventory SET status='sold' WHERE tenant_id=$1 AND branch_id=$2 AND id=$3",
      [s.tenant_id, s.branch_id, v.inventoryId],
    );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'sale.create',$4)",
      [s.userId, s.tenant_id, s.branch_id, id],
    );
    return id;
  });
}
export async function readSales(branchId: string, filters: HistoryFilters) {
  const s = await scope(branchId),
    args = [
      s.tenant_id,
      s.branch_id,
      filters.q,
      filters.method || null,
      filters.from || null,
      filters.to || null,
    ];
  const from = `FROM cash_sales sale JOIN inventory i ON i.id=sale.inventory_id AND i.tenant_id=sale.tenant_id AND i.branch_id=sale.branch_id WHERE sale.tenant_id=$1 AND sale.branch_id=$2
 AND strpos(lower(concat_ws(' ',sale.customer_label,sale.id::text,i.model,i.imei)),lower($3::text))>0
 AND ($4::text IS NULL OR sale.method=$4) AND ($5::date IS NULL OR sale.created_at>=($5::date::timestamp AT TIME ZONE 'Asia/Tashkent')) AND ($6::date IS NULL OR sale.created_at<(($6::date+1)::timestamp AT TIME ZONE 'Asia/Tashkent'))`;
  const summary = (
    await db.query(
      "SELECT count(*) count,coalesce(sum(sale.amount),0)::text total " + from,
      args,
    )
  ).rows[0];
  const count = Number(summary.count),
    pages = Math.max(1, Math.ceil(count / 20)),
    page = Math.min(filters.page, pages);
  const sales = (
    await db.query(
      "SELECT sale.id,sale.amount,sale.method,sale.customer_label,sale.created_at,i.model,i.imei " +
        from +
        " ORDER BY sale.created_at DESC,sale.id DESC LIMIT 20 OFFSET $7",
      [...args, (page - 1) * 20],
    )
  ).rows;
  return { sales, count, total: summary.total, pages, page, role: s.role };
}
