import { scope } from "./auth";
import { db } from "./db";
import { CHIQIM_EMAS, TAQSIMOT } from "./profit";

/**
 * Foyda hisobotidagi raqamning tafsiloti (TZ 6.9).
 *
 * Hisobotdagi har bir son - marja, nasiya daromadi, kurs farqi, xarajat -
 * shu yerda qatorma-qator ochiladi. Maqsadi oddiy: bitta raqamga ishonish
 * uchun uning ichi ko'rinishi kerak.
 *
 * So'rovlar `profit.ts` dagi hisob bilan bir xil shartlarda yozilgan,
 * shuning uchun tafsilotning yig'indisi hisobotdagi songa aynan teng
 * chiqadi. Agar bir kun teng chiqmay qolsa - bu xatoning o'zi, va u
 * yashirin emas, ekranda ko'rinadi.
 */
export const TAFSIL = ["marja", "ustama", "kursfarqi", "xarajat"] as const;
export type Tafsil = (typeof TAFSIL)[number];
export const TAFSIL_NOMI: Record<Tafsil, string> = {
  marja: "Sotuv marjasi",
  ustama: "Nasiya ustama daromadi",
  kursfarqi: "Kurs farqi",
  xarajat: "Xarajat",
};

export type TafsilQator = {
  kun: string;
  nom: string;
  izoh: string;
  kirim: number;
  chiqim: number;
  summa: number;
  /** Dollardagi xarajat: so'm yig'indisiga qo'shilmaydi (TZ 4.4). */
  usd?: boolean;
};

