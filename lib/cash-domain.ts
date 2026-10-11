import { z } from "zod";
export const walletNames = {
  cash_uzs: "Naqd UZS",
  cash_usd: "Naqd USD",
  card_uzs: "Karta (P2P)",
  bank_uzs: "Hisob raqam",
};
export type Wallet = keyof typeof walletNames;
export const cashVoidSchema = z
  .object({
    branchId: z.uuid(),
    requestKey: z.uuid(),
    entryId: z.uuid(),
    reason: z.string().trim().min(5).max(160),
  })
  .strict();
const wallet = z.enum(["cash_uzs", "cash_usd", "card_uzs", "bank_uzs"]);
export const cashCategories = [
  "Boshqa kirim",
  "Egasi qo‘shdi",
  "Investor kapitali",
  "Telefon xaridi",
  "Yetkazib beruvchiga qarz to‘lovi",
  "Ijara",
  "Oylik maosh",
  "Kommunal",
  "Reklama",
  "Transport",
  "Soliq",
  "Boshqa xarajat",
  "Egasi oldi",
  "Investorga to‘lov",
] as const;
const common = {
  branchId: z.uuid(),
  requestKey: z.uuid(),
  wallet,
  date: z.iso.date(),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
};
export const cashSchema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("opening") }).strict(),
  z
    .object({
      ...common,
      action: z.literal("entry"),
      direction: z.enum(["in", "out"]),
      category: z.enum(cashCategories),
      note: z.string().trim().max(160).default(""),
    })
    .strict(),
  z
    .object({ ...common, action: z.literal("transfer"), destination: wallet })
    .strict(),
]);
export function minorUnits(amount: string, wallet: Wallet, zero = false) {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount))
    throw new Error("Summa noto‘g‘ri");
  const [whole, fraction = ""] = amount.split(".");
  if (wallet !== "cash_usd" && fraction)
    throw new Error("UZS butun son bo‘lsin");
  const n =
    BigInt(whole) * (wallet === "cash_usd" ? 100n : 1n) +
    (wallet === "cash_usd" ? BigInt(fraction.padEnd(2, "0")) : 0n);
  if (n > 1000000000000n || n < (zero ? 0n : 1n))
    throw new Error("Summa chegaradan tashqarida");
  return Number(n);
}
export function cashMoney(value: unknown, wallet: Wallet) {
  const n = BigInt(String(value)),
    abs = n < 0n ? -n : n;
  return (
    (n < 0n ? "-" : "") +
    (wallet === "cash_usd"
      ? (abs / 100n).toLocaleString("uz-UZ") +
        "." +
        String(abs % 100n).padStart(2, "0") +
        " USD"
      : abs.toLocaleString("uz-UZ") + " UZS")
  );
}
export function paymentWallet(method: string): Wallet {
  return method === "card"
    ? "card_uzs"
    : method === "transfer"
      ? "bank_uzs"
      : "cash_uzs";
}
