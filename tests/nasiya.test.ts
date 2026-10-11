import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractSchema,
  paymentSchema,
  nasiyaTotals,
  schedule,
} from "../lib/domain";

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

test("forma to'ldirilmagan maydonlarni bo'sh satr bilan yuborsa ham o'tadi", () => {
  const v = contractSchema.parse({
    inventoryId: "00000000-0000-4000-8000-000000000001",
    customerName: "Salieva Azima",
    pnfl: "",
    passport: "",
    passportIssuer: "",
    passportDate: "",
    birthDate: "",
    phone1: "+998 90 123 45 67",
    phone2: "",
    address: "",
    icloudAccount: "",
    icloudPhone: "",
    priceUzs: "17028900",
    downPayment: "3570000",
    months: "6",
    monthlyRateBp: "500",
    startDate: "2026-09-25",
  });
  assert.equal(v.pnfl, undefined);
  assert.equal(v.birthDate, undefined);
  assert.equal(v.priceUzs, 17_028_900);
  assert.equal(v.monthlyRateBp, 500);
  assert.equal(v.downPaymentMethod, "cash");
});

test("mijoz ismi yoki belgisi bo'lmasa qabul qilinmaydi", () => {
  const asos = {
    inventoryId: "00000000-0000-4000-8000-000000000001",
    priceUzs: 9_000_000,
    downPayment: 1_000_000,
    months: 6,
    startDate: "2026-09-25",
  };
  assert.equal(contractSchema.safeParse(asos).success, false);
  assert.equal(
    contractSchema.safeParse({ ...asos, customerLabel: "eski belgi" }).success,
    true,
    "eski yo'l ishlashda davom etadi",
  );
  assert.equal(
    contractSchema.safeParse({ ...asos, customerName: "Salieva Azima" })
      .success,
    true,
  );
});

test("noto'g'ri PNFL, narx va boshlang'ich rad etiladi", () => {
  const asos = {
    inventoryId: "00000000-0000-4000-8000-000000000001",
    customerName: "Salieva Azima",
    months: 6,
    startDate: "2026-09-25",
  };
  for (const yomon of [
    { ...asos, priceUzs: 9_000_000, downPayment: 0, pnfl: "123" },
    { ...asos, priceUzs: 9_000_000, downPayment: 0, pnfl: "5123456789012a" },
    { ...asos, downPayment: 0 },
    { ...asos, priceUzs: 9_000_000, downPayment: 9_000_000 },
    { ...asos, priceUzs: 9_000_000, downPayment: 0, monthlyRateBp: 10_001 },
  ])
    assert.equal(
      contractSchema.safeParse(yomon).success,
      false,
      JSON.stringify(yomon),
    );
});

test("AT-10: kursi yo'q USD to'lov qabul qilinmaydi", () => {
  const asos = {
    contractId: "00000000-0000-4000-8000-000000000001",
    requestKey: "00000000-0000-4000-8000-000000000002",
  };
  // USD to'lovda summa ham, kurs ham majburiy.
  assert.equal(
    paymentSchema.safeParse({ ...asos, method: "cash_usd", usdAmount: "100" })
      .success,
    false,
  );
  assert.equal(
    paymentSchema.safeParse({ ...asos, method: "cash_usd", rate: 12800 })
      .success,
    false,
  );
  const ok = paymentSchema.parse({
    ...asos,
    method: "cash_usd",
    usdAmount: "100.50",
    rate: "12800",
  });
  assert.equal(ok.usdAmount, "100.50");
  assert.equal(ok.rate, 12800);
  assert.equal(ok.amount, undefined);
  // So'm to'lovida summa majburiy.
  assert.equal(
    paymentSchema.safeParse({ ...asos, method: "cash" }).success,
    false,
  );
  assert.equal(
    paymentSchema.safeParse({ ...asos, method: "cash", amount: 500000 }).success,
    true,
  );
  // Noto'g'ri dollar formati o'tmaydi.
  for (const usd of ["100.555", "-5", "abc", ""])
    assert.equal(
      paymentSchema.safeParse({
        ...asos,
        method: "cash_usd",
        usdAmount: usd,
        rate: 12800,
      }).success,
      false,
      usd,
    );
});
