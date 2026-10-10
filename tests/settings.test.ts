import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsSchema } from "../lib/settings-schema";
import { authorize } from "../lib/domain";
test("staff validation forbids weak/truncated passwords, forged roles and extra tenant identity", () => {
  const branchId = "00000000-0000-4000-8000-000000000001";
  const sample = {
    action: "create",
    branchId,
    email: "NEW@EXAMPLE.INVALID",
    password: "synthetic-only-password",
    role: "cashier",
  };
  assert.equal(settingsSchema.parse(sample).action, "create");
  assert.equal(
    settingsSchema.safeParse({ ...sample, password: "short" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...sample, password: "🙂".repeat(19) }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...sample, role: "disabled" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...sample, tenantId: branchId }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ action: "rename", branchId, name: "  " })
      .success,
    false,
  );
  assert.throws(() => authorize("disabled"));
});
