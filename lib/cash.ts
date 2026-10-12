import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { scope, AccessDeniedError } from "./auth";
import { transaction, db } from "./db";
import { can, rollarAmal } from "./domain";
import {
  cashSchema,
  cashVoidSchema,
  minorUnits,
  paymentWallet,
  type Wallet,
} from "./cash-domain";
type Scope = {
  tenant_id: string;
  branch_id: string;
  userId: string;
  role: string;
};
export class CashError extends Error {}

/** Toshkent vaqti bo'yicha bugungi sana, YYYY-MM-DD. */
export async function bugun(c: Pick<PoolClient, "query">) {
  return (
    await c.query(
      "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text today",
    )
  ).rows[0].today as string;
}
/**
 * Yopilgan kunga yozuv kirmaydi (CASH-04).
 *
 * Nasiya to'lovi, xarid, qarz to'lovi va qo'lda kiritilgan harakat -
 * hammasi shu tekshiruvdan o'tadi. Qayta ochilgan kun yana ochiq.
 */
export async function assertOpenDay(
  c: Pick<PoolClient, "query">,
  s: Scope,
  day: string,
) {
  const yopilgan = (
    await c.query(
      `SELECT day::text FROM cash_closings
 WHERE tenant_id=$1 AND branch_id=$2 AND reopened_at IS NULL AND day>=$3::date
 ORDER BY day LIMIT 1`,
      [s.tenant_id, s.branch_id, day],
    )
  ).rows[0];
  if (yopilgan)
    throw new CashError(
      `${yopilgan.day} kuni kassa yopilgan: bu sanaga yozuv kiritilmaydi. Rahbar kunni qayta ochishi kerak.`,
    );
}

/** Filialning to'rt hamyoni mavjud bo'lsin: ularga FK bog'lanishlar bor. */
export async function wallets(c: Pick<PoolClient, "query">, s: Scope) {
  await c.query(
    "INSERT INTO cash_wallets(tenant_id,branch_id,wallet) SELECT $1,$2,w FROM unnest(ARRAY['cash_uzs','cash_usd','card_uzs','bank_uzs']) w ON CONFLICT DO NOTHING",
    [s.tenant_id, s.branch_id],
  );
}
/**
 * Kirim uchun kassadan chiqim (TZ INV-02).
 *
 * Summa hamyonning o'z birligida: USD hamyonidan sent, so'm hamyonidan
 * so'm chiqadi. Har kirimga bitta yozuv - bazada UNIQUE(inventory_id).
 */
export async function postPurchase(
  c: Pick<PoolClient, "query">,
  s: Scope,
  inventoryId: string,
  walletMinor: number,
  wallet: Wallet,
) {
  if (!walletMinor) return;
  await wallets(c, s);
  await assertOpenDay(c, s, await bugun(c));
  await c.query(
    `INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,user_id,inventory_id)
 VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'Asia/Tashkent')::date,$5,'Telefon xaridi',$6,$7)`,
    [
      randomUUID(),
      s.tenant_id,
      s.branch_id,
      wallet,
      -walletMinor,
      s.userId,
      inventoryId,
    ],
  );
}

/** Yetkazib beruvchiga qarz to'lovi uchun kassadan chiqim (TZ SUP). */
export async function postSettlement(
  c: Pick<PoolClient, "query">,
  s: Scope,
  settlementId: string,
  walletMinor: number,
  wallet: Wallet,
) {
  await wallets(c, s);
  await assertOpenDay(c, s, await bugun(c));
  await c.query(
    `INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,user_id,settlement_id)
 VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'Asia/Tashkent')::date,$5,'Yetkazib beruvchiga qarz to‘lovi',$6,$7)`,
    [
      randomUUID(),
      s.tenant_id,
      s.branch_id,
      wallet,
      -walletMinor,
      s.userId,
      settlementId,
    ],
  );
}

