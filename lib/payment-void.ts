import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { scope, AccessDeniedError } from "./auth";
import { transaction } from "./db";
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
    s = await scope(v.branchId, true);
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
    if (role !== "admin") throw new AccessDeniedError();
    const payment = (
      await c.query(
        "SELECT * FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND id=$3",
        [s.tenant_id, s.branch_id, v.paymentId],
      )
    ).rows[0];
    if (!payment) throw new PaymentVoidError("To‘lov topilmadi");
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
      Number(receipt.amount_minor) !== Number(payment.amount) ||
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
        -Number(payment.amount),
        v.reason,
        s.userId,
        v.requestKey,
        receipt.id,
      ],
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
