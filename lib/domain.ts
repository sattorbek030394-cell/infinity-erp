import { z } from "zod";
export const money = z.coerce.number().int().min(1).max(1_000_000_000_000);
export const itemSchema = z.object({
  imei: z.string().regex(/^\d{15}$/),
  model: z.string().trim().min(1).max(100),
  cost: money,
});
export const contractSchema = z
  .object({
    inventoryId: z.uuid(),
    customerLabel: z.string().trim().min(1).max(80),
    total: money,
    downPayment: z.coerce.number().int().min(0),
    downPaymentMethod: z.enum(["cash", "card", "transfer"]).default("cash"),
    months: z.coerce.number().int().min(1).max(36),
    startDate: z.iso.date(),
  })
  .refine((v) => v.downPayment < v.total, {
    message: "Boshlang‘ich to‘lov jami summadan kichik bo‘lsin",
  });
export const paymentSchema = z.object({
  contractId: z.uuid(),
  amount: money,
  method: z.enum(["cash", "card", "transfer"]),
  requestKey: z.uuid(),
});
export function authorize(role: string, write = false) {
  if (
    !["admin", "cashier", "viewer"].includes(role) ||
    (write && role === "viewer")
  )
    throw new Error("Ruxsat yo‘q");
}
export function schedule(
  total: number,
  down: number,
  months: number,
  start: string,
) {
  if (
    !Number.isSafeInteger(total) ||
    !Number.isSafeInteger(down) ||
    down < 0 ||
    down >= total ||
    months < 1 ||
    months > 36 ||
    !Number.isInteger(months)
  )
    throw new Error("Noto‘g‘ri shartnoma");
  const balance = total - down,
    base = Math.floor(balance / months),
    extra = balance % months;
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || base < 1)
    throw new Error("Noto‘g‘ri sana yoki summa");
  return Array.from({ length: months }, (_, i) => {
    const first = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i + 2, 0),
    );
    first.setUTCDate(Math.min(d.getUTCDate(), first.getUTCDate()));
    return {
      sequence: i + 1,
      dueDate: first.toISOString().slice(0, 10),
      amount: base + (i < extra ? 1 : 0),
    };
  });
}
// Oylik ustama bazis punktda: 500 = oyiga 5%. Butun son bo'lgani uchun
// kasr xatosi yig'ilmaydi.
export const rateBp = z.coerce.number().int().min(0).max(10000);

/**
 * Nasiya shartnomasining summalari.
 *
 * Ustama oddiy foiz: har oy uchun asosiy qarzdan bir xil foiz olinadi,
 * qoldiq kamayganda ham kamaymaydi. Excel shu qoida bilan ishlagan va
 * 150 ta mavjud shartnomada bu hisob aynan mos keladi.
 *
 *   asosiy qarz = narx - boshlang'ich to'lov
 *   ustama      = asosiy qarz * oylik foiz * muddat
 *   jami        = boshlang'ich to'lov + asosiy qarz + ustama
 *
 * `jami` ichiga boshlang'ich to'lov ham kiradi, chunki `contracts.total`
 * shu ma'noda ishlatiladi va `schedule()` undan boshlang'ichni ayiradi.
 */
export function nasiyaTotals(
  price: number,
  down: number,
  months: number,
  bp: number,
) {
  if (
    !Number.isSafeInteger(price) ||
    !Number.isSafeInteger(down) ||
    !Number.isInteger(months) ||
    !Number.isInteger(bp) ||
    price <= 0 ||
    down < 0 ||
    down >= price ||
    months < 1 ||
    months > 36 ||
    bp < 0 ||
    bp > 10000
  )
    throw new Error("Noto‘g‘ri nasiya shartlari");
  const principal = price - down;
  const markup = Math.round((principal * bp * months) / 10000);
  const total = down + principal + markup;
  if (!Number.isSafeInteger(total)) throw new Error("Summa juda katta");
  return {
    principal,
    markup,
    total,
    // Mijozga aytiladigan oylik to'lov. Yaxlitlash tufayli oxirgi oy
    // biroz boshqacha bo'lishi mumkin - aniq jadvalni schedule() beradi.
    monthly: Math.round((principal + markup) / months),
  };
}

export function assertPayment(amount: number, balance: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > balance)
    throw new Error("To‘lov qoldiqdan oshmasligi kerak");
}
