import { test } from "node:test";
import assert from "node:assert/strict";
import {
  minorUnits,
  cashSchema,
  cashMoney,
  paymentWallet,
} from "../lib/cash-domain";
test("Cash: exact USD cents, whole UZS and strict amount validation", () => {
  assert.equal(minorUnits("100.25", "cash_usd"), 10025);
  assert.equal(minorUnits("0.01", "cash_usd"), 1);
  assert.equal(minorUnits("0", "cash_uzs", true), 0);
  for (const value of [
    "",
    "-1",
    "1e3",
    "NaN",
    " 100",
    "1.001",
    "1000000000001",
  ])
    assert.throws(() => minorUnits(value, "cash_usd"));
  assert.throws(() => minorUnits("1.50", "cash_uzs"));
  assert.throws(() => minorUnits("0", "cash_uzs"));
  assert.equal(paymentWallet("card"), "card_uzs");
  assert.equal(paymentWallet("transfer"), "bank_uzs");
  assert.ok(cashMoney("9007199254740993", "cash_uzs").includes("UZS"));
});
test("Cash: calendar dates and server-owned tenant fields", () => {
  const input = {
    action: "opening",
    branchId: "00000000-0000-4000-8000-000000000001",
    requestKey: "00000000-0000-4000-8000-000000000002",
    wallet: "cash_uzs",
    date: "2026-10-11",
    amount: "0",
  };
  assert.ok(cashSchema.safeParse(input).success);
  for (const extra of [
    { tenantId: "forged" },
    { date: "2026-10-11T12:00:00" },
    { date: "2026-02-30" },
    { amount: 100 },
    { amount: "1e3" },
  ])
    assert.equal(cashSchema.safeParse({ ...input, ...extra }).success, false);
});
