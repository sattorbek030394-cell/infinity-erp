import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, AccessDeniedError } from "./auth";
import { transaction } from "./db";
import { can } from "./domain";
import { tushumMinor } from "./cash-domain";
export const paymentVoidSchema = z
  .object({
    branchId: z.uuid(),
    paymentId: z.uuid(),
    requestKey: z.uuid(),
    reason: z.string().trim().min(5).max(160),
  })
  .strict();
export class PaymentVoidError extends Error {}
export async function voidPayment(raw: unknown) {
  const v = paymentVoidSchema.parse(raw),
    s = await scope(v.branchId, "payment.void");
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [s.tenant_id, s.branch_id],
    );
    const role = (
      await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
        [s.userId, s.tenant_id, s.branch_id],
      )
    ).rows[0]?.role;
    if (!can(role, "payment.void")) throw new AccessDeniedError();
    const payment = (
      await c.query(
        "SELECT * FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND id=$3",
        [s.tenant_id, s.branch_id, v.paymentId],
      )
    ).rows[0];
    if (!payment) throw new PaymentVoidError("To‘lov topilmadi");
    // Tasdiq kutayotgan tushum bekor qilinmaydi - u rad etiladi (PAY-06).
    if (payment.status !== "approved")
      throw new PaymentVoidError(
        payment.status === "pending"
          ? "Bu tushum hali tasdiqlanmagan: uni rad etish kerak"
          : "Rad etilgan tushumni bekor qilib bo‘lmaydi",
      );
    await c.query(
      "SELECT id FROM contracts WHERE tenant_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE",
      [s.tenant_id, s.branch_id, payment.contract_id],
    );
    const hash = createHash("sha256")
      .update(JSON.stringify({ action: "payment.void", ...v }))
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
        throw new PaymentVoidError("Takroriy so‘rov mos emas");
      return v.paymentId;
    }
    if (payment.voided_at)
      throw new PaymentVoidError("To‘lov avval bekor qilingan");
    const receipt = (
      await c.query(
        "SELECT * FROM cash_entries WHERE tenant_id=$1 AND branch_id=$2 AND payment_id=$3 FOR UPDATE",
        [s.tenant_id, s.branch_id, v.paymentId],
      )
    ).rows[0];
    if (!receipt)
      throw new PaymentVoidError(
        "Eski to‘lovning Kassa yozuvi yo‘q. Bu usul bilan bekor qilib bo‘lmaydi",
      );
    if (
      Number(receipt.amount_minor) !== tushumMinor(payment) ||
      (
        await c.query("SELECT 1 FROM cash_entries WHERE reversal_of=$1", [
          receipt.id,
        ])
      ).rowCount
    )
      throw new PaymentVoidError("Kassa yozuvi mos emas");
    await c.query("INSERT INTO cash_operations VALUES($1,$2,$3,$4)", [
      v.requestKey,
      s.tenant_id,
      s.branch_id,
      hash,
    ]);
    await c.query(
      "INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,note,user_id,operation_id,reversal_of) VALUES($1,$2,$3,$4,$5,$6,'Nasiya to‘lovini bekor qilish',$7,$8,$9,$10)",
      [
        randomUUID(),
        s.tenant_id,
        s.branch_id,
        receipt.wallet,
        receipt.entry_date,
        -tushumMinor(payment),
        v.reason,
        s.userId,
        v.requestKey,
        receipt.id,
      ],
    );
    // AT-32: yopilgan shartnomaning to'lovi qaytarilsa, bog'langan yopish
    // tuzatishi ham teskari qilinadi - bekor qilingan ustama qarzga
    // qaytadi va shartnoma yana ochiq bo'ladi.
    const yopish = (
      await c.query(
        "SELECT id FROM contract_closures WHERE contract_id=$1 AND status='completed' FOR UPDATE",
        [payment.contract_id],
      )
    ).rows[0];
    if (yopish)
      await c.query(
        "UPDATE contract_closures SET status='reversed',decided_by=$2,decided_at=now(),note=$3 WHERE id=$1",
        [yopish.id, s.userId, "To‘lov bekor qilindi"],
      );
    // To'lov bilan birga shu to'lovdan chiqqan avans ham amaldan chiqadi.
    // Avans allaqachon ishlatilgan bo'lsa bekor qilish bloklanadi.
    const avans = (
      await c.query(
        "SELECT id,used_amount FROM customer_advances WHERE payment_id=$1 AND voided_at IS NULL FOR UPDATE",
        [v.paymentId],
      )
    ).rows[0];
    if (avans && Number(avans.used_amount) > 0)
      throw new PaymentVoidError(
        "Bu to‘lovning avansi ishlatilgan: avval avans harakatini bekor qiling",
      );
    if (avans)
      await c.query(
        "UPDATE customer_advances SET voided_at=now() WHERE id=$1",
        [avans.id],
      );
    await c.query(
      "UPDATE payments SET voided_at=now(),voided_by=$4,void_reason=$5,void_request_key=$6 WHERE tenant_id=$1 AND branch_id=$2 AND id=$3",
      [s.tenant_id, s.branch_id, v.paymentId, s.userId, v.reason, v.requestKey],
    );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'payment.void',$4)",
      [s.userId, s.tenant_id, s.branch_id, v.paymentId],
    );
    return v.paymentId;
  });
}
