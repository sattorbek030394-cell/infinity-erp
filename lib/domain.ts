import { z } from "zod";
export const money = z.coerce.number().int().min(1).max(1_000_000_000_000);

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

// Qurilma identifikatori har doim 15 xonali IMEI emas: Apple seriya
// raqami (J4RMVWVXVV), noutbuk modeli (15-fd0366nia) ham keladi. Baza ham
// shu shartni ishlatadi (007 migratsiya).
export const imeiMatn = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9/-]{4,31}$/,
    "IMEI yoki seriya raqami 5-32 belgi, harf va raqamdan",
  );

export const TOLOV_TURLARI = [
  "cash_uzs",
  "cash_usd",
  "card",
  "bank",
  "debt",
  "investor",
  "trade_in",
] as const;

export const itemSchema = z
  .object({
    imei: imeiMatn,
    imei2: ixtiyoriy(imeiMatn),
    brand: matn(40),
    model: z.string().trim().min(1).max(100),
    memory: matn(20),
    simType: matn(20),
    color: matn(30),
    region: matn(20),
    condition: matn(20),
    // Batareyka holati foizda: 0-100.
    battery: ixtiyoriy(z.coerce.number().int().min(0).max(100)),
    purchaseDate: ixtiyoriy(z.iso.date()),
    // Tannarx: so'mda yoki dollarda kurs bilan.
    cost: ixtiyoriy(money),
    costUsd: ixtiyoriy(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/)),
    costRate: ixtiyoriy(z.coerce.number().int().min(1).max(100_000_000)),
    expectedPrice: ixtiyoriy(money),
    supplier: matn(120),
    receivedBy: matn(80),
    purchaseMethod: ixtiyoriy(z.enum(TOLOV_TURLARI)),
    // "Investor tovari" bo'lsa qaysi investorning kapitali ekani.
    investorId: ixtiyoriy(z.uuid()),
  })
  .refine(
    (v) =>
      v.cost !== undefined ||
      (v.costUsd !== undefined && v.costRate !== undefined),
    { message: "Tannarxni so‘mda yoki dollar va kurs bilan yozing" },
  )
  // Investor kapitali dollarda yuritiladi, shuning uchun investor
  // tovarida investor ham, dollardagi tannarx ham majburiy.
  .refine(
    (v) =>
      (v.purchaseMethod === "investor") === (v.investorId !== undefined),
    { message: "Investor tovarida investorni tanlang" },
  )
  .refine(
    (v) =>
      v.purchaseMethod !== "investor" ||
      (v.costUsd !== undefined && v.costRate !== undefined),
    { message: "Investor tovarida tannarx dollarda bo‘lishi kerak" },
  );
/**
 * Mijoz kartochkasi - nasiya va qarzga sotishda bir xil to'ldiriladi.
 * Ism berilsa mijoz `customers` ga yoziladi; PNFL berilsa, shu PNFL
 * bilan mavjud mijoz qayta ishlatiladi.
 */
const mijozMaydonlari = {
  customerName: ixtiyoriy(z.string().trim().min(1).max(160)),
  // Eski yo'l: hujjatsiz belgi. Ism berilmasa shu ishlatiladi.
  customerLabel: ixtiyoriy(z.string().trim().min(1).max(80)),
  pnfl: ixtiyoriy(z.string().regex(/^\d{5,20}$/, "PNFL 5-20 raqamdan bo‘lsin")),
  passport: matn(40),
  passportIssuer: matn(120),
  passportDate: ixtiyoriy(z.iso.date()),
  birthDate: ixtiyoriy(z.iso.date()),
  phone1: matn(40),
  phone2: matn(40),
  address: matn(200),
  icloudAccount: matn(120),
  icloudPhone: matn(40),
};

