import { randomUUID } from "node:crypto";
import { scope } from "./auth";
import { transaction, db } from "./db";
import {
  itemSchema,
  contractSchema,
  paymentSchema,
  schedule,
  nasiyaTotals,
  assertPayment,
} from "./domain";
import type { z } from "zod";
import type { PoolClient } from "pg";
import { postCashReceipt } from "./cash";
type Scope = {
  tenant_id: string;
  branch_id: string;
  userId: string;
  role: string;
};
export async function createRecord(
  branchId: string,
  kind: string,
  input: unknown,
) {
  const s = await scope(branchId, true);
  return transaction((c) => writeRecord(c, s, kind, input));
}
type Shartnoma = z.infer<typeof contractSchema>;

/**
 * Shartnoma summalari: narx berilsa ustamani dastur hisoblaydi.
 *
 * Foiz formadan kelmasa filial sozlamasidan olinadi, u ham bo'lmasa oyiga
 * 5% - hozir Excel'da amalda shu foiz ishlatilyapti.
 *
 * Eski yo'l (faqat `total` berilgan) saqlanib turadi: unda ustama ajratilmaydi
 * va `monthly_rate_bp` nol bo'lib qoladi, ya'ni bazada "hisoblanmagan" deb
 * ko'rinadi.
 */
async function nasiyaShartlari(
  c: Pick<PoolClient, "query">,
  s: Scope,
  v: Shartnoma,
) {
  if (v.priceUzs === undefined) {
    const total = v.total!;
    return { total, principal: total - v.downPayment, markup: 0, bp: 0 };
  }
  const sozlama = await c.query(
    "SELECT default_rate_bp,min_down_bp FROM nasiya_settings WHERE tenant_id=$1 AND branch_id=$2",
    [s.tenant_id, s.branch_id],
  );
  const row = sozlama.rows[0];
  const bp = v.monthlyRateBp ?? Number(row?.default_rate_bp ?? 500);
  const minDownBp = Number(row?.min_down_bp ?? 0);
  if (v.downPayment * 10000 < v.priceUzs * minDownBp)
    throw new Error("Boshlang‘ich to‘lov filial shartidan kichik");
  const t = nasiyaTotals(v.priceUzs, v.downPayment, v.months, bp);
  // Forma hisobni ko'rsatib turadi: ekranda ko'rilgan summa bilan bazaga
  // yozilayotgani boshqa bo'lsa, jim o'tib ketmaydi.
  if (v.total !== undefined && v.total !== t.total)
    throw new Error("Jami summa hisobga mos emas");
  return { total: t.total, principal: t.principal, markup: t.markup, bp };
}

/**
 * Mijoz kartochkasi. PNFL bor mijoz ikkinchi marta telefon olsa, yangi
 * kartochka ochilmaydi - borini to'ldiradi. Bo'sh kelgan maydon eski
 * qiymatni o'chirib tashlamaydi.
 */
async function mijozYoz(c: Pick<PoolClient, "query">, s: Scope, v: Shartnoma) {
  const r = await c.query(
    `INSERT INTO customers(id,tenant_id,full_name,passport,pnfl,passport_issuer,passport_date,
 birth_date,phone1,phone2,address,icloud_account,icloud_phone)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ON CONFLICT(tenant_id,pnfl) DO UPDATE SET
 full_name=excluded.full_name,
 passport=COALESCE(NULLIF(excluded.passport,''),customers.passport),
 passport_issuer=COALESCE(NULLIF(excluded.passport_issuer,''),customers.passport_issuer),
 passport_date=COALESCE(excluded.passport_date,customers.passport_date),
 birth_date=COALESCE(excluded.birth_date,customers.birth_date),
 phone1=COALESCE(NULLIF(excluded.phone1,''),customers.phone1),
 phone2=COALESCE(NULLIF(excluded.phone2,''),customers.phone2),
 address=COALESCE(NULLIF(excluded.address,''),customers.address),
 icloud_account=COALESCE(NULLIF(excluded.icloud_account,''),customers.icloud_account),
 icloud_phone=COALESCE(NULLIF(excluded.icloud_phone,''),customers.icloud_phone)
 RETURNING id`,
    [
      randomUUID(),
      s.tenant_id,
      v.customerName,
      v.passport,
      v.pnfl ?? null,
      v.passportIssuer,
      v.passportDate ?? null,
      v.birthDate ?? null,
      v.phone1,
      v.phone2,
      v.address,
      v.icloudAccount,
      v.icloudPhone,
    ],
  );
  return r.rows[0].id as string;
}

