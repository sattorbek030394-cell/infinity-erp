import { readFile, readdir } from "node:fs/promises";
import { db, transaction } from "../lib/db";
try {
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(883201)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)",
    );
    const files = (await readdir("db"))
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const version = file.slice(0, 3);
      const r = await c.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (!r.rowCount) {
        await c.query(await readFile("db/" + file, "utf8"));
        await c.query("INSERT INTO schema_migrations VALUES($1)", [version]);
      }
    }
  });
  console.log("Migration complete");
} finally {
  await db.end();
}
