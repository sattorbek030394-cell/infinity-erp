import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { qarzSql } from "./qarz-sql";

export const blockSchema = z
  .object({
    branchId: z.uuid(),
    customerId: z.uuid(),
    action: z.enum(["block", "unblock"]),
    reason: z.string().trim().max(160).default(""),
  })
  .strict();
export class CustomerError extends Error {}

/**
 * Mijoz kartochkasi: shartnoma sahifasida ko'rsatiladigan qisqa ma'lumot
 * va uning barcha shartnomalaridagi jami qarzi (taklif 3.1).
 */
export async function readCustomer(branchId: string, customerId: string) {
  const s = await scope(branchId);
  const row = (
    await db.query(
      `SELECT m.id,m.full_name,m.pnfl,m.passport,m.phone1,m.phone2,m.address,
 m.icloud_account,m.blocked_at,m.blocked_reason,u.email blocked_email,
 (SELECT count(*) FROM contracts c WHERE c.tenant_id=m.tenant_id AND c.customer_id=m.id) contracts,
 COALESCE((SELECT sum(q.qarz) FROM (SELECT ${qarzSql()} qarz FROM contracts c
   WHERE c.tenant_id=m.tenant_id AND c.customer_id=m.id) q WHERE q.qarz>0),0) exposure
 FROM customers m LEFT JOIN users u ON u.id=m.blocked_by
 WHERE m.id=$1 AND m.tenant_id=$2`,
      [customerId, s.tenant_id],
    )
  ).rows[0];
  return row ?? null;
}

/**
 * Qora ro'yxatga qo'shish va chiqarish.
 *
 * Qora ro'yxatdagi mijozga yangi nasiya berilmaydi. Sabab majburiy va
 * shartnoma tuzmoqchi bo'lgan sotuvchiga ko'rsatiladi. Qaror auditga
 * tushadi; eski shartnomalariga ta'sir qilmaydi.
 */
export async function blockCustomer(raw: unknown) {
  const v = blockSchema.parse(raw);
  if (v.action === "block" && v.reason.length < 5)
    throw new CustomerError("Sababni yozing (kamida 5 belgi)");
  const s = await scope(v.branchId, "customer.block");
  return transaction(async (c) => {
    const mijoz = (
      await c.query(
        "SELECT id,blocked_at FROM customers WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
        [v.customerId, s.tenant_id],
      )
    ).rows[0];
    if (!mijoz) throw new CustomerError("Mijoz topilmadi");
    if (v.action === "block")
      await c.query(
        "UPDATE customers SET blocked_at=now(),blocked_by=$2,blocked_reason=$3 WHERE id=$1",
        [v.customerId, s.userId, v.reason],
      );
    else
      await c.query(
        "UPDATE customers SET blocked_at=NULL,blocked_by=NULL,blocked_reason=NULL WHERE id=$1",
        [v.customerId],
      );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [
        s.userId,
        s.tenant_id,
        s.branch_id,
        "customer." + v.action,
        v.customerId,
      ],
    );
    return { id: v.customerId, blocked: v.action === "block" };
  });
}
