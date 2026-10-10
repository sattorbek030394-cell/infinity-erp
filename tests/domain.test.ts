import { test } from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  assertPayment,
  authorize,
  itemSchema,
  contractSchema,
  paymentSchema,
} from "../lib/domain";
test("integer schedule preserves exact balance and clamps end of month", () => {
  const s = schedule(1001, 100, 3, "2026-01-31");
  assert.equal(
    s.reduce((n, p) => n + p.amount, 0),
    901,
  );
  assert.deepEqual(
    s.map((p) => p.dueDate),
    ["2026-02-28", "2026-03-31", "2026-04-30"],
  );
});
test("rejects overpayment, negative payment and invalid terms", () => {
  for (const amount of [-1, 0, 101, 1.5])
    assert.throws(() => assertPayment(amount, 100));
  assertPayment(100, 100);
  assert.throws(() => schedule(100, 100, 3, "2026-01-01"));
  assert.throws(() => schedule(10, 0, 36, "2026-01-01"));
});
test("viewer cannot mutate; unknown roles denied", () => {
  authorize("viewer");
  assert.throws(() => authorize("viewer", true));
  assert.throws(() => authorize("owner"));
  authorize("cashier", true);
});
test("input validation rejects malformed identifiers and money", () => {
  assert.equal(
    itemSchema.safeParse({ imei: "123", model: "x", cost: -1 }).success,
    false,
  );
  assert.equal(
    paymentSchema.safeParse({
      contractId: "bad",
      amount: 1,
      method: "cash",
      requestKey: "bad",
    }).success,
    false,
  );
  assert.equal(
    contractSchema.safeParse({
      inventoryId: "00000000-0000-4000-8000-000000000001",
      customerLabel: "demo",
      total: 100,
      downPayment: 100,
      months: 1,
      startDate: "2026-01-01",
    }).success,
    false,
  );
});