export const contractSchema = z
  .object({
    inventoryId: z.uuid(),
    ...mijozMaydonlari,
    // Qurilma narxi. Berilsa ustamani dastur hisoblaydi.
    priceUzs: ixtiyoriy(money),
    // Eski yo'l: ustama qo'shilgan jami summa qo'lda kiritiladi.
    total: ixtiyoriy(money),
    downPayment: z.coerce.number().int().min(0),
    downPaymentMethod: z.enum(["cash", "card", "transfer"]).default("cash"),
    // Mijozning eski telefoni boshlang'ich to'lovning bir qismi bo'lsa:
    // Kirimga "Trade-in" turi bilan olingan qurilma (taklif 3.10).
    tradeInId: ixtiyoriy(z.uuid()),
    months: z.coerce.number().int().min(1).max(36),
    monthlyRateBp: ixtiyoriy(rateBp),
    startDate: z.iso.date(),
    // Mijoz limitidan oshsa rahbar sababini yozib o'tkazadi (taklif 3.1).
    limitOverrideReason: ixtiyoriy(z.string().trim().min(5).max(160)),
    // Kim sotdi va mijoz qayerdan keldi (TZ SALE-01).
    seller: matn(80),
    channel: matn(40),
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

/** Qarzga sotishda standart muddat. Sotuvda o'zgartirsa bo'ladi. */
export const QARZ_MUDDAT_KUN = 14;

/**
 * Qarzga sotish (TZ SALE-02).
 *
 * Nasiyadan farqi uchta: ustama yo'q, grafik yo'q, va qolgan qarz
 * DOLLARDA yuritiladi. Mijoz sotuv paytida bir necha hamyonga bo'lib
 * to'lashi mumkin - naqd dollar, naqd so'm va karta birga kelishi odatiy
 * hol, shuning uchun boshlang'ich to'lov bitta summa emas, ro'yxat.
 *
 * `amount` hamyonning o'z birligida: `cash_usd` ga sent, qolganiga so'm.
 */
export const qarzSotuvSchema = z.object({
  inventoryId: z.uuid(),
  ...mijozMaydonlari,
  // Fakt sotish narxi, dollarda: "1050" yoki "1050.50".
  priceUsd: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "Narxni dollarda yozing"),
  // Sotuv kunidagi kurs: so'mdagi summalarni shu bilan hisoblaymiz.
  rate: z.coerce.number().int().min(1).max(100_000_000),
  dueDate: z.iso.date(),
  tolovlar: z
    .array(
      z.object({ method: z.enum(TOLOV_USULLARI), amount: money }),
    )
    .max(4)
    .default([]),
  limitOverrideReason: ixtiyoriy(z.string().trim().min(5).max(160)),
  seller: matn(80),
  channel: matn(40),
});

/** "1050.50" -> 105050 sent. */
export const sentga = (s: string) => Math.round(Number(s) * 100);

/**
 * Qarzga sotuvning raqamlari.
 *
 * So'mdagi summalar sotuv kunidagi kurs bilan yoziladi (marja, kassa va
 * mijoz limiti uchun), qarzning o'zi esa dollarda qoladi. Hamyonlarning
 * dollar qiymati sentgacha yaxlitlanadi - eng ko'pi bilan bir sent farq,
 * u oxirgi to'lovda yopiladi.
 */
export function qarzSotuvHisobi(v: {
  priceCents: number;
  rate: number;
  tolovlar: { method: string; amount: number }[];
}) {
  const { priceCents, rate } = v;
  let downSom = 0,
    downCents = 0;
  for (const t of v.tolovlar) {
    if (t.amount <= 0) continue;
    downSom += t.method === "cash_usd" ? Math.round((t.amount * rate) / 100) : t.amount;
    downCents +=
      t.method === "cash_usd" ? t.amount : Math.round((t.amount * 100) / rate);
  }
  const total = Math.round((priceCents * rate) / 100);
  const debtCents = priceCents - downCents;
  if (debtCents <= 0)
    throw new Error("Qarz qolmadi - buni naqd sotuv sifatida yozing");
  if (downSom >= total)
    throw new Error("Tushgan pul sotish narxidan kam bo‘lsin");
  return { total, downSom, downCents, debtCents, debtSom: total - downSom };
}

/**
 * Dollardagi qarzga tushgan to'lov qancha qarzni yopadi.
 *
 * So'mda tushsa to'lov kunidagi kurs bilan dollarga o'tkaziladi; qarzdan
 * ortiq qismi yopilmaydi (ortig'i avansga ketadi, PAY-04 kabi).
 */
export function qarzTolovi(v: {
  /** Dollarda olingan bo'lsa sent, aks holda null. */
  usdCents: number | null;
  /** So'mda haqiqatda tushgan summa. */
  received: number;
  rate: number;
  debtCents: number;
}) {
  if (v.usdCents !== null) {
    const cents = Math.min(v.usdCents, v.debtCents);
    return { cents, som: Math.round((cents * v.rate) / 100) };
  }
  // So'mda to'lagan: qarzning bugungi kursdagi narxidan ortig'i avansga.
  // Sentni so'mdan hisoblaymiz, teskarisi emas - aks holda yaxlitlash
  // tushgan puldan ko'proq yopib yuborishi mumkin.
  const som = Math.min(v.received, Math.round((v.debtCents * v.rate) / 100));
  const cents = Math.min(Math.round((som * 100) / v.rate), v.debtCents);
  return { cents, som };
}

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
  // Qarzga sotish: ustamasiz qarz berish - pul qarori, sotuv qarori emas
  | "credit.sale"
  | "cash.entry"
  | "cash.reverse"
  | "settings.write"
  // Mijoz limitidan oshirib shartnoma tuzish va qora ro'yxatni boshqarish
  | "limit.override"
  | "customer.block"
  // iCloud/MDM nazorati: bloklash va ochish
  | "device.control"
  // Oylik rejani belgilash
  | "target.write"
  // Investor kapitali: ko'rish va yozish. Yozish - egasining o'z ishi.
  | "investor.read"
  | "investor.write";

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
    "credit.sale",
    "cash.entry",
    "cash.reverse",
    "settings.write",
    "limit.override",
    "customer.block",
    "device.control",
    "target.write",
    "investor.read",
    "investor.write",
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
    "credit.sale",
    "cash.entry",
    "cash.reverse",
    "limit.override",
    "customer.block",
    "device.control",
    "target.write",
    "investor.read",
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
  accountant: ["read", "export", "investor.read"],
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
