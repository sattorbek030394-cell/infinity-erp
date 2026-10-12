import { test } from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  assertPayment,
  authorize,
  can,
  rollarAmal,
  ROLLAR,
  itemSchema,
  aralashQismlar,
  sentga,
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
test("AT-07: yaxlitlash tafovuti oxirgi to'lovga tushadi", () => {
  assert.deepEqual(
    schedule(100, 0, 3, "2026-03-15").map((p) => p.amount),
    [33, 33, 34],
  );
  // Yuqoriga yaxlitlanganda oxirgi band kichik bo'ladi, lekin yig'indi aynan
  // teng qoladi va hech bir band nolga aylanmaydi.
  const olti = schedule(10_000_000, 0, 6, "2026-03-15");
  assert.deepEqual(
    olti.map((p) => p.amount),
    [1_666_667, 1_666_667, 1_666_667, 1_666_667, 1_666_667, 1_666_665],
  );
  for (const months of [1, 2, 3, 6, 8, 10, 12, 36])
    for (const total of [37, 54, 101, 999, 1_000_001, 17_496_570]) {
      const monthly = Math.round(total / months);
      // Summa muddatga nisbatan juda kichik bo'lsa jadval tuzilmaydi -
      // bunday shartnoma `schedule()` tomonidan rad etiladi.
      if (monthly < 1 || total - monthly * (months - 1) < 1) continue;
      const s = schedule(total, 0, months, "2026-01-31");
      assert.equal(
        s.reduce((n, p) => n + p.amount, 0),
        total,
        `${total}/${months}`,
      );
      assert.ok(
        s.every((p) => p.amount > 0),
        `${total}/${months} - nol band`,
      );
    }
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
test("rollar: har amal o'z roliga tegishli (TZ 5-bo'lim)", () => {
  // Kassir pul tushumini o'zi tasdiqlay oladi, lekin P2P/bankni yo'q (AT-24).
  assert.equal(can("cashier", "payment.approve.cash"), true);
  assert.equal(can("cashier", "payment.approve.transfer"), false);
  assert.equal(can("manager", "payment.approve.transfer"), true);
  // Omborchi pulga tegmaydi, undiruvchi omborga tegmaydi.
  assert.equal(can("warehouse", "inventory.create"), true);
  assert.equal(can("warehouse", "payment.create"), false);
  assert.equal(can("warehouse", "cash.entry"), false);
  assert.equal(can("collector", "payment.create"), true);
  assert.equal(can("collector", "inventory.create"), false);
  // Hisobchi va faqat ko'ruvchi hech narsa o'zgartirmaydi.
  for (const amal of [
    "inventory.create",
    "contract.create",
    "payment.create",
    "cash.entry",
    "sale.create",
  ] as const)
    for (const rol of ["accountant", "viewer"])
      assert.equal(can(rol, amal), false, `${rol} / ${amal}`);
  // Sozlamalarni faqat administrator boshqaradi; bekor qilish rahbarda ham.
  assert.deepEqual(rollarAmal("settings.write"), ["admin"]);
  assert.deepEqual(rollarAmal("payment.void"), ["admin", "manager"]);
  assert.deepEqual(rollarAmal("cash.reverse"), ["admin", "manager"]);
  // O'chirilgan hisob va noma'lum rol - hech qanday huquqsiz.
  for (const rol of ["disabled", "owner", "", "ADMIN"])
    for (const amal of ["read", "export", "payment.create"] as const)
      assert.equal(can(rol, amal), false, `${rol} / ${amal}`);
  // Hamma rol kamida ko'rish huquqiga ega bo'lsin, aks holda filial
  // ro'yxati bo'sh chiqadi.
  for (const rol of ROLLAR) assert.equal(can(rol, "read"), true, rol);
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

// Ombor kirimi: majburiy maydonlar, holat/batareyka, SIM turi, aralash to'lov.
const toliqKirim = {
  model: "iPhone 15",
  imei: "356789012345678",
  condition: "Yangi",
  purchaseDate: "2026-10-12",
  costUsd: "1000",
  costRate: "12000",
  expectedPriceUsd: "1100",
  simType: "Dual",
  supplier: "Ali",
  receivedBy: "Jamoliddin",
  purchaseMethod: "cash_uzs",
};
const xato = (v: unknown) => {
  const r = itemSchema.safeParse(v);
  return r.success ? "" : r.error.issues.map((i) => i.message).join(" | ");
};
test("kirim: to'liq to'ldirilgan forma o'tadi", () => {
  assert.equal(xato(toliqKirim), "");
});
test("kirim: bo'sh forma barcha majburiy maydonlarni bir xabarda aytadi", () => {
  const m = xato({});
  for (const nom of [
    "Model",
    "IMEI yoki seriya raqami",
    "Qurilma holati",
    "Kirim sanasi",
    "Tannarx USD",
    "Kirim kursi",
    "Prognoz sotuv narxi USD",
    "SIM turi",
    "Yetkazib beruvchi",
    "Qabul qiluvchi",
    "To‘lov turi",
  ])
    assert.ok(m.includes(nom), nom + " xabarda yo'q: " + m);
});
test("kirim: Trade-in va ro'yxatda yo'q SIM turi rad etiladi", () => {
  assert.notEqual(xato({ ...toliqKirim, condition: "Trade-in" }), "");
  assert.notEqual(xato({ ...toliqKirim, simType: "Nano" }), "");
  assert.equal(xato({ ...toliqKirim, simType: "Esim+esim" }), "");
});
test("kirim: Yangi qurilmada batareyka yozilmaydi, B/U da majburiy", () => {
  assert.match(xato({ ...toliqKirim, battery: "90" }), /Yangi qurilmada/);
  assert.match(xato({ ...toliqKirim, condition: "B/U" }), /Batareyka/);
  assert.equal(xato({ ...toliqKirim, condition: "B/U", battery: "87" }), "");
});
test("kirim: aralash to'lov jami tannarxga teng bo'lishi kerak", () => {
  // 1000$ x 12 000 = 12 mln: 500$ naqd + 2 mln naqd + 4 mln karta.
  assert.equal(sentga("850.5"), 85_050);
  assert.deepEqual(
    aralashQismlar({
      cost: 12_000_000,
      rate: 12_000,
      usdCents: 50_000,
      naqdSom: 2_000_000,
      karta: 4_000_000,
      bank: 0,
    }),
    [
      { hamyon: "cash_usd", minor: 50_000 },
      { hamyon: "cash_uzs", minor: 2_000_000 },
      { hamyon: "card_uzs", minor: 4_000_000 },
    ],
  );
  assert.throws(
    () =>
      aralashQismlar({
        cost: 12_000_000,
        rate: 12_000,
        usdCents: 50_000,
        naqdSom: 2_000_000,
        karta: 3_000_000,
        bank: 0,
      }),
    /teng bo‘lishi kerak/,
  );
  assert.throws(
    () =>
      aralashQismlar({
        cost: 1_000,
        rate: 1,
        usdCents: 0,
        naqdSom: 1_000,
        karta: 0,
        bank: 0,
      }),
    /kamida ikki/,
  );
});
