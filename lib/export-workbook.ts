import { staticWorkbook, type ExportSheet } from "./xlsx";
type Row = Record<string, unknown>;
export type ExportData = {
  branch: string;
  today: string;
  createdAt: string;
  inventory: Row[];
  contracts: Row[];
  payments: Row[];
  arrears: Row[];
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
        "Butun UZS. Fayl qiymatlar nusxasi, avtomatik hisoblovchi model emas.",
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
    ],
    data.payments.map((r) => [
      text(r.id),
      text(r.contract_id),
      text(r.customer_label),
      text(r.imei),
      amount(r.amount),
      r.method === "cash" ? "Naqd" : r.method === "card" ? "Karta" : "O‘tkazma",
      text(r.payment_time),
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
  return staticWorkbook(sheets);
}
