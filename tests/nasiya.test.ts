import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractSchema,
  paymentSchema,
  itemSchema,
  nasiyaTotals,
  schedule,
  yopishHisobi,
  otganDavrlar,
  oyQoshish,
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

test("PAY-08: erta yopishda kelgusi ustama bekor qilinadi (AT-28)", () => {
  // TZ 11.1: narx 1000 USD, kurs 12 000, boshlang'ich 3 600 000, 6 oy, 5%.
  // D = 8 400 000, M = 2 520 000, oylik 1 820 000.
  const t = nasiyaTotals(12_000_000, 3_600_000, 6, 500);
  assert.equal(t.principal, 8_400_000);
  assert.equal(t.markup, 2_520_000);
  assert.equal(t.monthly, 1_820_000);
  // 2 oy to'lagan: qarz 10 920 000 - 3 640 000 = 7 280 000.
  const h = yopishHisobi({
    principal: 8_400_000,
    markup: 2_520_000,
    rateBp: 500,
    periods: 2,
    debt: 7_280_000,
  });
  assert.equal(h.paidMarkup, 840_000);
  assert.equal(h.accrued, 840_000);
  assert.equal(h.markupCancelled, 1_680_000);
  assert.equal(h.closeAmount, 5_600_000);
  assert.equal(h.markupKept, 840_000);
  // Yopgandan keyin qarz aynan nol bo'ladi.
  assert.equal(7_280_000 - h.closeAmount - h.markupCancelled, 0);
});

test("AT-36: birinchi oy tugashidan oldin yopish - o'tgan davr 0", () => {
  const h = yopishHisobi({
    principal: 8_400_000,
    markup: 2_520_000,
    rateBp: 500,
    periods: 0,
    debt: 10_920_000,
  });
  assert.equal(h.accrued, 0);
  assert.equal(h.paidMarkup, 0);
  assert.equal(h.markupCancelled, 2_520_000, "hamma ustama bekor qilinadi");
  assert.equal(h.closeAmount, 8_400_000, "faqat asosiy qarz to'lanadi");
});

test("AT-37: jadval oxirida yopishda chegirma yo'q", () => {
  const h = yopishHisobi({
    principal: 8_400_000,
    markup: 2_520_000,
    rateBp: 500,
    periods: 6,
    debt: 1_820_000,
  });
  assert.equal(h.markupCancelled, 0);
  assert.equal(h.closeAmount, 1_820_000);
});

test("erta yopishda olingan ustama qaytarilmaydi", () => {
  // Mijoz 5 oy to'lagan: to'langan ustama hisoblangan ustamadan ko'p.
  const h = yopishHisobi({
    principal: 8_400_000,
    markup: 2_520_000,
    rateBp: 500,
    periods: 3,
    debt: 1_820_000,
  });
  // To'langan 9 100 000 dan ustama ulushi 2 100 000; hisoblangan 1 260 000.
  assert.equal(h.paidMarkup, 2_100_000);
  assert.equal(h.accrued, 1_260_000);
  // Bekor qilinadigan faqat qolgan 420 000.
  assert.equal(h.markupCancelled, 420_000);
  assert.equal(h.closeAmount, 1_400_000);
  assert.ok(h.closeAmount > 0, "asosiy qarz avtomatik kechirilmaydi");
});

test("otganDavrlar oy chegaralarini jadval sanalari bilan sanaydi", () => {
  assert.equal(otganDavrlar("2026-01-31", "2026-02-27", 6), 0);
  assert.equal(otganDavrlar("2026-01-31", "2026-02-28", 6), 1);
  assert.equal(otganDavrlar("2026-01-31", "2026-03-30", 6), 1);
  assert.equal(otganDavrlar("2026-01-31", "2026-03-31", 6), 2);
  assert.equal(otganDavrlar("2026-01-31", "2027-12-31", 6), 6, "muddatdan oshmaydi");
  assert.equal(oyQoshish("2026-01-31", 1), "2026-02-28");
  assert.equal(oyQoshish("2026-01-31", 2), "2026-03-31");
});

test("yopish hisobi noto'g'ri ma'lumotni rad etadi", () => {
  for (const v of [
    { principal: 0, markup: 100, rateBp: 500, periods: 1, debt: 100 },
    { principal: 100, markup: -1, rateBp: 500, periods: 1, debt: 100 },
    { principal: 100, markup: 0, rateBp: 500, periods: 1, debt: 0 },
    { principal: 100, markup: 10, rateBp: 500, periods: 1, debt: 111 },
    { principal: 100, markup: 10, rateBp: 500, periods: -1, debt: 100 },
  ])
    assert.throws(() => yopishHisobi(v), JSON.stringify(v));
});

// To'liq kirim: 030 migratsiyadan keyin bu maydonlar majburiy.
const toliqKirim = {
  model: "Iphone 17 Pro",
  condition: "Yangi",
  purchaseDate: "2026-10-11",
  costUsd: "850",
  costRate: "12800",
  expectedPriceUsd: "950",
  simType: "Sim+esim",
  supplier: "Bahodir aka",
  receivedBy: "Jamoliddin",
  purchaseMethod: "cash_usd",
};

test("Kirim: IMEI o'rniga seriya raqami ham qabul qilinadi", () => {
  for (const imei of [
    "353840106026083",
    "J4RMVWVXVV",
    "15-fd0366nia",
    "353840106026083/1",
  ])
    assert.equal(
      itemSchema.safeParse({ ...toliqKirim, imei }).success,
      true,
      imei,
    );
  for (const imei of ["123", "", "a b c d e", "x".repeat(33), "-abcde"])
    assert.equal(
      itemSchema.safeParse({ ...toliqKirim, imei }).success,
      false,
      JSON.stringify(imei),
    );
});

test("Kirim: tannarx dollar va kurs bilan, majburiy maydonlar", () => {
  const asos = { ...toliqKirim, imei: "353840106026083" };
  assert.equal(itemSchema.safeParse(asos).success, true);
  for (const k of [
    "costUsd",
    "costRate",
    "expectedPriceUsd",
    "supplier",
    "receivedBy",
    "purchaseMethod",
    "purchaseDate",
    "condition",
    "simType",
  ] as const)
    assert.equal(
      itemSchema.safeParse({ ...asos, [k]: "" }).success,
      false,
      k + " bo'sh bo'lsa o'tmasligi kerak",
    );
  const v = itemSchema.parse({
    ...asos,
    brand: "Iphone",
    memory: "256",
    color: "silver",
    condition: "B/U",
    battery: "87",
    costUsd: "850.50",
  });
  assert.equal(v.battery, 87);
  assert.equal(v.costUsd, "850.50");
  assert.equal(v.costRate, 12_800);
  assert.equal(v.purchaseMethod, "cash_usd");
  // Ixtiyoriy maydonlar bo'sh qolsa xato bermaydi.
  assert.equal(
    itemSchema.safeParse({ ...asos, brand: "", memory: "", imei2: "" })
      .success,
    true,
  );
  // Noto'g'ri batareyka va to'lov turi o'tmaydi.
  for (const bad of [
    { condition: "B/U", battery: "101" },
    { condition: "B/U", battery: "-1" },
    { purchaseMethod: "naqd" },
  ])
    assert.equal(
      itemSchema.safeParse({ ...asos, ...bad }).success,
      false,
      JSON.stringify(bad),
    );
});
