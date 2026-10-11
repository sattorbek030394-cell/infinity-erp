import { z } from "zod";
import { scope, AccessDeniedError } from "./auth";
import { db, transaction } from "./db";
import { can, assertPayment, tasdiqAmal, TOLOV_USULLARI } from "./domain";
import { postCashReceipt } from "./cash";
import { tushumMinor } from "./cash-domain";
import { yozAvans } from "./service";

export const approvalSchema = z
  .object({
    branchId: z.uuid(),
    paymentId: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(160).default(""),
  })
  .strict();
export class ApprovalError extends Error {}

/**
 * Tasdiq kutayotgan tushumlar - rahbar va kassir ekrani.
 *
 * Ro'yxatda faqat shu foydalanuvchi tasdiqlashga haqli usullar ko'rinadi:
 * kassirga naqd, rahbarga P2P va bank. Kirituvchi va dalil ham chiqadi.
 */
export async function readPending(branchId: string) {
  const s = await scope(branchId);
  const usullar = TOLOV_USULLARI.filter((m) => can(s.role, tasdiqAmal(m)));
  const rows = usullar.length
    ? (
        await db.query(
          `SELECT p.id,p.amount,p.advance_amount,p.usd_cents,p.rate,p.method,p.evidence,p.created_at,p.contract_id,
 c.customer_label,c.number,i.model,i.imei,u.email author,
 c.total-c.down_payment-COALESCE((SELECT sum(x.amount) FROM payments x
   WHERE x.contract_id=c.id AND x.status='approved' AND x.voided_at IS NULL),0) balance
 FROM payments p
 JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 LEFT JOIN users u ON u.id=p.created_by
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='pending' AND p.method=ANY($3)
 ORDER BY p.created_at,p.id LIMIT 200`,
          [s.tenant_id, s.branch_id, usullar],
        )
      ).rows
    : [];
  return { rows, role: s.role, usullar };
}

/**
 * Tushumni tasdiqlash yoki rad etish.
 *
 * Tasdiqlashda qoldiq yana tekshiriladi: kutish davomida boshqa to'lov
 * tasdiqlangan bo'lishi mumkin, u holda bu summa qarzdan oshib ketadi va
 * amal rad etiladi - jim ravishda ortiqcha yozilmaydi.
 *
 * Takroriy so'rov: qaror allaqachon qo'llanilgan bo'lsa ayni natija
 * qaytadi, boshqa qaror yuborilsa xato beradi.
 */
export async function decidePayment(raw: unknown) {
  const v = approvalSchema.parse(raw);
  if (v.decision === "reject" && v.reason.length < 5)
    throw new ApprovalError("Rad etish sababini yozing (kamida 5 belgi)");
  const s = await scope(v.branchId);
  return transaction(async (c) => {
    const payment = (
      await c.query(
        "SELECT * FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
        [s.tenant_id, s.branch_id, v.paymentId],
      )
    ).rows[0];
    if (!payment) throw new ApprovalError("To‘lov topilmadi");
    // Huquq tranzaksiya ichida qayta o'qiladi: kutish davomida rol
    // o'zgargan bo'lishi mumkin.
    const role = (
      await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
        [s.userId, s.tenant_id, s.branch_id],
      )
    ).rows[0]?.role;
    if (!role || !can(role, tasdiqAmal(payment.method)))
      throw new AccessDeniedError("Bu tushumni tasdiqlashga ruxsat yo‘q");
    if (payment.status !== "pending") {
      const kutilgan = v.decision === "approve" ? "approved" : "rejected";
      if (payment.status !== kutilgan)
        throw new ApprovalError(
          "Bu tushum bo‘yicha boshqa qaror allaqachon qabul qilingan",
        );
      return { id: payment.id, status: payment.status };
    }
    // Olingan pul: qarzga yo'naltirilgani va avansga tushgani birgalikda.
    const received =
      Number(payment.amount) + Number(payment.advance_amount ?? 0);
    let applied = received,
      advance = 0;
    if (v.decision === "approve") {
      const contract = (
        await c.query(
          "SELECT total,down_payment FROM contracts WHERE tenant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
          [s.tenant_id, s.branch_id, payment.contract_id],
        )
      ).rows[0];
      const paid = Number(
        (
          await c.query(
            "SELECT COALESCE(sum(amount),0) paid FROM payments WHERE contract_id=$1 AND status='approved' AND voided_at IS NULL",
            [payment.contract_id],
          )
        ).rows[0].paid,
      );
      const balance = Math.max(
        0,
        Number(contract.total) - Number(contract.down_payment) - paid,
      );
      // Kutish davomida qarz kamaygan bo'lishi mumkin: taqsimot tasdiq
      // paytidagi qoldiqdan qayta hisoblanadi, ortig'i avansga tushadi
      // (PAY-04). Pul rad etilmaydi - u allaqachon qabul qilingan.
      applied = Math.min(received, balance);
      advance = received - applied;
      if (applied > 0) assertPayment(applied, balance);
    }
    await c.query(
      `UPDATE payments SET status=$1,decided_by=$2,decided_at=now(),decided_reason=$3,
 amount=$4,advance_amount=$5 WHERE id=$6 AND status='pending'`,
      [
        v.decision === "approve" ? "approved" : "rejected",
        s.userId,
        v.reason || null,
        v.decision === "approve" ? applied : payment.amount,
        v.decision === "approve" ? advance : payment.advance_amount ?? 0,
        v.paymentId,
      ],
    );
    if (v.decision === "approve") {
      if (advance > 0)
        await yozAvans(c, s, payment.id, payment.contract_id, advance);
      await postCashReceipt(
        c,
        s,
        payment.id,
        tushumMinor({ ...payment, amount: applied, advance_amount: advance }),
        payment.method,
        "payment",
      );
    }
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [
        s.userId,
        s.tenant_id,
        s.branch_id,
        "payment." + v.decision,
        v.paymentId,
      ],
    );
    return {
      id: payment.id,
      status: v.decision === "approve" ? "approved" : "rejected",
    };
  });
}