async function writeRecord(
  c: Pick<PoolClient, "query">,
  s: Scope,
  kind: string,
  input: unknown,
) {
  const id = randomUUID();
  if (kind === "inventory") {
    const v = itemSchema.parse(input);
    await c.query(
      "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES($1,$2,$3,$4,$5,$6)",
      [id, s.tenant_id, s.branch_id, v.imei, v.model, v.cost],
    );
  } else if (kind === "contracts") {
    const v = contractSchema.parse(input);
    const item = await c.query(
      "SELECT id FROM inventory WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status='available' FOR UPDATE",
      [v.inventoryId, s.tenant_id, s.branch_id],
    );
    if (!item.rowCount) throw new Error("Mahsulot mavjud emas");
    const { total, principal, markup, bp } = await nasiyaShartlari(c, s, v);
    const customerId = v.customerName ? await mijozYoz(c, s, v) : null;
    // Shartnoma raqami Excel'dagi kabi ketma-ket. Ikki kassir bir vaqtda
    // tuzsa, UNIQUE(tenant_id,number) ikkinchisini rad etadi - qayta
    // yuborilganda keyingi raqamni oladi.
    await c.query(
      `INSERT INTO contracts(id,tenant_id,branch_id,inventory_id,customer_id,customer_label,number,
 total,down_payment,principal,markup,monthly_rate_bp,months,start_date)
 VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(number),0)+1 FROM contracts WHERE tenant_id=$2),
 $7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.inventoryId,
        customerId,
        v.customerName ?? v.customerLabel,
        total,
        v.downPayment,
        principal,
        markup,
        bp,
        v.months,
        v.startDate,
      ],
    );
    for (const p of schedule(total, v.downPayment, v.months, v.startDate))
      await c.query("INSERT INTO installments VALUES($1,$2,$3,$4)", [
        id,
        p.sequence,
        p.dueDate,
        p.amount,
      ]);
    await c.query("UPDATE inventory SET status='sold' WHERE id=$1", [
      v.inventoryId,
    ]);
    await postCashReceipt(c, s, id, v.downPayment, v.downPaymentMethod, "down");
  } else if (kind === "payments") {
    const v = paymentSchema.parse(input);
    const contract = await c.query(
      "SELECT * FROM contracts WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE",
      [v.contractId, s.tenant_id, s.branch_id],
    );
    if (!contract.rowCount) throw new Error("Shartnoma mavjud emas");
    const prior = await c.query(
      "SELECT * FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND request_key=$3",
      [s.tenant_id, s.branch_id, v.requestKey],
    );
    if (prior.rowCount) {
      const p = prior.rows[0];
      if (
        p.contract_id !== v.contractId ||
        Number(p.amount) !== v.amount ||
        p.method !== v.method
      )
        throw new Error("Takroriy kalit mos emas");
      return p.id;
    }
    const sum = await c.query(
      "SELECT COALESCE(sum(amount),0) paid FROM payments WHERE contract_id=$1 AND voided_at IS NULL",
      [v.contractId],
    );
    assertPayment(
      v.amount,
      Number(contract.rows[0].total) -
        Number(contract.rows[0].down_payment) -
        Number(sum.rows[0].paid),
    );
    await c.query(
      "INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,method,request_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.contractId,
        v.amount,
        v.method,
        v.requestKey,
      ],
    );
    await postCashReceipt(c, s, id, v.amount, v.method, "payment");
  } else throw new Error("Noto‘g‘ri modul");
  await c.query(
    "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [s.userId, s.tenant_id, s.branch_id, kind + ".create", id],
  );
  return id;
}
export async function readBranch(branchId: string) {
  const s = await scope(branchId);
  const args = [s.tenant_id, s.branch_id];
  const items = await db.query(
    "SELECT * FROM inventory WHERE tenant_id=$1 AND branch_id=$2 ORDER BY model",
    args,
  );
  const contracts = await db.query(
    "SELECT c.*, i.model,i.imei,c.total-c.down_payment-COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.contract_id=c.id AND p.voided_at IS NULL),0) balance FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id WHERE c.tenant_id=$1 AND c.branch_id=$2 ORDER BY start_date DESC,c.id",
    args,
  );
  return {
    items: items.rows,
    contracts: contracts.rows,
    role: s.role,
    salesTotal: (
      await db.query(
        "SELECT coalesce(sum(amount),0)::text total FROM cash_sales WHERE tenant_id=$1 AND branch_id=$2",
        args,
      )
    ).rows[0].total,
  };
}
