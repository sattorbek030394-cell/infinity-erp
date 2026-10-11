import { test } from "node:test";
import assert from "node:assert/strict";
import { saleSchema } from "../lib/sales-schema";
test("Cash sale validation rejects fractional/forged amounts and identity, and accepts exact whole UZS", () => {
  const v = {
    branchId: "00000000-0000-4000-8000-000000000001",
    inventoryId: "00000000-0000-4000-8000-000000000002",
    requestKey: "00000000-0000-4000-8000-000000000003",
    amount: "500000",
    method: "card",
  };
  assert.equal(saleSchema.parse(v).amount, 500000);
  for (const amount of [
    true,
    null,
    "",
    "1e3",
    "1.5",
    0,
    -1,
    1.5,
    1000000000001,
  ])
    assert.equal(saleSchema.safeParse({ ...v, amount }).success, false);
  assert.equal(
    saleSchema.safeParse({ ...v, tenantId: "forged" }).success,
    false,
  );
  assert.equal(
    saleSchema.safeParse({ ...v, method: "cash_usd" }).success,
    false,
  );
});
