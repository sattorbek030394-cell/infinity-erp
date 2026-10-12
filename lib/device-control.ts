import { randomUUID } from "node:crypto";
import { z } from "zod";
import { scope } from "./auth";
import { db, transaction } from "./db";
import { can } from "./domain";
import { qarzSql } from "./qarz-sql";
import { HOLAT_NOMI } from "./control-names";

export const controlSchema = z
  .object({
    branchId: z.uuid(),
    contractId: z.uuid(),
    action: z.enum(["install", "block", "unblock", "release"]),
    reason: z.string().trim().max(160).default(""),
  })
  .strict();
export class ControlError extends Error {}

/** Qaysi holatdan qaysi qarorga o'tish mumkin. */
const OTISH: Record<string, string[]> = {
  none: ["install"],
  installed: ["block", "release"],
  blocked: ["unblock", "release"],
  released: ["install"],
};
const YANGI: Record<string, string> = {
  install: "installed",
  block: "blocked",
  unblock: "installed",
  release: "released",
};

export async function readControl(branchId: string, contractId: string) {
  const s = await scope(branchId);
  const history = (
    await db.query(
      `SELECT d.*,u.email author FROM device_controls d
 LEFT JOIN users u ON u.id=d.created_by
 WHERE d.tenant_id=$1 AND d.branch_id=$2 AND d.contract_id=$3
 ORDER BY d.created_at DESC LIMIT 50`,
      [s.tenant_id, s.branch_id, contractId],
    )
  ).rows;
  return { history, canControl: can(s.role, "device.control") };
}

/**
 * Qurilma nazorati bo'yicha qaror.
 *
 * Bloklash va ochish rahbar qarori: qaror paytidagi kechikish kuni va
 * qarz hujjatda saqlanadi, shuning uchun keyin "nega bloklangan edi"
 * degan savolga aniq javob bo'ladi.
 */
export async function controlDevice(raw: unknown) {
  const v = controlSchema.parse(raw);
  const s = await scope(v.branchId, "device.control");
  if (v.action === "block" && v.reason.trim().length < 5)
    throw new ControlError("Bloklash sababini yozing (kamida 5 belgi)");
  return transaction(async (c) => {
    const row = (
      await c.query(
        `SELECT c.control_state,${qarzSql()} debt,
 (SELECT min(s.due_date) FROM installments s WHERE s.contract_id=c.id) first_due,
 (now() AT TIME ZONE 'Asia/Tashkent')::date today
 FROM contracts c WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.id=$3 FOR UPDATE`,
        [s.tenant_id, s.branch_id, v.contractId],
      )
    ).rows[0];
    if (!row) throw new ControlError("Shartnoma topilmadi");
    if (!OTISH[row.control_state]?.includes(v.action))
      throw new ControlError(
        `“${HOLAT_NOMI[row.control_state]}” holatidan bu qarorni qabul qilib bo‘lmaydi`,
      );
    // Kechikish kuni: eng eski qoplanmagan muddat bo'yicha hisoblangan
    // qiymat qarzdorlar ro'yxatida ko'rinadi; hujjatga shu paytdagi
    // kechikish va qarz yoziladi.
    const kech = (
      await c.query(
        `SELECT GREATEST(0,($2::date - min(s.due_date))) kun FROM installments s
 WHERE s.contract_id=$1 AND s.due_date<$2::date`,
        [v.contractId, row.today],
      )
    ).rows[0]?.kun;
    await c.query(
      `INSERT INTO device_controls(id,tenant_id,branch_id,contract_id,action,reason,days_late,debt,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        s.tenant_id,
        s.branch_id,
        v.contractId,
        v.action,
        v.reason,
        kech === null || kech === undefined ? null : Number(kech),
        Number(row.debt),
        s.userId,
      ],
    );
    await c.query(
      "UPDATE contracts SET control_state=$2 WHERE id=$1",
      [v.contractId, YANGI[v.action]],
    );
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [
        s.userId,
        s.tenant_id,
        s.branch_id,
        "device." + v.action,
        v.contractId,
      ],
    );
    return { state: YANGI[v.action] };
  });
}
