import { z } from "zod";
export const money = z.coerce.number().int().min(1).max(1_000_000_000_000);
export const itemSchema = z.object({
  imei: z.string().regex(/^\d{15}$/),
  model: z.string().trim().min(1).max(100),
  cost: money,
});
// Oylik ustama bazis punktda: 500 = oyiga 5%. Butun son bo'lgani uchun
// kasr xatosi yig'ilmaydi.
export const rateBp = z.coerce.number().int().min(0).max(10000);

// Formadan to'ldirilmagan maydon bo'sh satr bo'lib keladi. Bo'sh satrni
// "berilmagan" deb olamiz, aks holda sana va PNFL tekshiruvi bo'sh joyda
// yiqiladi.
const matn = (max: number) => z.string().trim().max(max).default("");
const ixtiyoriy = <T extends z.ZodType>(s: T) =>
  z.preprocess(
    (x) => (typeof x === "string" ? x.trim() || undefined : x),
    s.optional(),
  );

export const contractSchema = z
  .object({
    inventoryId: z.uuid(),
    // Mijoz kartochkasi. Ism berilsa mijoz `customers` ga yoziladi; PNFL
    // berilsa, shu PNFL bilan mavjud mijoz qayta ishlatiladi.
    customerName: ixtiyoriy(z.string().trim().min(1).max(160)),
    // Eski yo'l: hujjatsiz belgi. Ism berilmasa shu ishlatiladi.
    customerLabel: ixtiyoriy(z.string().trim().min(1).max(80)),
    pnfl: ixtiyoriy(
      z.string().regex(/^\d{5,20}$/, "PNFL 5-20 raqamdan bo‘lsin"),
    ),
    passport: matn(40),
    passportIssuer: matn(120),
    passportDate: ixtiyoriy(z.iso.date()),
    birthDate: ixtiyoriy(z.iso.date()),
    phone1: matn(40),
    phone2: matn(40),
    address: matn(200),
    icloudAccount: matn(120),
    icloudPhone: matn(40),
    // Qurilma narxi. Berilsa ustamani dastur hisoblaydi.
    priceUzs: ixtiyoriy(money),
    // Eski yo'l: ustama qo'shilgan jami summa qo'lda kiritiladi.
    total: ixtiyoriy(money),
    downPayment: z.coerce.number().int().min(0),
    downPaymentMethod: z.enum(["cash", "card", "transfer"]).default("cash"),
    months: z.coerce.number().int().min(1).max(36),
    monthlyRateBp: ixtiyoriy(rateBp),
    startDate: z.iso.date(),
    // Mijoz limitidan oshsa rahbar sababini yozib o'tkazadi (taklif 3.1).
    limitOverrideReason: ixtiyoriy(z.string().trim().min(5).max(160)),
  })
  .refine((v) => v.customerName || v.customerLabel, {
    message: "Mijoz ismini yozing",
  })
  .refine((v) => v.priceUzs !== undefined || v.total !== undefined, {
    message: "Narxni yozing",
  })
  .refine((v) => v.downPayment < (v.priceUzs ?? v.total ?? 0), {
    message: "Boshlang‘ich to‘lov narxdan kichik bo‘lsin",
  });
export const TOLOV_USULLARI = ["cash", "cash_usd", "card", "transfer"] as const;

/** Qaysi rol shu usuldagi tushumni tasdiqlaydi (PAY-06). */
export const tasdiqAmal = (method: string): Amal =>
  method.startsWith("cash") ? "payment.approve.cash" : "payment.approve.transfer";

export const paymentSchema = z
  .object({
    contractId: z.uuid(),
    // So'mdagi to'lov summasi. USD to'lovda bo'sh qoldiriladi - uni
    // dastur kursdan hisoblaydi.
    amount: ixtiyoriy(money),
    // Dollarda olingan summa, masalan "100.50", va to'lov kursi.
    usdAmount: ixtiyoriy(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/)),
    rate: ixtiyoriy(z.coerce.number().int().min(1).max(100_000_000)),
    method: z.enum(TOLOV_USULLARI),
    // P2P/bank tushumining dalili: tranzaksiya identifikatori yoki kvitansiya
    // raqami. Rahbar shu bo'yicha haqiqiy tushumni tekshiradi (PAY-06).
    evidence: z.string().trim().max(160).default(""),
    requestKey: z.uuid(),
  })
  // AT-10: kursi yo'q USD to'lov qabul qilinmaydi.
  .refine(
    (v) =>
      v.method === "cash_usd"
        ? v.usdAmount !== undefined && v.rate !== undefined
        : v.amount !== undefined,
    { message: "USD to‘lovda summa va kurs majburiy" },
  );
