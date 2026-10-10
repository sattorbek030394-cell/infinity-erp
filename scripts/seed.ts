import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db, transaction } from "../lib/db";
const password = process.env.DEMO_PASSWORD;
if (
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password, "utf8") > 72
)
  throw new Error(
    "Set DEMO_PASSWORD locally (12+ characters, maximum 72 UTF-8 bytes)",
  );
try {
  await transaction(async (c) => {
    if ((await c.query("SELECT id FROM tenants LIMIT 1")).rowCount)
      throw new Error("Seed requires an empty database");
    const tenant = randomUUID(),
      user = randomUUID();
    await c.query("INSERT INTO tenants VALUES($1,'Infinity demo')", [tenant]);
    await c.query("INSERT INTO users VALUES($1,'demo@example.invalid',$2)", [
      user,
      await hash(password, 12),
    ]);
    for (const [index, name] of [
      "Infinity",
      process.env.SECOND_BRANCH_NAME || "Ikkinchi filial",
    ].entries()) {
      const branch = randomUUID();
      await c.query("INSERT INTO branches VALUES($1,$2,$3)", [
        branch,
        tenant,
        name,
      ]);
      await c.query("INSERT INTO memberships VALUES($1,$2,$3,'admin')", [
        user,
        tenant,
        branch,
      ]);
      await c.query(
        "INSERT INTO inventory(id,tenant_id,branch_id,imei,model,cost) VALUES($1,$2,$3,$4,$5,1000000)",
        [
          randomUUID(),
          tenant,
          branch,
          "00000000000000" + index,
          "SYNTHETIC demo phone " + (index + 1),
        ],
      );
    }
  });
  console.log("Synthetic demo ready: demo@example.invalid");
} finally {
  await db.end();
}
