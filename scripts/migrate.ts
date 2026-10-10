import { readFile } from "node:fs/promises";
import { db, transaction } from "../lib/db";
try {
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(883201)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)",
    );
    const r = await c.query(
      "SELECT version FROM schema_migrations WHERE version='001'",
    );
    if (!r.rowCount) {
      await c.query(await readFile("db/001_init.sql", "utf8"));
      await c.query("INSERT INTO schema_migrations VALUES('001')");
    }
  });
  console.log("Migration complete");
} finally {
  await db.end();
}