export async function postCashReceipt(
  c: Pick<PoolClient, "query">,
  s: Scope,
  id: string,
  amount: number,
  method: string,
  kind: "payment" | "down",
) {
  // `amount` - hamyonning o'z birligida: USD hamyoniga sent, so'm
  // hamyoniga so'm tushadi (tushumMinor).
  if (!amount) return;
  await wallets(c, s);
  await assertOpenDay(c, s, await bugun(c));
  await c.query(
    `INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,user_id,${kind === "payment" ? "payment_id" : "contract_id"}) VALUES($1,$2,$3,$4,(now() AT TIME ZONE 'Asia/Tashkent')::date,$5,$6,$7,$8)`,
    [
      randomUUID(),
      s.tenant_id,
      s.branch_id,
      paymentWallet(method),
      amount,
      kind === "payment" ? "Nasiya to‘lovi" : "Nasiya boshlang‘ich",
      s.userId,
      id,
    ],
  );
}
export async function mutateCash(raw: unknown) {
  const v = cashSchema.parse(raw),
    s = await scope(v.branchId, "cash.entry");
  let amount: number;
  try {
    amount = minorUnits(v.amount, v.wallet, v.action === "opening");
  } catch (e) {
    throw new CashError((e as Error).message);
  }
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [s.tenant_id, s.branch_id],
    );
    const role = (
      await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3 AND role=ANY($4)",
        [s.userId, s.tenant_id, s.branch_id, rollarAmal("cash.entry")],
      )
    ).rows[0]?.role;
    if (!role || (v.action === "opening" && role !== "admin"))
      throw new AccessDeniedError();
    const today = (
      await c.query(
        "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text today",
      )
    ).rows[0].today;
    if (v.date > today) throw new CashError("Kelajak sanasini kiritmang");
    if (v.action !== "opening") await assertOpenDay(c, s, v.date);
    if (
      v.action === "transfer" &&
      (v.wallet === v.destination ||
        v.wallet === "cash_usd" ||
        v.destination === "cash_usd")
    )
      throw new CashError("Faqat turli UZS hamyonlari orasida o‘tkazma mumkin");
    const hash = createHash("sha256").update(JSON.stringify(v)).digest("hex");
    const prior = (
      await c.query(
        "SELECT tenant_id,branch_id,input_hash FROM cash_operations WHERE id=$1",
        [v.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.tenant_id !== s.tenant_id ||
        prior.branch_id !== s.branch_id ||
        prior.input_hash !== hash
      )
        throw new CashError("Takroriy so‘rov mos emas");
      return v.requestKey;
    }
    await wallets(c, s);
    await c.query("INSERT INTO cash_operations VALUES($1,$2,$3,$4)", [
      v.requestKey,
      s.tenant_id,
      s.branch_id,
      hash,
    ]);
    if (v.action === "opening") {
      const result = await c.query(
        "UPDATE cash_wallets SET opening_date=$4,opening_minor=$5 WHERE tenant_id=$1 AND branch_id=$2 AND wallet=$3 AND opening_date IS NULL",
        [s.tenant_id, s.branch_id, v.wallet, v.date, amount],
      );
      if (!result.rowCount)
        throw new CashError("Boshlang‘ich qoldiq avval belgilangan");
    } else {
      const add = async (
        wallet: Wallet,
        signed: number,
        category: string,
        note = "",
      ) =>
        c.query(
          "INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,note,user_id,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            randomUUID(),
            s.tenant_id,
            s.branch_id,
            wallet,
            v.date,
            signed,
            category,
            note,
            s.userId,
            v.requestKey,
          ],
        );
      if (v.action === "transfer") {
        await add(v.wallet, -amount, "Hamyonlar orasida o‘tkazma");
        await add(v.destination, amount, "Hamyonlar orasida o‘tkazma");
      } else
        await add(
          v.wallet,
          v.direction === "in" ? amount : -amount,
          v.category,
          v.note,
        );
    }
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [s.userId, s.tenant_id, s.branch_id, "cash." + v.action, v.requestKey],
    );
    return v.requestKey;
  });
}
export async function readCash(branchId: string, requestedPage: number) {
  const s = await scope(branchId);
  const today = (
    await db.query(
      "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text today",
    )
  ).rows[0].today;
  const balances = (
    await db.query(
      `SELECT w.wallet,w.opening_date::text,w.opening_minor,COALESCE(sum(e.amount_minor),0)::text movement,
 CASE WHEN w.opening_minor IS NOT NULL THEN (w.opening_minor+COALESCE(sum(e.amount_minor),0))::text ELSE NULL END balance
 FROM cash_wallets w LEFT JOIN cash_entries e ON e.tenant_id=w.tenant_id AND e.branch_id=w.branch_id AND e.wallet=w.wallet AND e.entry_date<=$3::date AND (w.opening_date IS NULL OR e.entry_date>=w.opening_date)
 WHERE w.tenant_id=$1 AND w.branch_id=$2 GROUP BY w.wallet,w.opening_date,w.opening_minor`,
      [s.tenant_id, s.branch_id, today],
    )
  ).rows;
  const total = Number(
    (
      await db.query(
        "SELECT count(*) n FROM cash_entries WHERE tenant_id=$1 AND branch_id=$2",
        [s.tenant_id, s.branch_id],
      )
    ).rows[0].n,
  );
  const pages = Math.max(1, Math.ceil(total / 20)),
    page = Math.min(requestedPage, pages);
  const entries = (
    await db.query(
      "SELECT e.id,e.wallet,e.entry_date::text,e.amount_minor::text,e.category,e.note,e.payment_id,e.contract_id,e.sale_id,e.operation_id,e.reversal_of,EXISTS(SELECT 1 FROM cash_entries r WHERE r.reversal_of=e.id) reversed FROM cash_entries e WHERE e.tenant_id=$1 AND e.branch_id=$2 ORDER BY e.entry_date DESC,e.created_at DESC,e.id DESC LIMIT 20 OFFSET $3",
      [s.tenant_id, s.branch_id, (page - 1) * 20],
    )
  ).rows;
  // Shu oyning chiqimlari kategoriya bo'yicha. Valyutalar qo'shilmaydi:
  // so'm va dollar alohida ustun (TZ 4.4).
  const expenses = (
    await db.query(
      `SELECT category,
 COALESCE(sum(CASE WHEN wallet<>'cash_usd' THEN -amount_minor END),0)::text uzs,
 COALESCE(sum(CASE WHEN wallet='cash_usd' THEN -amount_minor END),0)::text usd
 FROM cash_entries
 WHERE tenant_id=$1 AND branch_id=$2 AND amount_minor<0
 AND entry_date>=date_trunc('month',$3::date)::date AND entry_date<=$3::date
 AND category<>'Hamyonlar orasida o‘tkazma'
 GROUP BY category ORDER BY 2 DESC,category`,
      [s.tenant_id, s.branch_id, today],
    )
  ).rows;
  return { balances, entries, today, total, page, pages, expenses };
}
export async function reverseCash(raw: unknown) {
  const v = cashVoidSchema.parse(raw),
    s = await scope(v.branchId, "cash.reverse");
  return transaction(async (c) => {
    await c.query(
      "SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [s.tenant_id, s.branch_id],
    );
    const role = (
      await c.query(
        "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
        [s.userId, s.tenant_id, s.branch_id],
      )
    ).rows[0]?.role;
    if (!can(role, "cash.reverse")) throw new AccessDeniedError();
    await assertOpenDay(c, s, await bugun(c));
    const hash = createHash("sha256")
      .update(JSON.stringify({ action: "reverse", ...v }))
      .digest("hex");
    const prior = (
      await c.query(
        "SELECT tenant_id,branch_id,input_hash FROM cash_operations WHERE id=$1",
        [v.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.tenant_id !== s.tenant_id ||
        prior.branch_id !== s.branch_id ||
        prior.input_hash !== hash
      )
        throw new CashError("Takroriy so‘rov mos emas");
      return v.requestKey;
    }
    const selected = (
      await c.query(
        "SELECT * FROM cash_entries WHERE tenant_id=$1 AND branch_id=$2 AND id=$3",
        [s.tenant_id, s.branch_id, v.entryId],
      )
    ).rows[0];
    if (!selected || !selected.operation_id || selected.reversal_of)
      throw new CashError("Faqat qo‘lda kiritilgan asl harakat bekor qilinadi");
    const entries = (
      await c.query(
        "SELECT e.* FROM cash_entries e WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.operation_id=$3 ORDER BY e.id FOR UPDATE",
        [s.tenant_id, s.branch_id, selected.operation_id],
      )
    ).rows;
    if (
      (
        await c.query(
          "SELECT 1 FROM cash_entries WHERE reversal_of=ANY($1::uuid[])",
          [entries.map((e) => e.id)],
        )
      ).rowCount
    )
      throw new CashError("Bu harakat avval bekor qilingan");
    await c.query("INSERT INTO cash_operations VALUES($1,$2,$3,$4)", [
      v.requestKey,
      s.tenant_id,
      s.branch_id,
      hash,
    ]);
    for (const e of entries)
      await c.query(
        "INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,category,note,user_id,operation_id,reversal_of) VALUES($1,$2,$3,$4,$5,$6,'Bekor qilish',$7,$8,$9,$10)",
        [
          randomUUID(),
          s.tenant_id,
          s.branch_id,
          e.wallet,
          e.entry_date,
          -Number(e.amount_minor),
          v.reason,
          s.userId,
          v.requestKey,
          e.id,
        ],
      );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,'cash.reverse',$4)",
      [s.userId, s.tenant_id, s.branch_id, v.requestKey],
    );
    return v.requestKey;
  });
}