// Rollar va amallar - texnik topshiriqning 5-bo'limi. Huquq har safar
// serverda tekshiriladi; ekranda tugmani yashirish hisobga olinmaydi.
//
// Topshiriqda administrator va rahbar alohida: administrator pul tushumini
// rahbar o'rniga tasdiqlay olmaydi. Hozir do'konning egasi ikkala vazifani
// bajaradi, shuning uchun `admin` tasdiqlash huquqini ham oladi. Alohida
// rahbar paydo bo'lganda `payment.approve.transfer` ni `admin` dan olib
// tashlash kifoya - qolgan kod o'zgarmaydi.
export const ROLLAR = [
  "admin",
  "manager",
  "cashier",
  "seller",
  "warehouse",
  "collector",
  "accountant",
  "viewer",
] as const;
export type Rol = (typeof ROLLAR)[number];
export type Amal =
  | "read"
  | "export"
  | "inventory.create"
  | "contract.create"
  | "payment.create"
  | "payment.void"
  | "payment.approve.cash"
  | "payment.approve.transfer"
  | "sale.create"
  | "cash.entry"
  | "cash.reverse"
  | "settings.write"
  // Mijoz limitidan oshirib shartnoma tuzish va qora ro'yxatni boshqarish
  | "limit.override"
  | "customer.block"
  // iCloud/MDM nazorati: bloklash va ochish
  | "device.control";

// Kichik do'kon haqiqati: kassir ayni paytda sotuvchi va omborchi ham.
// Omborchi/sotuvchi rollari ajratilganda ularning huquqi shu jadvalda
// qisqartiriladi.
const HUQUQLAR: Record<Rol, Amal[]> = {
  admin: [
    "read",
    "export",
    "inventory.create",
    "contract.create",
    "payment.create",
    "payment.void",
    "payment.approve.cash",
    "payment.approve.transfer",
    "sale.create",
    "cash.entry",
    "cash.reverse",
    "settings.write",
    "limit.override",
    "customer.block",
    "device.control",
  ],
  manager: [
    "read",
    "export",
    "inventory.create",
    "contract.create",
    "payment.create",
    "payment.void",
    "payment.approve.cash",
    "payment.approve.transfer",
    "sale.create",
    "cash.entry",
    "cash.reverse",
    "limit.override",
    "customer.block",
    "device.control",
  ],
  cashier: [
    "read",
    "export",
    "inventory.create",
    "contract.create",
    "payment.create",
    "payment.approve.cash",
    "sale.create",
    "cash.entry",
  ],
  seller: ["read", "contract.create", "sale.create"],
  warehouse: ["read", "inventory.create"],
  collector: ["read", "payment.create"],
  accountant: ["read", "export"],
  viewer: ["read", "export"],
};

export function can(role: string, amal: Amal) {
  return (HUQUQLAR as Record<string, Amal[] | undefined>)[role]?.includes(
    amal,
  ) === true;
}

/** Amalni bajaradigan rollar ro'yxati - bazadagi tekshiruv uchun. */
export const rollarAmal = (amal: Amal) => ROLLAR.filter((r) => can(r, amal));

export function authorize(role: string, amal: Amal | boolean = "read") {
  // `true` - eski chaqiruvlar uchun: "biror yozuv o'zgartirish".
  const kerak: Amal =
    amal === true ? "payment.create" : amal === false ? "read" : amal;
  if (!can(role, kerak)) throw new Error("Ruxsat yo‘q");
}
/**
 * Shartnoma sanasiga `n` oy qo'shish.
 *
 * 31-yanvarga bir oy qo'shilsa fevral oxiri chiqadi, lekin keyingi oylar
 * asl kunga qaytadi (TZ 4.3, AT-08). Natija YYYY-MM-DD.
 */
