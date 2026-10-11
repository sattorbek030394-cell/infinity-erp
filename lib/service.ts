import { randomUUID } from "node:crypto";
import { scope } from "./auth";
import { transaction, db } from "./db";
import {
  itemSchema,
  contractSchema,
  paymentSchema,
  schedule,
  nasiyaTotals,
  assertPayment,
  can,
  tasdiqAmal,
  type Amal,
} from "./domain";
import type { z } from "zod";
import type { PoolClient } from "pg";
import { postCashReceipt } from "./cash";
import { minorUnits, tushumMinor } from "./cash-domain";
import { kunlikKurs } from "./kurs";
import { qarzSql } from "./qarz-sql";
type Scope = {
  tenant_id: string;
  branch_id: string;
  userId: string;
  role: string;
};
export async function createRecord(
  branchId: string,
  kind: string,
  input: unknown,
) {
  // Har modulning o'z huquqi: omborchi kirim qiladi, undiruvchi to'lov
  // kiritadi, sotuvchi shartnoma tuzadi - bir "yozish" huquqi emas.
  const amal = {
    inventory: "inventory.create",
    contracts: "contract.create",
    payments: "payment.create",
  }[kind] as Amal | undefined;
  if (!amal) throw new Error("Noto‘g‘ri modul");
  const s = await scope(branchId, amal);
  return transaction((c) => writeRecord(c, s, kind, input));
}
type Shartnoma = z.infer<typeof contractSchema>;

/** PAY-04: to'lovdan ortib qolgan summa mijoz avansi sifatida yoziladi. */
export async function yozAvans(
  c: Pick<PoolClient, "query">,
  s: Scope,
  paymentId: string,
  contractId: string,
  amount: number,
) {
  await c.query(
    `INSERT INTO customer_advances(id,tenant_id,branch_id,contract_id,payment_id,amount)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(payment_id) DO NOTHING`,
    [randomUUID(), s.tenant_id, s.branch_id, contractId, paymentId, amount],
  );
}

/**
 * Shartnoma summalari: narx berilsa ustamani dastur hisoblaydi.
 *
 * Foiz formadan kelmasa filial sozlamasidan olinadi, u ham bo'lmasa oyiga
 * 5% - hozir Excel'da amalda shu foiz ishlatilyapti.
 *
 * Eski yo'l (faqat `total` berilgan) saqlanib turadi: unda ustama ajratilmaydi
 * va `monthly_rate_bp` nol bo'lib qoladi, ya'ni bazada "hisoblanmagan" deb
 * ko'rinadi.
 */
async function nasiyaShartlari(
  c: Pick<PoolClient, "query">,
  s: Scope,
  v: Shartnoma,
) {
  if (v.priceUzs === undefined) {
    const total = v.total!;
    return { total, principal: total - v.downPayment, markup: 0, bp: 0 };
  }
  const sozlama = await c.query(
    "SELECT default_rate_bp,min_down_bp FROM nasiya_settings WHERE tenant_id=$1 AND branch_id=$2",
    [s.tenant_id, s.branch_id],
  );
  const row = sozlama.rows[0];
  const bp = v.monthlyRateBp ?? Number(row?.default_rate_bp ?? 500);
  const minDownBp = Number(row?.min_down_bp ?? 0);
  if (v.downPayment * 10000 < v.priceUzs * minDownBp)
    throw new Error("Boshlang‘ich to‘lov filial shartidan kichik");
  const t = nasiyaTotals(v.priceUzs, v.downPayment, v.months, bp);
  // Forma hisobni ko'rsatib turadi: ekranda ko'rilgan summa bilan bazaga
  // yozilayotgani boshqa bo'lsa, jim o'tib ketmaydi.
  if (v.total !== undefined && v.total !== t.total)
    throw new Error("Jami summa hisobga mos emas");
  return { total: t.total, principal: t.principal, markup: t.markup, bp };
}

/**
 * Mijoz kartochkasi. PNFL bor mijoz ikkinchi marta telefon olsa, yangi
 * kartochka ochilmaydi - borini to'ldiradi. Bo'sh kelgan maydon eski
 * qiymatni o'chirib tashlamaydi.
 */
