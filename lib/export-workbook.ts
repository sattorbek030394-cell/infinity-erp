import { staticWorkbook, type ExportSheet } from "./xlsx";
import { cashMoney, walletNames, type Wallet } from "./cash-domain";
type Row = Record<string, unknown>;
export type ExportData = {
  branch: string;
  today: string;
  createdAt: string;
  inventory: Row[];
  contracts: Row[];
  payments: Row[];
  arrears: Row[];
  cashBalances: Row[];
  cashEntries: Row[];
  sales: Row[];
};
export async function exportWorkbook(data: ExportData) {
  const sheets: ExportSheet[] = [];
  const add = (
    name: string,
    headers: string[],
    rows: (string | number)[][],
    moneyColumns: number[] = [],
  ) => {
    sheets.push({ name, headers, rows, moneyColumns });
  };
  const text = (v: unknown) => String(v ?? "");
  const amount = (v: unknown) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n))
      throw new Error("Export amount outside safe integer range");
    return n;
  };
  add(
    "Ma’lumot",
    ["Maydon", "Qiymat"],
    [
      ["Filial", data.branch],
      ["Hisob sanasi (Toshkent)", data.today],
      ["Yuklash vaqti (UTC)", data.createdAt],
      [
        "Qamrov",
        "Tanlangan filialning barcha yozuvlari; ekran filtrlari qo‘llanmaydi.",
      ],
      [
        "Valyuta",
        "Nasiya — butun UZS. Kassa — UZS yoki USD; Kassa summalari valyuta bilan aniq matn. Fayl qiymatlar nusxasi.",
      ],
      [
        "Kechikish qoidasi",
        "To‘lovlar eng eski oylikni qoplaydi; bugungi muddat kechikmagan. Jarima yo‘q.",
      ],
      [
        "Cheklov",
        "Excel va Kassa mosligi tasdiqlanmagan. Jami qoldiq Kassa yoki sof foyda emas.",
      ],
      [
        "Xavfsizlik",
        "Yuklangan faylda filial ma’lumotlari bor. Uni faqat vakolatli odamga bering.",
      ],
      [
        "Kassa qoidasi",
        "Qoldiq = tekshirilgan boshlang‘ich + shu sanadan bugungacha harakatlar. Noma’lum qoldiq nol emas. Bekor qilish asl sanani tuzatadi; asl va qarama-qarshi yozuv ikkalasi saqlanadi. Eski to‘lovlar avtomatik ko‘chirilmagan.",
      ],
    ],
  );
  add(
    "Ombor",
    ["Qurilma ID", "Model", "IMEI", "Tannarx", "Holat"],
    data.inventory.map((r) => [
      text(r.id),
      text(r.model),
      text(r.imei),
      amount(r.cost),
      r.status === "sold" ? "Sotilgan" : "Omborda",
    ]),
    [4],
  );
  add(
    "Nasiya",
    [
      "Shartnoma ID",
      "Mijoz belgisi",
      "Model",
      "IMEI",
      "Jami",
      "Boshlang‘ich",
      "Keyingi to‘lovlar",
      "Qoldiq",
      "Oylar",
      "Boshlanish sanasi",
    ],
    data.contracts.map((r) => [
      text(r.id),
      text(r.customer_label),
      text(r.model),
      text(r.imei),
      amount(r.total),
      amount(r.down_payment),
      amount(r.paid),
      amount(r.balance),
      amount(r.months),
      text(r.start_date),
    ]),
    [5, 6, 7, 8],
  );
  add(
    "To‘lovlar",
    [
      "To‘lov ID",
      "Shartnoma ID",
      "Mijoz belgisi",
      "IMEI",
      "Summa",
      "Usul",
      "Vaqt (Toshkent)",
      "Holat",
      "Bekor qilish sababi",
      "Bekor qilingan vaqt (Toshkent)",
      "Bekor qilgan xodim",
    ],
    data.payments.map((r) => [
      text(r.id),
      text(r.contract_id),
      text(r.customer_label),
      text(r.imei),
      amount(r.amount),
      r.method === "cash" ? "Naqd" : r.method === "card" ? "Karta" : "O‘tkazma",
      text(r.payment_time),
      r.voided_at ? "Bekor qilingan — hisobga kirmaydi" : "Faol",
      text(r.void_reason),
      text(r.voided_at),
      text(r.voided_by),
    ]),
    [5],
  );
  add(
    "Qarzdorlar",
    [
      "Shartnoma ID",
      "Mijoz belgisi",
      "Model",
      "IMEI",
      "Jami qoldiq",
      "Muddati o‘tgan",
      "Eng eski qoplanmagan muddat",
      "Kechikish kunlari",
    ],
    data.arrears.map((r) => [
      text(r.id),
      text(r.customer_label),
      text(r.model),
      text(r.imei),
      amount(r.balance),
      amount(r.overdue),
      text(r.first_unpaid),
      amount(r.days_late),
    ]),
    [5, 6],
  );
  add(
    "Kassa qoldiqlari",
    [
      "Hamyon",
      "Valyuta",
      "Boshlang‘ich sana",
      "Boshlang‘ich qoldiq",
      "Harakatlar jami",
      "Joriy qoldiq",
    ],
    data.cashBalances.map((r) => {
      const w = r.wallet as Wallet;
      return [
        walletNames[w],
        w === "cash_usd" ? "USD" : "UZS",
        text(r.opening_date),
        r.opening_minor == null ? "Noma’lum" : cashMoney(r.opening_minor, w),
        cashMoney(r.movement, w),
        r.balance == null ? "Noma’lum" : cashMoney(r.balance, w),
      ];
    }),
  );
  add(
    "Kassa daftari",
    [
      "Harakat ID",
      "Sana",
      "Hamyon",
      "Summa",
      "Sabab",
      "Izoh",
      "Holat",
      "Asl harakat ID",
      "Amal ID",
      "To‘lov ID",
      "Shartnoma ID",
      "Yozilgan vaqt (Toshkent)",
      "Muallif",
      "Savdo ID",
    ],
    data.cashEntries.map((r) => [
      text(r.id),
      text(r.entry_date),
      walletNames[r.wallet as Wallet],
      cashMoney(r.amount_minor, r.wallet as Wallet),
      text(r.category),
      text(r.note),
      r.reversal_of
        ? "Bekor qilish yozuvi"
        : r.reversed
          ? "Bekor qilingan"
          : r.sale_id
            ? "Naqd savdo — avtomatik"
            : r.payment_id || r.contract_id
              ? "Nasiya — avtomatik"
              : "Qo‘lda yozilgan",
      text(r.reversal_of),
      text(r.operation_id),
      text(r.payment_id),
      text(r.contract_id),
      text(r.recorded_at),
      text(r.author),
      text(r.sale_id),
    ]),
  );
  add(
    "Naqd savdo",
    [
      "Savdo ID",
      "Vaqt (Toshkent)",
      "Model",
      "IMEI",
      "Mijoz belgisi",
      "Summa UZS",
      "Usul",
      "Muallif",
      "Holat",
      "Bekor qilish sababi",
      "Bekor qilingan vaqt (Toshkent)",
      "Bekor qilgan xodim",
    ],
    data.sales.map((r) => [
      text(r.id),
      text(r.sale_time),
      text(r.model),
      text(r.imei),
      text(r.customer_label),
      amount(r.amount),
      r.method === "cash" ? "Naqd" : r.method === "card" ? "Karta" : "O‘tkazma",
      text(r.author),
      r.voided_at ? "Bekor qilingan — hisobga kirmaydi" : "Faol",
      text(r.void_reason),
      text(r.voided_at),
      text(r.voided_by),
    ]),
    [6],
  );
  return staticWorkbook(sheets);
}