export async function readProfitDetail(
  branchId: string,
  oyRaw: string,
  kindRaw: string,
) {
  const s = await scope(branchId);
  const kind = (TAFSIL as readonly string[]).includes(kindRaw)
    ? (kindRaw as Tafsil)
    : "marja";
  const oy = /^\d{4}-(0[1-9]|1[0-2])$/.test(oyRaw)
    ? oyRaw
    : (
        await db.query(
          "SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'YYYY-MM') oy",
        )
      ).rows[0].oy;
  const args = [s.tenant_id, s.branch_id, oy + "-01"];
  const q = async (sql: string, extra: unknown[] = []) =>
    (await db.query(sql, [...args, ...extra])).rows;

  let rows: TafsilQator[] = [];
  if (kind === "marja") {
    // Sotuv: nasiya va qarz shartnoma sanasi bo'yicha, naqd sotuv
    // kuni bo'yicha. Kirim - narx, chiqim - tannarx.
    const r = await q(
      `SELECT c.start_date::text kun,
 CASE c.kind WHEN 'qarz' THEN 'Qarzga' ELSE 'Nasiya' END tur,
 c.customer_label nom, i.model||' / '||i.imei qurilma,
 COALESCE(c.principal,c.total-c.down_payment)+c.down_payment narx, i.cost tannarx
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2
 AND c.start_date>=$3::date AND c.start_date<$3::date+interval '1 month'
 UNION ALL
 SELECT (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date::text, 'Naqd',
 COALESCE(NULLIF(sale.seller,''),''), i.model||' / '||i.imei, sale.amount, i.cost
 FROM cash_sales sale JOIN inventory i ON i.id=sale.inventory_id AND i.tenant_id=sale.tenant_id AND i.branch_id=sale.branch_id
 WHERE sale.tenant_id=$1 AND sale.branch_id=$2
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (sale.created_at AT TIME ZONE 'Asia/Tashkent')::date<$3::date+interval '1 month'
 ORDER BY 1,4`,
    );
    rows = r.map((x) => ({
      kun: x.kun,
      nom: `${x.tur}: ${x.qurilma}`,
      izoh: x.nom || "",
      kirim: Number(x.narx),
      chiqim: Number(x.tannarx),
      summa: Number(x.narx) - Number(x.tannarx),
    }));
  } else if (kind === "ustama") {
    // Har to'lovdagi ustama ulushi, va erta yopishdagi tuzatish.
    const r = await q(
      `SELECT (p.created_at AT TIME ZONE 'Asia/Tashkent')::date::text kun,
 c.number, c.customer_label nom, p.amount,
 round(p.amount::numeric*COALESCE(c.markup,0)
   / NULLIF(COALESCE(c.principal,c.total-c.down_payment)+COALESCE(c.markup,0),0)) ustama
 FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date<$3::date+interval '1 month'
 ORDER BY 1,2`,
    );
    const yopish = await q(
      `SELECT (x.decided_at AT TIME ZONE 'Asia/Tashkent')::date::text kun,
 c.number, c.customer_label nom, x.markup_cancelled,
 round(x.markup_cancelled::numeric*COALESCE(c.principal,c.total-c.down_payment)
   / NULLIF(COALESCE(c.principal,c.total-c.down_payment)+COALESCE(c.markup,0),0)) tuzatish
 FROM contract_closures x JOIN contracts c ON c.id=x.contract_id AND c.tenant_id=x.tenant_id AND c.branch_id=x.branch_id
 WHERE x.tenant_id=$1 AND x.branch_id=$2 AND x.status='completed'
 AND (x.decided_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (x.decided_at AT TIME ZONE 'Asia/Tashkent')::date<$3::date+interval '1 month'
 ORDER BY 1,2`,
    );
    rows = [
      ...r.map((x) => ({
        kun: x.kun,
        nom: `№${x.number} ${x.nom}`,
        izoh: "to‘lovdagi ustama ulushi",
        kirim: Number(x.amount),
        chiqim: 0,
        summa: Number(x.ustama),
      })),
      ...yopish.map((x) => ({
        kun: x.kun,
        nom: `№${x.number} ${x.nom}`,
        izoh: `erta yopish: ${Number(x.markup_cancelled).toLocaleString("uz-UZ")} ustama bekor`,
        kirim: 0,
        chiqim: Number(x.tuzatish),
        summa: -Number(x.tuzatish),
      })),
    ].sort((a, b) => a.kun.localeCompare(b.kun));
  } else if (kind === "kursfarqi") {
    // Dollardagi qarz so'mda to'langanda: tushgan so'm va sotuv
    // kursidagi kitob qiymati farqi.
    const r = await q(
      `SELECT (p.created_at AT TIME ZONE 'Asia/Tashkent')::date::text kun,
 c.number, c.customer_label nom, p.amount, p.applied_cents, c.sale_rate,
 round(p.applied_cents::numeric*c.sale_rate/100) kitob
 FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id
 WHERE p.tenant_id=$1 AND p.branch_id=$2 AND p.status='approved' AND p.voided_at IS NULL
 AND c.kind='qarz' AND p.applied_cents IS NOT NULL
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date>=$3::date
 AND (p.created_at AT TIME ZONE 'Asia/Tashkent')::date<$3::date+interval '1 month'
 ORDER BY 1,2`,
    );
    rows = r.map((x) => ({
      kun: x.kun,
      nom: `№${x.number} ${x.nom}`,
      izoh: `${(Number(x.applied_cents) / 100).toFixed(2)} $ yopildi, sotuv kursi ${Number(x.sale_rate).toLocaleString("uz-UZ")}`,
      kirim: Number(x.amount),
      chiqim: Number(x.kitob),
      summa: Number(x.amount) - Number(x.kitob),
    }));
  } else {
    // Xarajat: kassadan chiqqan operatsion pul. Tovarga ketgan pul va
    // foyda taqsimoti xarajat emas - hisobotdagi kabi chiqarib
    // tashlanadi.
    const r = await q(
      `SELECT entry_date::text kun, category, wallet, -amount_minor summa
 FROM cash_entries
 WHERE tenant_id=$1 AND branch_id=$2 AND amount_minor<0
 AND NOT category=ANY($4) AND NOT category=ANY($5)
 AND entry_date>=$3::date AND entry_date<$3::date+interval '1 month'
 ORDER BY 1,2`,
      [CHIQIM_EMAS, TAQSIMOT],
    );
    rows = r.map((x) => ({
      kun: x.kun,
      nom: x.category,
      izoh: x.wallet === "cash_usd" ? "dollarda" : "so‘mda",
      kirim: 0,
      chiqim: Number(x.summa),
      summa: Number(x.summa),
      usd: x.wallet === "cash_usd",
    }));
  }
  // Muzlatilgan oyda tafsilot hozirgi yozuvlardan hisoblanadi, hisobot
  // esa yopilgan paytdagi raqamni ko'rsatadi - ikkisi farq qilishi
  // mumkin va buni aytib qo'yish kerak.
  const muzlatilgan = !!(
    await db.query(
      "SELECT 1 FROM profit_snapshots WHERE tenant_id=$1 AND branch_id=$2 AND month=$3::date",
      args,
    )
  ).rowCount;
  return {
    oy,
    kind,
    muzlatilgan,
    nomi: TAFSIL_NOMI[kind],
    rows,
    // Valyutalar jim qo'shilmaydi: so'm va dollar alohida yig'iladi.
    jami: rows.reduce((a, b) => a + (b.usd ? 0 : b.summa), 0),
    jamiUsd: rows.reduce((a, b) => a + (b.usd ? b.summa : 0), 0),
  };
}
