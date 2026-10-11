import { randomUUID } from "node:crypto";
import { scope } from "./auth";
import { transaction, db } from "./db";
import {
  itemSchema,
  contractSchema,
  paymentSchema,
  schedule,
  assertPayment,
} from "./domain";
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
    await c.query(
      "INSERT INTO contracts(id,tenant_id,branch_id,inventory_id,customer_label,total,down_payment,months,start_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.inventoryId,
        v.customerLabel,
        v.total,
        v.downPayment,
        v.months,
        v.startDate,
      ],
    );
    for (const p of schedule(v.total, v.downPayment, v.months, v.startDate))
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
  };
}
