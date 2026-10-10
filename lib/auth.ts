import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { db } from "./db";
import { authorize } from "./domain";
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;
  const r = await db.query(
    "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [digest(token)],
  );
  return r.rows[0] ?? null;
}
export async function scope(branchId: string, write = false) {
  const user = await currentUser();
  if (!user) throw new Error("Avval tizimga kiring");
  const r = await db.query(
    "SELECT tenant_id,branch_id,role FROM memberships WHERE user_id=$1 AND branch_id=$2",
    [user.id, branchId],
  );
  const membership = r.rows[0];
  if (!membership) throw new Error("Filialga ruxsat yo‘q");
  authorize(membership.role, write);
  return { ...membership, userId: user.id };
}
export async function checkOrigin() {
  const h = await headers();
  if (!process.env.APP_ORIGIN || h.get("origin") !== process.env.APP_ORIGIN)
    throw new Error("Noto‘g‘ri so‘rov manbasi");
}
