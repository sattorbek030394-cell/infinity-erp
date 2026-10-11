import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("PostgreSQL schema blocks cross tenant/branch references and duplicate IMEI", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("db/001_init.sql", "utf8"));
    await db.exec(await readFile("db/002_disabled_memberships.sql", "utf8"));
    await db.exec(await readFile("db/003_cash.sql", "utf8"));
    const t = "00000000-0000-4000-8000-000000000001",
      b = "00000000-0000-4000-8000-000000000002",
      b2 = "00000000-0000-4000-8000-000000000003",
      i = "00000000-0000-4000-8000-000000000004";
    await db.query("INSERT INTO tenants VALUES($1,$2)", [t, "synthetic"]);
    await db.query("INSERT INTO branches VALUES($1,$2,$3),($4,$2,$5)", [
      b,
      t,
      "Infinity",
      b2,
      "Second",
    ]);
    await db.query(
      "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES($1,$2,$3,$4,$5,100)",
      [i, t, b, "000000000000001", "synthetic"],
    );
    await assert.rejects(
      db.query(
        "INSERT INTO contracts VALUES('00000000-0000-4000-8000-000000000005',$1,$2,$3,'demo',200,0,2,'2026-01-01')",
        [t, b2, i],
      ),
    );
    await assert.rejects(
      db.query(
        "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES('00000000-0000-4000-8000-000000000006',$1,$2,'000000000000001','demo',100)",
        [t, b2],
      ),
    );
    await assert.rejects(
      db.query(
        "INSERT INTO branches VALUES('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','unauthorized')",
      ),
    );
  } finally {
    await db.close();
  }
});
