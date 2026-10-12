import { test } from "node:test";
import assert from "node:assert/strict";
import { shartnomaHtml, type ShartnomaMalumot } from "../lib/shartnoma";

const namuna = (o: Partial<ShartnomaMalumot> = {}): ShartnomaMalumot => ({
  raqam: 151,
  sana: new Date(2026, 8, 25),
  mijoz: "Салиева Азима Аметбай қизи",
  pnfl: "51234567890123",
  pasport: "AD1234567",
  pasportKim: "Чилонзор ИИБ",
  pasportQachon: "12.03.2021",
  manzil: "Тошкент ш., Чилонзор т.",
  telefon1: "+998 90 123 45 67",
  telefon2: "",
  tovar: "Iphone 17 Pro 256 Gb",
  imei: "350270740363762",
  narx: 17_028_900,
  boshlangich: 3_570_000,
  qoldiq: 13_458_900,
  oylik: 2_243_150,
  jadval: Array.from({ length: 6 }, (_, i) => ({
    sana: new Date(2026, 9 + i, 25),
    summa: 2_243_150,
  })),
  ...o,
});

test("shartnomada barcha majburiy ma'lumot bor", () => {
  const h = shartnomaHtml(namuna());
  for (const kerak of [
    "151 - сонли",
    "Салиева Азима Аметбай қизи",
    "51234567890123",
    "350270740363762",
    "17 028 900",
    "13 458 900",
    "25.10.2026",
    "25.03.2027",
    "iPlanet",
    "1-илова",
  ])
    assert.ok(h.includes(kerak), `topilmadi: ${kerak}`);
});

test("to'ldirilmagan o'rin qolmaydi", () => {
  const h = shartnomaHtml(namuna());
  assert.doesNotMatch(h, /\{\{|\$\{/);
});

test("jadval yig'indisi qoldiq qarzga teng", () => {
  const m = namuna();
  const h = shartnomaHtml(m);
  const jami = m.jadval.reduce((n, t) => n + t.summa, 0);
  assert.equal(jami, m.qoldiq);
  assert.ok(h.includes("13 458 900"));
});

test("mijoz maydonlaridagi HTML qochiriladi", () => {
  const h = shartnomaHtml(namuna({ mijoz: "<script>alert(1)</script>" }));
  assert.ok(!h.includes("<script>alert(1)"));
  assert.ok(h.includes("&lt;script&gt;"));
});

test("bir oylik shartnoma ham chiqadi", () => {
  const h = shartnomaHtml(
    namuna({
      raqam: 1,
      jadval: [{ sana: new Date(2026, 9, 25), summa: 1_937_250 }],
    }),
  );
  assert.ok(h.includes("1 - сонли"));
  assert.ok(h.includes("1 937 250"));
});
