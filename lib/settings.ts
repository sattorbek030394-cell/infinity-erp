import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { currentUser, scope, AccessDeniedError } from "./auth";
import { db, transaction } from "./db";
import { settingsSchema, type SettingsInput } from "./settings-schema";
export class SettingsError extends Error {}
export async function readSettings(branchId: string) {
  const s = await scope(branchId);
  if (s.role !== "admin")
    throw new AccessDeniedError("Faqat administrator boshqaradi");
  const branch = (
    await db.query(
      "SELECT id,name FROM branches WHERE tenant_id=$1 AND id=$2",
      [s.tenant_id, s.branch_id],
    )
  ).rows[0];
  const members = await db.query(
    "SELECT u.id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.branch_id=$2 ORDER BY u.email",
    [s.tenant_id, s.branch_id],
  );
  const available = await db.query(
    `SELECT DISTINCT u.id,u.email FROM users u
 JOIN memberships m ON m.user_id=u.id AND m.tenant_id=$1
 JOIN memberships actor ON actor.tenant_id=m.tenant_id AND actor.branch_id=m.branch_id AND actor.user_id=$2 AND actor.role='admin'
 WHERE NOT EXISTS(SELECT 1 FROM memberships target WHERE target.user_id=u.id AND target.tenant_id=$1 AND target.branch_id=$3)
 ORDER BY u.email`,
    [s.tenant_id, s.userId, s.branch_id],
  );
  return {
    branch,
    members: members.rows,
    available: available.rows,
    actorId: s.userId,
  };
}
export async function updateSettings(raw: unknown) {
  const input = settingsSchema.parse(raw);
  const actor = await currentUser();
  if (!actor) throw new AccessDeniedError("Avval tizimga kiring");
  // Membership changes share a tenant lock, then recheck the actor's current role.
  return transaction(async (c) => {
    const initial = await c.query(
      "SELECT tenant_id FROM memberships WHERE user_id=$1 AND branch_id=$2 AND role='admin'",
      [actor.id, input.branchId],
    );
    if (!initial.rowCount)
      throw new AccessDeniedError("Faqat administrator boshqaradi");
    const tenant = initial.rows[0].tenant_id;
    await c.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [tenant]);
    const rights = await c.query(
      "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
      [actor.id, tenant, input.branchId],
    );
    if (rights.rows[0]?.role !== "admin")
      throw new AccessDeniedError("Administrator ruxsati o‘zgargan");
    let recordId = input.branchId,
      action = "branch.rename";
    if (input.action === "rename") {
      const duplicate = await c.query(
        "SELECT id FROM branches WHERE tenant_id=$1 AND id<>$2 AND lower(trim(name))=lower($3)",
        [tenant, input.branchId, input.name],
      );
      if (duplicate.rowCount)
        throw new SettingsError("Bu nomdagi filial mavjud");
      await c.query(
        "UPDATE branches SET name=$1 WHERE tenant_id=$2 AND id=$3",
        [input.name, tenant, input.branchId],
      );
    } else if (input.action === "create") {
      recordId = randomUUID();
      try {
        await c.query(
          "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
          [recordId, input.email, await hash(input.password, 12)],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "23505")
          throw new SettingsError(
            "Bu email bilan yangi hisob yaratib bo‘lmadi. Mavjud xodimni tanlang yoki boshqa email kiriting.",
          );
        throw e;
      }
      await c.query(
        "INSERT INTO memberships(user_id,tenant_id,branch_id,role) VALUES($1,$2,$3,$4)",
        [recordId, tenant, input.branchId, input.role],
      );
      action = "user.create." + input.role;
    } else {
      recordId = input.userId;
      if (input.action === "grant") {
        const eligible = await c.query(
          `SELECT 1 FROM memberships m JOIN memberships actor
 ON actor.branch_id=m.branch_id AND actor.tenant_id=m.tenant_id AND actor.user_id=$1 AND actor.role='admin'
 WHERE m.user_id=$2 AND m.tenant_id=$3 LIMIT 1`,
          [actor.id, input.userId, tenant],
        );
        if (!eligible.rowCount)
          throw new AccessDeniedError(
            "Xodim siz boshqaradigan filialga tegishli emas",
          );
        const existing = await c.query(
          "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
          [input.userId, tenant, input.branchId],
        );
        if (existing.rowCount)
          throw new SettingsError(
            "Xodim ro‘yxatda bor; uning rolini o‘zgartiring",
          );
        await c.query("INSERT INTO memberships VALUES($1,$2,$3,$4)", [
          input.userId,
          tenant,
          input.branchId,
          input.role,
        ]);
        action = "membership.grant." + input.role;
      } else {
        if (input.userId === actor.id)
          throw new SettingsError(
            "O‘z administrator huquqingizni o‘zgartira olmaysiz",
          );
        const target = await c.query(
          "SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND branch_id=$3",
          [input.userId, tenant, input.branchId],
        );
        if (!target.rowCount)
          throw new SettingsError("Xodim bu filialda topilmadi");
        if (target.rows[0].role === "admin" && input.role !== "admin") {
          const admins = await c.query(
            "SELECT count(*) n FROM memberships WHERE tenant_id=$1 AND branch_id=$2 AND role='admin'",
            [tenant, input.branchId],
          );
          if (Number(admins.rows[0].n) <= 1)
            throw new SettingsError(
              "Filialda kamida bitta administrator qolsin",
            );
        }
        await c.query(
          "UPDATE memberships SET role=$1 WHERE user_id=$2 AND tenant_id=$3 AND branch_id=$4",
          [input.role, input.userId, tenant, input.branchId],
        );
        action = "membership.role." + input.role;
      }
    }
    await c.query(
      "INSERT INTO audit_events(user_id,tenant_id,branch_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [actor.id, tenant, input.branchId, action, recordId],
    );
    return { id: recordId };
  });
}
