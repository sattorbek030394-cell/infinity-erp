import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { minorUnits, type Wallet } from "./cash-domain";
import { postSettlement, wallets } from "./cash";

export const settlementSchema = z
  .object({
    branchId: z.uuid(),
    supplierId: z.uuid(),
    // Majburiyatdan ayiriladigan summa so'mda; USD hamyonidan to'lansa
    // dollar summasi va kurs beriladi.
    amount: z.coerce.number().int().min(1).max(1_000_000_000_000).optional(),
    usdAmount: z
      .string()
      .regex(/^\d{1,9}(\.\d{1,2})?$/)
      .optional(),
    rate: z.coerce.number().int().min(1).max(100_000_000).optional(),
    wallet: z.enum(["cash_uzs", "cash_usd", "card_uzs", "bank_uzs"]),
    note: z.string().trim().max(160).default(""),
    requestKey: z.uuid(),
  })
  .strict()
  .refine(
    (v) =>
      v.wallet === "cash_usd"
        ? v.usdAmount !== undefined && v.rate !== undefined
        : v.amount !== undefined,
    { message: "USD hamyonidan to‘lovda summa va kurs majburiy" },
  );
export class SupplierError extends Error {}

/**
 * Yetkazib beruvchilar ro'yxati: jami xarid, qarzga olingan, to'langan
 * va qoldiq (TZ SUP).
 *
 * Naqd xarid qarz yaratmaydi, shuning uchun "qarzga olingan" alohida
 * ustun. Qoldiq = qarzga olingan − to'langan.
 */
export async function readSuppliers(branchId: string) {
  const s = await scope(branchId);
  const rows = (
    await db.query(
      `SELECT p.id,p.name,p.phone,
 COALESCE((SELECT count(*) FROM inventory i WHERE i.tenant_id=p.tenant_id AND i.supplier_id=p.id),0) devices,
 COALESCE((SELECT sum(i.cost) FROM inventory i WHERE i.tenant_id=p.tenant_id AND i.supplier_id=p.id),0) purchased,
 COALESCE((SELECT sum(o.amount) FROM supplier_obligations o WHERE o.tenant_id=p.tenant_id AND o.supplier_id=p.id),0) obligations,
 COALESCE((SELECT sum(x.amount) FROM supplier_settlements x WHERE x.tenant_id=p.tenant_id AND x.supplier_id=p.id),0) settled
 FROM suppliers p WHERE p.tenant_id=$1 ORDER BY p.name`,
      [s.tenant_id],
    )
  ).rows;
  return {
    rows: rows.map((r) => ({
      ...r,
      balance: Number(r.obligations) - Number(r.settled),
    })),
    role: s.role,
  };
}

/**
 * Qarz to'lovi: majburiyatni kamaytiradi va kassadan pul chiqaradi.
 * Xarid xarajatini qayta yaratmaydi.
 *
 * Qoldiqdan ortiq to'lov qabul qilinmaydi - avval qarzni tekshirish
 * kerak. Takroriy so'rov ikki to'lov yaratmaydi.
 */
export async function paySupplier(raw: unknown) {
  const v = settlementSchema.parse(raw);
  const s = await scope(v.branchId, "cash.entry");
  return transaction(async (c) => {
    const prior = (
      await c.query(
        "SELECT id,supplier_id,amount FROM supplier_settlements WHERE request_key=$1",
        [v.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (prior.supplier_id !== v.supplierId)
        throw new SupplierError("Takroriy kalit mos emas");
      return { id: prior.id as string };
    }
    const supplier = (
      await c.query(
        "SELECT id,name FROM suppliers WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
        [v.supplierId, s.tenant_id],
      )
    ).rows[0];
    if (!supplier) throw new SupplierError("Yetkazib beruvchi topilmadi");
    // Hamyon qatori bo'lmasa to'lov yozuvi FK bo'yicha o'tmaydi.
    await wallets(c, s);
    const usdCents =
      v.usdAmount === undefined ? null : minorUnits(v.usdAmount, "cash_usd");
    const amount =
      usdCents === null ? v.amount! : Math.round((usdCents * v.rate!) / 100);
    if (!Number.isSafeInteger(amount) || amount < 1)
      throw new SupplierError("To‘lov summasi noto‘g‘ri");
    const qarz = Number(
      (
        await c.query(
          `SELECT COALESCE((SELECT sum(o.amount) FROM supplier_obligations o WHERE o.tenant_id=$1 AND o.supplier_id=$2),0)
 -COALESCE((SELECT sum(x.amount) FROM supplier_settlements x WHERE x.tenant_id=$1 AND x.supplier_id=$2),0) qarz`,
          [s.tenant_id, v.supplierId],
        )
      ).rows[0].qarz,
    );
    if (qarz <= 0)
      throw new SupplierError("Bu yetkazib beruvchida qarz qolmagan");
    if (amount > qarz)
      throw new SupplierError(
        `Qarz ${qarz.toLocaleString("uz-UZ")} so‘m: ortiq to‘lov kiritilmaydi`,
      );
    const id = randomUUID();
    const walletMinor = v.wallet === "cash_usd" ? usdCents! : amount;
    await c.query(
      `INSERT INTO supplier_settlements(id,tenant_id,branch_id,supplier_id,amount,wallet,wallet_minor,rate,note,request_key,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.supplierId,
        amount,
        v.wallet,
        walletMinor,
        usdCents === null ? null : v.rate,
        v.note,
        v.requestKey,
        s.userId,
      ],
    );
    await postSettlement(c, s, id, walletMinor, v.wallet as Wallet);
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'supplier.pay',$4)",
      [s.userId, s.tenant_id, s.branch_id, id],
    );
    return { id, amount, balance: qarz - amount };
  });
}
