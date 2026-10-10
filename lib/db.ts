import { Pool, type PoolClient } from "pg";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
