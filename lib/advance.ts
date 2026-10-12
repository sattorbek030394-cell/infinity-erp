import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { money } from "./domain";
import { qarzSql } from "./qarz-sql";

/**
 * Avansni boshqa shartnomaga ko'chirish (PAY-04 davomi).
 *
 * Ko'chirish - maqsad shartnomasiga to'lov yozish, puli esa kassadan
 * emas, avansdan. Kassaga yozuv tushmaydi: o'sha pul avans paydo
 * bo'lgan kuni allaqachon kirgan.
 *
 * Qoidalar:
 * - Faqat O'SHA MIJOZNING boshqa shartnomasiga. Bir mijozning puli
 *   bilan boshqasining qarzini yopib bo'lmaydi.
 * - Qarzdan ortiq ko'chirilmaydi: aks holda bir avansdan ikkinchisi
 *   tug'ilib, zanjir paydo bo'ladi.
 * - Rahbar qaroriga qoldirildi (payment.approve.transfer): pulni bir
 *   shartnomadan ikkinchisiga ko'chirish kassir ishi emas.
 */
export const transferSchema = z.object({
  branchId: z.uuid(),
  advanceId: z.uuid(),
  toContractId: z.uuid(),
  amount: money,
  reason: z.string().trim().min(5).max(160),
});

export async function transferAdvance(raw: unknown) {
  const v = transferSchema.parse(raw);
  const s = await scope(v.branchId, "payment.approve.transfer");
  return transaction(async (c) => {
    const a = (
      await c.query(
        `SELECT a.id,a.amount-a.used_amount qoldiq,c.customer_id,c.number
 FROM customer_advances a
 JOIN contracts c ON c.id=a.contract_id AND c.tenant_id=a.tenant_id AND c.branch_id=a.branch_id
 WHERE a.id=$1 AND a.tenant_id=$2 AND a.branch_id=$3 AND a.voided_at IS NULL
 FOR UPDATE OF a`,
        [v.advanceId, s.tenant_id, s.branch_id],
      )
    ).rows[0];
    if (!a) throw new Error("Avans topilmadi");
    const qoldiq = Number(a.qoldiq);
    if (qoldiq <= 0) throw new Error("Bu avans allaqachon ishlatilgan");
    if (v.amount > qoldiq)
      throw new Error("Avans qoldig‘idan ortiq ko‘chirib bo‘lmaydi");
    const t = (
      await c.query(
        `SELECT c.id,c.customer_id,${qarzSql()} qarz FROM contracts c
 WHERE c.id=$1 AND c.tenant_id=$2 AND c.branch_id=$3 FOR UPDATE`,
        [v.toContractId, s.tenant_id, s.branch_id],
      )
    ).rows[0];
    if (!t) throw new Error("Maqsad shartnoma topilmadi");
    if (t.id === v.advanceId) throw new Error("Shartnoma noto‘g‘ri");
    // Bir mijozning puli boshqasiga o'tmasligi kerak.
    if (!a.customer_id || !t.customer_id || a.customer_id !== t.customer_id)
      throw new Error("Faqat o‘sha mijozning boshqa shartnomasiga mumkin");
    const qarz = Number(t.qarz);
    if (qarz <= 0) throw new Error("Maqsad shartnomada qarz qolmagan");
    if (v.amount > qarz)
      throw new Error("Maqsad shartnomadagi qarzdan ortiq ko‘chirilmaydi");
    const id = randomUUID();
    await c.query(
      `INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,advance_amount,method,
 request_key,evidence,created_by,status,decided_by,decided_at,from_advance_id)
 VALUES($1,$2,$3,$4,$5,0,'advance',$6,$7,$8,'approved',$8,now(),$9)`,
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.toContractId,
        v.amount,
        randomUUID(),
        `№${a.number} shartnomadagi avansdan: ${v.reason}`,
        s.userId,
        v.advanceId,
      ],
    );
    await c.query(
      "UPDATE customer_advances SET used_amount=used_amount+$2 WHERE id=$1",
      [v.advanceId, v.amount],
    );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'advance.transfer',$4)",
      [s.userId, s.tenant_id, s.branch_id, id],
    );
    return { id };
  });
}

/** Ishlatilmagan avanslar va ularni ko'chirish mumkin bo'lgan shartnomalar. */
export async function readAdvances(branchId: string) {
  const s = await scope(branchId);
  const args = [s.tenant_id, s.branch_id];
  const rows = (
    await db.query(
      `SELECT a.id,a.amount-a.used_amount qoldiq,a.created_at::date::text kun,
 c.number,c.customer_label nom,c.customer_id
 FROM customer_advances a
 JOIN contracts c ON c.id=a.contract_id AND c.tenant_id=a.tenant_id AND c.branch_id=a.branch_id
 WHERE a.tenant_id=$1 AND a.branch_id=$2 AND a.voided_at IS NULL
 AND a.amount>a.used_amount
 ORDER BY a.created_at DESC`,
      args,
    )
  ).rows;
  // Maqsad bo'la oladigan shartnomalar: o'sha mijozning qarzi bor
  // boshqa shartnomalari.
  const nishonlar = (
    await db.query(
      `SELECT c.id,c.customer_id,c.number,c.customer_label nom,${qarzSql()} qarz
 FROM contracts c WHERE c.tenant_id=$1 AND c.branch_id=$2
 AND c.customer_id IS NOT NULL AND (${qarzSql()})>0
 ORDER BY c.number`,
      args,
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id as string,
    kun: r.kun as string,
    number: Number(r.number),
    nom: r.nom as string,
    qoldiq: Number(r.qoldiq),
    nishonlar: nishonlar
      .filter(
        (n) => n.customer_id === r.customer_id && Number(n.number) !== Number(r.number),
      )
      .map((n) => ({
        id: n.id as string,
        label: `№${n.number} — qarz ${Number(n.qarz).toLocaleString("uz-UZ")}`,
        qarz: Number(n.qarz),
      })),
  }));
}
