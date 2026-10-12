import { scope } from "./auth";
import { db } from "./db";
import type { HistoryFilters } from "./filters";
import type { ShartnomaMalumot } from "./shartnoma";
import { kunlikKurs } from "./kurs";
import { qarzSql } from "./qarz-sql";

/**
 * Chop etiladigan shartnoma uchun ma'lumot.
 *
 * `raqam` nol bo'lsa - yozuvga shartnoma raqami berilmagan (ustama hisobi
 * qo'shilishidan oldin tuzilgan eski yozuv). Chaqiruvchi shuni tekshirsin:
 * raqamsiz shartnomani chop etib bo'lmaydi.
 */
export async function readShartnoma(
  branchId: string,
  contractId: string,
): Promise<ShartnomaMalumot | null> {
  const s = await scope(branchId);
  const r = await db.query(
    `SELECT c.number,c.start_date,c.total,c.down_payment,c.principal,c.markup,c.customer_label,
 i.model,i.imei,i.memory,i.color,
 m.full_name,m.pnfl,m.passport,m.passport_issuer,m.passport_date,m.address,m.phone1,m.phone2
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 LEFT JOIN customers m ON m.id=c.customer_id AND m.tenant_id=c.tenant_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.id=$3`,
    [s.tenant_id, s.branch_id, contractId],
  );
  if (!r.rowCount) return null;
  const c = r.rows[0];
  const installments = (
    await db.query(
      "SELECT due_date,amount FROM installments WHERE contract_id=$1 ORDER BY sequence",
      [contractId],
    )
  ).rows;
  const boshlangich = Number(c.down_payment);
  const qoldiq = Number(c.total) - boshlangich;
  // Pasport sanasi hujjatda kun.oy.yil ko'rinishida yoziladi.
  const kun = (v: Date) =>
    [
      String(v.getDate()).padStart(2, "0"),
      String(v.getMonth() + 1).padStart(2, "0"),
      v.getFullYear(),
    ].join(".");
  return {
    raqam: Number(c.number ?? 0),
    sana: new Date(c.start_date),
    mijoz: c.full_name ?? c.customer_label,
    pnfl: c.pnfl ?? "",
    pasport: c.passport ?? "",
    pasportKim: c.passport_issuer ?? "",
    pasportQachon: c.passport_date ? kun(new Date(c.passport_date)) : "",
    manzil: c.address ?? "",
    telefon1: c.phone1 ?? "",
    telefon2: c.phone2 ?? "",
    tovar: [c.model, c.memory, c.color].filter(Boolean).join(" "),
    imei: c.imei,
    // Qurilma narxi: ustamasiz summa. Eski yozuvda ustama ajratilmagan,
    // u holda principal = total - boshlang'ich.
    narx: Number(c.principal ?? qoldiq) + boshlangich,
    boshlangich,
    qoldiq,
    oylik: Number(installments[0]?.amount ?? 0),
    jadval: installments.map((p) => ({
      sana: new Date(p.due_date),
      summa: Number(p.amount),
    })),
  };
}

export async function readContract(branchId: string, contractId: string) {
  const s = await scope(branchId);
  const result = await db.query(
    `SELECT c.*,i.model,i.imei,b.name branch_name,
 COALESCE((SELECT sum(a.amount-a.used_amount) FROM customer_advances a WHERE a.contract_id=c.id AND a.voided_at IS NULL),0) advance,
 ${qarzSql()} balance
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
    kurs: await kunlikKurs(s.tenant_id),
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
