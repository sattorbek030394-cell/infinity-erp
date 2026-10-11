import { test } from "node:test";
import assert from "node:assert/strict";
import { nasiyaTotals, schedule } from "../lib/domain";

test("ustama oddiy foiz: asosiy qarz * oylik foiz * muddat", () => {
  // Excel'dagi 1-shartnoma: narx 5 535 000, boshlang'ich 3 690 000,
  // 1 oy, oyiga 5%.
  const t = nasiyaTotals(5_535_000, 3_690_000, 1, 500);
  assert.equal(t.principal, 1_845_000);
  assert.equal(t.markup, 92_250);
  assert.equal(t.total, 5_627_250);
  assert.equal(t.monthly, 1_937_250);
});

test("muddat uzaysa ustama ham o'shancha ortadi", () => {
  const olti = nasiyaTotals(10_000_000, 3_000_000, 6, 500);
  const sakkiz = nasiyaTotals(10_000_000, 3_000_000, 8, 500);
  assert.equal(olti.markup, 2_100_000); // 7 000 000 * 5% * 6
  assert.equal(sakkiz.markup, 2_800_000); // 7 000 000 * 5% * 8
  // mijozning oylik to'lovi esa pasayadi
  assert.ok(sakkiz.monthly < olti.monthly);
});

test("ustamasiz shartnoma ham ishlaydi", () => {
  const t = nasiyaTotals(12_000_000, 0, 36, 0);
  assert.equal(t.markup, 0);
  assert.equal(t.total, 12_000_000);
});

test("grafik yig'indisi asosiy qarz va ustamaga teng", () => {
  for (const [price, down, months, bp] of [
    [5_535_000, 3_690_000, 1, 500],
    [10_498_180, 2_998_800, 3, 500],
    [17_028_900, 3_570_000, 6, 500],
    [14_065_800, 3_570_000, 8, 450],
    [9_000_000, 1_000_000, 12, 300],
  ]) {
    const t = nasiyaTotals(price, down, months, bp);
    const s = schedule(t.total, down, months, "2026-03-15");
    assert.equal(s.length, months);
    assert.equal(
      s.reduce((n, p) => n + p.amount, 0),
      t.principal + t.markup,
      `${price}/${down}/${months}/${bp}`,
    );
  }
});

test("noto'g'ri shartlarni rad etadi", () => {
  for (const args of [
    [1000, 1000, 6, 500], // boshlang'ich narxga teng
    [1000, 1500, 6, 500], // boshlang'ich narxdan katta
    [1000, 0, 0, 500], // muddat nol
    [1000, 0, 37, 500], // muddat 36 dan katta
    [1000, 0, 6, 10001], // foiz 100% dan katta
    [1000, 0, 6, -1], // manfiy foiz
    [1000.5, 0, 6, 500], // kasr summa
    [0, 0, 6, 500], // narx nol
  ] as [number, number, number, number][])
    assert.throws(
      () => nasiyaTotals(...args),
      `qabul qilmasligi kerak: ${args}`,
    );
});