/**
 * Investor kapitalining pul tomoni (TZ 6.10).
 *
 * Kirim musbat, qaytarim va daromad olish manfiy. `amount` hamyonning
 * o'z birligida: USD hamyoniga sent, so'm hamyoniga so'm. Tovar
 * ko'rinishidagi kapital bu yerga umuman kelmaydi - pul harakati yo'q.
 *
 * Kategoriya foyda hisobotiga qarab tanlanadi: investorga berilgan pul
 * xarajat emas, foyda taqsimoti - "Investorga to'lov" shu ro'yxatda.
 */
export async function postInvestorCash(
  c: Pick<PoolClient, "query">,
  s: Scope,
  entryId: string,
  day: string,
  amount: number,
  wallet: Wallet,
) {
  if (!amount) return;
  await wallets(c, s);
  await assertOpenDay(c, s, day);
  await c.query(
    `INSERT INTO cash_entries(id,tenant_id,branch_id,wallet,entry_date,amount_minor,
 category,user_id,investor_entry_id) VALUES($1,$2,$3,$4,$5::date,$6,$7,$8,$9)`,
    [
      randomUUID(),
      s.tenant_id,
      s.branch_id,
      wallet,
      day,
      amount,
      amount > 0 ? "Investor kapitali" : "Investorga to‘lov",
      s.userId,
      entryId,
    ],
  );
}
