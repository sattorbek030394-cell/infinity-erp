import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { arrearsQuery } from "../lib/arrears-query";
test("arrears: exact due-day boundary, oldest-first partial payments, prepayment, settlement and branch isolation", async () => {
  const db = new PGlite();
  const id = (n: number) =>
    "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
  try {
    await db.exec(await readFile("db/001_init.sql", "utf8"));
    await db.query("INSERT INTO tenants VALUES($1,'synthetic'),($2,'other')", [
      id(1),
      id(9),
    ]);
    await db.query(
      "INSERT INTO branches VALUES($1,$2,'A'),($3,$2,'B'),($4,$5,'C')",
      [id(2), id(1), id(3), id(10), id(9)],
    );
    for (const [item, contract, tenant, branch] of [
      [4, 5, 1, 2],
      [6, 7, 1, 3],
      [11, 12, 9, 10],
    ]) {
      await db.query(
        "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES($1,$2,$3,$4,'synthetic',100)",
        [id(item), id(tenant), id(branch), String(item).padStart(15, "0")],
      );
      await db.query(
        "INSERT INTO contracts VALUES($1,$2,$3,$4,'synthetic',400,100,3,'2026-01-31')",
        [id(contract), id(tenant), id(branch), id(item)],
      );
      await db.query(
        "INSERT INTO installments VALUES($1,1,'2026-02-28',100),($1,2,'2026-03-31',100),($1,3,'2026-04-30',100)",
        [id(contract)],
      );
    }
    const report = async (date: string) =>
      (
        await db.query<{
          id: string;
          overdue: string;
          balance: string;
          days_late: number;
          first_unpaid: string;
        }>(arrearsQuery, [id(1), id(2), date])
      ).rows.map((r) => ({
        ...r,
        overdue: Number(r.overdue),
        balance: Number(r.balance),
      }));
    assert.equal((await report("2026-02-28"))[0].overdue, 0);
    assert.equal((await report("2026-03-01"))[0].overdue, 100);
    await db.query(
      "INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,method,request_key) VALUES($1,$2,$3,$4,150,'cash',$5)",
      [id(20), id(1), id(2), id(5), id(21)],
    );
    let rows = await report("2026-04-01");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id(5));
    assert.equal(rows[0].overdue, 50);
    assert.equal(rows[0].balance, 150);
    assert.equal(rows[0].days_late, 1);
    assert.equal(rows[0].first_unpaid, "2026-03-31");
    assert.equal(
      (await report("2026-03-01"))[0].overdue,
      0,
      "advance payment covers the earliest due installment",
    );
    await db.query("UPDATE payments SET amount=250 WHERE id=$1", [id(20)]);
    rows = await report("2026-05-02");
    assert.equal(rows[0].overdue, 50);
    assert.equal(rows[0].days_late, 2);
    await db.query("UPDATE payments SET amount=300 WHERE id=$1", [id(20)]);
    assert.equal(
      (await report("2026-05-02")).length,
      0,
      "fully settled contracts excluded",
    );
    assert.equal(
      (await db.query(arrearsQuery, [id(9), id(2), "2026-05-02"])).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