export function oyQoshish(start: string, n: number) {
  const d = new Date(start + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) throw new Error("Noto‘g‘ri sana");
  const oxiri = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0),
  );
  oxiri.setUTCDate(Math.min(d.getUTCDate(), oxiri.getUTCDate()));
  return oxiri.toISOString().slice(0, 10);
}

/**
 * Shartnoma sanasidan hisob sanasigacha o'tgan to'liq oylik davrlar (m).
 *
 * Davr chegaralari jadvaldagi oy qo'shish sanalari bilan aniqlanadi.
 * Birinchi oy tugashidan oldin yopilsa 0 qaytadi; tugamagan oy uchun
 * kunlik ustama hisoblanmaydi (TZ PAY-08, AT-36).
 */
export function otganDavrlar(start: string, until: string, months: number) {
  let m = 0;
  for (let i = 1; i <= months; i++) {
    if (oyQoshish(start, i) <= until) m = i;
    else break;
  }
  return m;
}

/**
 * Muddatidan oldin to'liq yopish hisobi (TZ PAY-08).
 *
 *   I_accrued = min(M, D × r × m)              saqlanadigan hisoblangan ustama
 *   I_paid    = to'langan summadagi ustama ulushi
 *   C         = min(B, max(0, M − max(I_accrued, I_paid)))   bekor qilinadi
 *   S         = B − C                           yopish uchun to'lanadi
 *
 * Oldin tasdiqlab olingan ustama qaytarilmaydi: faqat qolgan kelgusi
 * ustama bekor qilinadi.
 */
export function yopishHisobi(v: {
  /** Asosiy nasiya qarzi D */
  principal: number;
  /** Jami dastlabki ustama M */
  markup: number;
  /** Oylik ustama bazis punktda r */
  rateBp: number;
  /** O'tgan to'liq oylik davrlar m */
  periods: number;
  /** Yopishdan oldingi tasdiqlangan qarz qoldig'i B */
  debt: number;
}) {
  const { principal, markup, rateBp, periods, debt } = v;
  if (
    ![principal, markup, rateBp, periods, debt].every((n) =>
      Number.isSafeInteger(n),
    ) ||
    principal <= 0 ||
    markup < 0 ||
    rateBp < 0 ||
    periods < 0 ||
    debt <= 0 ||
    debt > principal + markup
  )
    throw new Error("Yopish hisobi uchun ma’lumot yetarli emas");
  const jami = principal + markup;
  // To'langan summadagi ustama ulushi: manbadagi ulush usuli.
  const paid = jami - debt;
  const paidMarkup = jami > 0 ? Math.round((paid * markup) / jami) : 0;
  const accrued = Math.min(
    markup,
    Math.round((principal * rateBp * periods) / 10000),
  );
  const cancelled = Math.min(
    debt,
    Math.max(0, markup - Math.max(accrued, paidMarkup)),
  );
  return {
    paidMarkup,
    accrued,
    markupKept: markup - cancelled,
    markupCancelled: cancelled,
    closeAmount: debt - cancelled,
  };
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
  // Texnik topshiriq 4.2-4.3: oylik to'lov = round(T/n), oxirgi to'lov =
  // T - oldingi bandlar. Yaxlitlash tafovuti oxirgi bandga tushadi, boshiga
  // emas: 100 so'm 3 oyga 33 + 33 + 34 bo'linadi. Mijoz e'lon qilingan
  // oylik summani to'lab yuradi, farq oxirida chiqadi.
  const balance = total - down,
    monthly = Math.round(balance / months),
    last = balance - monthly * (months - 1);
  if (Number.isNaN(new Date(start + "T00:00:00Z").getTime()))
    throw new Error("Noto‘g‘ri sana yoki summa");
  if (monthly < 1 || last < 1) throw new Error("Noto‘g‘ri sana yoki summa");
  return Array.from({ length: months }, (_, i) => ({
    sequence: i + 1,
    dueDate: oyQoshish(start, i + 1),
    amount: i === months - 1 ? last : monthly,
  }));
}
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