async function mijozYoz(c: Pick<PoolClient, "query">, s: Scope, v: Shartnoma) {
  const r = await c.query(
    `INSERT INTO customers(id,tenant_id,full_name,passport,pnfl,passport_issuer,passport_date,
 birth_date,phone1,phone2,address,icloud_account,icloud_phone)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ON CONFLICT(tenant_id,pnfl) DO UPDATE SET
 full_name=excluded.full_name,
 passport=COALESCE(NULLIF(excluded.passport,''),customers.passport),
 passport_issuer=COALESCE(NULLIF(excluded.passport_issuer,''),customers.passport_issuer),
 passport_date=COALESCE(excluded.passport_date,customers.passport_date),
 birth_date=COALESCE(excluded.birth_date,customers.birth_date),
 phone1=COALESCE(NULLIF(excluded.phone1,''),customers.phone1),
 phone2=COALESCE(NULLIF(excluded.phone2,''),customers.phone2),
 address=COALESCE(NULLIF(excluded.address,''),customers.address),
 icloud_account=COALESCE(NULLIF(excluded.icloud_account,''),customers.icloud_account),
 icloud_phone=COALESCE(NULLIF(excluded.icloud_phone,''),customers.icloud_phone)
 RETURNING id`,
    [
      randomUUID(),
      s.tenant_id,
      v.customerName,
      v.passport,
      v.pnfl ?? null,
      v.passportIssuer,
      v.passportDate ?? null,
      v.birthDate ?? null,
      v.phone1,
      v.phone2,
      v.address,
      v.icloudAccount,
      v.icloudPhone,
    ],
  );
  return r.rows[0].id as string;
}

/**
 * Nasiya berish qarori: qora ro'yxat va mijoz limiti (taklif 3.1).
 *
 * Limit raqamlari filial sozlamasidan olinadi; sozlama bo'lmasa haqiqiy
 * ma'lumot tahlilidan chiqqan qiymatlar ishlatiladi: 2 ta faol shartnoma,
 * 25 mln so'm qoldiq, qattiq chegara 40 mln.
 *
 * Limitdan oshsa rahbar sabab yozib o'tkaza oladi; qattiq chegaradan
 * oshsa hech kim o'tkaza olmaydi. Qora ro'yxatdagi mijozga nasiya
 * berilmaydi - uni avval ro'yxatdan chiqarish kerak.
 *
 * @returns limitdan oshirilgan bo'lsa sabab, aks holda null
 */
async function limitTekshir(
  c: Pick<PoolClient, "query">,
  s: Scope,
  customerId: string,
  yangiQarz: number,
  v: Shartnoma,
) {
  const mijoz = (
    await c.query(
      "SELECT full_name,blocked_at,blocked_reason FROM customers WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [customerId, s.tenant_id],
    )
  ).rows[0];
  if (mijoz?.blocked_at)
    throw new Error(
      `Mijoz qora ro'yxatda: ${mijoz.blocked_reason}. Nasiya berilmaydi.`,
    );
  const sozlama = (
    await c.query(
      "SELECT max_active_contracts,max_exposure,hard_exposure FROM nasiya_settings WHERE tenant_id=$1 AND branch_id=$2",
      [s.tenant_id, s.branch_id],
    )
  ).rows[0];
  const maxSoni = Number(sozlama?.max_active_contracts ?? 2);
  const maxQarz = Number(sozlama?.max_exposure ?? 25_000_000);
  const qattiq = Number(sozlama?.hard_exposure ?? 40_000_000);
  // Mijozning barcha filiallardagi faol qarzi - bir mijoz ikkinchi
  // do'kondan ham olishi mumkin.
  const holat = (
    await c.query(
      `SELECT count(*) n, COALESCE(sum(q.qarz),0) qarz FROM (
 SELECT ${qarzSql()} qarz FROM contracts c
 WHERE c.tenant_id=$1 AND c.customer_id=$2) q WHERE q.qarz>0`,
      [s.tenant_id, customerId],
    )
  ).rows[0];
  const soni = Number(holat.n),
    qarz = Number(holat.qarz),
    jami = qarz + yangiQarz;
  const sabablar: string[] = [];
  if (soni >= maxSoni)
    sabablar.push(`${soni} ta faol shartnomasi bor (chegara ${maxSoni})`);
  if (jami > maxQarz)
    sabablar.push(
      `jami qarzi ${(jami / 1e6).toFixed(1)} mln bo'ladi (chegara ${(maxQarz / 1e6).toFixed(0)} mln)`,
    );
  if (!sabablar.length) return null;
  if (jami > qattiq)
    throw new Error(
      `Mijozning jami qarzi ${(jami / 1e6).toFixed(1)} mln bo'ladi - qattiq chegara ${(qattiq / 1e6).toFixed(0)} mln dan oshadi. Shartnoma tuzilmaydi.`,
    );
  if (!v.limitOverrideReason)
    throw new Error(
      `Mijoz limiti: ${sabablar.join(", ")}. Davom etish uchun rahbar sabab yozib tasdiqlashi kerak.`,
    );
  if (!can(s.role, "limit.override"))
    throw new Error("Limitdan oshirishga faqat rahbar ruxsat bera oladi");
  return v.limitOverrideReason;
}

async function writeRecord(
  c: Pick<PoolClient, "query">,
  s: Scope,
  kind: string,
  input: unknown,
) {
  const id = randomUUID();
  if (kind === "inventory") {
    const v = itemSchema.parse(input);
    await c.query(
      "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES($1,$2,$3,$4,$5,$6)",
      [id, s.tenant_id, s.branch_id, v.imei, v.model, v.cost],
    );
  } else if (kind === "contracts") {
    const v = contractSchema.parse(input);
    const item = await c.query(
      "SELECT id FROM inventory WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status='available' FOR UPDATE",
      [v.inventoryId, s.tenant_id, s.branch_id],
    );
    if (!item.rowCount) throw new Error("Mahsulot mavjud emas");
    const { total, principal, markup, bp } = await nasiyaShartlari(c, s, v);
    const customerId = v.customerName ? await mijozYoz(c, s, v) : null;
    const override = customerId
      ? await limitTekshir(c, s, customerId, principal + markup, v)
      : null;
    // Shartnoma raqami Excel'dagi kabi ketma-ket. Ikki kassir bir vaqtda
    // tuzsa, UNIQUE(tenant_id,number) ikkinchisini rad etadi - qayta
    // yuborilganda keyingi raqamni oladi.
    await c.query(
      `INSERT INTO contracts(id,tenant_id,branch_id,inventory_id,customer_id,customer_label,number,
 total,down_payment,principal,markup,monthly_rate_bp,months,start_date,
 limit_override_by,limit_override_reason)
 VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(number),0)+1 FROM contracts WHERE tenant_id=$2),
 $7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.inventoryId,
        customerId,
        v.customerName ?? v.customerLabel,
        total,
        v.downPayment,
        principal,
        markup,
        bp,
        v.months,
        v.startDate,
        override ? s.userId : null,
        override,
      ],
    );
    for (const p of schedule(total, v.downPayment, v.months, v.startDate))
      await c.query("INSERT INTO installments VALUES($1,$2,$3,$4)", [
        id,
        p.sequence,
        p.dueDate,
        p.amount,
      ]);
    await c.query("UPDATE inventory SET status='sold' WHERE id=$1", [
      v.inventoryId,
    ]);
    await postCashReceipt(c, s, id, v.downPayment, v.downPaymentMethod, "down");
  } else if (kind === "payments") {
    const v = paymentSchema.parse(input);
    const contract = await c.query(
      "SELECT * FROM contracts WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE",
      [v.contractId, s.tenant_id, s.branch_id],
    );
    if (!contract.rowCount) throw new Error("Shartnoma mavjud emas");
    const prior = await c.query(
      "SELECT * FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND request_key=$3",
      [s.tenant_id, s.branch_id, v.requestKey],
    );
    if (prior.rowCount) {
      const p = prior.rows[0];
      if (
        p.contract_id !== v.contractId ||
        p.method !== v.method ||
        (v.amount !== undefined && Number(p.amount) !== v.amount) ||
        (v.usdAmount !== undefined &&
          Number(p.usd_cents) !== minorUnits(v.usdAmount, "cash_usd"))
      )
        throw new Error("Takroriy kalit mos emas");
      return p.id;
    }
    const balance = Number(
      (
        await c.query(
          `SELECT ${qarzSql()} balance FROM contracts c WHERE c.id=$1`,
          [v.contractId],
        )
      ).rows[0].balance,
    );
    if (balance <= 0) throw new Error("Bu shartnomada qarz qolmagan");
    // PAY-02: dollarda olingan to'lov to'lov kursi bilan so'mga
    // aylantiriladi; shartnoma kursi o'zgarmaydi.
    const usdCents =
      v.usdAmount === undefined ? null : minorUnits(v.usdAmount, "cash_usd");
    const received =
      usdCents === null
        ? v.amount!
        : Math.round((usdCents * v.rate!) / 100);
    if (!Number.isSafeInteger(received) || received < 1)
      throw new Error("To‘lov summasi noto‘g‘ri");
    // PAY-04: qarzdan ortiq summa rad etilmaydi - ortig'i mijoz avansi
    // bo'ladi. Qarz manfiy ko'rsatilmaydi.
    const applied = Math.min(received, balance);
    const advance = received - applied;
    assertPayment(applied, balance);
    // PAY-06: naqdni kassir, P2P/bankni rahbar tasdiqlaydi. Kirituvchining
    // o'zida shu huquq bo'lsa to'lov darhol hisobga kiradi va tasdiqlovchi
    // sifatida u yoziladi; bo'lmasa tasdiq kutadi va qarzni kamaytirmaydi.
    const tasdiq = can(s.role, tasdiqAmal(v.method));
    await c.query(
      `INSERT INTO payments(id,tenant_id,branch_id,contract_id,amount,advance_amount,method,request_key,
 evidence,created_by,status,decided_by,decided_at,usd_cents,rate)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        s.tenant_id,
        s.branch_id,
        v.contractId,
        applied,
        advance,
        v.method,
        v.requestKey,
        v.evidence,
        s.userId,
        tasdiq ? "approved" : "pending",
        tasdiq ? s.userId : null,
        tasdiq ? new Date() : null,
        usdCents,
        usdCents === null ? null : v.rate,
      ],
    );
    if (tasdiq) {
      if (advance > 0) await yozAvans(c, s, id, v.contractId, advance);
      // Kassaga haqiqatda olingan pul o'z hamyonida tushadi: naqd USD
      // hamyoniga dollar, so'm hamyoniga qarz va avans summasi birgalikda.
      await postCashReceipt(
        c,
        s,
        id,
        tushumMinor({ method: v.method, amount: applied, advance_amount: advance, usd_cents: usdCents }),
        v.method,
        "payment",
      );
    }
  } else throw new Error("Noto‘g‘ri modul");
  await c.query(
    "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [s.userId, s.tenant_id, s.branch_id, kind + ".create", id],
  );
  return id;
}
export async function readBranch(branchId: string) {
  const s = await scope(branchId);
  const args = [s.tenant_id, s.branch_id];
  const items = await db.query(
    "SELECT * FROM inventory WHERE tenant_id=$1 AND branch_id=$2 ORDER BY model",
    args,
  );
  const contracts = await db.query(
    `SELECT c.*, i.model,i.imei,COALESCE((SELECT sum(a.amount-a.used_amount) FROM customer_advances a WHERE a.contract_id=c.id AND a.voided_at IS NULL),0) advance,${qarzSql()} balance FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id WHERE c.tenant_id=$1 AND c.branch_id=$2 ORDER BY start_date DESC,c.id`,
    args,
  );
  return {
    items: items.rows,
    contracts: contracts.rows,
    role: s.role,
    salesTotal: (
      await db.query(
        "SELECT coalesce(sum(amount),0)::text total FROM cash_sales WHERE tenant_id=$1 AND branch_id=$2",
        args,
      )
    ).rows[0].total,
    kurs: await kunlikKurs(s.tenant_id),
    // Yopilgan, lekin nazoratdan chiqarilmagan qurilmalar (taklif 3.2).
    unreleased: Number(
      (
        await db.query(
          `SELECT count(*) n FROM contracts c WHERE c.tenant_id=$1 AND c.branch_id=$2
 AND c.control_state IN ('installed','blocked') AND (${qarzSql()})<=0`,
          args,
        )
      ).rows[0].n,
    ),
    // Inkassatsiya: undiruvchi qabul qilgan, kassirga topshirilmagan naqd
    // pul (taklif 3.8). Kassa qoldig'iga kirmaydi.
    inTransit: (
      await db.query(
        `SELECT coalesce(sum(amount+advance_amount),0)::text total,count(*) n
 FROM payments WHERE tenant_id=$1 AND branch_id=$2 AND status='pending'
 AND method IN ('cash','cash_usd')`,
        args,
      )
    ).rows[0],
    // Mijoz avanslari qarzdan alohida yuritiladi (PAY-04).
    advances: (
      await db.query(
        "SELECT coalesce(sum(amount-used_amount),0)::text total FROM customer_advances WHERE tenant_id=$1 AND branch_id=$2 AND voided_at IS NULL",
        args,
      )
    ).rows[0].total,
  };
}
